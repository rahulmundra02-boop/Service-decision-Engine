import { useState } from "react";
import { PDFDocument } from "pdf-lib";

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const AUTH_LABEL = /authori[sz]ed\s+(?:signatory|signature|sign)\b/i;

function imageBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function findAuthorizedSignLine(items) {
  const lines = [];
  for (const item of (items || []).filter(x => String(x.str || "").trim())) {
    const y = Number(item.transform?.[5] || 0);
    let line = lines.find(x => Math.abs(x.y - y) <= 4);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  for (const line of lines) {
    line.items.sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0));
    const text = line.items.map(x => x.str || "").join(" ").replace(/\s+/g, " ").trim();
    if (!AUTH_LABEL.test(text)) continue;
    const x1 = Math.min(...line.items.map(x => Number(x.transform?.[4] || 0)));
    const x2 = Math.max(...line.items.map(x => Number(x.transform?.[4] || 0) + Number(x.width || 0)));
    return { x: (x1 + x2) / 2, y: line.y, text };
  }
  return null;
}
function makeTransparentWhite(canvasContext, canvas) {
  const pixels = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const matte = Math.min(r, g, b);
    const alpha = 255 - matte;
    if (alpha <= 3) { data[p + 3] = 0; continue; }
    data[p] = Math.min(255, Math.round(((r - matte) * 255) / alpha));
    data[p + 1] = Math.min(255, Math.round(((g - matte) * 255) / alpha));
    data[p + 2] = Math.min(255, Math.round(((b - matte) * 255) / alpha));
    data[p + 3] = Math.round(data[p + 3] * alpha / 255);
  }
  canvasContext.putImageData(pixels, 0, 0);
}
function placeAuthorizationMarks(page, location, signature, seal) {
  if (!location || (!signature && !seal)) return false;
  const gap = signature && seal ? 7 : 0;
  const sigW = signature ? Math.min(104, page.getWidth() * 0.25) : 0;
  const sealW = seal ? Math.min(54, page.getWidth() * 0.14) : 0;
  const sigH = signature ? sigW * signature.height / signature.width : 0;
  const sealH = seal ? sealW * seal.height / seal.width : 0;
  const totalW = sigW + sealW + gap;
  const centerX = Math.max(totalW / 2 + 8, Math.min(page.getWidth() - totalW / 2 - 8, location.x));
  // PDF.js text transforms use top-origin viewport coordinates.
  // pdf-lib drawImage uses bottom-origin PDF coordinates, so invert Y.
  // Place the mark just above the authorized-signature label.
  const labelPdfY = page.getHeight() - location.y;
  const desiredBottom = labelPdfY + 18;
  const bottom = Math.max(8, Math.min(page.getHeight() - Math.max(sigH, sealH) - 8, desiredBottom));
  let x = centerX - totalW / 2;
  if (seal) {
    page.drawImage(seal, { x, y: bottom, width: sealW, height: sealH });
    x += sealW + gap;
  }
  if (signature) page.drawImage(signature, { x, y: bottom, width: sigW, height: sigH });
  return true;
}

