import { useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

function imageBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function parsePageSelection(value, total) {
  const selected = new Set();
  String(value || "").split(",").forEach(part => {
    const token = part.trim();
    if (!token) return;
    const range = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const start = Math.max(1, Number(range[1]));
      const end = Math.min(total, Number(range[2]));
      for (let n = start; n <= end; n++) selected.add(n - 1);
    } else if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n >= 1 && n <= total) selected.add(n - 1);
    }
  });
  return selected;
}
export default function PdfLetterheadTool({ user, onBack }) {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageInput, setPageInput] = useState("");
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const branding = user?.preferences || {};
  const ready = Boolean(branding.letterhead?.image);
  const hasSignature = Boolean(branding.signature?.image);
  const hasSeal = Boolean(branding.seal?.image);
  const selectedCount = useMemo(() => applyAll ? pageCount : parsePageSelection(pageInput, pageCount).size, [applyAll, pageInput, pageCount]);

  async function inspectPdf(selectedFile) {
    setError(""); setStatus(""); setFile(null); setPageCount(0); setPageInput("");
    if (!selectedFile || selectedFile.type !== "application/pdf") {
      setError("Please upload a valid system-generated PDF file.");
      return;
    }
    if (selectedFile.size > 25 * 1024 * 1024) {
      setError("PDF size must be 25 MB or less.");
      return;
    }
    try {
      const pdfjs = await import(/* @vite-ignore */ PDFJS_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      const data = new Uint8Array(await selectedFile.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise;
      if (!doc.numPages) throw new Error("The PDF has no pages.");
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const text = await page.getTextContent();
        const readable = (text.items || []).some(item => String(item.str || "").trim());
        if (!readable) throw new Error("Scanned pages are not allowed. Please upload a system-generated PDF with selectable text.");
      }
      setFile(selectedFile); setPageCount(doc.numPages);
      setPageInput(doc.numPages === 1 ? "1" : "");
      setStatus(`PDF verified. ${doc.numPages} text-based page(s) detected.`);
    } catch (e) {
      setError(e?.message || "Unable to read this PDF. Please upload a system-generated PDF.");
    }
  }

  async function createPdf() {
    if (!file || !ready) return;
    const selected = applyAll ? new Set(Array.from({length: pageCount}, (_, i) => i)) : parsePageSelection(pageInput, pageCount);
    if (!selected.size && (hasSignature || hasSeal)) {
      setError("Select at least one page for Signature / Seal, or choose all pages.");
      return;
    }
    setBusy(true); setError(""); setStatus("Preparing your PDF...");
    try {
      const pdfjs = await import(/* @vite-ignore */ PDFJS_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      const source = new Uint8Array(await file.arrayBuffer());
      const sourceDoc = await pdfjs.getDocument({ data: source }).promise;
      const output = await PDFDocument.create();
      const letterhead = await output.embedJpg(branding.letterhead.image).catch(async () => output.embedPng(branding.letterhead.image));
      const signature = hasSignature ? await output.embedPng(imageBytes(branding.signature.image)) : null;
      const seal = hasSeal ? await output.embedPng(imageBytes(branding.seal.image)) : null;
      for (let n = 1; n <= sourceDoc.numPages; n++) {
        setStatus(`Processing page ${n} of ${sourceDoc.numPages}...`);
        const page = await sourceDoc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const renderScale = 2;
        const renderViewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;

        // Remove only the white page matte. Preserve text, table borders, fills,
        // logos, lines and every other non-white PDF element as transparent PNG.
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        for (let p = 0; p < data.length; p += 4) {
          const r = data[p], g = data[p + 1], b = data[p + 2];
          const matte = Math.min(r, g, b);
          const alpha = 255 - matte;
          if (alpha <= 3) {
            data[p + 3] = 0;
            continue;
          }
          data[p] = Math.min(255, Math.round(((r - matte) * 255) / alpha));
          data[p + 1] = Math.min(255, Math.round(((g - matte) * 255) / alpha));
          data[p + 2] = Math.min(255, Math.round(((b - matte) * 255) / alpha));
          data[p + 3] = Math.round(data[p + 3] * alpha / 255);
        }
        context.putImageData(pixels, 0, 0);
        const transparentPage = await output.embedPng(imageBytes(canvas.toDataURL("image/png")));
        const outPage = output.addPage([viewport.width, viewport.height]);
        outPage.drawImage(letterhead, { x: 0, y: 0, width: viewport.width, height: viewport.height });
        outPage.drawImage(transparentPage, { x: 0, y: 0, width: viewport.width, height: viewport.height });

        if (selected.has(n - 1)) {
          let right = viewport.width - 24;
          const bottom = 24;
          if (seal) {
            const w = Math.min(88, viewport.width * 0.22);
            const h = w * (seal.height / seal.width);
            outPage.drawImage(seal, { x: right - w, y: bottom, width: w, height: h });
            right -= w + 8;
          }
          if (signature) {
            const w = Math.min(92, viewport.width * 0.23);
            const h = w * (signature.height / signature.width);
            outPage.drawImage(signature, { x: Math.max(18, right - w), y: bottom, width: w, height: h });
          }
        }
      }
      const bytes = await output.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name.replace(/\.pdf$/i, "") + "-letterhead.pdf";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setStatus("PDF created and downloaded successfully.");
    } catch (e) {
      setError(e?.message || "PDF processing failed. Please check the uploaded file and profile branding.");
    } finally { setBusy(false); }
  }

  return <div style={{maxWidth:1100,margin:"0 auto",padding:"20px 16px"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:18}}>
      <div><h2 style={{margin:0}}>PDF Letterhead &amp; Sign / Seal</h2><p style={{margin:"6px 0 0",color:"#64748b",fontSize:13}}>Apply your saved company letterhead and selected-page authorization marks.</p></div>
      <button className="excel-button" onClick={onBack}>Back</button>
    </div>
    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:800,marginBottom:10}}>1. Upload system-generated PDF</div>
      <input type="file" accept="application/pdf,.pdf" onChange={e=>inspectPdf(e.target.files?.[0])}/>
      <div style={{fontSize:12,color:"#64748b",marginTop:8}}>Scanned or image-only pages are not supported. Maximum file size: 25 MB.</div>
      {file && <div style={{marginTop:10,fontSize:13}}>Selected: <b>{file.name}</b> · {pageCount} page(s)</div>}
    </div>
    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:800,marginBottom:10}}>2. Profile branding</div>
      <div style={{display:"flex",gap:18,flexWrap:"wrap",fontSize:13}}>
        <span>{ready ? "✓ Letterhead saved" : "✕ Letterhead missing"}</span>
        <span>{hasSignature ? "✓ Signature saved" : "Signature not configured"}</span>
        <span>{hasSeal ? "✓ Seal saved" : "Seal not configured"}</span>
      </div>
      {!ready && <div style={{color:"#b45309",fontSize:13,marginTop:10}}>Add a company letterhead in Profile Settings before processing.</div>}
    </div>
    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:800,marginBottom:10}}>3. Select pages for Signature / Seal</div>
      <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,marginBottom:12}}><input type="checkbox" checked={applyAll} onChange={e=>setApplyAll(e.target.checked)}/> Apply Signature / Seal to all pages</label>
      {!applyAll && <input value={pageInput} onChange={e=>setPageInput(e.target.value)} placeholder="Example: 1, 3, 5-7" disabled={!pageCount} style={{width:"100%",maxWidth:360,padding:10,border:"1px solid #cbd5e1",borderRadius:7}}/>}
      <div style={{fontSize:12,color:"#64748b",marginTop:8}}>Enter page numbers separated by commas. Use ranges such as 2-4. Selected marks appear at the bottom-right of those pages.</div>
      {pageCount > 0 && <div style={{fontSize:13,marginTop:10}}>Pages selected: <b>{selectedCount}</b> of {pageCount}</div>}
    </div>
    {error && <div role="alert" style={{padding:12,borderRadius:8,background:"#fef2f2",color:"#b91c1c",marginBottom:12,fontSize:13}}>{error}</div>}
    {status && <div role="status" style={{padding:12,borderRadius:8,background:"#eff6ff",color:"#1d4ed8",marginBottom:12,fontSize:13}}>{status}</div>}
    <div style={{display:"flex",justifyContent:"flex-end"}}><button className="excel-button green" disabled={!file || !ready || busy} onClick={createPdf}>{busy ? "Processing..." : "Create & Download PDF"}</button></div>
  </div>;
}
