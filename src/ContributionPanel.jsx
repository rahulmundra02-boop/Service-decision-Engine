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
  const [donation, setDonation] = useState({ mobile: "", points: "1" });
  const [donateBusy, setDonateBusy] = useState(false);
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
      const cleaned = parsed.map(row => ({ ...row, vin: findVin(row) })).filter(row => row.vin);
      const unique = new Map(cleaned.map(row => [row.vin, row]));
      setRows([...unique.values()]);
      if (unique.size !== 50) setError(`File mein ${unique.size} unique VIN mile. Exactly 50 assigned VINs hone chahiye.`);
      else setMessage("50 unique VIN mile. Ensure karein ki is file ka data portal ke Bulk Vehicle upload pipeline se save ho chuka hai, phir task submit karein.");
    } catch { setError("Excel file read nahi hui. XLS/XLSX file try karein."); }
  }

  async function submitTask() {
    if (!task?.id || rows.length === 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (!file || typeof onUpload !== "function") throw new Error("Excel file select karein aur existing bulk upload pipeline ready hone dein.");
      const syncResult = await onUpload(file);
      if (!syncResult || syncResult.status !== "completed") throw new Error(syncResult?.backgroundError || "Bulk upload database sync complete nahi hua. Points award nahi kiye gaye.");
      const result = await callApi("submit-task", { taskId: task.id, rows });
      setMessage(result.pointsAwarded ? "Task complete! 1 point award hua." : "Task status update ho gaya.");
      setTask(null); setRows([]); setFile(null); if (fileRef.current) fileRef.current.value = "";
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
      setRows([]); setFile(null); if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function donate(e) {
    e.preventDefault(); setDonateBusy(true); setError(""); setMessage("");
    try {
      const result = await callApi("donate-points", { mobile: donation.mobile, points: Number(donation.points) });
      setMessage(result.message); setDonation({ mobile: "", points: "1" }); await refresh();
    } catch (e) { setError(e.message); }
    finally { setDonateBusy(false); }
  }

  if (!user || user.userType === "al_customer") return null;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const progress = Math.min(100, ((data?.earnedPoints || 0) / 50) * 100);

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
          <div><small>Next month eligibility</small><strong>{data.freeMonth ? "Free month" : data.adminExempt ? "Exempt" : data.earnedPoints >= 50 ? "Eligible" : `${data.earnedPoints}/50`}</strong></div>
        </div>
        <div className="contribution-progress"><span style={{ width: `${progress}%` }} /></div>
        <p className="contribution-help">{data.adminExempt ? "Admin accounts contribution target aur account inactivation se exempt hain." : data.freeMonth ? "November 2026 mein sabhi existing accounts ke liye access free hai. November ke earned points December eligibility ke liye count honge." : "Har successfully verified task = 1 point. Agle month ki eligibility ke liye pichhle month ke 50 points zaroori hain. Extra points month-end par expire honge."}</p>
        {tutorialUrl ? <a className="contribution-tutorial" href={tutorialUrl} target="_blank" rel="noreferrer">Contribution tutorial video dekhein ↗</a> : <p className="contribution-help">Tutorial video link abhi configure nahi hai.</p>}
        {task ? <div className="contribution-task">
          <div className="contribution-task-heading"><div><strong>Task assigned</strong><small>{task.vehicle_vins?.length || 50} VINs · Assigned {fmtDate(task.assigned_at)}</small></div><span className={seconds < 300 ? "contribution-timer urgent" : "contribution-timer"}>{mm}:{ss}</span></div>
          <details><summary>Assigned 50 VINs dekhein</summary><div className="contribution-vins">{(task.vehicle_vins || []).map(v => <code key={v}>{v}</code>)}</div></details>
          <label className="contribution-label">Bulk upload Excel file select karein (XLS/XLSX)</label>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={e => readFile(e.target.files?.[0])} />
          {file && <p className="contribution-help">File: {file.name} · {rows.length} unique VINs found</p>}
          <p className="contribution-help">Note: Submit se pehle file ka data portal ke existing Bulk Vehicle upload se database mein save hona chahiye. Points sirf tab milenge jab sabhi 50 VIN ki Job Card history verify ho.</p>
          <div className="contribution-actions">
            <button type="button" disabled={busy || rows.length === 0 || seconds <= 0} onClick={submitTask}>{busy ? "Please wait…" : "Verify & Submit Task"}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => taskAction("retry-task")}>Retry task</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => taskAction("cancel-task")}>Cancel task</button>
          </div>
        </div> : <button type="button" className="contribution-primary" disabled={busy || (!data.eligible && !data.adminExempt)} onClick={startTask}>{busy ? "Please wait…" : "Get 50-VIN Task"}</button>}
        <form className="contribution-donate" onSubmit={donate}>
          <strong>Donate points to a registered user</strong>
          <div className="contribution-donate-fields"><input aria-label="Registered mobile number" inputMode="numeric" maxLength={13} placeholder="Registered mobile number" value={donation.mobile} onChange={e=>setDonation(v=>({...v,mobile:e.target.value}))} required /><input aria-label="Points to donate" type="number" min="1" max="50" value={donation.points} onChange={e=>setDonation(v=>({...v,points:e.target.value}))} required /><button type="submit" disabled={donateBusy}>{donateBusy ? "Sending…" : "Donate"}</button></div>
        </form>
      </>}
    </div>}
  </section>;
}
