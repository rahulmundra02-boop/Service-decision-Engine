  const descriptionOptions=useMemo(()=>{
    const map=new Map();
    tags.forEach(tag=>{
      const isAmc=/^AMC$/i.test(warrantyText(tag.claimType));
      if(repairFilter==="AMC" && !isAmc) return;
      if(repairFilter==="NON_AMC" && isAmc) return;
      const desc=warrantyText(tag.partDesc);
      if(desc&&!map.has(desc)) map.set(desc,0);
      if(desc) map.set(desc,(map.get(desc)||0)+1);
    });
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  },[tags,repairFilter]);

  const descriptionOptions=useMemo(()=>{
    const map=new Map();
    tags.forEach(tag=>{
      const tagRepairType=getWarrantyRepairType(tag.claimType);
      if(repairFilter==="AMC" && tagRepairType!=="AMC") return;
      if(repairFilter==="NON_AMC" && tagRepairType!=="NON_AMC") return;
      const desc=warrantyText(tag.partDesc);
      if(desc&&!map.has(desc)) map.set(desc,0);
      if(desc) map.set(desc,(map.get(desc)||0)+1);
    });
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  },[tags,repairFilter]);

  const visibleTags=useMemo(()=>{
    return tags.filter(tag=>{
      const desc=warrantyText(tag.partDesc);
      if(removedDescriptions.includes(desc)) return false;
      const tagRepairType=getWarrantyRepairType(tag.claimType);
      if(repairFilter==="AMC") return tagRepairType==="AMC";
      if(repairFilter==="NON_AMC") return tagRepairType==="NON_AMC";
      return true;
    });
  },[tags,removedDescriptions,repairFilter]);

  const removeDescription=desc=>{
    setRemovedDescriptions(prev=>prev.includes(desc)?prev:[...prev,desc]);
  };
  const restoreDescription=desc=>{
    setRemovedDescriptions(prev=>prev.filter(x=>x!==desc));
  };

  const printTags=()=>{
    if(!visibleTags.length) return;
    window.print();
  };

  const downloadPdf=async()=>{
    if(!visibleTags.length||!printRootRef.current) return;
    setPdfBusy(true);setError("");setMessage("");
    try{
      const element=printRootRef.current;
      const opt={
        margin:0,
        filename:"Warranty_Tags.pdf",
        image:{type:"jpeg",quality:0.98},
        html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff"},
        jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},
        pagebreak:{mode:["css","legacy"]}
      };
      await html2pdf().set(opt).from(element).save();
      setMessage(visibleTags.length.toLocaleString("en-IN")+" tags PDF ready.");
    }catch(e){
      setError(e?.message||"PDF generate nahi ho saka.");
    }finally{setPdfBusy(false);}
  };

  const clearAll=()=>{
    setClaimFile(null);setSummaryFile(null);setClaimDataset(null);setSummaryDataset(null);
    setTags([]);setRemovedDescriptions([]);setRepairFilter("ALL");setError("");setMessage("");
  };

  return <>
    <div className="warranty-tag-workspace no-print">
      <div className="warranty-tag-header">
        <div><div className="sheet-heading">WARRANTY TAG PRINTING</div><div className="sheet-subheading">Billed JC Claim Statement + Jobcard Summary</div></div>
        <div className="warranty-tag-header-actions">
          <button className="excel-button" type="button" onClick={onBack}>← Home</button>
          <button className="excel-button" type="button" onClick={clearAll}>Clear</button>
        </div>
      </div>

      <div className="warranty-tag-info-grid">
        <div className="warranty-tag-info-card"><span>Workshop / Dealer</span><strong>{summaryDataset?.mapping?.workshopName||"-"}</strong></div>
        <div className="warranty-tag-info-card"><span>Barcode Source</span><strong>OEM Claim No.</strong></div>
        <div className="warranty-tag-info-card"><span>A4 Layout</span><strong>10 tags / page</strong></div>
        <div className="warranty-tag-info-card"><span>Selected Output</span><strong>{visibleTags.length?visibleTags.length.toLocaleString("en-IN")+" tags":"Not generated"}</strong></div>
      </div>

      <div className="warranty-tag-upload-grid">
        <div className="warranty-tag-upload-card">
          <div className="warranty-tag-upload-title">1. Billed JC Claim Statement</div>
          <div className="warranty-tag-upload-text">Mandatory: Job Card Number, Job Card Date, Registration Number, Chassis Number, Engine Number, Part / Labour code, Quantity, Part / Labour Desc, OEM Claim Number and Claim Creation Date.</div>
          <label className="warranty-tag-file-button"><input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={busy} onChange={event=>{const file=event.target.files?.[0]||null;event.target.value="";setClaimFile(file);if(file) void processClaimFile(file);}} />{claimFile?"Replace Claim Statement":"Select Excel File"}</label>
          {claimFile&&<div className="warranty-tag-file-name">{claimFile.name}</div>}
        </div>
        <div className="warranty-tag-upload-card">
          <div className="warranty-tag-upload-title">2. Jobcard Summary</div>
          <div className="warranty-tag-upload-text">Mandatory: Job Card No., KM Reading / HR Reading, km/hr and Servicing Company.</div>
          <label className="warranty-tag-file-button"><input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={busy} onChange={event=>{const file=event.target.files?.[0]||null;event.target.value="";setSummaryFile(file);if(file) void processSummaryFile(file);}} />{summaryFile?"Replace Jobcard Summary":"Select Excel File"}</label>
          {summaryFile&&<div className="warranty-tag-file-name">{summaryFile.name}</div>}
        </div>
      </div>

      <div className="warranty-tag-action-row">
        <button className="excel-button green" type="button" disabled={busy||!claimDataset||!summaryDataset} onClick={generateTags}>{busy?"Reading Excel...":"Generate Warranty Tags"}</button>
        {busy&&<span className="warranty-tag-busy">Processing Excel files…</span>}
      </div>

      {(error||message)&&<div className={"warranty-tag-message "+(error?"error":"success")}>{error||message}</div>}

      {tags.length>0&&<>
        <div className="warranty-tag-controls no-print">
          <div className="warranty-tag-control-block">
            <div className="warranty-tag-control-title">Repair Type</div>
            <div className="warranty-tag-filter-buttons">
              <button className={repairFilter==="AMC"?"active":""} type="button" onClick={()=>setRepairFilter("AMC")}>AMC</button>
              <button className={repairFilter==="NON_AMC"?"active":""} type="button" onClick={()=>setRepairFilter("NON_AMC")}>NON AMC</button>
              <button className={repairFilter==="ALL"?"active":""} type="button" onClick={()=>setRepairFilter("ALL")}>ALL REPAIR TYPES</button>
            </div>
          </div>
          <div className="warranty-tag-control-block">
            <div className="warranty-tag-control-title">Part Descriptions in Current Format</div>
            <div className="warranty-tag-part-list">
              {descriptionOptions.map(([desc,count])=>{
                const removed=removedDescriptions.includes(desc);
                return <div className={"warranty-tag-part-item "+(removed?"removed":"")} key={desc}>
                  <span>{desc}</span>
                  {removed
                    ? <button type="button" onClick={()=>restoreDescription(desc)}>Add</button>
                    : <button type="button" onClick={()=>removeDescription(desc)}>Remove</button>}
                </div>;
              })}
            </div>
          </div>
        </div>

        <div className="warranty-tag-print-controls no-print">
          <strong>Tag Print Area</strong>
          <span>{visibleTags.length.toLocaleString("en-IN")} tags selected · {Math.ceil(visibleTags.length/10)} A4 page(s)</span>
          <button className="excel-button green" type="button" disabled={!visibleTags.length} onClick={printTags}>Print Tags</button>
          <button className="excel-button" type="button" disabled={!visibleTags.length||pdfBusy} onClick={downloadPdf}>{pdfBusy?"Creating PDF...":"Download PDF"}</button>
        </div>
      </>}
    </div>

    {tags.length>0&&<div ref={printRootRef} className="warranty-tag-print-root">{Array.from({length:Math.ceil(visibleTags.length/10)},(_,pageIndex)=>{
      const pageTags=visibleTags.slice(pageIndex*10,pageIndex*10+10);
      return <div className="warranty-tag-page" key={"warranty-page-"+pageIndex}>{pageTags.map(tag=><WarrantyTag key={tag.id} tag={tag}/>)}</div>;
    })}</div>}
  </>;
}
function PortalHome({ user, onNavigate, onUpload, onClear, hasAnalysis, bulkResults, savedEstimates, savedEstimatesLoading, onOpenSavedEstimate, theme = "blue", onThemeChange }) {
  const dueVehicles = (bulkResults || []).filter(item => Array.isArray(item?.services) && item.services.length > 0).length;
  const totalVehicles = (bulkResults || []).length;
  const savedCount = Array.isArray(savedEstimates) ? savedEstimates.length : 0;
  const cards = [
    { key:"single", icon:"🚚", title:"Single Vehicle", text:"Check one vehicle service history, service requirements and completed work." },
    { key:"bulk", icon:"📊", title:"Bulk Vehicle", text:"Analyse multiple vehicles and prepare customer-wise service due summaries." },
    { key:"schedule", icon:"📅", title:"Service Schedule", text:"Review service intervals and applicable maintenance schedules." },
    { key:"estimate", icon:"🧾", title:"Prepare Estimate", text:"Open the existing Service Estimate module and prepare a vehicle estimate." },
    { key:"warranty-tags", icon:"🏷️", title:"Warranty Tag Print", text:"Generate and print warranty tags from Billed JC Claim Statement + Jobcard Summary." },
  ];
  return (
    <div className="portal-home">
      <div className="portal-home-hero">
        <div>
          <div className="portal-home-kicker">VEHICLE SERVICE MANAGEMENT</div>
          <h1>Welcome{user?.personName ? ", " + user.personName : ""}</h1>
          <p>Manage vehicle service history, service requirements, due schedules and estimates from one place.</p>
        </div>
        <div className="portal-home-hero-actions">
          <button className="excel-button green portal-upload-button" onClick={onUpload}>Upload DMS Excel</button>
          <button className="excel-button portal-upload-button" onClick={() => onNavigate("estimate")}>Prepare Estimate</button>
          <button className="excel-button" onClick={onClear}>Clear</button>
        </div>
      </div>
      <div className="home-theme-picker">
        <div className="home-theme-picker-title">Dashboard Theme</div>
        <div className="home-theme-options">
          {[["blue","Classic Blue"],["green","Excel Green"],["navy","Navy"],["teal","Teal"],["purple","Purple"]].map(([key,label]) => (
            <button key={key} type="button" className={`home-theme-option ${theme===key ? "active" : ""} theme-${key}`} onClick={() => onThemeChange?.(key)}>
              <span className="home-theme-swatch" aria-hidden="true"></span>{label}
            </button>
          ))}
        </div>
      </div>
      <div className="portal-kpi-grid">
        <div className="portal-kpi"><span>Vehicles in Current Upload</span><strong>{totalVehicles}</strong><small>Current session</small></div>
        <div className="portal-kpi"><span>Due Vehicles</span><strong>{dueVehicles}</strong><small>Current upload</small></div>
        <div className="portal-kpi"><span>Saved Estimates</span><strong>{savedCount}</strong><small>Available to open</small></div>
      </div>
      <div className="portal-section-title">Quick Actions</div>
      <div className="portal-action-grid">{cards.map(card => <button key={card.key} className="portal-action-card" onClick={() => onNavigate(card.key)}><span className="portal-action-icon">{card.icon}</span><span className="portal-action-title">{card.title}</span><span className="portal-action-text">{card.text}</span><span className="portal-action-link">Open →</span></button>)}
        <button className="portal-action-card" onClick={() => onNavigate("estimate")}><span className="portal-action-icon">🧾</span><span className="portal-action-title">Service Estimate</span><span className="portal-action-text">Prepare an estimate directly from Home. Vehicle details and parts can be loaded from the database or entered manually.</span><span className="portal-action-link">Open Estimate →</span></button>
      </div>
      <div className="home-estimate-preview" onClick={() => onNavigate("estimate")} role="button" tabIndex={0} onKeyDown={event => { if(event.key==="Enter" || event.key===" ") onNavigate("estimate"); }}>
        <div className="home-estimate-preview-head">
          <div><strong>SERVICE ESTIMATE</strong><span>Same estimate format • Click to open</span></div>
          <button type="button" className="excel-button green no-print" onClick={event => { event.stopPropagation(); onNavigate("estimate"); }}>Open Estimate</button>
        </div>
        <div className="home-estimate-preview-grid">
          <div><b>Vehicle No.</b><span>Vehicle number → DB lookup</span></div>
          <div><b>Vehicle Details</b><span>Customer, Model, Engine, Chassis / VIN</span></div>
          <div><b>Parts</b><span>Part No. → Description + MRP / Rate</span></div>
          <div><b>Qty / Rate / Amount</b><span>Editable estimate lines and totals</span></div>
        </div>
      </div>
      <div className="home-saved-estimates">
        <div className="portal-section-title">Saved Estimates</div>
        {savedEstimatesLoading ? (
          <div className="small-note">Loading saved estimates...</div>
        ) : savedEstimates.length ? (
          <div className="saved-estimate-list">
            {savedEstimates.map(item => (
              <button key={item.id} type="button" className="saved-estimate-row" onClick={() => onOpenSavedEstimate(item.id)}>
                <span><b>{item.estimate_no}</b><small>{item.vehicle_no || "Vehicle No. not entered"}</small></span>
                <span>Open →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="small-note">No saved estimates yet.</div>
        )}
      </div>
      <div className="portal-workflow"><div><b>Workflow</b><span>Upload DMS Excel → Analyse → Review Service History → Prepare Estimate / Share Due Summary</span></div><div><b>Personalisation</b><span>Theme is selected from Home. Columns, custom names and table widths are saved in Profile &amp; Settings.</span></div></div>
    </div>
  );
}
function ServiceDecisionApp({ user }) {
  const [excelData, setExcelData] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [overrideReading, setOverrideReading] = useState("");
  const [appliedOverride, setAppliedOverride] = useState(null);
  const [decisionBasis, setDecisionBasis] = useState("AUTO");
  const [mode, setMode] = useState("home");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkMeta, setBulkMeta] = useState(null);
  const [customerGroups, setCustomerGroups] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [mergedCustomerName, setMergedCustomerName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMeta, setUploadMeta] = useState(null);
  const [uploadParsedRecords, setUploadParsedRecords] = useState([]);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateStage, setEstimateStage] = useState("select");
  const [estimateHistory, setEstimateHistory] = useState([]);
  const [estimateVehicle, setEstimateVehicle] = useState({ customerName:"", reg:"", vin:"", engine:"", model:"", sale:null });
  const [estimateVehicleNo, setEstimateVehicleNo] = useState("");
  const [estimateVehicleLookupBusy, setEstimateVehicleLookupBusy] = useState(false);
  const [estimateVehicleLookupMessage, setEstimateVehicleLookupMessage] = useState("");
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateSelectedServices, setEstimateSelectedServices] = useState([]);
  const [estimateParts, setEstimateParts] = useState([]);
  const [estimateLabour, setEstimateLabour] = useState([]);
  const [estimateNotice, setEstimateNotice] = useState("");
  const [estimateNumber, setEstimateNumber] = useState("");
  const [estimateSavedId, setEstimateSavedId] = useState(null);
  const [savedEstimates, setSavedEstimates] = useState([]);
  const [savedEstimatesLoading, setSavedEstimatesLoading] = useState(false);
  const [estimateSaveBusy, setEstimateSaveBusy] = useState(false);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkQuickFilter, setBulkQuickFilter] = useState("all");
  const [manualPartLookupBusy, setManualPartLookupBusy] = useState({});
  const [customerVoice, setCustomerVoice] = useState("");
  const [remark, setRemark] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState("schedule");
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState("");

  const defaultSingleColumns = ["date","jobCard","reading","plant","parts"];
  const defaultBulkColumns = ["customerName","vin","reg","saleDate","model","currentReading","services"];
  const defaultSingleLabels = { date:"Date", jobCard:"Job Card", reading:"Reading", plant:"Plant", parts:"Part No. / Service / Qty" };
  const defaultBulkLabels = { customerName:"Customer Name", vin:"VIN", reg:"Reg. No.", saleDate:"Sale Date", model:"Model", currentReading:"Current Reading", services:"Service To Be Completed" };
  const defaultSingleWidths = { date:8, jobCard:10, reading:10, plant:12, parts:60 };
  const defaultBulkWidths = { serial:6, customerName:15, vin:12, reg:11, saleDate:10, model:12, currentReading:12, services:22 };
  const normalizeWidthMap = (widths, keys) => {
    const source = { ...widths };
    const values = keys.map(key => Math.max(1, Number(source[key] || 0)));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const factor = 100 / total;
    const normalized = {};
    let running = 0;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        normalized[key] = Number((100 - running).toFixed(2));
      } else {
        normalized[key] = Number((values[index] * factor).toFixed(2));
        running += normalized[key];
      }
    });
    return normalized;
  };
  const normalizeDashboardPrefs = (preferences = {}) => {
    const singleColumns = Array.isArray(preferences.singleColumns) && preferences.singleColumns.length ? preferences.singleColumns : defaultSingleColumns;
    const bulkColumns = Array.isArray(preferences.bulkColumns) && preferences.bulkColumns.length ? preferences.bulkColumns : defaultBulkColumns;
    const singleWidthKeys = singleColumns;
    const bulkWidthKeys = ["serial", ...bulkColumns];
    return {
      ...preferences,
      singleColumns,
      bulkColumns,
      singleColumnLabels: { ...defaultSingleLabels, ...(preferences.singleColumnLabels || {}) },
      bulkColumnLabels: { ...defaultBulkLabels, ...(preferences.bulkColumnLabels || {}) },
      singleColumnWidths: normalizeWidthMap({ ...defaultSingleWidths, ...(preferences.singleColumnWidths || {}) }, singleWidthKeys),
      bulkColumnWidths: normalizeWidthMap({ ...defaultBulkWidths, ...(preferences.bulkColumnWidths || {}) }, bulkWidthKeys),
    };
  };
  const [dashboardPrefs, setDashboardPrefs] = useState(() => normalizeDashboardPrefs(user?.preferences || {}));
  const changeDashboardTheme = (theme) => { const nextTheme = String(theme || "blue"); void persistDashboardPrefs({ ...dashboardPrefs, theme: nextTheme }); };
  useEffect(() => { setDashboardPrefs(normalizeDashboardPrefs(user?.preferences || {})); }, [user?.id, user?.preferences]);
  const singleTableColumns = dashboardPrefs.singleColumns;
  const bulkTableColumns = dashboardPrefs.bulkColumns;
  const singleColumnLabels = dashboardPrefs.singleColumnLabels;
  const bulkColumnLabels = dashboardPrefs.bulkColumnLabels;
  const singleColumnWidths = dashboardPrefs.singleColumnWidths;
  const bulkColumnWidths = dashboardPrefs.bulkColumnWidths;
  const isSingleColumnVisible = key => singleTableColumns.includes(key);
  const isBulkColumnVisible = key => bulkTableColumns.includes(key);
  const persistDashboardPrefs = async (nextPrefs) => {
    setDashboardPrefs(nextPrefs);
    const token = localStorage.getItem("serviceDecisionAuthToken");
    if (!token) return;
    try {
      const response = await fetch("/api/auth", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body:JSON.stringify({ action:"update-profile", dashboardOnly:true, preferences:nextPrefs }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || "Unable to save table preferences.");
    } catch (error) { console.error("Dashboard preference save failed:", error); }
  };
  const resizeTableColumn = (tableType, key, event) => {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.parentElement;
    const table = th?.closest("table");
    if (!th || !table) return;

    const visibleKeys = tableType === "single"
      ? singleTableColumns.filter(isSingleColumnVisible)
      : ["serial", ...bulkTableColumns.filter(isBulkColumnVisible)];
    const lastKey = visibleKeys[visibleKeys.length - 1];
    if (!lastKey || key === lastKey) return;

    const startX = event.clientX;
    const tableWidth = Math.max(1, table.getBoundingClientRect().width);
    const sourceKey = tableType === "single" ? "singleColumnWidths" : "bulkColumnWidths";
    let latestWidths = tableType === "single" ? { ...singleColumnWidths } : { ...bulkColumnWidths };
    const startSourcePct = Number(latestWidths[key] || 10);
    const startLastPct = Number(latestWidths[lastKey] || 10);
    const minPct = 3;

    const onMove = (moveEvent) => {
      const deltaPct = ((moveEvent.clientX - startX) / tableWidth) * 100;
      const sourcePct = Math.max(minPct, Math.min(90, startSourcePct + deltaPct));
      const actualDelta = sourcePct - startSourcePct;
      const lastPct = Math.max(minPct, startLastPct - actualDelta);
      latestWidths = {
        ...latestWidths,
        [key]: Number(sourcePct.toFixed(2)),
        [lastKey]: Number(lastPct.toFixed(2)),
      };
      setDashboardPrefs(prev => ({ ...prev, [sourceKey]: latestWidths }));
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      void persistDashboardPrefs({ ...dashboardPrefs, [sourceKey]: latestWidths });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };
  const tableColumnStyle = (tableType, key) => ({ width:`${Number((tableType === "single" ? singleColumnWidths[key] : bulkColumnWidths[key]) || 10)}%` });

  const [bulkTableSort, setBulkTableSort] = useState({ key: "dueCount", direction: "desc" });
  const [bulkTableFilters, setBulkTableFilters] = useState({
    customerName: "",
    vin: "",
    reg: "",
    saleDate: "",
    model: "",
    currentReading: "",
    services: "",
  });
  const [bulkFilterSelections, setBulkFilterSelections] = useState({
    customerName: [],
    vin: [],
    reg: [],
    saleDate: [],
    model: [],
    currentReading: [],
    services: [],
  });
  const [openBulkFilter, setOpenBulkFilter] = useState(null);

  const logUsage = (activityType, payload = {}) => {
    const token = localStorage.getItem("serviceDecisionAuthToken");
    if (!token) return;
    void fetch("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action:"log-activity", activityType, ...payload }),
    }).catch(() => {});
  };

  const previewRows = useMemo(() => {
    if (!excelData.trim()) return [];
    return excelData.trim().split(/\r?\n/).slice(0, 6);
  }, [excelData]);
  const todayDisplay = (() => {
    const d = new Date();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(d.getDate()).padStart(2,"0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
  })();



  // ============================================================
  // BACKGROUND DATABASE SYNC
  // Excel parsing/decision calculation must NOT wait for DB.
  // Localhost uses the existing Express backend.
  // Production uses the same-origin Vercel /api/save-history function.
  // ============================================================
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3001"
      : "");

  async function fetchEmergencyDbUploadCutoff() {
    try {
      const response = await fetch("/api/auth", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ action:"emergency-db-upload-cutoff-settings" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || "Emergency DB upload cutoff status unavailable.");
      }
      return { enabled:data?.settings?.enabled === true, statusAvailable:true };
    } catch (error) {
      console.warn("Emergency DB upload cutoff status unavailable; pausing DB history save for safety.", error);
      return { enabled:true, statusAvailable:false };
    }
  }

  async function checkNewJobCards(apiBaseUrl, jobCards) {
    const uniqueJobCards = [...new Set(
      (jobCards || []).map(normalizeJobCard).filter(Boolean)
    )];

    if (!uniqueJobCards.length) return new Set();

    const response = await fetch(`${apiBaseUrl}/api/save-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check-job-cards",
        jobCards: uniqueJobCards,
      }),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Job Card duplicate check failed (${response.status})`);
    }

    return new Set(
      (payload.newJobCards || []).map(normalizeJobCard).filter(Boolean)
    );
  }

  async function saveHistoryToBackend({ records, vehicle }) {
    const response = await fetch(`${API_BASE_URL}/api/save-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records,
        vehicle: {
          ...vehicle,
          sale: vehicle?.sale instanceof Date
            ? vehicle.sale.toISOString()
            : vehicle?.sale || null,
        },
      }),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `History save failed (${response.status})`);
    }

    if (Array.isArray(payload.insertedJobCardNumbers) && payload.insertedJobCardNumbers.length) {
      await addJobCardsToBrowserIndex(payload.insertedJobCardNumbers);
    }

    return payload;
  }

  async function saveHistoryInBackground(records) {
    const groups = new Map();
    for (const record of records || []) {
      const vin = String(record?.vin || "").trim().toUpperCase();
      if (!vin) continue;
      if (!groups.has(vin)) groups.set(vin, []);
      groups.get(vin).push(record);
    }

    const jobs = [...groups.entries()];
    if (!jobs.length) return;

    const concurrency = Math.min(4, jobs.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < jobs.length) {
        const index = nextIndex++;
        const [, vehicleRecords] = jobs[index];
        try {
          const vehicle = deriveVehicle(vehicleRecords);
          await saveHistoryToBackend({ records: vehicleRecords, vehicle });
        } catch (error) {
          console.error("Background history save failed:", error);
        }
      }
    }

    await Promise.all(
      Array.from({ length: concurrency }, () => worker())
    );
  }

  const handleExcelUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setError("");
    setUploadBusy(true);

    try {
      const result = await parseExcelFiles(files);
      const parsedRows = result.records || [];

      setExcelData("");
      const acceptedFiles = files.filter(file => result.files.includes(file.name));
      setUploadedFiles(acceptedFiles);
      setUploadMeta({
        files: result.files,
        failedFiles: result.failedFiles || [],
        rowsBefore: result.totalRowsBeforeDedup,
        duplicates: result.duplicateRowsIgnored,
        rowsAfter: parsedRows.length,
      });

      setAnalysis(null);
      setBulkResults([]);
      setBulkMeta(null);
      setCustomerGroups([]);
      setSelectedCustomers([]);
      setUploadParsedRecords(parsedRows);
      if (parsedRows.length) {
        const uploadedVins = new Set(
          parsedRows.map(r => String(r?.vin || "").trim().toUpperCase()).filter(Boolean)
        );
        setMode(uploadedVins.size > 1 ? "bulk" : "single");
      }
      if (parsedRows.length) {
        logUsage("Excel Upload", {
          fileCount: acceptedFiles.length,
          vehicleCount: new Set(parsedRows.map(r=>String(r.vin||"").trim().toUpperCase()).filter(Boolean)).size,
          details: { rows: parsedRows.length, files: acceptedFiles.map(f=>f.name) }
        });
      }

      if (!parsedRows.length && result.failedFiles?.length) {
        setError(
          result.failedFiles
            .map(item => `${item.name} — This file was ignored because required header was not found. ${item.reason}`)
            .join(" | ")
        );
      } else {
        // Service Decision always uses the complete parsed Excel data.
        // Emergency cutoff affects only DB persistence.
        if (parsedRows.length) {
          const cutoff = await fetchEmergencyDbUploadCutoff();

          if (cutoff.enabled) {
            console.warn(
              cutoff.statusAvailable
                ? "Emergency DB Upload Cutoff is active. Skipping DB history persistence."
                : "Emergency DB Upload Cutoff status unavailable. DB history persistence is paused for safety."
            );
          } else {
            const allJobCards = parsedRows
              .map(record => normalizeJobCard(record?.jobCard))
              .filter(Boolean);

            const newJobCards = await getHybridNewJobCards(
              API_BASE_URL,
              allJobCards,
              (candidateJobCards) => checkNewJobCards(API_BASE_URL, candidateJobCards)
            );

            const recordsForBackend = parsedRows.filter(record => {
              const jobCard = normalizeJobCard(record?.jobCard);
              return !!jobCard && newJobCards.has(jobCard);
            });

            if (recordsForBackend.length) {
              void saveHistoryInBackground(recordsForBackend);
            }
          }
        }
      }
    } catch (err) {
      setUploadMeta(null);
      setUploadedFiles([]);
      setUploadParsedRecords([]);
      setError(err?.message || "Excel file read nahi ho payi.");
    } finally {
      setUploadBusy(false);
      event.target.value = "";
    }
  };

  const getAnalysisRecords = () => {
    if (uploadParsedRecords.length) {
      return {
        headers: [],
        records: uploadParsedRecords,
        headerMap: {}
      };
    }
    return parseExcelPaste(excelData);
  };

  const analyze = () => {
    setError("");
    try {
      const parsed = getAnalysisRecords();
      const uniqueVins = [...new Set(
        parsed.records
          .map(r => String(r.vin || '').trim().toUpperCase())
          .filter(Boolean)
      )];

      // Single Vehicle button automatically switches to Bulk when the input
      // contains more than one VIN. No second upload/paste is required.
      if(uniqueVins.length > 1){
        const results = buildBulkAnalysis(parsed.records);
        const groups = buildCustomerGroups(results, user?.dealerName);
        setAnalysis(null);
        setOverrideReading("");
        setAppliedOverride(null);
        setBulkResults(results);
        setCustomerGroups(groups);
        setSelectedCustomers([]);
        setBulkTableSort({ key: "dueCount", direction: "desc" });
        setBulkTableFilters({
          customerName: "",
          vin: "",
          reg: "",
          saleDate: "",
          model: "",
          currentReading: "",
          services: "",
        });
        setBulkFilterSelections({
          customerName: [],
          vin: [],
          reg: [],
          saleDate: [],
          model: [],
          currentReading: [],
          services: [],
        });
        setOpenBulkFilter(null);
        setBulkMeta({ records: parsed.records.length, vehicles: results.length, customers: groups.length });
        setMode("bulk");
        logUsage("Bulk Vehicle Analysis", {
          mode:"bulk",
          vehicleCount:results.length,
          fileCount:uploadedFiles.length,
          details:{ rows:parsed.records.length, customers:groups.length, automatic:true }
        });
        setError(`Multiple Vehicle Detected: ${uniqueVins.length} unique VINs found. Automatically switched to Bulk Service.`);
        return;
      }

      const vehicle = deriveVehicle(parsed.records);
      const running = deriveRunningReading(parsed.records, vehicle);
      const visits = aggregateHistory(parsed.records);
      const decision = calculateDecisions(parsed.records, vehicle, running);
      const vinForCampaign = String(vehicle?.vin || parsed.records?.[0]?.vin || "").trim().toUpperCase();
      setCampaigns([]);
      if (vinForCampaign) {
        setCampaignLoading(true);
        void fetch("/api/auth", {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            ...(localStorage.getItem("serviceDecisionAuthToken")
              ? {Authorization:`Bearer ${localStorage.getItem("serviceDecisionAuthToken")}`}
              : {})
          },
          body:JSON.stringify({action:"campaigns-by-vin",vin:vinForCampaign})
        })
          .then(response => response.json().then(data => ({response,data})))
          .then(({response,data}) => {
            if (!response.ok || data?.success === false) {
              throw new Error(data?.error || "Campaign lookup failed.");
            }
            setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
          })
          .catch(error => {
            console.warn("Campaign lookup failed:", error);
            setCampaigns([]);
          })
          .finally(() => setCampaignLoading(false));
      } else {
        setCampaignLoading(false);
      }
      setOverrideReading("");
      setAppliedOverride(null);
      setDecisionBasis(running?.unit === "HRS" ? "HRS" : "KM");
      setAnalysis({ ...parsed, vehicle, running, visits, decision });
      setRemark("");
      setCustomerVoice("");
      setHistoryViewMode("schedule");
      logUsage("Single Vehicle Analysis", {
        mode:"single",
        vehicleCount:1,
        fileCount:uploadedFiles.length,
        vin:String(vehicle?.vin || parsed.records?.[0]?.vin || "").trim().toUpperCase(),
        details:{ serviceCount:(decision?.services || []).length }
      });
    } catch (e) {
      setAnalysis(null);
      setError(e.message || "Excel data read nahi ho paya.");
    }
  };

  const analyzeBulk = () => {
    setError("");
    try {
      const parsed = getAnalysisRecords();
      const results = buildBulkAnalysis(parsed.records);
      setBulkResults(results);
      const groups = buildCustomerGroups(results, user?.dealerName);
      setCustomerGroups(groups);
      setSelectedCustomers([]);
      setBulkTableSort({ key: "dueCount", direction: "desc" });
      setBulkTableFilters({
        customerName: "",
        vin: "",
        reg: "",
        saleDate: "",
        model: "",
        currentReading: "",
        services: "",
      });
      setBulkFilterSelections({
        customerName: [],
        vin: [],
        reg: [],
        saleDate: [],
        model: [],
        currentReading: [],
        services: [],
      });
      setOpenBulkFilter(null);
      setBulkMeta({ records: parsed.records.length, vehicles: results.length, customers: groups.length });
      logUsage("Bulk Vehicle Analysis", {
        mode:"bulk",
        vehicleCount:results.length,
        fileCount:uploadedFiles.length,
        details:{ rows:parsed.records.length, customers:groups.length }
      });
    } catch (e) {
      setBulkResults([]);
      setBulkMeta(null);
      setError(e.message || "Bulk data read nahi ho paya.");
    }
  };

  const recalculateWithOverride = () => {
    if (!analysis) return;

    const basis = getEffectiveDecisionBasis(analysis.vehicle, decisionBasis);
    logUsage("Reading / Decision Basis Override", {
      mode:"single",
      vehicleCount:1,
      vin:String(analysis?.vehicle?.vin || "").trim().toUpperCase(),
      details:{ value:overrideReading || "", unit:basis, basis }
    });

    const raw = String(overrideReading || "").replace(/,/g, "").trim();
    const baseRunning = deriveRunningReadingForBasis(analysis.records, analysis.vehicle, basis);

    if (!raw) {
      const decision = calculateDecisions(analysis.records, analysis.vehicle, baseRunning, basis);
      setAppliedOverride(null);
      setAnalysis(prev => ({ ...prev, running: baseRunning, decision }));
      return;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      const msg = `Please enter a valid ${basis} value.`;
      setError(msg);
      window.alert(msg);
      return;
    }

    const historicalReadings = analysis.records
      .map(r => getRelevantReadingForBasis(r, basis))
      .filter(v => Number.isFinite(v) && v > 0);
    const highestRecorded = historicalReadings.length ? Math.max(...historicalReadings) : 0;

    if (highestRecorded > 0 && value < highestRecorded) {
      setAppliedOverride(null);
      const msg = `Invalid ${basis} reading!\n\nEntered: ${formatNumber(value)} ${basis}\nPrevious recorded reading: ${formatNumber(highestRecorded)} ${basis}\n\nPlease enter a reading equal to or higher than the previous recorded reading.`;
      setError(msg.replace(/\n/g, " "));
      window.alert(msg);
      return;
    }

    setError("");
    const overriddenRunning = {
      ...baseRunning,
      current: value,
      mode: "User override",
      unit: basis
    };
    const decision = calculateDecisions(analysis.records, analysis.vehicle, overriddenRunning, basis);
    setAppliedOverride(value);
    setAnalysis(prev => ({ ...prev, running: overriddenRunning, decision }));
  };

  const changeDecisionBasis = (nextBasis) => {
    const basis = getEffectiveDecisionBasis(analysis?.vehicle, nextBasis);
    setDecisionBasis(basis);
    setOverrideReading("");
    setAppliedOverride(null);
    setError("");

    if (!analysis) return;

    // When the user changes only the decision basis and does not enter an
    // override reading, use the automatically derived running reading for
    // the selected basis.
    const running = deriveRunningReadingForBasis(analysis.records, analysis.vehicle, basis);
    const decision = calculateDecisions(analysis.records, analysis.vehicle, running, basis);
    setAnalysis(prev => ({ ...prev, running, decision }));
  };

  const getBulkSortValue = (item, key) => {
    const vehicle = item?.vehicle || {};
    switch (key) {
      case "customerName": return String(vehicle.customerName || "").toUpperCase();
      case "vin": return String(item?.vin || vehicle.vin || "").toUpperCase();
      case "reg": return String(vehicle.reg || "").toUpperCase();
      case "saleDate": return vehicle.sale ? vehicle.sale.getTime() : 0;
      case "model": return String(vehicle.model || "").toUpperCase();
      case "currentReading": return Number(item?.running?.current || 0);
      case "services": return String(item?.services?.join(", ") || "").toUpperCase();
      case "dueCount": return Number(item?.dueCount || item?.services?.length || 0);
      default: return "";
    }
  };

  const getBulkDisplayValues = (item) => {
    const vehicle = item?.vehicle || {};
    return {
      customerName: String(vehicle.customerName || "-"),
      vin: String(item?.vin || vehicle.vin || "-"),
      reg: String(vehicle.reg || "-"),
      saleDate: vehicle.sale ? formatDateShort(vehicle.sale) : "-",
      model: String(vehicle.model || "-"),
      currentReading: item.running?.current
        ? `${formatNumber(item.running.current)} ${item.running.unit || getTargetUnit(vehicle)}`
        : "-",
      services: String(item.services?.join(", ") || "-"),
    };
  };

  const bulkFilterValueLists = useMemo(() => {
    const sourceRows = bulkResults.filter(item =>
      Array.isArray(item.services) && item.services.length > 0
    );
    const lists = {};
    const keys = ["customerName", "vin", "reg", "saleDate", "model", "currentReading", "services"];

    for (const key of keys) {
      lists[key] = [...new Set(
        sourceRows.map(item => getBulkDisplayValues(item)[key])
      )].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base"
        })
      );
    }

    return lists;
  }, [bulkResults]);

  const bulkSummaryRows = useMemo(() => {
    const search = bulkSearch.trim().toLowerCase();
    const rows = bulkResults
      .filter(item => bulkQuickFilter === "all" || (Array.isArray(item.services) && item.services.length > 0))
      .filter(item => {
        if (!search) return true;
        const values = getBulkDisplayValues(item);
        return Object.values(values).some(value => String(value ?? "").toLowerCase().includes(search));
      })
      .filter(item => {
        const values = getBulkDisplayValues(item);

        return Object.entries(bulkFilterSelections).every(([key, selected]) => {
          if (!Array.isArray(selected) || selected.length === 0) return true;
          return selected.includes(values[key]);
        });
      });

    const sorted = [...rows].sort((a, b) => {
      const av = getBulkSortValue(a, bulkTableSort.key);
      const bv = getBulkSortValue(b, bulkTableSort.key);

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * (bulkTableSort.direction === "asc" ? 1 : -1);
      }

      return String(av).localeCompare(
        String(bv),
        undefined,
        { numeric: true, sensitivity: "base" }
      ) * (bulkTableSort.direction === "asc" ? 1 : -1);
    });

    return sorted;
  }, [bulkResults, bulkFilterSelections, bulkTableSort, bulkSearch, bulkQuickFilter]);

  const openBulkFilterMenu = (key, event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    setOpenBulkFilter({
      key,
      label: {
        customerName: "Customer Name",
        vin: "VIN",
        reg: "Reg. No.",
        saleDate: "Sale Date",
        model: "Model",
        currentReading: "Current Reading",
        services: "Service To Be Completed",
      }[key],
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    });
  };

  const applyBulkFilter = (key, selectedValues) => {
    setBulkFilterSelections(prev => ({
      ...prev,
      [key]: selectedValues,
    }));
    setOpenBulkFilter(null);
  };

  const clearBulkFilter = (key) => {
    setBulkFilterSelections(prev => ({
      ...prev,
      [key]: [],
    }));
    setOpenBulkFilter(null);
  };

  const downloadBulkCsv = () => {
    const exportColumns = [
      ["serial", "S.No."],
      ["customerName", bulkColumnLabels.customerName || "Customer Name"],
      ["vin", bulkColumnLabels.vin || "VIN"],
      ["reg", bulkColumnLabels.reg || "Reg. No."],
      ["saleDate", bulkColumnLabels.saleDate || "Sale Date"],
      ["model", bulkColumnLabels.model || "Model"],
      ["currentReading", bulkColumnLabels.currentReading || "Current Reading"],
      ["services", bulkColumnLabels.services || "Service To Be Completed"],
    ].filter(([key]) => key === "serial" || isBulkColumnVisible(key));

    const rows = bulkSummaryRows.map((item, index) => {
      const values = getBulkDisplayValues(item);
      return Object.fromEntries(
        exportColumns.map(([key, label]) => [
          label,
          key === "serial" ? index + 1 : (values[key] === "-" ? "" : values[key]),
        ])
      );
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Due Summary");
    XLSX.writeFile(book, "Service_Due_Summary.xlsx");
  };

  const clearAllBulkFilters = () => {
    setBulkFilterSelections({
      customerName: [],
      vin: [],
      reg: [],
      saleDate: [],
      model: [],
      currentReading: [],
      services: [],
    });
    setBulkTableSort({ key: "dueCount", direction: "desc" });
    setBulkSearch("");
    setBulkQuickFilter("all");
    setOpenBulkFilter(null);
  };

  const sortBulkByColumn = (key, direction) => {
    setBulkTableSort({ key, direction });
  };

  const clear = () => {
    if ((analysis || bulkResults.length || uploadedFiles.length) && !window.confirm("Clear the current vehicle data and analysis?")) return;
    logUsage("Clear", { mode, details:{ hadAnalysis:Boolean(analysis), uploadedFiles:uploadedFiles.length } });
    setExcelData("");
    setAnalysis(null);
    setError("");
    setOverrideReading("");
    setAppliedOverride(null);
    setHistoryViewMode("schedule");
    setBulkResults([]);
    setBulkMeta(null);
    setCustomerGroups([]);
    setSelectedCustomers([]);
    setMergedCustomerName("");
    setUploadedFiles([]);
    setUploadBusy(false);
    setUploadMeta(null);
    setUploadParsedRecords([]);
    setBulkTableSort({ key: "dueCount", direction: "desc" });
    setBulkSearch("");
    setBulkQuickFilter("all");
    setBulkTableFilters({
      customerName: "",
      vin: "",
      reg: "",
      saleDate: "",
      model: "",
      currentReading: "",
      services: "",
    });
    setBulkFilterSelections({
      customerName: [],
      vin: [],
      reg: [],
      saleDate: [],
      model: [],
      currentReading: [],
      services: [],
    });
    setOpenBulkFilter(null);
    setCampaigns([]);
    setCampaignLoading(false);
  };

  // App-style Escape navigation:
  // 1. Close an open Excel filter first.
  // 2. From Service Schedule / Bulk Vehicle, go back to Single Vehicle.
  // 3. From a loaded Single Vehicle screen, perform the same action as Clear.
  // 4. On the empty Single Vehicle home screen, Escape safely behaves like Clear.
  useEffect(() => {
    const handleEscapeNavigation = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();

      if (openBulkFilter) {
        setOpenBulkFilter(null);
        return;
      }

      if (mode === "schedule") {
        setMode("single");
        setError("");
        return;
      }

      if (mode === "bulk") {
        setMode("single");
        setError("");
        return;
      }

      clear();
    };

    window.addEventListener("keydown", handleEscapeNavigation, true);
    return () => window.removeEventListener("keydown", handleEscapeNavigation, true);
  }, [mode, openBulkFilter, analysis, uploadParsedRecords.length]);

  async function loadEstimateHistoryByVin(vin) {
    const response = await fetch("/api/save-history?vin=" + encodeURIComponent(vin));
    const data = await response.json();
    return { vehicleRows:Array.isArray(data?.rows)?data.rows:[], modelRows:Array.isArray(data?.modelRows)?data.modelRows:[], globalPartRates:Array.isArray(data?.globalPartRates)?data.globalPartRates:[] };
  }

  async function openEstimate() {
    if (!analysis?.vehicle?.vin) return;
    const dueKeys = BULK_SERVICE_LABELS.filter(([, key]) => analysis?.decision?.result?.[key]).map(([, key]) => key);
    setEstimateVehicle({ customerName:analysis?.vehicle?.customerName||"", reg:analysis?.vehicle?.reg||"", vin:analysis?.vehicle?.vin||"", engine:analysis?.vehicle?.engine||"", model:analysis?.vehicle?.model||"", sale:analysis?.vehicle?.sale||null });
    setEstimateVehicleNo(analysis?.vehicle?.reg||"");
    setEstimateSelectedServices(dueKeys);
    setEstimateSavedId(null);
    setEstimateNumber("EST-" + new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,"0") + String(new Date().getDate()).padStart(2,"0") + "-" + String(Date.now()).slice(-5));
    setEstimateParts([]); setEstimateLabour([]); setEstimateNotice(""); setEstimateVehicleLookupMessage("");
    setEstimateStage("select"); setEstimateOpen(true); setEstimateLoading(true);
    try {
      const history=await loadEstimateHistoryByVin(analysis.vehicle.vin);
      setEstimateHistory(history);
      setEstimateNotice(history.vehicleRows.length||history.modelRows.length ? "Vehicle history loaded. Missing items will be sourced from the same model history in DB." : "No historical service data found. Estimate items can be entered manually.");
    } catch {
      setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
      setEstimateNotice("Historical data could not be loaded. Manual estimate entry is available.");
    } finally { setEstimateLoading(false); }
  }

  function openStandaloneEstimate() {
    setEstimateVehicle({customerName:"",reg:"",vin:"",engine:"",model:"",sale:null});
    setEstimateVehicleNo("");
    setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
    setEstimateSelectedServices([]); setEstimateParts([]); setEstimateLabour([]);
    setEstimateNotice(""); setEstimateVehicleLookupMessage("");
    setEstimateSavedId(null);
    setEstimateNumber("EST-" + new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,"0") + String(new Date().getDate()).padStart(2,"0") + "-" + String(Date.now()).slice(-5));
    setEstimateStage("vehicle"); setEstimateOpen(true);
  }

  async function loadSavedEstimates() {
    setSavedEstimatesLoading(true);
    try {
      const token = localStorage.getItem("serviceDecisionAuthToken");
      if (!token) return;
      const response = await fetch("/api/estimates", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body:JSON.stringify({ action:"list" }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) setSavedEstimates(Array.isArray(data.estimates) ? data.estimates : []);
    } catch (error) {
      console.warn("Saved estimate list load failed:", error);
    } finally {
      setSavedEstimatesLoading(false);
    }
  }

  async function saveEstimateToDb() {
    const vehicleNo = String(estimateVehicle?.reg || estimateVehicleNo || "").replace(/\s+/g,"").trim().toUpperCase();
    if (!vehicleNo) {
      setEstimateNotice("Vehicle No. is required before saving the estimate.");
      return;
    }
    if (!estimateNumber) {
      setEstimateNotice("Estimate number is missing. Please start a new estimate.");
      return;
    }

    setEstimateSaveBusy(true);
    try {
      const token = localStorage.getItem("serviceDecisionAuthToken");
      const response = await fetch("/api/estimates", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body:JSON.stringify({
          action:"save",
          estimateNo:estimateNumber,
          vehicleNo,
          vehicle:{
            ...estimateVehicle,
            sale:estimateVehicle?.sale instanceof Date ? estimateVehicle.sale.toISOString() : estimateVehicle?.sale || null,
          },
          selectedServices:estimateSelectedServices,
          parts:estimateParts,
          labour:estimateLabour,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to save estimate.");
      setEstimateSavedId(data.estimate?.id || estimateSavedId);
      setEstimateNotice(`Estimate ${estimateNumber} saved successfully. Future saves will update the same estimate number.`);
      await loadSavedEstimates();
    } catch (error) {
      setEstimateNotice(error.message || "Unable to save estimate.");
    } finally {
      setEstimateSaveBusy(false);
    }
  }

  async function openSavedEstimate(id) {
    setEstimateLoading(true);
    setEstimateOpen(true);
    try {
      const token = localStorage.getItem("serviceDecisionAuthToken");
      const response = await fetch("/api/estimates", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body:JSON.stringify({ action:"get", id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.estimate) throw new Error(data.error || "Unable to load saved estimate.");

      const saved = data.estimate;
      const vehicle = saved.vehicle_data || {};
      setEstimateSavedId(saved.id);
      setEstimateNumber(saved.estimate_no || "");
      setEstimateVehicleNo(String(saved.vehicle_no || vehicle.reg || "").replace(/\s+/g,"").toUpperCase());
      setEstimateVehicle({
        customerName:vehicle.customerName || "",
        reg:String(vehicle.reg || saved.vehicle_no || "").replace(/\s+/g,"").toUpperCase(),
        vin:vehicle.vin || "",
        engine:vehicle.engine || "",
        model:vehicle.model || "",
        sale:vehicle.sale ? new Date(vehicle.sale) : null,
      });
      setEstimateSelectedServices(Array.isArray(saved.selected_services) ? saved.selected_services : []);
      setEstimateParts(Array.isArray(saved.parts) ? saved.parts : []);
      setEstimateLabour(Array.isArray(saved.labour) ? saved.labour : []);
      setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
      setEstimateNotice("Saved estimate loaded. You can edit it and save again; the estimate number will remain unchanged.");
      setEstimateStage("estimate");
    } catch (error) {
      setEstimateOpen(false);setMode("home");
      setError(error.message || "Unable to load saved estimate.");
    } finally {
      setEstimateLoading(false);
    }
  }

  useEffect(() => {
    if (user?.id) void loadSavedEstimates();
  }, [user?.id]);

  async function lookupEstimateVehicle() {
    const registration=String(estimateVehicleNo||"").replace(/\s+/g,"").trim().toUpperCase();
    setEstimateVehicleNo(registration);
    if(!registration){ setEstimateVehicleLookupMessage("Please enter Vehicle No."); return; }
    setEstimateVehicleLookupBusy(true); setEstimateVehicleLookupMessage("");
    try {
      const response=await fetch("/api/save-history?registration="+encodeURIComponent(registration));
      const data=await response.json().catch(()=>({}));
      const rows=Array.isArray(data?.rows)?data.rows:[];
      const dbVehicle=data?.vehicle || rows[0] || null;
      if(dbVehicle){
        setEstimateVehicle({
          customerName:dbVehicle?.customer_name||"",
          reg:String(dbVehicle?.registration||registration).replace(/\s+/g,"").toUpperCase(),
          vin:String(dbVehicle?.vin||"").trim().toUpperCase(),
          engine:dbVehicle?.engine||"",
          model:dbVehicle?.model||"",
          sale:dbVehicle?.sale_date?new Date(dbVehicle.sale_date):null
        });
        setEstimateHistory({vehicleRows:rows,modelRows:Array.isArray(data?.modelRows)?data.modelRows:[],globalPartRates:Array.isArray(data?.globalPartRates)?data.globalPartRates:[]});
        setEstimateVehicleLookupMessage(rows.length
          ? "Vehicle found in DB. Details loaded automatically."
          : "Vehicle found in DB. No service history is available; enter estimate lines manually.");

      } else {
        setEstimateVehicle(prev=>({...prev,reg:registration,vin:""}));
        setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
        setEstimateVehicleLookupMessage("Vehicle not found in DB. Enter the vehicle/customer details manually below.");
      }
    } catch {
      setEstimateVehicle(prev=>({...prev,reg:registration,vin:""}));
      setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
      setEstimateVehicleLookupMessage("DB lookup failed. You can continue with manual vehicle details.");
    } finally {
      setEstimateVehicleLookupBusy(false);
      setEstimateStage("estimate");
    }
  }

  function prepareEstimate() {
    const history = Array.isArray(estimateHistory)
      ? { vehicleRows: estimateHistory, modelRows: [] }
      : (estimateHistory || { vehicleRows: [], modelRows: [] });

    // A saved estimate already contains its edited parts/labour. Changing
    // aggregate-service selection must not rebuild and erase those saved edits.
    if (estimateSavedId && !(history.vehicleRows?.length || history.modelRows?.length)) {
      setEstimateNotice("Aggregate service selection updated. Your existing saved estimate lines are retained.");
      setEstimateStage("estimate");
      return;
    }

    const items = estimateHistoryToItems(
      history.vehicleRows || [],
      estimateSelectedServices,
      history.modelRows || [],
      history.globalPartRates || []
    );
    setEstimateParts(items.filter(item => item.type === "part"));
    setEstimateLabour(items.filter(item => item.type === "labour"));
    setEstimateNotice(
      (history.vehicleRows?.length || history.modelRows?.length)
        ? "Estimate prepared from vehicle history and same-model DB fallback. You can edit every line or add missing items manually."
        : "No historical estimate items found. Please add the required items manually."
    );
    setEstimateStage("estimate");
  }
  function reviseEstimateServices() { setEstimateStage("select"); }
  function updateEstimateItem(type, id, field, value) {
    const setter = type === "labour" ? setEstimateLabour : setEstimateParts;
    setter(prev => prev.map(item => item.id === id ? { ...item, [field]: value, source:"Manual" } : item));
  }

  function normalizeEstimateQuantities() {
    setEstimateParts(prev => prev.map(item => ({ ...item, qty:String(item.qty ?? "").trim()==="" ? 1 : Number(item.qty) || 0 })));
    setEstimateLabour(prev => prev.map(item => ({ ...item, qty:String(item.qty ?? "").trim()==="" ? 1 : Number(item.qty) || 0 })));
  }
  async function lookupManualEstimatePart(id, partNo) {
    const code = String(partNo || "").replace(/\s+/g,"").trim().toUpperCase();
    if (!code) return;
    setManualPartLookupBusy(prev => ({...prev,[id]:true}));
    try {
      const response = await fetch("/api/save-history?partNo=" + encodeURIComponent(code));
      const data = await response.json().catch(() => ({}));
      if (data.part) setEstimateParts(prev => prev.map(item => item.id === id ? {...item,partNo:data.part.partNo||code,description:data.part.description||item.description,rate:Number(data.part.rateInclGst||0),baseRate:Number(data.part.rate||0),source:"Historical DB - exact Part No."} : item));
    } catch (err) { console.warn("Manual estimate part lookup:",err); }
    finally { setManualPartLookupBusy(prev => ({...prev,[id]:false})); }
  }
  function addEstimateItem(type) { (type === "labour" ? setEstimateLabour : setEstimateParts)(prev => [...prev, emptyEstimateItem(type)]); }
  function removeEstimateItem(type, id) {
    (type === "labour" ? setEstimateLabour : setEstimateParts)(prev => prev.filter(item => item.id !== id));
  }
  const estimatePartsTotal = estimateParts.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.rate||0),0);
  const estimateLabourBase = estimateLabour.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.rate||0),0);
  const estimateLabourGst = estimateLabourBase*0.18;
  const estimateLabourTotal = estimateLabourBase+estimateLabourGst;
  const estimateGrandTotal = estimatePartsTotal+estimateLabourTotal;
  function buildEstimatePdf(autoPrint = false) {
    const pdf = new jsPDF({ unit:"mm", format:"a4", orientation:"portrait", compress:true });
    const margin = 10;
    const width = 190;
    const vehicle = estimateVehicle || analysis?.vehicle || {};
    const workshop = String(user?.dealerName || "Workshop").trim();

    // jsPDF's built-in Helvetica does not render the ₹ glyph reliably.
    // Use plain ASCII "INR" in the PDF so Adobe/Edge do not show broken
    // characters or artificial digit spacing.
    const money = value => {
      const n = Number(value || 0);
      return "INR " + n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    pdf.setFont("helvetica","bold");
    pdf.setFontSize(17);
    pdf.text("SERVICE ESTIMATE",105,14,{align:"center"});
    pdf.setFontSize(10);
    pdf.text(workshop,105,21,{align:"center"});
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8.5);
    pdf.text("Estimate only - subject to actual inspection and applicable rates.",105,25,{align:"center"});
    pdf.setFontSize(8);
    pdf.text("Estimate No. (Session): " + (estimateNumber || "-"),margin,30);
    pdf.text("Prepared: " + formatDate(new Date()),width + margin,30,{align:"right"});

    autoTable(pdf,{
      startY:35,
      margin:{left:margin,right:margin},
      tableWidth:width,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8.5,
        cellPadding:3,
        lineColor:[150,150,150],
        lineWidth:0.2
      },
      body:[
        ["Customer\n"+(vehicle.customerName||"-"),"Reg. No.\n"+(vehicle.reg||"-"),"VIN\n"+(vehicle.vin||"-")],
        ["Model\n"+(vehicle.model||"-"),"Current Reading\n"+(analysis?.running?.current ? formatNumber(analysis.running.current)+" "+(analysis.running.unit||getTargetUnit(vehicle)) : "-"),"Date\n"+formatDate(new Date())]
      ]
    });

    let y=(pdf.lastAutoTable?.finalY||58)+7;
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(10);
    pdf.text("Selected Aggregate Services",margin,y);
    y+=4;

    const selectedNames=BULK_SERVICE_LABELS
      .filter(([,key])=>estimateSelectedServices.includes(key))
      .map(([name])=>name);

    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8.5);
    pdf.text(
      selectedNames.length ? selectedNames.join(", ") : "No aggregate service selected",
      margin,
      y+3,
      {maxWidth:width}
    );
    y+=selectedNames.length?9:7;

    autoTable(pdf,{
      startY:y,
      margin:{left:margin,right:margin},
      tableWidth:width,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8,
        cellPadding:2.5,
        lineColor:[150,150,150],
        lineWidth:0.2,
        overflow:"linebreak"
      },
      head:[["Part No.","Description","Qty","Rate (Incl. GST)","Amount"]],
      body:estimateParts.length
        ? estimateParts.map(item=>[
            item.partNo||"-",
            item.description||"-",
            formatQty(item.qty),
            money(item.rate),
            money(Number(item.qty||0)*Number(item.rate||0))
          ])
        : [["-","No parts added","-","-",money(0)]],
      columnStyles:{
        0:{cellWidth:28},
        1:{cellWidth:82},
        2:{cellWidth:18},
        3:{cellWidth:27},
        4:{cellWidth:35}
      }
    });

    y=(pdf.lastAutoTable?.finalY||y+20)+7;
    pdf.setFont("helvetica","bold");
    pdf.text("Labour",margin,y);
    y+=4;

    autoTable(pdf,{
      startY:y,
      margin:{left:margin,right:margin},
      tableWidth:width,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8,
        cellPadding:2.5,
        lineColor:[150,150,150],
        lineWidth:0.2,
        overflow:"linebreak"
      },
      head:[["Description","Qty","Rate","Amount"]],
      body:estimateLabour.length
        ? estimateLabour.map(item=>[
            item.description||"-",
            formatQty(item.qty),
            money(item.rate),
            money(Number(item.qty||0)*Number(item.rate||0))
          ])
        : [["No labour added","-","-",money(0)]],
      columnStyles:{
        0:{cellWidth:110},
        1:{cellWidth:20},
        2:{cellWidth:25},
        3:{cellWidth:35}
      }
    });

    y=(pdf.lastAutoTable?.finalY||y+20)+7;

    autoTable(pdf,{
      startY:y,
      margin:{left:120,right:margin},
      tableWidth:80,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8.5,
        cellPadding:3,
        lineColor:[150,150,150],
        lineWidth:0.2
      },
      body:[
        ["Parts Total (GST Incl.)",money(estimatePartsTotal)],
        ["Labour Subtotal",money(estimateLabourBase)],
        ["GST on Labour (18%)",money(estimateLabourGst)],
        ["Grand Total",money(estimateGrandTotal)]
      ],
      columnStyles:{
        0:{cellWidth:45,fontStyle:"bold"},
        1:{cellWidth:35,halign:"right"}
      }
    });

    y=(pdf.lastAutoTable?.finalY||y+25)+12;
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8);
    pdf.line(140,y-2,190,y-2);
    pdf.text("Authorized Signatory",165,y,{align:"center"});

    if(autoPrint){
      pdf.autoPrint();
      window.open(pdf.output("bloburl"),"_blank");
    } else {
      const fileName=("Service_Estimate_"+(vehicle.reg||vehicle.vin||"Vehicle")+".pdf")
        .replace(/[^a-z0-9_.-]+/gi,"_");
      pdf.save(fileName);
    }
  }
  const visibleSingleVisits = analysis?.visits?.filter((visit) =>
    historyViewMode === "full" || isScheduledHistoryVisit(visit, analysis.vehicle, analysis.decision)
  ) || [];

  const captureSingleScreenshot = async () => {
    if (screenshotBusy) return;

    const source = document.getElementById("single-screenshot-area");
    if (!source) {
      setScreenshotStatus("Analyze a vehicle first.");
      return;
    }

    setScreenshotBusy(true);
    setScreenshotStatus("Preparing screenshot...");

    let clone = null;
    try {
      const heading = source.querySelector(".sheet-heading");
      const captureStart = heading || source.firstElementChild || source;
      const viewportHeight = Math.max(window.innerHeight || 700, 700);
      const maxCaptureHeight = Math.round(viewportHeight * 2.5);
      const sourceRect = source.getBoundingClientRect();
      const headingRect = captureStart.getBoundingClientRect();
      const sourceWidth = Math.max(1, Math.ceil(sourceRect.width));
      const sourceHeight = Math.max(
        1,
        Math.min(
          Math.max(source.scrollHeight, headingRect.bottom - sourceRect.top),
          maxCaptureHeight
        )
      );

      clone = source.cloneNode(true);
clone.removeAttribute("id");

const themeRoot = source.closest(".excel-app");
if (themeRoot) {
  const themeClass = Array.from(themeRoot.classList).find((className) =>
    className.startsWith("theme-")
  );

  if (themeClass) {
    clone.classList.add(themeClass);
  }

  const computedTheme = window.getComputedStyle(themeRoot);
  ["--theme", "--theme-dark", "--theme-soft", "--theme-bg", "--theme-accent"].forEach((property) => {
    const value = computedTheme.getPropertyValue(property).trim();
    if (value) {
      clone.style.setProperty(property, value);
    }
  });
}

clone.style.position = "absolute";
clone.style.left = "-100000px";
clone.style.top = "0";
clone.style.width = sourceWidth + "px";
clone.style.height = sourceHeight + "px";
clone.style.maxHeight = sourceHeight + "px";
clone.style.overflow = "hidden";
clone.style.margin = "0";
clone.style.boxSizing = "border-box";
clone.style.zIndex = "999999";
clone.style.transform = "none";
clone.style.transformOrigin = "top left";

      const originalControls = source.querySelectorAll("input, textarea, select");
      const clonedControls = clone.querySelectorAll("input, textarea, select");
      originalControls.forEach((originalControl, index) => {
        const clonedControl = clonedControls[index];
        if (!clonedControl) return;
        if (originalControl instanceof HTMLInputElement) {
          clonedControl.value = originalControl.value;
          clonedControl.checked = originalControl.checked;
      } else if (originalControl instanceof HTMLTextAreaElement) {
  const value = originalControl.value;

  clonedControl.value = value;
  clonedControl.textContent = value;

  const rect = originalControl.getBoundingClientRect();
  clonedControl.style.height = rect.height + "px";
  clonedControl.style.whiteSpace = "pre-wrap";
  clonedControl.style.overflowWrap = "anywhere";
  clonedControl.style.wordBreak = "break-word";

  const lineBreakOverlay = document.createElement("div");
  lineBreakOverlay.textContent = value;
  lineBreakOverlay.style.position = "absolute";
  lineBreakOverlay.style.left = rect.left + "px";
  lineBreakOverlay.style.top = rect.top + "px";
  lineBreakOverlay.style.width = rect.width + "px";
  lineBreakOverlay.style.height = rect.height + "px";
  lineBreakOverlay.style.boxSizing = "border-box";
  lineBreakOverlay.style.padding = window.getComputedStyle(originalControl).padding;
  lineBreakOverlay.style.font = window.getComputedStyle(originalControl).font;
  lineBreakOverlay.style.lineHeight = window.getComputedStyle(originalControl).lineHeight;
  lineBreakOverlay.style.textAlign = window.getComputedStyle(originalControl).textAlign;
  lineBreakOverlay.style.color = window.getComputedStyle(originalControl).color;
  lineBreakOverlay.style.background = "transparent";
  lineBreakOverlay.style.whiteSpace = "pre-wrap";
  lineBreakOverlay.style.overflowWrap = "anywhere";
  lineBreakOverlay.style.wordBreak = "break-word";
  lineBreakOverlay.style.pointerEvents = "none";
  lineBreakOverlay.style.zIndex = "1000000";

  clonedControl.style.color = "transparent";
  clonedControl.style.caretColor = "transparent";

  clone.appendChild(lineBreakOverlay);
} else if (originalControl instanceof HTMLSelectElement) {
  clonedControl.value = originalControl.value;
}
      });

      document.body.appendChild(clone);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        useCORS: true,
        scale: 2.5,
        width: sourceWidth,
        height: sourceHeight,
        windowWidth: sourceWidth,
        windowHeight: sourceHeight,
        scrollX: 0,
        scrollY: 0,
      });

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to create PNG.")), "image/png");
      });

      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard is not supported by this browser.");
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ]);

      setScreenshotStatus("Screenshot copied to clipboard.");
      window.setTimeout(() => setScreenshotStatus(""), 2500);
    } catch (error) {
      console.error("Single vehicle screenshot failed:", error);
      setScreenshotStatus("Screenshot could not be copied. Please allow clipboard access and try again.");
      window.setTimeout(() => setScreenshotStatus(""), 5000);
    } finally {
      if (clone?.parentNode) clone.parentNode.removeChild(clone);
      setScreenshotBusy(false);
    }
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #d9e2f3; font-family: Calibri, Arial, sans-serif; color: #1f1f1f; }
        .excel-app { min-height: 100vh; background: #d9e2f3; }
        .table-width-compact { min-width:560px !important; }.table-width-normal { min-width:760px !important; }.table-width-wide { min-width:100% !important;}
        .theme-green .excel-titlebar,.theme-green .section-title {background:#217346 !important}.theme-navy .excel-titlebar,.theme-navy .section-title {background:#17365d !important}.theme-teal .excel-titlebar,.theme-teal .section-title {background:#0f766e !important}.theme-purple .excel-titlebar,.theme-purple .section-title {background:#6b46c1 !important}
        .theme-blue { --theme:#4472c4; --theme-dark:#1f4e78; --theme-soft:#d9eaf7; --theme-bg:#eef5fb; --theme-accent:#217346; }
        .theme-green { --theme:#217346; --theme-dark:#185c37; --theme-soft:#e2f0d9; --theme-bg:#f1f8f3; --theme-accent:#217346; }
        .theme-navy { --theme:#17365d; --theme-dark:#102a47; --theme-soft:#dbe7f4; --theme-bg:#edf2f8; --theme-accent:#17365d; }
        .theme-teal { --theme:#0f766e; --theme-dark:#0b5f59; --theme-soft:#d9f1ef; --theme-bg:#eef9f8; --theme-accent:#0f766e; }
        .theme-purple { --theme:#6b46c1; --theme-dark:#5535a0; --theme-soft:#ece5fb; --theme-bg:#f6f2fc; --theme-accent:#6b46c1; }
        .excel-app { background:var(--theme-bg) !important; }
        .excel-window { border-color:var(--theme); }
        .excel-titlebar { background:var(--theme) !important; }
        .excel-ribbon,.excel-toolbar { border-color:var(--theme-soft); }
        .excel-tab.active { color:var(--theme) !important; border-bottom-color:var(--theme); }
        .sheet-heading,.section-title,.portal-section-title { background:var(--theme) !important; border-color:var(--theme-dark) !important; }
        .sheet-subheading { background:var(--theme-soft); border-color:var(--theme); color:var(--theme-dark); }
        .portal-home-hero { background:linear-gradient(135deg,var(--theme-bg),#fff); border-color:var(--theme); }
        .portal-home-kicker,.portal-action-title,.portal-workflow b,.portal-kpi strong { color:var(--theme-dark) !important; }
        .portal-action-card,.portal-kpi,.bulk-overview-card,.home-estimate-preview { border-color:color-mix(in srgb,var(--theme) 35%,#c7d1da); }
        .portal-action-card:hover:not(:disabled),.home-estimate-preview:hover { border-color:var(--theme); }
        .portal-action-link { color:var(--theme) !important; }
        .portal-workflow div,.decision-basis,.decision-status-card { border-color:color-mix(in srgb,var(--theme) 28%,#d7dee4); background:var(--theme-bg); }
        .decision-table th,.history-table th { background:var(--theme) !important; }
        .cell.section { background:var(--theme) !important; }
        .cell.label { background:var(--theme-soft); color:var(--theme-dark); }
        .status-pill.blue { background:var(--theme-soft); color:var(--theme-dark); border-color:var(--theme); }
        .upload-area { border-color:var(--theme); background:var(--theme-bg); }
        .excel-input:focus { outline-color:var(--theme); }
        .excel-button.green { background:var(--theme); border-color:var(--theme-dark); }
        .excel-button.green:hover:not(:disabled) { background:var(--theme-dark); }
        .excel-tab.active { background:#fff; }
        .home-theme-picker { margin:12px 0 0; padding:10px 12px; border:1px solid color-mix(in srgb,var(--theme) 28%,#d7dee4); background:var(--theme-bg); border-radius:6px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .home-theme-picker-title { font-size:12px; font-weight:800; color:var(--theme-dark); white-space:nowrap; }
        .home-theme-options { display:flex; gap:6px; flex-wrap:wrap; }
        .home-theme-option { display:inline-flex; align-items:center; gap:6px; border:1px solid #b7c3cd; background:#fff; color:#34495a; border-radius:5px; padding:6px 9px; font:700 11px Calibri,Arial,sans-serif; cursor:pointer; }
        .home-theme-option.active { border-color:var(--theme); background:var(--theme); color:#fff; }
        .home-theme-swatch { width:10px; height:10px; border-radius:50%; background:#4472c4; display:inline-block; border:1px solid rgba(0,0,0,.15); }
        .home-theme-option.theme-green .home-theme-swatch { background:#217346; }
        .home-theme-option.theme-navy .home-theme-swatch { background:#17365d; }
        .home-theme-option.theme-teal .home-theme-swatch { background:#0f766e; }
        .home-theme-option.theme-purple .home-theme-swatch { background:#6b46c1; }
        .home-theme-option.theme-blue .home-theme-swatch { background:#4472c4; }

        .theme-green .decision-table th,.theme-green .history-table th {background:#217346 !important}.theme-navy .decision-table th,.theme-navy .history-table th {background:#17365d !important}.theme-teal .decision-table th,.theme-teal .history-table th {background:#0f766e !important}.theme-purple .decision-table th,.theme-purple .history-table th {background:#6b46c1 !important}

        .estimate-meta { margin-left:auto; font-size:11px; color:#666; }
        .portal-home { padding:18px 8px 28px; }
        .portal-home-hero { display:flex; justify-content:space-between; gap:20px; align-items:center; padding:24px; border:1px solid #b7b7b7; background:linear-gradient(135deg,#f7fbff,#eef5fb); border-radius:6px; }
        .portal-home-kicker { color:#1f4e78; font-size:11px; font-weight:800; letter-spacing:1px; }
        .portal-home-hero h1 { margin:5px 0 4px; font-size:27px; color:#1f1f1f; }
        .portal-home-hero p { margin:0; color:#5f6b75; font-size:13px; }
        .portal-home-hero-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .portal-upload-button { white-space:nowrap; min-height:38px; }
        .portal-kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:12px 0; }
        .portal-kpi,.bulk-overview-card { border:1px solid #c7d1da; background:#fff; padding:13px; border-radius:5px; }
        .portal-kpi span,.bulk-overview-card span { display:block; color:#66737d; font-size:11px; }
        .portal-kpi strong,.bulk-overview-card strong { display:block; font-size:24px; color:#1f4e78; margin-top:4px; }
        .portal-kpi small { color:#8a969f; }
        .portal-section-title { background:#4472c4; color:#fff; padding:8px 10px; font-weight:700; font-size:14px; margin-top:16px; }
        .portal-action-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:10px; }
         .home-estimate-preview { margin-top:14px; border:2px solid #5b9bd5; background:#fff; color:#1f2937; border-radius:8px; padding:12px; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,.08); }
         .home-estimate-preview:hover { box-shadow:0 3px 10px rgba(0,0,0,.12); }
         .home-estimate-preview-head { display:flex; align-items:center; gap:12px; border-bottom:1px solid #d5d5d5; padding-bottom:9px; }
         .home-estimate-preview-head strong { display:block; font-size:17px; }
         .home-estimate-preview-head span { display:block; font-size:11px; color:#666; margin-top:2px; }
         .home-estimate-preview-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:10px; }
         .home-estimate-preview-grid > div { border:1px solid #d5d5d5; padding:9px; border-radius:6px; min-height:58px; }
         .home-estimate-preview-grid b { display:block; font-size:12px; }
         .home-estimate-preview-grid span { display:block; font-size:11px; color:#666; margin-top:5px; }
        .portal-action-card { text-align:left; border:1px solid #c7d1da; background:#fff; padding:16px; min-height:155px; display:flex; flex-direction:column; align-items:flex-start; gap:7px; border-radius:5px; }
        .portal-action-card:hover:not(:disabled) { border-color:#70ad47; box-shadow:0 2px 8px rgba(0,0,0,.08); }
        .portal-action-card.disabled { opacity:.5; cursor:not-allowed; }
        .portal-action-icon { font-size:25px; }
        .portal-action-title { font-weight:800; font-size:15px; color:#1f4e78; }
        .portal-action-text { color:#66737d; font-size:12px; line-height:1.45; }
        .portal-action-link { margin-top:auto; color:#217346; font-size:12px; font-weight:800; }
        .portal-workflow { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
        .portal-workflow div { border:1px solid #d7dee4; background:#f8fafc; padding:11px 13px; font-size:12px; }
        .portal-workflow b { display:block; color:#1f4e78; margin-bottom:4px; }
        .portal-workflow span { color:#66737d; }
        .professional-section-title { margin-top:12px; }
        .decision-status-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; margin-top:7px; }
        .decision-status-card { border:1px solid #b7b7b7; padding:9px; background:#f7f7f7; min-height:56px; }
        .decision-status-card span { display:block; font-size:11px; color:#58646d; line-height:1.2; }
        .decision-status-card strong { display:inline-block; margin-top:5px; font-size:12px; }
        .decision-status-card.is-due { background:#e2f0d9; border-color:#70ad47; }
        .decision-status-card.is-due strong { color:#006100; }
        .decision-status-card.is-not-due strong { color:#666; }
        .decision-basis { margin-top:8px; border:1px solid #c7d1da; background:#f8fafc; }
        .decision-basis summary { cursor:pointer; padding:8px 10px; font-weight:700; color:#1f4e78; }
        .decision-basis-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:0 10px 8px; }
        .decision-basis-grid div { background:#fff; border:1px solid #dfe5e9; padding:8px; }
        .decision-basis-grid b { display:block; font-size:10px; color:#74808b; }
        .decision-basis-grid span { display:block; margin-top:4px; font-size:12px; font-weight:700; }
        .bulk-overview-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; }
        .bulk-overview-card.due { background:#e2f0d9; border-color:#70ad47; }
        .bulk-overview-card.due strong { color:#006100; }
        .bulk-search-input { max-width:360px; min-height:31px; }
        @media (max-width:900px) { .portal-action-grid{grid-template-columns:repeat(2,1fr)} .decision-status-grid{grid-template-columns:repeat(2,1fr)} .decision-basis-grid{grid-template-columns:repeat(2,1fr)} .bulk-overview-grid{grid-template-columns:repeat(2,1fr)} }
        @media (max-width:600px) { .portal-home-hero{flex-direction:column;align-items:flex-start}.portal-home-hero-actions{width:100%;justify-content:flex-start}.portal-kpi-grid,.portal-workflow{grid-template-columns:1fr}.portal-action-grid{grid-template-columns:1fr}.decision-basis-grid{grid-template-columns:1fr}.bulk-overview-grid{grid-template-columns:1fr}.bulk-search-input{max-width:none;width:100%} }
        .excel-window { width: min(1500px, 100%); margin: 0 auto; background: #fff; min-height: 100vh; box-shadow: 0 0 0 1px #9e9e9e; }
        .excel-titlebar { height: 34px; background: #217346; color: #fff; display:flex; align-items:center; justify-content:center; padding:0 12px; font-size:14px; }
        .excel-title { font-weight:700; text-align:center; flex:1; }
        .excel-title-right { display:none; }
        .excel-ribbon { background:#f3f3f3; border-bottom:1px solid #b7b7b7; }
        .excel-tabs { height:36px; display:flex; align-items:flex-end; gap:2px; padding:0 10px; border-bottom:1px solid #c8c8c8; }
        .excel-tab { padding:8px 15px 7px; font-size:13px; cursor:pointer; border:1px solid transparent; border-bottom:0; }
        .excel-tab.active { background:#fff; border-color:#c8c8c8; font-weight:700; color:#217346; }
        .excel-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px 10px; background:#fff; }
        .excel-button { border:1px solid #a6a6a6; background:linear-gradient(#fff,#e7e6e6); min-height:30px; padding:5px 12px; border-radius:2px; cursor:pointer; font-family:Calibri,Arial,sans-serif; font-size:13px; }
        .excel-button:hover:not(:disabled) { background:#e2f0d9; }
        .excel-button.green { background:#217346; color:#fff; border-color:#185c37; font-weight:700; }
        .excel-button.green:hover:not(:disabled) { background:#185c37; }
        .excel-button:disabled { opacity:.5; cursor:not-allowed; }
        .excel-sheet { padding:10px; background:#fff; }
        .sheet-heading { background:#1f4e78; color:#fff; border:1px solid #17365d; font-size:18px; font-weight:700; padding:9px 12px; text-align:center; }
        .sheet-subheading { background:#d9eaf7; border:1px solid #9fbad0; border-top:0; padding:5px 10px; font-size:12px; color:#404040; }
        .sheet-grid { display:grid; grid-template-columns: 125px minmax(110px,1fr) 95px minmax(110px,1fr) 95px minmax(110px,1fr); border-left:1px solid #b7b7b7; border-top:1px solid #b7b7b7; }
        .compact-override-control { display:flex; align-items:center; gap:5px; }
        .compact-override-input { width:88px; min-width:88px; height:30px; padding:5px 7px; }
        .compact-recalculate-button { min-height:30px; height:30px; padding:4px 8px; font-size:11px; }

        .vehicle-output-layout { display:grid; grid-template-columns:minmax(0, 1fr) minmax(300px, 360px); gap:10px; align-items:stretch; }
        .vehicle-profile-panel, .customer-output-panel {
          min-width:0;
          border:1px solid #8aa8c4;
          background:#1c2738;
          box-shadow:0 1px 3px rgba(0,0,0,.22);
          overflow:hidden;
        }
        .vehicle-profile-panel .section-title, .customer-output-panel .section-title {
          margin:0;
          border-left:0;
          border-right:0;
          border-top:0;
        }
        .vehicle-profile-panel .sheet-grid {
          margin-top:0 !important;
          border-left:0;
          border-top:0;
        }
        .customer-output-panel .due-box {
          height:calc(100% - 34px);
          min-height:90px;
          display:flex;
          align-content:flex-start;
          align-items:flex-start;
          flex-wrap:wrap;
          margin:0;
          border:0;
        }
        .cell {
          min-height:31px;
          height:auto;
          border-right:1px solid #b7b7b7;
          border-bottom:1px solid #b7b7b7;
          padding:7px 8px;
          font-size:13px;
          background:#fff;
          overflow-wrap:anywhere;
          word-break:break-word;
          white-space:normal;
          line-height:1.25;
        }
        .cell.label {
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:break-word;
        }
        .cell.value {
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:break-word;
        }
        .cell.label { background:#d9e2f3; font-weight:700; }
        .cell.value { font-weight:600; }
        .cell.section { background:#4472c4; color:#fff; font-weight:700; text-align:center; }
        .cell.center { text-align:center; }
        .cell.yes { background:#e2f0d9; color:#006100; font-weight:700; text-align:center; }
        .cell.no { background:#f2f2f2; color:#666; font-weight:700; text-align:center; }
        .decision-table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .decision-table th { background:#4472c4; color:#fff; border:1px solid #b7b7b7; padding:6px 7px; font-size:12px; text-align:center; }
        .decision-table td { border:1px solid #b7b7b7; padding:6px 7px; font-size:12px; vertical-align:top; }
        .decision-table tr:nth-child(even) td { background:#f8fbff; }
        .decision-table td.service-name { font-weight:700; }
        .status-yes { background:#e2f0d9 !important; color:#006100; font-weight:700; text-align:center; }
        .status-no { background:#f2f2f2 !important; color:#666; text-align:center; font-weight:700; }
        .section-title { margin-top:12px; background:#5b9bd5; color:#fff; border:1px solid #2f75b5; padding:6px 9px; font-weight:700; font-size:13px; }
        .history-wrap { overflow:auto; max-height:520px; border:1px solid #b7b7b7; }
        .history-table { width:100%; border-collapse:collapse; min-width:760px; }
        .dashboard-resizable-table { table-layout:fixed; }
        .dashboard-resizable-table col,
        .dashboard-resizable-table th,
        .dashboard-resizable-table td { box-sizing:border-box; }
        .saved-estimate-list { display:flex; flex-direction:column; gap:6px; }
        .saved-estimate-row { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid #cbd5df; border-radius:7px; background:#fff; color:#1f1f1f; cursor:pointer; text-align:left; }
        .saved-estimate-row:hover { border-color:#217346; background:#f5fbf7; }
        .saved-estimate-row span:first-child { display:flex; flex-direction:column; gap:3px; }
        .saved-estimate-row small { color:#687681; }

        .history-table th { position:sticky; top:0; z-index:2; background:#4472c4; color:#fff; border:1px solid #b7b7b7; padding:5px 7px; font-size:12px; }
        .estimate-workspace .history-table th { position:static; top:auto; z-index:auto; }
        .history-table td { border:1px solid #d0d0d0; padding:5px 7px; font-size:12px; }
        .history-table tr:nth-child(even) td { background:#fafafa; }
        .bulk-service-table { min-width: 1120px; }
        .bulk-service-table th { padding:0; vertical-align:top; }
        .bulk-th { display:flex; flex-direction:column; gap:3px; padding:5px 6px; min-height:58px; }
        .bulk-th-filtered { background:rgba(255,255,255,.08); }
        .bulk-th-top { display:flex; align-items:center; justify-content:center; gap:4px; min-height:22px; }
        .bulk-column-title { line-height:1.15; }
        .bulk-sort-indicator { font-size:9px; min-width:9px; }
        .bulk-filter-arrow {
          width:20px;
          height:20px;
          padding:0;
          margin-left:2px;
          border:1px solid rgba(255,255,255,.5);
          border-radius:2px;
          background:rgba(255,255,255,.08);
          color:#fff;
          cursor:pointer;
          font-size:10px;
          line-height:18px;
          flex:0 0 20px;
        }
        .bulk-filter-arrow:hover,
        .bulk-filter-arrow.active {
          background:#fff;
          color:#1f4e78;
          border-color:#fff;
        }
        .bulk-sort-btn {
          border:0;
          background:transparent !important;
          color:inherit;
          cursor:pointer;
          font:inherit;
          font-weight:700;
          padding:1px 3px;
          border-radius:0;
          appearance:none;
          -webkit-appearance:none;
          box-shadow:none;
        }
        .bulk-sort-btn:hover,
        .bulk-sort-btn:focus,
        .bulk-sort-btn:active {
          border:0;
          background:transparent !important;
          color:inherit;
          box-shadow:none;
          outline:none;
        }
        .bulk-filter-status {
          min-height:16px;
          padding:2px 0;
          border:0;
          background:transparent !important;
          color:#d9e5f5;
          font-size:10px;
          font-weight:400;
          text-align:left;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .bulk-filter-status.active {
          background:transparent !important;
          color:#fff;
          border:0;
          font-weight:700;
        }

        .excel-filter-popup {
          position:fixed;
          z-index:2147483647;
          background:#fff;
          color:#1f1f1f;
          border:1px solid #9a9a9a;
          box-shadow:0 6px 22px rgba(0,0,0,.28);
          border-radius:3px;
          overflow:hidden;
          font-family:Calibri,Arial,sans-serif;
        }
        .excel-filter-popup-title {
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:9px 10px;
          background:#f3f3f3;
          border-bottom:1px solid #d0d0d0;
          font-size:13px;
        }
        .excel-filter-close {
          border:0;
          background:transparent;
          color:#666;
          width:24px;
          height:24px;
          padding:0;
          cursor:pointer;
          font-size:20px;
          line-height:20px;
        }
        .excel-filter-close:hover { background:#e5e5e5; color:#111; }
        .excel-filter-sort-row {
          display:flex;
          align-items:center;
          gap:4px;
          padding:7px 8px;
          border-bottom:1px solid #e3e3e3;
        }
        .excel-filter-menu-btn {
          flex:1;
          border:1px solid #c7c7c7;
          background:#fff;
          color:#333;
          padding:6px 5px;
          border-radius:2px;
          cursor:pointer;
          font-size:11px;
          font-weight:600;
        }
        .excel-filter-menu-btn:hover { background:#e2f0d9; border-color:#70ad47; }
        .excel-filter-current-sort { min-width:10px; font-size:10px; }
        .excel-filter-search-wrap {
          display:flex;
          align-items:center;
          gap:5px;
          margin:8px;
          border:1px solid #a6a6a6;
          height:30px;
          background:#fff;
        }
        .excel-filter-search-wrap:focus-within {
          outline:2px solid #70ad47;
          outline-offset:-2px;
        }
        .excel-filter-search-icon { padding-left:7px; color:#666; font-size:17px; }
        .excel-filter-search {
          flex:1;
          min-width:0;
          border:0;
          outline:0;
          height:28px;
          padding:4px 2px;
          font-family:Calibri,Arial,sans-serif;
          font-size:12px;
          background:#fff;
          color:#1f1f1f;
        }
        .excel-filter-search-clear {
          border:0;
          background:transparent;
          color:#777;
          width:24px;
          height:24px;
          padding:0;
          cursor:pointer;
          font-size:16px;
        }
        .excel-filter-selection-bar {
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:6px 9px;
          border-top:1px solid #e3e3e3;
          border-bottom:1px solid #e3e3e3;
          background:#fafafa;
          font-size:11px;
        }
        .excel-filter-select-all {
          display:flex;
          align-items:center;
          gap:7px;
          cursor:pointer;
          font-weight:700;
        }
        .excel-filter-select-all input,
        .excel-filter-value input {
          width:14px;
          height:14px;
          margin:0;
          accent-color:#217346;
        }
        .excel-filter-count { color:#666; }
        .excel-filter-values {
          height:235px;
          overflow-y:auto;
          padding:4px 0;
          background:#fff;
        }
        .excel-filter-value {
          display:flex;
          align-items:center;
          gap:8px;
          min-height:27px;
          padding:4px 10px;
          cursor:pointer;
          font-size:12px;
        }
        .excel-filter-value:hover { background:#eaf4fc; }
        .excel-filter-value span {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .excel-filter-no-match {
          padding:20px 10px;
          text-align:center;
          color:#777;
          font-size:12px;
        }
        .excel-filter-footer {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          padding:8px;
          border-top:1px solid #d0d0d0;
          background:#f3f3f3;
        }
        .excel-filter-footer-right { display:flex; gap:6px; }
        .excel-filter-clear,
        .excel-filter-cancel,
        .excel-filter-ok {
          border-radius:2px;
          padding:6px 11px;
          cursor:pointer;
          font-family:Calibri,Arial,sans-serif;
          font-size:11px;
          font-weight:700;
        }
        .excel-filter-clear {
          border:1px solid #c7c7c7;
          background:#fff;
          color:#a33a3a;
        }
        .excel-filter-cancel {
          border:1px solid #c7c7c7;
          background:#fff;
          color:#444;
        }
        .excel-filter-ok {
          border:1px solid #185c37;
          background:#217346;
          color:#fff;
          min-width:58px;
        }
        .excel-filter-clear:hover,
        .excel-filter-cancel:hover { background:#e9e9e9; }
        .excel-filter-ok:hover { background:#185c37; }
        .excel-filter-active-note {
          padding:5px 9px;
          border-top:1px solid #d0d0d0;
          background:#e2f0d9;
          color:#006100;
          font-size:10px;
          font-weight:700;
        }
        .single-service-summary { min-width:760px; width:100%; table-layout:fixed; }
        .single-service-summary th, .single-service-summary td { min-width:0; white-space:normal; overflow-wrap:anywhere; }
        .single-service-summary th:last-child, .single-service-summary td:last-child { overflow-wrap:anywhere; }
        .service-summary-note { padding:5px 8px; margin-top:4px; }
        .service-summary-title {
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  background:#2f75b5;
  color:#fff;
  border-color:#255e91;
  margin-top:10px;
  min-height:44px;
  padding:8px 190px 8px 12px;
  box-shadow:0 1px 2px rgba(0,0,0,.18);
  letter-spacing:.1px;
}

.vehicle-profile-panel > .section-title {
  text-align:center;
}

.service-summary-title > span {
  width:100%;
  text-align:center;
}

.service-summary-title .single-history-toggle {
  position:absolute;
  right:8px;
  top:50%;
  transform:translateY(-50%);
  margin-left:0;
}

        .history-part { display:inline-block; margin:2px 4px 2px 0; padding:3px 6px; border:1px solid transparent; }
        .history-part.eligible { background:#e2f0d9; color:#006100; border-color:#70ad47; font-weight:700; border-radius:2px; }
        .pre-analysis-empty { min-height:420px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; border:1px dashed #9fbad0; background:#eef4fa; color:#5b6770; padding:30px 20px; }
        .pre-analysis-title { font-size:20px; font-weight:700; color:#1f4e78; margin-bottom:8px; }
        .pre-analysis-text { max-width:560px; font-size:13px; line-height:1.5; }
        .excel-input { width:100%; border:1px solid #a6a6a6; min-height:29px; padding:5px 7px; font-family:Calibri,Arial,sans-serif; font-size:13px; }
        .excel-input:focus { outline:2px solid #70ad47; outline-offset:-2px; }
        .upload-area { border:1px dashed #70ad47; background:#f4fbef; padding:10px; }
        .upload-area input { font-family:Calibri,Arial,sans-serif; font-size:13px; }
        .status-line { margin-top:8px; padding:6px 8px; border:1px solid #a9d18e; background:#e2f0d9; color:#006100; font-size:12px; }
        .error-line { margin-top:8px; padding:6px 8px; border:1px solid #c00000; background:#fce4d6; color:#9c0006; font-size:12px; white-space:pre-wrap; }
        .due-box { border:1px solid #b7b7b7; background:#fff2cc; padding:8px; }
        .due-chip { display:inline-block; margin:3px; padding:5px 9px; border:1px solid #c9b458; background:#fff2cc; font-weight:700; font-size:12px; }
        .no-due { background:#f2f2f2; border:1px solid #b7b7b7; padding:8px; color:#666; font-size:12px; }
        .bulk-card { border:1px solid #b7b7b7; margin-top:10px; }
        .bulk-card-head { background:#d9e2f3; border-bottom:1px solid #b7b7b7; padding:6px 9px; font-weight:700; font-size:13px; }
        .bulk-card-body { padding:8px; }
        .small-note { color:#666; font-size:11px; }
        .status-pill { display:inline-block; padding:3px 7px; border:1px solid #b7b7b7; font-size:11px; font-weight:700; }
        .status-pill.green { background:#e2f0d9; color:#006100; border-color:#a9d18e; }
        .status-pill.blue { background:#d9eaf7; color:#1f4e78; border-color:#9fbad0; }
        .action-row { display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
        .spacer { flex:1; }
        @media (max-width: 1050px) {
          .vehicle-output-layout { grid-template-columns: 1fr; }
          .customer-output-panel .section-title { margin-top:10px; }
          .customer-output-panel .due-box { height:auto; min-height:90px; }
        }
        @media (max-width: 900px) {
          .sheet-grid { grid-template-columns: 105px minmax(100px,1fr) 105px minmax(100px,1fr); }
          .wide-hide { display:none; }
        }
        @media (max-width: 600px) {
          .excel-tabs { overflow-x:auto; justify-content:flex-start; align-items:stretch; padding:0 4px; scrollbar-width:none; }
          .excel-tabs::-webkit-scrollbar { display:none; }
          .excel-tab { flex:0 0 auto; white-space:nowrap; padding:9px 13px 8px; font-size:12px; }
          .excel-toolbar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; align-items:stretch; }
          .excel-toolbar .excel-button { width:100%; min-width:0; min-height:40px; padding:6px 8px; line-height:1.15; }
          .excel-toolbar .status-pill { width:100%; text-align:center; min-width:0; }
          .excel-toolbar .status-pill:first-of-type { grid-column:1 / -1; }
          .reading-override-grid { grid-template-columns:100px minmax(0,1fr); }
          .reading-override-grid .cell:nth-child(3),
          .reading-override-grid .cell:nth-child(4) { grid-column:2; }
          .reading-override-grid .cell:nth-child(5),
          .reading-override-grid .cell:nth-child(6) { grid-column:1 / -1; }
          .recalculate-button { width:100%; min-width:0; }
          .sheet-heading { font-size:15px; line-height:1.25; }
          .vehicle-profile-panel .sheet-grid { grid-template-columns:110px minmax(0,1fr); }
        }
        @media (prefers-color-scheme: dark) {
          body, .excel-app { background:#111827; color:#e5e7eb; color-scheme:dark; }
          .excel-window, .excel-sheet { background:#1f2937; box-shadow:0 0 0 1px #64748b; }
          .excel-ribbon, .excel-toolbar { background:#263445; border-color:#64748b; }
          .excel-tabs { border-color:#64748b; }
          .excel-tab { color:#dbeafe; }
          .excel-tab.active { background:#1f2937; border-color:#64748b; color:#86efac; }
          .cell { background:#1f2937; border-color:#64748b; color:#e5e7eb; }
          .cell.label, .bulk-card-head { background:#334155; color:#f8fafc; }
          .sheet-subheading { background:#253b53; border-color:#4b7aa7; color:#dbeafe; }
          .decision-table td, .history-table td { background:#1f2937; border-color:#526278; color:#e5e7eb; }
          .decision-table tr:nth-child(even) td, .history-table tr:nth-child(even) td { background:#253143; }
          .history-wrap, .bulk-card { border-color:#64748b; }
          .upload-area { background:#20352a; border-color:#86c77a; }
          .excel-input { background:#182230; border-color:#718096; color:#f8fafc; }
          .excel-input::placeholder { color:#aab7c8; }
          .due-box { background:#4a3d17; border-color:#a7893b; }
          .due-chip { background:#5a4918; border-color:#c3a84c; color:#fff7cf; }
          .no-due { background:#334155; border-color:#64748b; color:#d1d5db; }
          .small-note { color:#cbd5e1; }
          .status-line { background:#1f432e; border-color:#6da878; color:#d1fae5; }
          .error-line { background:#4a2424; border-color:#ee7777; color:#ffd2d2; }
          .excel-button { background:linear-gradient(#3c4a5f,#283548); border-color:#8391a7; color:#f8fafc; }
          .excel-button:hover:not(:disabled) { background:#405a47; }
          .excel-button.green { background:#217346; border-color:#75bd91; color:#fff; }
          .status-yes { background:#285b35 !important; border-color:#70ad47; color:#f0fff2 !important; }
          .status-no { background:#3a4555 !important; border-color:#8291a8; color:#ffffff !important; }
        }
        .single-screenshot-area {
          width: 100%;
          overflow: visible;
        }
        .campaign-list {
  width:100%;
  display:flex;
  flex-direction:column;
  gap:8px;
  align-items:stretch;
}
.campaign-remark-row {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  width:100%;
  text-align:center;
}
.campaign-remark-text {
  overflow-wrap:anywhere;
  line-height:1.35;
}
.campaign-info-wrap {
  position:relative;
  display:inline-flex;
  flex:0 0 auto;
}
.campaign-info-button {
  width:18px;
  height:18px;
  padding:0;
  border-radius:50%;
  border:1px solid #d1d5db;
  background:#374151;
  color:#fff;
  font-size:11px;
  font-weight:800;
  line-height:16px;
  cursor:help;
}
.campaign-info-popover {
  display:none;
  position:absolute;
  left:50%;
  bottom:calc(100% + 8px);
  transform:translateX(-50%);
  width:280px;
  max-width:min(280px, 70vw);
  padding:10px 12px;
  border-radius:8px;
  border:1px solid #64748b;
  background:#111827;
  color:#f8fafc;
  box-shadow:0 8px 24px rgba(0,0,0,.35);
  text-align:left;
  font-size:11px;
  line-height:1.5;
  z-index:50;
}
.campaign-info-wrap:hover .campaign-info-popover,
.campaign-info-wrap:focus-within .campaign-info-popover {
  display:block;
}
.campaign-item-list {
  display:flex;
  flex-direction:column;
  gap:2px;
  margin-top:3px;
}
.campaign-loading-text {
  opacity:.75;
}
.single-note-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 10px;
          margin: 10px 0;
          align-items: stretch;
        }
        .single-note-card-full {
          grid-column: 1 / -1;
        }
        .single-customer-voice-compact {
          min-height: 42px;
          height: 42px;
          padding: 7px 10px;
        }
        .single-note-card {
          border: 1px solid #5c748d;
          background: #253b53;
          min-width: 0;
        }
        .single-note-title {
          background: #117f79;
          color: #fff;
          font-weight: 800;
          text-align: center;
          padding: 8px 10px;
        }
        .single-note-value {
          min-height: 64px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          color: #f8fafc;
          background: #1f2937;
        }
        .single-customer-voice {
          display: block;
          width: 100%;
          min-height: 64px;
          resize: vertical;
          box-sizing: border-box;
          border: 0;
          outline: 0;
          padding: 12px;
          font: inherit;
          line-height: 1.35;
          text-align: center;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          overflow: hidden;
          color: #111827;
          background: #fff;
        }
        .single-history-toggle {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 12px;
          font-weight: 700;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.25);
          padding: 6px 9px;
        }
        .single-history-toggle label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          white-space: nowrap;
        }
        .single-history-toggle input {
          accent-color: #2f9e44;
        }
        .single-history-wrap {
          max-height: none !important;
          height: auto !important;
          overflow: visible !important;
        }
        @media (max-width: 800px) {
          .single-note-grid {
            grid-template-columns: 1fr;
          }
          .single-history-toggle {
            margin-left: 0;
            width: 100%;
          }
        }


        @page { size: A4 portrait; margin: 0; }

        /* Warranty tags: separated cuttable tags on A4 */
        .warranty-tag-print-root{width:100%;background:#fff;color:#111!important;font-family:Arial,Helvetica,sans-serif}
        .warranty-tag-page{width:210mm;height:297mm;box-sizing:border-box;margin:0;padding:8mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,1fr);column-gap:4mm;row-gap:4mm;background:#fff;color:#111!important;page-break-after:always;break-after:page}
        .warranty-tag-page:last-child{page-break-after:auto;break-after:auto}
        .warranty-tag{min-width:0;min-height:0;border:1px solid #111;background:#fff;color:#111!important;display:flex;flex-direction:column;overflow:hidden;font-size:10.5px;line-height:1.15}
        .warranty-tag-row{min-height:0;flex:1 1 auto;display:grid;grid-template-columns:39% 61%;align-items:center;border-bottom:1px solid #111;color:#111!important}
        .warranty-tag-row:last-child{border-bottom:0}
        .warranty-tag-row>span{height:100%;display:flex;align-items:center;padding:3px 5px;border-right:1px solid #111;font-weight:500;color:#111!important;white-space:nowrap}
        .warranty-tag-row>strong{display:flex;align-items:center;justify-content:center;min-width:0;height:100%;padding:3px 5px;text-align:center;font-weight:500;color:#111!important;overflow-wrap:anywhere;word-break:break-word}
        .warranty-tag-part-row{grid-template-columns:39% 43% 18%}
        .warranty-tag-part-row>strong:first-of-type{border-right:1px solid #111}
        .warranty-tag-barcode-row{flex:1.15 1 auto}
        .warranty-tag-barcode-row>span{justify-content:flex-start}
        .warranty-tag-barcode{width:70%;height:27px;max-width:145px;display:block;margin:0 auto}
        .warranty-tag-workspace{color:#1f1f1f!important}.warranty-tag-message{color:#1f1f1f!important}
        .warranty-tag-filter-buttons{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .warranty-tag-filter-buttons button{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:38px!important;height:38px!important;min-width:0!important;padding:6px 12px!important;background:#f5f7fa!important;color:#1f2937!important;border:1px solid #9aa4b2!important;border-radius:7px!important;font-size:13px!important;font-weight:700!important;opacity:1!important;visibility:visible!important}
        .warranty-tag-filter-buttons button.active{background:#1976d2!important;color:#fff!important}
        .warranty-tag-part-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
        .warranty-tag-part-item{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 8px;border:1px solid #e0e4e8;border-radius:6px;background:#fafbfc;color:#1f2937!important;min-width:0}
        .warranty-tag-part-item>span{color:#1f2937!important;font-size:12px!important;line-height:1.2;text-align:left;overflow-wrap:anywhere}
        .warranty-tag-part-item button{display:inline-flex!important;align-items:center;justify-content:center;min-width:48px!important;min-height:28px!important;height:28px!important;padding:3px 8px!important;border:1px solid #9aa4b2!important;border-radius:6px!important;background:#f5f7fa!important;color:#1f2937!important;font-size:12px!important;font-weight:700!important;opacity:1!important;visibility:visible!important}
        @media (max-width:900px){.warranty-tag-part-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:560px){.warranty-tag-part-list{grid-template-columns:1fr}}
        .warranty-tag-part-item.removed>span{text-decoration:line-through;opacity:.55}
        .warranty-tag-print-controls{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:16px;padding:16px;border:2px solid #2f80c9;border-radius:10px;background:#f8fbff;color:#1f2937!important}
        .warranty-tag-print-controls strong{font-size:18px}
        .warranty-tag-print-controls span{font-size:16px;font-weight:700}
        .warranty-tag-barcode-registration-row>div{display:grid;grid-template-columns:1fr 1fr;min-width:0;height:100%}
        .warranty-tag-barcode-registration-row .barcode-side{display:flex;align-items:center;justify-content:center;padding:3px 8px;border-right:1px solid #111;min-width:0}
        .warranty-tag-barcode-registration-row .registration-side{display:flex;align-items:center;justify-content:center;gap:5px;flex-direction:column;padding:3px 6px;text-align:center;min-width:0}
        .warranty-tag-barcode-registration-row .registration-label{font-size:9px;font-weight:700;color:#111!important}
        .warranty-tag-barcode-registration-row .registration-value{font-size:11px;font-weight:700;color:#111!important;overflow-wrap:anywhere}

        @media screen{.warranty-tag-print-root{margin-top:18px;padding:12px;overflow-x:auto}.warranty-tag-page{box-shadow:0 1px 8px rgba(0,0,0,.15)}}
        @media print{body,.excel-app,.excel-window{background:#fff!important}.excel-titlebar,.excel-ribbon,.no-print{display:none!important}.excel-window{width:100%;box-shadow:none}.excel-sheet{padding:0}.history-wrap{max-height:none;overflow:visible}.history-table th{position:static}.warranty-tag-workspace{display:none!important}.warranty-tag-print-root{display:block!important;width:194mm!important;margin:0 auto!important;padding:0!important;background:#fff!important;color:#111!important}.warranty-tag-page{width:210mm!important;height:297mm!important;box-sizing:border-box!important;margin:0!important;padding:8mm!important;column-gap:4mm!important;row-gap:4mm!important;box-shadow:none!important;page-break-after:always!important;break-after:page!important}.warranty-tag-page:last-child{page-break-after:auto!important;break-after:auto!important}.warranty-tag-page,.warranty-tag{break-inside:avoid!important;page-break-inside:avoid!important}.warranty-tag,.warranty-tag-row,.warranty-tag-row>span,.warranty-tag-row>strong{color:#111!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
        .excel-upload-processing-overlay { position: fixed; inset: 0; z-index: 100000; background: rgba(255,255,255,.72); display: flex; align-items: center; justify-content: center; cursor: wait; }
        .excel-upload-processing-card { min-width: 280px; max-width: 90vw; padding: 24px 28px; border: 1px solid #c9c9c9; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.18); text-align: center; }
        .excel-upload-spinner { width: 42px; height: 42px; margin: 0 auto 14px; border: 4px solid #d9e2f3; border-top-color: #4472c4; border-radius: 50%; animation: excelUploadSpin .8s linear infinite; }
        .excel-upload-processing-title { font-size: 18px; font-weight: 800; color: #1f1f1f; }
        .excel-upload-processing-text { margin-top: 6px; font-size: 13px; color: #666; line-height: 1.4; }
        @keyframes excelUploadSpin { to { transform: rotate(360deg); } }      `}</style>



      {uploadBusy && (
        <div className="excel-upload-processing-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="excel-upload-processing-card">
            <div className="excel-upload-spinner" aria-hidden="true"></div>
            <div className="excel-upload-processing-title">Processing Excel...</div>
            <div className="excel-upload-processing-text">Please wait while the Excel data is being uploaded and processed.</div>
          </div>
        </div>
      )}

      <div className={`excel-app theme-${dashboardPrefs.theme || "blue"}`}>
        <div className="excel-window">
          <div className="excel-titlebar">
            <div className="excel-title">Vehicle Service Decision &amp; Maintenance Dashboard</div>
          </div>

          <div className="excel-ribbon no-print">
            <div className="excel-tabs">
              <div className={"excel-tab " + (mode === "home" ? "active" : "")} onClick={() => { setEstimateOpen(false); setMode("home"); }}>Home</div>
              <div className={"excel-tab " + (mode === "single" ? "active" : "")} onClick={() => { setEstimateOpen(false); setMode("single"); setError(""); setBulkResults([]); setBulkMeta(null); }}>Single Vehicle</div>
              <div className={`excel-tab ${mode === "bulk" ? "active" : ""}`} onClick={() => { setEstimateOpen(false); setMode("bulk"); setError(""); setAnalysis(null); }}>Bulk Vehicle</div>
              <div className={`excel-tab ${mode === "schedule" ? "active" : ""}`} onClick={() => { setEstimateOpen(false); setMode("schedule"); setError(""); logUsage("Service Schedule Viewed", { mode:"schedule" }); }}>Service Schedule Chart</div>
              <div className={`excel-tab ${estimateOpen ? "active" : ""}`} onClick={() => { setMode("estimate"); if (analysis) void openEstimate(); else openStandaloneEstimate(); }}>Prepare Estimate</div>
              <div className={`excel-tab ${mode === "warranty-tags" ? "active" : ""}`} onClick={() => { setEstimateOpen(false); setMode("warranty-tags"); setError(""); }}>Warranty Tag Print</div>
            </div>
            {mode !== "warranty-tags" && (
            <div className="excel-toolbar">
              {mode !== "schedule" && mode !== "home" && <>
                <button className="excel-button green" onClick={() => document.getElementById("excel-file-input")?.click()} disabled={uploadBusy}>Upload Excel</button>
                <button className="excel-button" onClick={clear}>Clear</button>
                <button className="excel-button green" onClick={mode === "bulk" ? analyzeBulk : analyze} disabled={uploadBusy || (!excelData.trim() && !uploadParsedRecords.length)}>{mode === "bulk" ? "Analyze All Vehicles" : "Analyze Vehicle"}</button>

              </>}
              {mode === "bulk" && bulkMeta && <span className="status-pill green">{bulkMeta.vehicles} Vehicles · {bulkMeta.records} Rows</span>}
              {uploadedFiles.length > 0 && <span className="status-pill blue">{uploadedFiles.length} Excel file{uploadedFiles.length > 1 ? "s" : ""}</span>}
              {mode === "single" && analysis && (
                <div className="compact-override-control no-print">
                  <span style={{fontSize:11,fontWeight:700}}>Override {decisionBasis === "HRS" ? "HRS" : "KM"}</span>
                  <input
                    className="excel-input compact-override-input"
                    type="number"
                    min="1"
                    step="1"
                    value={overrideReading}
                    onChange={(e)=>{setOverrideReading(e.target.value);setError("")}}
                    placeholder={decisionBasis === "HRS" ? "HRS" : "KM"}
                    aria-label={`Override ${decisionBasis === "HRS" ? "HRS" : "KM"}`}
                  />
                  <span style={{fontSize:11,fontWeight:700}}>Decision Basis</span>
                  <select
                    className="excel-input"
                    value={decisionBasis}
                    onChange={(e)=>changeDecisionBasis(e.target.value)}
                    style={{height:30,padding:"3px 6px",width:82,fontSize:11}}
                    aria-label="Decision Basis"
                  >
                    <option value="KM">KM</option>
                    <option value="HRS">HRS</option>
                  </select>
                  <button
                    className="excel-button green compact-recalculate-button"
                    onClick={recalculateWithOverride}
                  >
                    Recalculate
                  </button>
                </div>
              )}
              {uploadMeta?.failedFiles?.length > 0 && (
                <div className="upload-warning no-print" style={{color:"#ff4d4f",fontWeight:700,marginTop:6}}>
                  {uploadMeta.failedFiles.map((item,index) => (
                    <div key={index}>
                      ⚠ {item.name} — This file was ignored because required header was not found. Below are required headers in file: {item.reason}
                    </div>
                  ))}
                </div>
              )}
              {mode === "single" && analysis && (
                <div className="no-print" style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
                  <button
                    type="button"
                    className="excel-button green"
                    onClick={captureSingleScreenshot}
                    disabled={screenshotBusy}
                    title="Copy the vehicle report area to clipboard"
                  >
                    {screenshotBusy ? "Preparing..." : "Screenshot"}
                  </button>
                  {screenshotStatus && <span className="small-note">{screenshotStatus}</span>}
                </div>
              )}
            </div>
            )}
          </div>

          <input id="excel-file-input" className="no-print" type="file" accept=".xlsx,.xls,.xlsm,.csv" multiple style={{display:"none"}} onChange={handleExcelUpload} disabled={uploadBusy} />

          <main className="excel-sheet">
            {mode === "home" ? (
              <PortalHome user={user} theme={dashboardPrefs.theme || "blue"} onThemeChange={changeDashboardTheme} hasAnalysis={Boolean(analysis)} bulkResults={bulkResults}
                savedEstimates={savedEstimates}
                savedEstimatesLoading={savedEstimatesLoading}
                onNavigate={(nextMode) => { if (nextMode === "estimate") { if (analysis) void openEstimate(); else openStandaloneEstimate(); } else setMode(nextMode); }}
                onUpload={() => document.getElementById("excel-file-input")?.click()}
                onClear={clear}
                onOpenSavedEstimate={openSavedEstimate}
              />
            ) : mode === "warranty-tags" ? (
              <WarrantyTagPanel user={user} onBack={() => setMode("home")} />
            ) : mode === "single" ? (
              <>
                {analysis ? (
                <div id="single-screenshot-area" className="single-screenshot-area">
                <div className="sheet-heading" style={{marginTop:10}}>VEHICLE SCHEDULE SERVICE HISTORY AS ON DATE - {todayDisplay}</div>

                <div className="vehicle-output-layout" style={{marginTop:10}}>
                  <div className="vehicle-profile-panel">
                    <div className="section-title">Customer / Vehicle Profile</div>
                    <div className="sheet-grid">
                      <div className="cell label">Customer Name</div><div className="cell value">{analysis?.vehicle?.customerName || ""}</div>
                      <div className="cell label">Reg No</div><div className="cell value">{analysis?.vehicle?.reg || ""}</div>
                      <div className="cell label">VIN No</div><div className="cell value">{analysis?.vehicle?.vin || ""}</div>
                      <div className="cell label">Sale Date</div><div className="cell value">{analysis ? formatDate(analysis.vehicle.sale) : ""}</div>
                      <div className="cell label">Vehicle Age</div><div className="cell value">{analysis?.vehicle?.sale ? formatVehicleAge(analysis.vehicle.sale) : ""}</div>
                      <div className="cell label">Model</div><div className="cell value">{analysis?.vehicle?.model || ""}</div>
                      <div className="cell label">Last Odometer recorded/date</div><div className="cell value">{analysis?.running?.last ? `${formatNumber(getRelevantReading(analysis.running.last, analysis.vehicle))} / ${formatDate(analysis.running.last.date)}` : ""}</div>
                      <div className="cell label">Current Reading</div><div className="cell value">{analysis?.running?.current ? `${formatNumber(analysis.running.current)} ${analysis.running.unit || "KM"}${appliedOverride === null ? " (Approx.)" : ""}` : ""}</div>
                      <div className="cell label">Last service under AMC?</div><div className="cell value">{analysis?.vehicle?.lastServiceUnderAmc ? "Yes" : "No"}</div>
                    </div>
                  </div>

                  <div className="customer-output-panel">
                    <div className="section-title" style={{display:"flex",alignItems:"center",gap:10}}><span>Customer Output — Service To Be Completed</span><button className="excel-button no-print" style={{marginLeft:"auto"}} onClick={openEstimate}>Generate Estimate</button></div>
                    <div className="due-box">
                      {analysis ? (() => {
                        const aggregateNames = BULK_SERVICE_LABELS
                          .filter(([,key]) => analysis.decision.result[key])
                          .map(([name]) => name);
                        const freeService = String(analysis.decision.freeService || '').trim();
                        const isFirstFreeService = /^1st free service$/i.test(freeService);
                        const showFreeService = !!freeService && (isFirstFreeService || aggregateNames.length > 0);
                        const names = [
                          ...aggregateNames,
                          ...(showFreeService
                            ? [freeService.replace(/^1st free service$/i,'1st Free Service').replace(/^2nd free service$/i,'2nd Free Service').replace(/^3rd free service$/i,'3rd Free Service')]
                            : []),
                          ...(analysis.decision.additionalServices || []).filter(name => !String(name).toLowerCase().includes('free service'))
                        ];
                        return names.length ? names.map(name => <span className="due-chip" key={name}>{name}</span>) : <div className="no-due">No service to be completed at the current reading.</div>;
                      })() : <div className="single-empty-state"><b>No vehicle analysis yet</b><span>Upload the DMS Excel file to start the service decision.</span><button className="excel-button green no-print" onClick={() => document.getElementById("excel-file-input")?.click()}>Upload Excel &amp; Start</button></div>}
                    </div>
                  </div>
                </div>


                {(() => {
                  const activeCampaigns = getActiveCampaignGroups(campaigns);
                  if (campaignLoading) {
                    return (
                      <div className="single-note-grid single-note-grid-campaign-loading">
                        <div className="single-note-card single-note-card-full">
                          <div className="single-note-title">Customer Voice</div>
                          <textarea
                            className="single-customer-voice"
                            value={customerVoice}
                            onChange={(event) => {
                              setCustomerVoice(event.target.value);
                              event.target.style.height = "auto";
                              event.target.style.height = event.target.scrollHeight + "px";
                            }}
                            placeholder="Enter customer voice..."
                            rows={2}
                            aria-label="Customer Voice"
                          />
                        </div>
                      </div>
                    );
                  }

                  if (!activeCampaigns.length) {
                    return (
                      <div className="single-note-grid single-note-grid-no-campaign">
                        <div className="single-note-card single-note-card-full">
                          <div className="single-note-title">Customer Voice</div>
                          <textarea
                            className="single-customer-voice single-customer-voice-compact"
                            value={customerVoice}
                            onChange={(event) => {
                              setCustomerVoice(event.target.value);
                              event.target.style.height = "auto";
                              event.target.style.height = event.target.scrollHeight + "px";
                            }}
                            placeholder="Enter customer voice..."
                            rows={1}
                            aria-label="Customer Voice"
                          />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="single-note-grid single-note-grid-with-campaign">
                      <div className="single-note-card">
                        <div className="single-note-title">Remark</div>
                        <div className="single-note-value">
                          <div className="campaign-list">
                            {activeCampaigns.map((campaign, index) => (
                              <div className="campaign-remark-row" key={String(campaign.campaignNumber || campaign.campaignDesc) + "-" + index}>
                                <span className="campaign-remark-text">{campaign.campaignDesc}</span>
                                <span className="campaign-info-wrap">
                                  <button type="button" className="campaign-info-button" aria-label="Campaign details">i</button>
                                  <span className="campaign-info-popover">
                                    <strong>Campaign Number:</strong> {campaign.campaignNumber || "-"}<br />
                                    <strong>From Date:</strong> {campaign.fromDate ? formatDate(campaign.fromDate) : "-"}<br />
                                    <strong>To Date:</strong> {campaign.toDate ? formatDate(campaign.toDate) : "-"}<br />
                                    <strong>Items:</strong>
                                    <span className="campaign-item-list">
                                      {campaign.items.length ? campaign.items.map((item, itemIndex) => (
                                        <span key={itemIndex}>{item.item || "-"} — Qty {item.quantity || "-"}</span>
                                      )) : <span>-</span>}
                                    </span>
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="single-note-card">
                        <div className="single-note-title">Customer Voice</div>
                        <textarea
                          className="single-customer-voice"
                          value={customerVoice}
                          onChange={(event) => {
                            setCustomerVoice(event.target.value);
                            event.target.style.height = "auto";
                            event.target.style.height = event.target.scrollHeight + "px";
                          }}
                          placeholder="Enter customer voice..."
                          rows={1}
                          aria-label="Customer Voice"
                        />
                      </div>
                    </div>
                  );
                })()}

                {error && <div className="error-line no-print">{error}</div>}

                <div className="section-title service-summary-title" style={{display:"flex",alignItems:"center",gap:10}}>
                  <span>Service Summary — Complete Vehicle History</span>
                  <div className="single-history-toggle no-print" role="group" aria-label="Service history view">
                    <label>
                      <input
                        type="radio"
                        name="single-history-view"
                        value="schedule"
                        checked={historyViewMode === "schedule"}
                        onChange={() => setHistoryViewMode("schedule")}
                      />
                      Only Schedule Service History
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="single-history-view"
                        value="full"
                        checked={historyViewMode === "full"}
                        onChange={() => setHistoryViewMode("full")}
                      />
                      Full History
                    </label>
                  </div>
                </div>
                <div className="history-wrap single-history-wrap" style={{maxHeight:"none",height:"auto",overflow:"visible"}}>
                  <table className="history-table single-service-summary dashboard-resizable-table"><thead><tr>
{singleTableColumns.map((key,index) => (
  <th key={key} style={tableColumnStyle("single",key)}>
    <span className="dashboard-th-content">{singleColumnLabels[key] || key}</span>
    {index < singleTableColumns.length - 1 && <span className="column-resizer" onPointerDown={e=>resizeTableColumn("single",key,e)} />}
  </th>
))}</tr></thead><tbody>
{visibleSingleVisits.length ? visibleSingleVisits.map((visit,i)=>{const visitDate=getVisitDate(visit),jobCard=getVisitJobCard(visit),visitReading=getVisitReading(visit,analysis.vehicle,decisionBasis),allParts=getVisitParts(visit,analysis.vehicle,analysis.decision),parts=historyViewMode === "full" ? allParts : allParts.filter(part => part.eligible);return <tr key={i}>
{isSingleColumnVisible("date")&&<td style={tableColumnStyle("single","date")}>{formatDateShort(visitDate)}</td>}
{isSingleColumnVisible("jobCard")&&<td style={tableColumnStyle("single","jobCard")}>{jobCard}</td>}
{isSingleColumnVisible("reading")&&<td style={tableColumnStyle("single","reading")}>{visitReading?`${formatNumber(visitReading)} ${decisionBasis === "HRS" ? "HRS" : "KM"}`:"-"}</td>}
{isSingleColumnVisible("plant")&&<td style={tableColumnStyle("single","plant")}>{[...new Set(visit.map(r=>String(r?.plantName||r?.salesOrgName||"").trim()).filter(Boolean))].join(", ")||"-"}</td>}
{isSingleColumnVisible("parts")&&<td style={tableColumnStyle("single","parts")}>{parts.length?parts.map((part,index)=><span key={index} className={historyViewMode === "full" && part.eligible ? "history-part eligible" : "history-part"} title={historyViewMode === "full" && part.eligible ? "Eligible service-calculation record" : "History record"}>{part.text}</span>):"-"}</td>}
</tr>}) : <tr><td colSpan={Math.max(1,singleTableColumns.length)} className="small-note">No service history loaded.</td></tr>}
</tbody></table>
                </div>
                </div>
              ) : (
              <div className="pre-analysis-empty">
                <div className="pre-analysis-title">Upload Excel to start</div>
                <div className="pre-analysis-text">Vehicle analysis, profile and service history will appear here after the Excel file is uploaded and analysed.</div>
              </div>
                )}
              </>
            ) : mode === "bulk" ? (
              <>
                <div className="sheet-heading">BULK VEHICLE SERVICE DECISION</div>
                <div className="sheet-subheading">Multiple Excel files supported · Vehicle separation by VIN · Cross-file duplicate protection only.</div>
                {bulkMeta && <>
                  <div className="section-title">Customer Grouping</div>
                  <div className="bulk-card"><div className="bulk-card-head">Customer groups — {customerGroups.length}</div><div className="bulk-card-body">
                    <table className="history-table" style={{minWidth:500}}><thead><tr><th><label style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer"}}><input type="checkbox" checked={customerGroups.length>0 && selectedCustomers.length===customerGroups.length} onChange={(event)=>setSelectedCustomers(event.target.checked ? customerGroups.map(group=>group.id) : [])}/> <span>Select All</span></label></th><th>Customer Group</th><th>Vehicles</th></tr></thead><tbody>
                      {customerGroups.map(group=><tr key={group.id}><td><input type="checkbox" checked={selectedCustomers.includes(group.id)} onChange={()=>setSelectedCustomers(prev=>prev.includes(group.id)?prev.filter(x=>x!==group.id):[...prev,group.id])}/></td><td><strong>{group.name}</strong>{group.customerKeys.length>1&&<div className="small-note">Merged group</div>}</td><td>{group.vehicles.length}</td></tr>)}
                    </tbody></table>
                    <div className="action-row" style={{marginTop:8}}><input className="excel-input" style={{maxWidth:280}} value={mergedCustomerName} onChange={(event)=>setMergedCustomerName(event.target.value)} placeholder="Optional merged customer name" /><button className="excel-button" disabled={selectedCustomers.length<2} onClick={()=>{setCustomerGroups(prev=>mergeCustomerGroups(prev,selectedCustomers,mergedCustomerName));setSelectedCustomers([]);setMergedCustomerName("")}}>Merge Selected Customers</button><button className="excel-button" onClick={()=>{const fresh=buildCustomerGroups(bulkResults,user?.dealerName);setCustomerGroups(fresh);setSelectedCustomers([]);setMergedCustomerName("")}}>Reset Grouping</button></div>
                  </div></div>

                  <div className="section-title">Customer-wise Output</div>
                  {customerGroups.map(group=>{const dueVehicles=group.vehicles.filter(v=>v.services.length>0);return <div className="bulk-card" key={group.id}><div className="bulk-card-head"><div className="action-row"><strong>{group.name}</strong><span className="small-note">{group.vehicles.length} vehicles · {dueVehicles.length} due</span><span className="spacer"/><button className="excel-button no-print" onClick={()=>copyCustomerSummary(group, user?.dealerName, user?.preferences || {})}>Copy WhatsApp Summary</button><button className="excel-button no-print" onClick={()=>printCustomerReport(group,true)}>Print Detailed PDF</button></div></div></div>})}

                  <div className="bulk-overview-grid">
                    <button type="button" className={"bulk-overview-card bulk-overview-card-button " + (bulkQuickFilter === "all" ? "active" : "")} onClick={() => setBulkQuickFilter("all")}><span>Total Vehicles</span><strong>{bulkResults.length}</strong><small>Show all vehicles</small></button>
                    <button type="button" className={"bulk-overview-card bulk-overview-card-button " + (bulkQuickFilter === "due" ? "active" : "")} onClick={() => setBulkQuickFilter("due")}><span>Service Due</span><strong>{bulkResults.filter(item => item.services?.length > 0).length}</strong><small>Show due vehicles</small></button>
                    <button type="button" className={"bulk-overview-card bulk-overview-card-button " + (bulkQuickFilter === "due" ? "active" : "")} onClick={() => setBulkQuickFilter("due")}><span>Due Services</span><strong>{bulkResults.reduce((sum,item)=>sum + (item.services?.length || 0),0)}</strong><small>Show due service items</small></button>
                    <div className="bulk-overview-card"><span>Currently Shown</span><strong>{bulkSummaryRows.length}</strong><small>After search / Excel filters</small></div>
                  </div>
                  <div className="section-title">Service Summary</div>
                  <div className="bulk-control-labels no-print"><span>Search</span><span>Excel Filter / Sort</span><span>Export</span></div>
                  <div className="action-row no-print" style={{margin:"6px 0"}}>
                    <input className="excel-input bulk-search-input" value={bulkSearch} onChange={e=>setBulkSearch(e.target.value)} placeholder="Search VIN, Reg. No., Customer, Model or Service..." aria-label="Search bulk vehicle summary" />
                    <span className="small-note">
                      {bulkSummaryRows.length} vehicle{bulkSummaryRows.length === 1 ? "" : "s"} shown
                      {bulkResults.filter(item=>item.services.length>0).length !== bulkSummaryRows.length
                        ? ` · ${bulkResults.filter(item=>item.services.length>0).length - bulkSummaryRows.length} hidden by filter`
                        : ""}
                    </span>
                    <span className="spacer"/>
                    <button className="excel-button" onClick={clearAllBulkFilters}>Reset Sort / Filter</button>
                    <button className="excel-button" onClick={downloadBulkCsv}>Download Excel</button>
                  </div>
                  <div className="history-wrap">
                    <table className="history-table bulk-service-table dashboard-resizable-table"><thead><tr>
<th style={tableColumnStyle("bulk","serial")}><div className="bulk-th"><div className="bulk-th-top"><button className="bulk-sort-btn" onClick={()=>setBulkSort("dueCount")} title="Sort by number of due services">{dashboardPrefs.bulkColumnLabels?.serial||"S.No. / Due"}</button><span className="bulk-sort-indicator">{bulkTableSort.key==="dueCount"?(bulkTableSort.direction==="asc"?"▲":"▼"):""}</span></div></div><span className="column-resizer" onPointerDown={e=>resizeTableColumn("bulk","serial",e)}/></th>
                          {[
                            [bulkColumnLabels.customerName||"Customer Name","customerName"],
                            [bulkColumnLabels.vin||"VIN","vin"],
                            [bulkColumnLabels.reg||"Reg. No.","reg"],
                            [bulkColumnLabels.saleDate||"Sale Date","saleDate"],
                            [bulkColumnLabels.model||"Model","model"],
                            [bulkColumnLabels.currentReading||"Current Reading","currentReading"],
                            [bulkColumnLabels.services||"Service To Be Completed","services"],
                          ].filter(([,key]) => isBulkColumnVisible(key)).map(([label,key]) => {
                            const active = bulkFilterSelections[key]?.length > 0;
                            const sortActive = bulkTableSort.key === key;
                            return (
                              <th key={key} style={tableColumnStyle("bulk",key)}>
                                <div className={`bulk-th ${active ? "bulk-th-filtered" : ""}`}>
                                  <div className="bulk-th-top">
                                    <span className="bulk-column-title">{label}</span>
                                    {sortActive && (
                                      <span className="bulk-sort-indicator">
                                        {bulkTableSort.direction === "asc" ? "▲" : "▼"}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className={`bulk-filter-arrow ${active ? "active" : ""}`}
                                      onClick={(event) => openBulkFilterMenu(key, event)}
                                      title={`Filter ${label}`}
                                      aria-label={`Open ${label} filter`}
                                      aria-expanded={openBulkFilter?.key === key}
                                    >
                                      ▼
                                    </button>
                                  </div>
                                  {active && (
                                    <div className="bulk-filter-status active">
                                      {bulkFilterSelections[key].length} selected
                                    </div>
                                  )}
                                </div><span className="column-resizer" onPointerDown={e=>resizeTableColumn("bulk",key,e)}/></th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkSummaryRows.map((item,index) => (
                          <tr key={item.vin || index}>
                            <td style={tableColumnStyle("bulk","serial")}>{index + 1}</td>
                            {isBulkColumnVisible("customerName") && <td style={tableColumnStyle("bulk","customerName")}>{item.vehicle.customerName || "-"}</td>}{isBulkColumnVisible("vin") && <td style={tableColumnStyle("bulk","vin")}>{item.vin || item.vehicle.vin || "-"}</td>}{isBulkColumnVisible("reg") && <td style={tableColumnStyle("bulk","reg")}>{item.vehicle.reg || "-"}</td>}{isBulkColumnVisible("saleDate") && <td style={tableColumnStyle("bulk","saleDate")}>{item.vehicle.sale ? formatDateShort(item.vehicle.sale) : "-"}</td>}{isBulkColumnVisible("model") && <td style={tableColumnStyle("bulk","model")}>{item.vehicle.model || "-"}</td>}{isBulkColumnVisible("currentReading") && <td style={tableColumnStyle("bulk","currentReading")}>{item.running?.current ? `${formatNumber(item.running.current)} ${item.running.unit || getTargetUnit(item.vehicle)}` : "-"}</td>}{isBulkColumnVisible("services") && <td style={tableColumnStyle("bulk","services")}>{item.services.join(", ")}</td>}
                          </tr>
                        ))}
                        {!bulkSummaryRows.length && (
                          <tr><td colSpan="8" className="small-note">No vehicles match the selected filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {openBulkFilter && (
                    <ExcelFilterDropdown
                      label={openBulkFilter.label}
                      values={bulkFilterValueLists[openBulkFilter.key] || []}
                      selectedValues={bulkFilterSelections[openBulkFilter.key] || []}
                      anchorRect={openBulkFilter.rect}
                      sortDirection={
                        bulkTableSort.key === openBulkFilter.key
                          ? bulkTableSort.direction
                          : null
                      }
                      onApply={(selectedValues) =>
                        applyBulkFilter(openBulkFilter.key, selectedValues)
                      }
                      onCancel={() => setOpenBulkFilter(null)}
                      onClear={() => clearBulkFilter(openBulkFilter.key)}
                      onSort={(direction) =>
                        sortBulkByColumn(openBulkFilter.key, direction)
                      }
                    />
                  )}
                </>}
              </>
            ) : (
              <>
                <div className="sheet-heading">SERVICE SCHEDULE CHART</div>
                <div className="sheet-subheading">Reference intervals used by Service Decision. The dashboard applies the relevant model, BS norm, service history, reading and date conditions.</div>
                <div className="section-title">Scheduled Service Intervals</div>
                <div className="history-wrap" style={{maxHeight:"none"}}>
                  <table className="history-table">
                    <thead><tr><th>Service</th><th>Normal Vehicle — Reading</th><th>Normal Vehicle — Time</th><th>Tipper / RMC — Reading</th><th>Tipper / RMC — Time</th></tr></thead>
                    <tbody>{SERVICE_SCHEDULE_ROWS.map(([service, normalReading, normalTime, tipperReading, tipperTime]) => <tr key={service}><td className="service-name">{service}</td><td>{normalReading}</td><td>{normalTime}</td><td>{tipperReading}</td><td>{tipperTime}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="section-title">Free and Additional Service Windows</div>
                <table className="decision-table"><thead><tr><th>Service</th><th>Eligibility Window</th><th>Notes</th></tr></thead><tbody>
                  <tr><td className="service-name">1st Free Service — Normal</td><td>37,000–43,000 KM or 5–7 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">2nd Free Service — Normal</td><td>77,000–83,000 KM or 11–13 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">3rd Free Service — Normal</td><td>117,000–123,000 KM or 17–19 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">Tipper Free Service</td><td>1st: 440–560 HRS / 2–4 months; 2nd: 940–1060 HRS / 5–7 months; 3rd: 1940–2060 HRS / 8–10 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">RMC Free Service</td><td>1st: 440–560 HRS / 2–4 months; 2nd: 940–1060 HRS / 5–7 months; 3rd: 1440–1560 HRS / 8–10 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">Wheel Alignment</td><td>Normal: 7,000–45,000 KM; Tipper: 0–2,060 HRS in four service windows</td><td>Existing 4-digit model list; Tipper included, RMC excluded.</td></tr>
                  <tr><td className="service-name">Body Building Check Up</td><td>1–5,000 KM and up to 4 months</td><td>Specified models only.</td></tr>
                </tbody></table>
              </>
            )}
          </main>

        {estimateOpen && (
          <div className="no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div className="estimate-workspace" style={{background:"#fff",color:"#111",width:"min(1100px,96vw)",maxHeight:"94vh",overflow:"auto",borderRadius:10,padding:18}}>
              {estimateStage === "vehicle" ? (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <div style={{fontSize:22,fontWeight:800}}>SERVICE ESTIMATE</div>
                    <div className="estimate-meta">Estimate No. (Session): <b>{estimateNumber || "-"}</b> · Date: <b>{formatDate(new Date())}</b></div>
                    <button className="excel-button" style={{marginLeft:"auto"}} onClick={()=>{setEstimateOpen(false);setMode("home");}}>Cancel</button>
                  </div>
                  <div style={{border:"1px solid #d5d5d5",borderRadius:8,padding:14}}>
                    <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>1. Vehicle Details</div>
                    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"end"}}>
                      <div>
                        <label style={{fontWeight:700}}>Vehicle No.</label>
                        <input className="excel-input" value={estimateVehicleNo} onChange={e=>setEstimateVehicleNo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") void lookupEstimateVehicle();}} placeholder="e.g. GJ12BZ7541" autoFocus />
                      </div>
                      <button className="excel-button green" disabled={estimateVehicleLookupBusy} onClick={()=>void lookupEstimateVehicle()}>{estimateVehicleLookupBusy ? "Checking DB..." : "Next"}</button>
                    </div>
                    <div className="small-note" style={{marginTop:8}}>Spaces are removed automatically before DB lookup.</div>
                  </div>
                </>
              ) : estimateStage === "select" ? (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <div style={{fontSize:22,fontWeight:800}}>SELECT AGGREGATE SERVICES</div><div className="estimate-meta">Estimate No. (Session): <b>{estimateNumber || "-"}</b> · Date: <b>{formatDate(new Date())}</b></div>
                    <span style={{fontSize:12,color:"#666"}}>Single Vehicle Estimate</span>
                    <button className="excel-button" style={{marginLeft:"auto"}} onClick={()=>{setEstimateOpen(false);setMode("home");}}>Cancel</button>
                  </div>
                  <div style={{border:"1px solid #d5d5d5",borderRadius:8,padding:14}}>
                    <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>Which services should be included in the estimate?</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
                      {BULK_SERVICE_LABELS.map(([label,key])=>{
                        const due=!!analysis?.decision?.result?.[key], checked=estimateSelectedServices.includes(key);
                        return <label key={key} style={{display:"flex",alignItems:"center",gap:9,border:"1px solid #ddd",padding:"10px 12px",borderRadius:7,cursor:"pointer",fontSize:15}}>
                          <input type="checkbox" checked={checked} onChange={e=>setEstimateSelectedServices(e.target.checked?[...estimateSelectedServices,key]:estimateSelectedServices.filter(x=>x!==key))}/>
                          <span>{label}</span><small style={{marginLeft:"auto",color:due?"#217346":"#777"}}>{due?"Due":"Not Due"}</small>
                        </label>;
                      })}
                    </div>
                  </div>
                  {estimateLoading && <div style={{marginTop:12,padding:10,textAlign:"center",background:"#f5f5f5",borderRadius:7}}>Loading vehicle history...</div>}
                  {!estimateLoading && estimateNotice && <div style={{marginTop:12,padding:10,background:"#f5f5f5",borderRadius:7}}>{estimateNotice}</div>}
                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
                    <button className="excel-button" onClick={()=>{setEstimateOpen(false);setMode("home");}}>Cancel</button>
                    <button className="excel-button green" disabled={estimateLoading} onClick={prepareEstimate}>OK / Prepare Estimate</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,borderBottom:"1px solid #ddd",paddingBottom:10}}>
                    <div style={{fontSize:22,fontWeight:800}}>SERVICE ESTIMATE</div><div className="estimate-meta">Estimate No. (Session): <b>{estimateNumber || "-"}</b> · Date: <b>{formatDate(new Date())}</b></div>
                    <span style={{fontSize:12,color:"#666"}}>Single Vehicle Only</span>
                    <span style={{marginLeft:"auto",fontWeight:700}}>{user?.dealerName || "Workshop"}</span>
                    <button className="excel-button no-print" onClick={()=>{setEstimateOpen(false);setMode("home");}}>Close</button>
                  </div>
                   <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8,marginBottom:12}}>
                     {[["Customer","customerName"],["Reg. No.","reg"],["Chassis / VIN","vin"],["Engine No.","engine"],["Model","model"]].map(([label,key]) => (
                       <div key={key}><b>{label}</b><input className="excel-input" value={estimateVehicle?.[key] || ""} onChange={e=>setEstimateVehicle(prev=>({...prev,[key]:e.target.value}))} /></div>
                     ))}
                   </div>
                  <div style={{fontWeight:800,margin:"10px 0 6px"}}>Selected Aggregate Services</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{BULK_SERVICE_LABELS.filter(([,key])=>estimateSelectedServices.includes(key)).map(([label])=><span key={label} style={{border:"1px solid #bbb",padding:"5px 8px",borderRadius:5,fontSize:12,background:"#f7f7f7"}}>{label}</span>)}</div>
                  <div style={{fontWeight:800,margin:"10px 0 6px"}}>Parts</div>
                  <table className="history-table"><thead><tr><th>Part No.</th><th>Description</th><th>Qty</th><th>Rate (Incl. GST)</th><th>Amount</th><th></th></tr></thead><tbody>{estimateParts.map(item=><tr key={item.id}><td><input value={item.partNo} onChange={e=>updateEstimateItem("part",item.id,"partNo",e.target.value)} onBlur={e=>lookupManualEstimatePart(item.id,e.target.value)} title="Enter Part No. and leave the field to auto-fill description and rate"/></td><td><input value={item.description} onChange={e=>updateEstimateItem("part",item.id,"description",e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={item.qty ?? ""} placeholder="Qty" onChange={e=>updateEstimateItem("part",item.id,"qty",e.target.value)} onBlur={normalizeEstimateQuantities} onKeyDown={e=>{if(e.key==="Enter") normalizeEstimateQuantities();}} style={{width:80}}/></td><td><input type="number" min="0" step="0.01" value={item.rate} onChange={e=>updateEstimateItem("part",item.id,"rate",e.target.value)} style={{width:110}}/></td><td>{formatNumber(item.qty*item.rate)}</td><td><button className="excel-button no-print" onClick={()=>removeEstimateItem("part",item.id)}>Delete</button></td></tr>)}{!estimateParts.length&&<tr><td colSpan="6">No historical part found. Add manually.</td></tr>}</tbody></table>
                  <div style={{margin:"8px 0"}}><button className="excel-button no-print" onClick={()=>addEstimateItem("part")}>+ Add Part</button></div>
                  <div style={{fontWeight:800,margin:"14px 0 6px"}}>Labour</div>
                  <table className="history-table"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead><tbody>{estimateLabour.map(item=><tr key={item.id}><td><input value={item.description} onChange={e=>updateEstimateItem("labour",item.id,"description",e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={item.qty ?? ""} onChange={e=>updateEstimateItem("labour",item.id,"qty",e.target.value)} onBlur={normalizeEstimateQuantities} onKeyDown={e=>{if(e.key==="Enter") normalizeEstimateQuantities();}} style={{width:80}}/></td><td><input type="number" min="0" step="0.01" value={item.rate} onChange={e=>updateEstimateItem("labour",item.id,"rate",e.target.value)} style={{width:110}}/></td><td>{formatNumber(item.qty*item.rate)}</td><td><button className="excel-button no-print" onClick={()=>removeEstimateItem("labour",item.id)}>Delete</button></td></tr>)}{!estimateLabour.length&&<tr><td colSpan="5">No historical labour found. Add manually.</td></tr>}</tbody></table>
                  <div style={{margin:"8px 0"}}><button className="excel-button no-print" onClick={()=>addEstimateItem("labour")}>+ Add Labour</button></div>
                  <div style={{marginTop:16,marginLeft:"auto",maxWidth:380,borderTop:"2px solid #222",paddingTop:10}}><div style={{display:"flex",justifyContent:"space-between"}}><span>Parts Total</span><b>₹ {formatNumber(estimatePartsTotal)}</b></div><div style={{display:"flex",justifyContent:"space-between"}}><span>Labour Subtotal</span><b>₹ {formatNumber(estimateLabourBase)}</b></div><div style={{display:"flex",justifyContent:"space-between"}}><span>GST on Labour (18%)</span><b>₹ {formatNumber(estimateLabourGst)}</b></div><div style={{display:"flex",justifyContent:"space-between",fontSize:18,marginTop:6}}><span>Grand Total</span><b>₹ {formatNumber(estimateGrandTotal)}</b></div></div>
                  <div className="no-print" style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:8,marginTop:18,paddingTop:12,borderTop:"1px solid #ddd"}}><button className="excel-button" onClick={reviseEstimateServices}>Revise Aggregate Service</button><button className="excel-button green" disabled={estimateSaveBusy} onClick={saveEstimateToDb}>{estimateSaveBusy ? "Saving..." : "Save Estimate"}</button><button className="excel-button" onClick={()=>buildEstimatePdf(true)}>Print A4</button><button className="excel-button green" onClick={()=>buildEstimatePdf(false)}>Download PDF</button></div>
                  <div style={{marginTop:8,fontSize:12,color:"#666"}}>Estimate only. Historical DB rates are without GST; 18% GST is added to historical part rates shown above. Missing items/rates can be entered manually using GST-inclusive rates.</div>
                </>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

function Info({ label, value }) {
  return <div className="info-box"><span>{label}</span><strong>{value}</strong></div>;
}


function App() {
  return <AuthGate><ServiceDecisionApp /></AuthGate>;
}

export default App;