export default function PdfLetterheadTool({ user, onBack }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const branding = user?.preferences || {};
  const ready = Boolean(branding.letterhead?.image);
  const hasSignature = Boolean(branding.signature?.image);
  const hasSeal = Boolean(branding.seal?.image);

  function handleFiles(fileList) {
    setError(""); setStatus(""); setResults([]);
    const selected = Array.from(fileList || []);
    if (!selected.length) { setFiles([]); return; }
    const invalid = selected.find(file => file.type !== "application/pdf" || file.size > 25 * 1024 * 1024);
    if (invalid) {
      setFiles([]);
      setError(invalid.type !== "application/pdf" ? `"${invalid.name}" is not a valid PDF.` : `"${invalid.name}" exceeds the 25 MB limit.`);
      return;
    }
    setFiles(selected);
    setStatus(`${selected.length} PDF file(s) selected. Each file will remain separate.`);
  }

  async function processOne(file, pdfjs, index, total, signatureBytes, sealBytes) {
    const source = new Uint8Array(await file.arrayBuffer());
    const sourceDoc = await pdfjs.getDocument({ data: source }).promise;
    if (!sourceDoc.numPages) throw new Error(`${file.name}: PDF has no pages.`);
    const output = await PDFDocument.create();
    const letterhead = await output.embedJpg(branding.letterhead.image).catch(async () => output.embedPng(branding.letterhead.image));
    const signature = signatureBytes ? await output.embedPng(signatureBytes) : null;
    const seal = sealBytes ? await output.embedPng(sealBytes) : null;
    let signedPages = 0;

    for (let n = 1; n <= sourceDoc.numPages; n++) {
      setStatus(`PDF ${index + 1}/${total}: ${file.name}, page ${n}/${sourceDoc.numPages}...`);
      const sourcePage = await sourceDoc.getPage(n);
      const textContent = await sourcePage.getTextContent();
      if (!(textContent.items || []).some(item => String(item.str || "").trim())) {
        throw new Error(`${file.name}, page ${n}: Scanned pages are not allowed. Upload a system-generated PDF with selectable text.`);
      }
      const signLocation = findAuthorizedSignLine(textContent.items);
      const viewport = sourcePage.getViewport({ scale: 1 });
      const renderScale = 2;
      const renderViewport = sourcePage.getViewport({ scale: renderScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      await sourcePage.render({ canvasContext: context, viewport: renderViewport }).promise;
      makeTransparentWhite(context, canvas);
      const transparentPage = await output.embedPng(imageBytes(canvas.toDataURL("image/png")));
      const outPage = output.addPage([viewport.width, viewport.height]);
      outPage.drawImage(letterhead, { x: 0, y: 0, width: viewport.width, height: viewport.height });
      outPage.drawImage(transparentPage, { x: 0, y: 0, width: viewport.width, height: viewport.height });
      if (placeAuthorizationMarks(outPage, signLocation, signature, seal)) signedPages++;
      canvas.width = 1; canvas.height = 1;
    }
    const bytes = await output.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    return {
      name: file.name.replace(/\\.pdf$/i, "") + "-letterhead.pdf",
      url: URL.createObjectURL(blob),
      pages: sourceDoc.numPages,
      signedPages
    };
  }

  async function createPdfs() {
    if (!files.length || !ready || (!hasSignature && !hasSeal)) return;
    setBusy(true); setError(""); setStatus("Starting PDF processing..."); setResults([]);
    try {
      const pdfjs = await import(/* @vite-ignore */ PDFJS_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      const signatureBytes = hasSignature ? imageBytes(branding.signature.image) : null;
      const sealBytes = hasSeal ? imageBytes(branding.seal.image) : null;
      const completed = [];
      for (let i = 0; i < files.length; i++) {
        completed.push(await processOne(files[i], pdfjs, i, files.length, signatureBytes, sealBytes));
      }
      setResults(completed);
      const totalSigned = completed.reduce((sum, item) => sum + item.signedPages, 0);
      setStatus(`Completed ${completed.length} separate PDF(s). Authorization marks placed on ${totalSigned} page(s).`);
    } catch (e) {
      setError(e?.message || "PDF processing failed. Check the files and profile branding.");
    } finally { setBusy(false); }
  }

  return <div style={{maxWidth:1100,margin:"0 auto",padding:"20px 16px"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:18}}>
      <div><h2 style={{margin:0}}>PDF Letterhead &amp; Auto Sign / Seal</h2><p style={{margin:"6px 0 0",color:"#64748b",fontSize:13}}>Upload multiple PDFs. Each file stays separate. Signature and seal are placed where an authorized-signature label is detected.</p></div>
      <button className="excel-button" onClick={onBack}>Back</button>
    </div>
    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:800,marginBottom:10}}>1. Upload system-generated PDF file(s)</div>
      <input type="file" accept="application/pdf,.pdf" multiple onChange={e=>handleFiles(e.target.files)}/>
      <div style={{fontSize:12,color:"#64748b",marginTop:8}}>Multiple PDFs supported. Maximum 25 MB per file. Scanned or image-only pages are not allowed.</div>
      {files.length>0&&<div style={{marginTop:10,fontSize:13}}><b>{files.length} file(s) selected</b><ul style={{margin:"6px 0 0",paddingLeft:20}}>{files.map((f,i)=><li key={i}>{f.name} · {(f.size/1024/1024).toFixed(1)} MB</li>)}</ul></div>}
    </div>
    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:800,marginBottom:10}}>2. Profile branding</div>
      <div style={{display:"flex",gap:18,flexWrap:"wrap",fontSize:13}}>
        <span>{ready ? "✓ Letterhead saved" : "✕ Letterhead missing"}</span>
        <span>{hasSignature ? "✓ Signature saved" : "Signature not configured"}</span>
        <span>{hasSeal ? "✓ Seal saved" : "Seal not configured"}</span>
      </div>
      {!ready&&<div style={{color:"#b45309",fontSize:13,marginTop:10}}>Add a company letterhead in Profile Settings before processing.</div>}
      {!hasSignature&&!hasSeal&&<div style={{color:"#b45309",fontSize:13,marginTop:10}}>Add a Signature or Company Seal in Profile Settings.</div>}
    </div>
    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:800,marginBottom:8}}>3. Automatic authorized-signature detection</div>
      <div style={{fontSize:13,color:"#475569",lineHeight:1.6}}>The system searches each page for phrases such as “Authorized Signatory &amp; Date”, “Authorized Signatory”, “Authorised Signature”, “Authorised Sign” and similar spelling variations. It places at most one signature/seal set on each page. Pages without a matching label are left unsigned.</div>
    </div>
    {error&&<div role="alert" style={{padding:12,borderRadius:8,background:"#fef2f2",color:"#b91c1c",marginBottom:12,fontSize:13}}>{error}</div>}
    {status&&<div role="status" style={{padding:12,borderRadius:8,background:"#eff6ff",color:"#1d4ed8",marginBottom:12,fontSize:13}}>{status}</div>}
    <div style={{display:"flex",justifyContent:"flex-end"}}><button className="excel-button green" disabled={!files.length||!ready||(!hasSignature&&!hasSeal)||busy} onClick={createPdfs}>{busy?"Processing PDFs...":`Process ${files.length||""} PDF(s) & Download`}</button></div>
    {results.length>0&&<div className="card" style={{padding:20,marginTop:16}}>
      <div style={{fontWeight:800,marginBottom:10}}>Separate PDF downloads</div>
      <div style={{display:"grid",gap:10}}>{results.map((item,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",borderBottom:"1px solid #e2e8f0",paddingBottom:8}}>
        <div style={{fontSize:13}}><b>{item.name}</b><div style={{color:"#64748b",fontSize:12}}>{item.pages} pages · Signature/seal placed on {item.signedPages} page(s)</div></div>
        <a href={item.url} download={item.name} className="excel-button green" style={{textDecoration:"none"}}>Download PDF</a>
      </div>)}</div>
    </div>}
  </div>;
}
