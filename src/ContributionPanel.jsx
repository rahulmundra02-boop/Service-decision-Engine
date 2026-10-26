import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import "./ContributionPanel.css";

const TOKEN_KEY = "serviceDecisionAuthToken";
const tutorialUrl = import.meta.env.VITE_CONTRIBUTION_TUTORIAL_URL || "";

async function callApi(action, payload = {}) {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const response = await fetch("/api/contributions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || "Request failed.");
  return data;
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function findVin(row) {
  const entries = Object.entries(row || {});
  const hit = entries.find(([key]) => /vin|chassis|vehicle identification/i.test(String(key).trim()));
  return String(hit?.[1] ?? "").trim().toUpperCase();
}

export default function ContributionPanel({ user, onUpload }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [task, setTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [pasteText, setPasteText] = useState("");
  const [uploadSummary, setUploadSummary] = useState(null);
  const [donation, setDonation] = useState({ mobile: "", points: "1" });
  const [donateBusy, setDonateBusy] = useState(false);
  const [recipientPreview, setRecipientPreview] = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const result = await callApi("dashboard");
      setData(result);
      if (result.activeTask) setTask(result.activeTask);
      else setTask(null);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!task?.expires_at && !task?.expiresAt) return undefined;
    const expires = new Date(task.expires_at || task.expiresAt).getTime();
    const tick = () => setSeconds(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [task]);
  useEffect(() => {
    if (seconds !== 0 || !task || !open) return;
    if (task.status === "Assigned") {
      setError("Task ka 60-minute timer expire ho gaya. Retry karke naya 60-minute attempt le sakte hain.");
      refresh();
    }
  }, [seconds, task, open, refresh]);

  async function startTask() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await callApi("assign-task");
      setTask(result.task); setMessage(result.existing ? "Aapka existing task restore kar diya." : "Task assigned. 60 minutes ke andar Excel upload karke submit karein.");
      setRows([]); setFile(null); await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function readFile(nextFile) {
    setFile(nextFile || null); setRows([]); setError(""); setMessage("");
    if (!nextFile) return;
    try {
      const buffer = await nextFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const assigned = new Set((task?.vehicle_vins || []).map(v => String(v).trim().toUpperCase()));
      const cleaned = parsed.map(row => ({ ...row, vin: findVin(row) })).filter(row => row.vin && (!assigned.size || assigned.has(row.vin)));
      const unique = new Map(cleaned.map(row => [row.vin, row]));
      setRows([...unique.values()]);
      setPasteText("");
      if (unique.size !== 50) setMessage(`${unique.size}/50 assigned VIN rows mile. Valid rows database mein save honge; sabhi 50 VIN ki Job Card history verify hone par hi point milega.`);
      else setMessage("50 assigned VIN rows mile. Submit karne par existing database history pipeline chalegi.");
    } catch { setError("Excel file read nahi hui. XLS/XLSX file try karein."); }
  }

  function readPaste(value) {
    setPasteText(value); setFile(null); setRows([]); setError(""); setMessage("");
    if (fileRef.current) fileRef.current.value = "";
    if (!value.trim()) return;
    try {
      const matrix = value.trim().split(/\r?\n/).map(line => line.split("\t"));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), "Pasted Data");
      const parsed = XLSX.utils.sheet_to_json(workbook.Sheets["Pasted Data"], { defval: "" });
      const assigned = new Set((task?.vehicle_vins || []).map(v => String(v).trim().toUpperCase()));
      const cleaned = parsed.map(row => ({ ...row, vin: findVin(row) })).filter(row => row.vin && (!assigned.size || assigned.has(row.vin)));
      const unique = new Map(cleaned.map(row => [row.vin, row]));
      setRows([...unique.values()]);
      if (unique.size !== 50) setMessage(`${unique.size}/50 assigned VIN rows pasted. Valid rows will still be saved; points require verified history for all 50 VINs.`);
      else setMessage("50 assigned VIN rows pasted. Submit to run the existing database history pipeline.");
    } catch { setError("Pasted Excel data read nahi hua. Header row ke saath tab-separated cells paste karein."); }
  }

  async function submitTask() {
    if (!task?.id || rows.length === 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if ((!file && !pasteText.trim()) || typeof onUpload !== "function") throw new Error("Excel file select karein ya header ke saath Excel cells paste karein.");
      let uploadFile = file;
      if (!uploadFile && pasteText.trim()) {
        const matrix = pasteText.trim().split(/\r?\n/).map(line => line.split("\t"));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), "Pasted Data");
        const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        uploadFile = new File([bytes], "contribution-paste.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      }
      const syncResult = await onUpload(uploadFile, task.vehicle_vins || []);
      if (!syncResult) throw new Error("Bulk upload pipeline ka final status nahi mila.");
      const diag = syncResult.diagnostic || {};
      setUploadSummary({
        filesSelected: Number(diag.filesSelected || 0),
        filesRead: Number(diag.filesRead || 0),
        repeatedFilesSkipped: Number(diag.repeatedFilesSkipped || 0),
        rowsReady: Number(diag.parsedRows || 0),
        duplicateRowsIgnored: Number(diag.duplicateRowsIgnored || 0),
        invalidRows: Array.isArray(diag.invalidRows) ? diag.invalidRows.length : 0,
        savedHistoryRows: Number(diag.jobCardsSaved || 0),
        status: diag.status || "completed"
      });
      const result = await callApi("submit-task", { taskId: task.id, rows: (task.vehicle_vins || []).map(vin => ({ vin })) });
      setMessage(result.pointsAwarded ? "Task complete! 1 point award hua." : "Task status update ho gaya.");
      setTask(null); setRows([]); setFile(null); setPasteText(""); if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) { setError(e.message); await refresh(); }
    finally { setBusy(false); }
  }

  async function taskAction(action) {
    if (!task?.id) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await callApi(action, { taskId: task.id });
      setMessage(action === "cancel-task" ? "Task cancel ho gaya." : "Retry start ho gaya. Timer reset: 60 minutes.");
      setRows([]); setFile(null); setPasteText(""); if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function donate(e) {
    e.preventDefault(); setDonateBusy(true); setError(""); setMessage("");
    try {
      const normalizedMobile = donation.mobile.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      if (!recipientPreview || recipientPreview.requestedMobile !== donation.mobile || String(recipientPreview.normalizedMobile) !== normalizedMobile) {
        const result = await callApi("lookup-recipient", { mobile: donation.mobile });
        setRecipientPreview({ ...result.recipient, normalizedMobile, requestedMobile: donation.mobile });
        setMessage("Recipient ka naam verify karein. Confirm karne ke baad hi points transfer honge.");
      } else {
        const result = await callApi("donate-points", { mobile: donation.mobile, points: Number(donation.points), receiverId: recipientPreview.id, confirmedName: recipientPreview.name });
        setMessage(result.message); setDonation({ mobile: "", points: "1" }); setRecipientPreview(null); await refresh();
      }
    } catch (e) { setError(e.message); setRecipientPreview(null); }
    finally { setDonateBusy(false); }
  }

  if (!user || user.userType === "al_customer") return null;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const progress = Math.min(100, ((data?.nextMonthBalance || 0) / 50) * 100);
  const targetReached = Number(data?.nextMonthBalance || 0) >= 50;

  return <section className="contribution-shell" aria-label="Monthly contribution">
    <button className="contribution-summary" type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
      <span className="contribution-summary-icon">★</span>
      <span className="contribution-summary-copy"><strong>Monthly Contribution</strong><small>{data?.freeMonth ? "November free for everyone" : data?.adminExempt ? "Admin account — contribution exempt" : `${data?.earnedPoints || 0}/50 points earned this month`}</small></span>
      <span className="contribution-summary-state">{open ? "Hide −" : "View +"}</span>
    </button>
    {open && <div className="contribution-body">
      {error && <div className="contribution-alert error" role="alert">{error}</div>}
      {message && <div className="contribution-alert success" role="status">{message}</div>}
      {!data ? <p>Contribution details load ho rahe hain…</p> : <>
        <div className="contribution-stats">
          <div><small>Current month</small><strong>{data.earnedPoints}/50</strong></div>
          <div><small>Available points</small><strong>{data.availablePoints}</strong></div>
          <div><small>Next month eligibility</small><strong>{data.adminExempt ? "Exempt" : data.freeMonth ? "Free month" : targetReached ? "Eligible" : `${data.nextMonthBalance || 0}/50`}</strong></div>
        </div>
        <div className={`contribution-progress ${targetReached ? "complete" : ""}`}><span style={{ width: `${progress}%` }} /></div><div className={`contribution-cup ${targetReached ? "complete" : ""}`} aria-live="polite"><span aria-hidden="true">{targetReached ? "🏆" : "🥤"}</span><strong>{targetReached ? "50-point target complete" : `${data.nextMonthBalance || 0}/50 points toward next month`}</strong></div>
        <p className="contribution-help">{data.adminExempt ? "Admin accounts contribution target aur account inactivation se exempt hain." : data.freeMonth ? "November 2026 mein sabhi existing accounts ke liye access free hai. November ke earned points December eligibility ke liye count honge." : "Har successfully verified task = 1 point. Agle month ki eligibility ke liye pichhle month ke 50 points zaroori hain. Extra points month-end par expire honge."}</p>
        {tutorialUrl ? <a className="contribution-tutorial" href={tutorialUrl} target="_blank" rel="noreferrer">Contribution tutorial video dekhein ↗</a> : <p className="contribution-help">Tutorial video link abhi configure nahi hai.</p>}
        {task ? <div className="contribution-task">
          <div className="contribution-task-heading"><div><strong>Task assigned</strong><small>{task.vehicle_vins?.length || 50} VINs · Assigned {fmtDate(task.assigned_at)}</small></div><span className={seconds < 300 ? "contribution-timer urgent" : "contribution-timer"}>{mm}:{ss}</span></div>
          <details><summary>Assigned 50 VINs dekhein</summary><div className="contribution-vins">{(task.vehicle_vins || []).map(v => <code key={v}>{v}</code>)}</div></details>
          <label className="contribution-label">Bulk upload Excel file select karein (XLS/XLSX)</label>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={e => readFile(e.target.files?.[0])} />
          <label className="contribution-label" htmlFor="contribution-paste-data">Ya Excel se header samet rows copy karke yahan paste karein</label>
          <textarea id="contribution-paste-data" className="contribution-paste" value={pasteText} onChange={e => readPaste(e.target.value)} placeholder="Header row + Excel rows yahan paste karein (Ctrl+C / Ctrl+V)" rows={4} />
          {(file || pasteText.trim()) && <p className="contribution-help">{file ? `File: ${file.name}` : "Pasted Excel data"} · {rows.length}/50 assigned VIN rows found</p>}
          <p className="contribution-help">Submit existing Bulk Vehicle upload parser aur database history pipeline chalata hai. Partial valid rows bhi save honge, lekin point sirf tab milega jab sabhi 50 assigned VINs ki Job Card history database mein verify ho.</p>
          {uploadSummary && <div className="contribution-upload-summary" role="status"><strong>Upload summary · {uploadSummary.status}</strong><div><span>Files read: {uploadSummary.filesRead}/{uploadSummary.filesSelected}</span><span>Repeated files skipped: {uploadSummary.repeatedFilesSkipped}</span><span>Rows ready: {uploadSummary.rowsReady}</span><span>Duplicate rows ignored: {uploadSummary.duplicateRowsIgnored}</span><span>Invalid rows: {uploadSummary.invalidRows}</span><span>New Job Cards saved: {uploadSummary.savedHistoryRows}</span></div></div>}
          <div className="contribution-actions">
            <button type="button" disabled={busy || rows.length === 0 || seconds <= 0} onClick={submitTask}>{busy ? "Please wait…" : "Verify & Submit Task"}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => taskAction("retry-task")}>Retry task</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => taskAction("cancel-task")}>Cancel task</button>
          </div>
        </div> : <button type="button" className="contribution-primary" disabled={busy || (!data.eligible && !data.adminExempt)} onClick={startTask}>{busy ? "Please wait…" : "Get 50-VIN Task"}</button>}
        <form className="contribution-donate" onSubmit={donate}>
          <strong>Donate points to a registered user</strong>
          <div className="contribution-donate-fields"><input aria-label="Registered mobile number" inputMode="numeric" maxLength={13} placeholder="Registered mobile number" value={donation.mobile} onChange={e=>{setDonation(v=>({...v,mobile:e.target.value}));setRecipientPreview(null);}} required /><input aria-label="Points to donate" type="number" min="1" max="50" value={donation.points} onChange={e=>setDonation(v=>({...v,points:e.target.value}))} required /><button type="submit" disabled={donateBusy}>{donateBusy ? "Please wait…" : recipientPreview && recipientPreview.requestedMobile === donation.mobile ? "Confirm & Donate" : "Verify Recipient"}</button></div>{recipientPreview && recipientPreview.requestedMobile === donation.mobile && <p className="contribution-help">Recipient: <strong>{recipientPreview.name || "Name not available"}</strong> · Mobile: {recipientPreview.mobile || donation.mobile}. Confirm name before tapping “Confirm &amp; Donate”.</p>}
        </form>
      </>}
    </div>}
  </section>;
}
