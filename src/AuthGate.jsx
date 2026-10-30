import { cloneElement, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import "./AuthGate.css";

const TOKEN_KEY = "serviceDecisionAuthToken";
const ACTIVITY_KEY = "serviceDecisionLastActivity";
const INACTIVITY_MS = 12 * 60 * 60 * 1000;
const ADMIN_CONTACT_EMAIL = "rahul.mundra02@gmail.com";
const ADMIN_CONTACT_MOBILE = "9461768278";
const ADMIN_DEALER_FALLBACK = "Kandla Motors";

function normalizeLoggedInUser(account) {
  if (!account) return account;
  // The original admin account was created before dealer names were made
  // account-specific. Keep that legacy placeholder from leaking into the
  // customer-facing WhatsApp workflow.
  if (
    account.role === "admin" &&
    String(account.dealerName || "").trim().toLowerCase() === "service decision admin"
  ) {
    return { ...account, dealerName: ADMIN_DEALER_FALLBACK };
  }
  return account;
}

async function api(action, payload = {}, token = "") {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    if (data.sessionConflict) {
      error.sessionConflict = true;
      error.previousSession = data.previousSession || null;
    }
    throw error;
  }
  return data;
}

export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const sessionValidationRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAccountHelp, setShowAccountHelp] = useState(false);
  const [requestForm, setRequestForm] = useState({personName:"",dealerName:"",email:"",mobile:"",referralCode:""});
  const [requestStatusForm, setRequestStatusForm] = useState({mobile:""});
  const [requestStatusResult, setRequestStatusResult] = useState("");
  const [accountRequests, setAccountRequests] = useState([]);
  const [referralStats, setReferralStats] = useState({referralCode:"",referralCount:0});
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword:"", newPassword:"", confirmPassword:"" });
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminRoute, setAdminRoute] = useState(() => window.location.pathname);
  const adminOpenedFromProfileRef = useRef(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ userId:null, personName:"", dealerName:"", email:"", mobile:"", password:"" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ personName:"", dealerName:"", mobile:"", booking1:"", booking2:"", singleColumns:["date","jobCard","reading","plant","parts"], bulkColumns:["customerName","vin","reg","saleDate","model","currentReading","services"], singleColumnLabels:{date:"Date",jobCard:"Job Card",reading:"Reading",plant:"Plant",parts:"Part No. / Service / Qty"}, bulkColumnLabels:{serial:"S.No. / Due",customerName:"Customer Name",vin:"VIN",reg:"Reg. No.",saleDate:"Sale Date",model:"Model",currentReading:"Current Reading",services:"Service To Be Completed"}, theme:"blue" });
  const [adminAnalytics, setAdminAnalytics] = useState({ summary:[], recent:[], periods:[] });
  const [analyticsUserId, setAnalyticsUserId] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsIncludeAdmins, setAnalyticsIncludeAdmins] = useState(true);
  const [jobCardCacheSettings, setJobCardCacheSettings] = useState({ enabled:true, intervalHours:24, version:1, lastRebuildAt:null, nextRebuildAt:null, cachedJobCards:0 });
  const [emergencyDbUploadCutoff, setEmergencyDbUploadCutoff] = useState(false);
  const [registrationSearchEnabled, setRegistrationSearchEnabled] = useState(true);
  const [sessionConflict, setSessionConflict] = useState(null);
  const [pendingLoginCredentials, setPendingLoginCredentials] = useState(null);
  const [campaignMeta, setCampaignMeta] = useState({ rows:0, vehicles:0, fileName:"", uploadedAt:null });
  const [campaignUploadBusy, setCampaignUploadBusy] = useState(false);
  const [campaignUploadMessage, setCampaignUploadMessage] = useState("");
  const [campaignUploadError, setCampaignUploadError] = useState("");
  const [priceMasterMeta, setPriceMasterMeta] = useState({ version:0, rowCount:0, updatedAt:null, fileName:"" });
  const [priceMasterUploadBusy, setPriceMasterUploadBusy] = useState(false);
  const [priceMasterUploadMessage, setPriceMasterUploadMessage] = useState("");
  const [priceMasterUploadError, setPriceMasterUploadError] = useState("");
  const clickQueueRef = useRef([]);
  const clickFlushTimerRef = useRef(null);


  useEffect(() => {
    if (!user) return undefined;

    const flushClickQueue = async () => {
      const events = clickQueueRef.current.splice(0, 100);
      if (!events.length) return;
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        clickQueueRef.current.unshift(...events);
        return;
      }
      try {
        await api("log-activity-batch", { events }, token);
      } catch {
        clickQueueRef.current.unshift(...events.slice(0, 100));
      }
    };

    const getClickTarget = (target) => {
      if (!(target instanceof Element)) return null;
      return target.closest("button,a,input,select,textarea,[role='button'],[role='tab'],[role='option'],[role='menuitem'],[data-activity]");
    };

    const handleClick = (event) => {
      const target = getClickTarget(event.target);
      if (!target || target.matches('input[type="password"],input[type="file"],input[type="hidden"]')) return;
      const textValue = String(
        target.getAttribute("data-activity") ||
        target.getAttribute("aria-label") ||
        target.getAttribute("title") ||
        target.innerText ||
        target.name ||
        target.id ||
        target.tagName
      ).replace(/\s+/g, " ").trim().slice(0, 180);

      clickQueueRef.current.push({
        clientTime: new Date().toISOString(),
        details: {
          label: textValue || target.tagName,
          tag: target.tagName,
          id: target.id || "",
          className: String(target.className || "").slice(0, 160),
          page: window.location.pathname || "/"
        }
      });

      if (clickQueueRef.current.length >= 10) {
        void flushClickQueue();
      } else if (!clickFlushTimerRef.current) {
        clickFlushTimerRef.current = window.setTimeout(() => {
          clickFlushTimerRef.current = null;
          void flushClickQueue();
        }, 3000);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (clickFlushTimerRef.current) {
        window.clearTimeout(clickFlushTimerRef.current);
        clickFlushTimerRef.current = null;
      }
      void flushClickQueue();
    };
  }, [user]);

  useEffect(() => {
    const syncAdminPath = () => {
      if (window.location.pathname.startsWith("/admin/")) {
        setAdminOpen(true);
        adminOpenedFromProfileRef.current = false;
      }
    };
    syncAdminPath();
    window.addEventListener("popstate", syncAdminPath);
    return () => window.removeEventListener("popstate", syncAdminPath);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    api("me", {}, token)
      .then(data => {
        const nextUser = normalizeLoggedInUser(data.user);
        setUser(nextUser);
        if (nextUser?.role === "admin" && window.location.pathname.startsWith("/admin/")) setAdminOpen(true);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const run = async (fn) => {
    setError("");
    setMessage("");
    setLoading(true);
    try { await fn(); }
    catch (e) { setError(e.message || "Something went wrong."); }
    finally { setLoading(false); }
  };

  const getDeviceName = () => {
    const ua = navigator.userAgent || "";
    const os = /Windows/i.test(ua) ? "Windows PC" : /Android/i.test(ua) ? "Android device" : /iPhone|iPad/i.test(ua) ? "Apple device" : /Mac/i.test(ua) ? "Mac" : "Browser device";
    const browser = /Edg\//i.test(ua) ? "Microsoft Edge" : /Chrome\//i.test(ua) ? "Google Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "Browser";
    return os + " · " + browser;
  };

  const login = (terminateExistingSession = false, credentials = null) => run(async () => {
    const identifier = credentials?.identifier ?? document.getElementById("auth-identifier")?.value ?? "";
    const password = credentials?.password ?? document.getElementById("auth-password")?.value ?? "";
    const loginCredentials = { identifier, password };

    try {
      const data = await api("login", {
        ...loginCredentials,
        terminateExistingSession,
        deviceName: getDeviceName(),
      });
      setSessionConflict(null);
      setPendingLoginCredentials(null);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      setUser(normalizeLoggedInUser(data.user));
    } catch (e) {
      if (e?.sessionConflict) {
        setPendingLoginCredentials(loginCredentials);
        setSessionConflict(e.previousSession || {});
        return;
      }
      throw e;
    }
  });

  const logoutInProgressRef = useRef(false);
  const logout = () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    // End the local session immediately; network cleanup is best-effort.
    const token = localStorage.getItem(TOKEN_KEY);
    const pendingClicks = clickQueueRef.current.splice(0, 100);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    setUser(null);
    setAdminOpen(false);
    setProfileOpen(false);
    setMessage("Logged out successfully.");
    if (token) {
      void (async () => {
        try {
          if (pendingClicks.length) await api("log-activity-batch", { events: pendingClicks }, token);
        } catch {}
        try { await api("logout", {}, token); } catch {}
      })();
    }
    window.setTimeout(() => { logoutInProgressRef.current = false; }, 800);
  };

  useEffect(() => {
    if (!user) return undefined;

    const validateSession = async () => {
      const currentToken = localStorage.getItem(TOKEN_KEY);
      if (!currentToken || sessionValidationRef.current) return;
      sessionValidationRef.current = true;
      try {
        await api("me", {}, currentToken);
      } catch (e) {
        // Only a real 401 means another login terminated this session.
        // Temporary network/server errors do not kick the user out.
        if (e?.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ACTIVITY_KEY);
          setAdminOpen(false);
          setUser(null);
          setMessage("Your session was terminated because this account was logged in elsewhere.");
        }
      } finally {
        sessionValidationRef.current = false;
      }
    };

    const handleClick = (event) => {
      if (event.target?.closest?.(".mobile-profile-action.logout")) return;
      void validateSession();
    };

    document.addEventListener("click", handleClick, true);

    const timer = window.setInterval(() => {
      void validateSession();
    }, 2 * 60 * 1000);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.clearInterval(timer);
    };
  }, [user?.id]);

  const changePassword = () => run(async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) throw new Error("New passwords do not match.");
    if (passwordForm.newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
    await api("change-password", {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    }, localStorage.getItem(TOKEN_KEY));
    setPasswordForm({ currentPassword:"", newPassword:"", confirmPassword:"" });
    setShowPassword(false);
    setMessage("Password changed successfully.");
  });


  const loadAdminAnalytics = async (userId = analyticsUserId, rangeDays = analyticsRange) => {
    // Update the selected range immediately so the UI does not remain on the
    // previous tab while the analytics request is loading.
    setAnalyticsRange(rangeDays);
    setAnalyticsLoading(true);
    try {
      const payload = { rangeDays, includeAdmins: analyticsIncludeAdmins };
      if (userId) payload.userId = userId;
      const data = await api("admin-analytics", payload, localStorage.getItem(TOKEN_KEY));
      setAdminAnalytics(data || { summary:[], recent:[], periods:[], breakdown:[], rangeDays });
      setAnalyticsUserId(userId || null);
      setAnalyticsRange(rangeDays);
    } catch (e) {
      setError(e.message || "Unable to load analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadJobCardCacheSettings = async () => {
    try {
      const data = await api("job-card-cache-settings");
      if (data?.settings) setJobCardCacheSettings(data.settings);
    } catch (e) {
      setError(e.message || "Unable to load Job Card cache settings.");
    }
  };

  const updateJobCardCacheSettings = (payload) => run(async () => {
    const data = await api("admin-job-card-cache-settings", payload, localStorage.getItem(TOKEN_KEY));
    if (data?.settings) setJobCardCacheSettings(data.settings);
    setMessage(data.message || "Job Card cache settings updated.");
  });

  const loadEmergencyDbUploadCutoff = async () => {
    try {
      const data = await api("emergency-db-upload-cutoff-settings");
      setEmergencyDbUploadCutoff(data?.settings?.enabled === true);
    } catch (e) {
      setError(e.message || "Unable to load emergency DB upload cutoff settings.");
    }
  };

  const loadRegistrationSearchSetting = async () => {
    try {
      const data = await api("registration-search-settings");
      setRegistrationSearchEnabled(data?.settings?.enabled !== false);
    } catch (e) {
      setError(e.message || "Unable to load registration search setting.");
    }
  };

  const updateRegistrationSearchSetting = (enabled) => run(async () => {
    const data = await api("admin-registration-search-settings", { enabled: enabled === true }, localStorage.getItem(TOKEN_KEY));
    setRegistrationSearchEnabled(data?.settings?.enabled !== false);
    setMessage(data.message || "Registration search setting updated.");
  });

  const updateEmergencyDbUploadCutoff = (enabled) => run(async () => {
    const data = await api("admin-emergency-db-upload-cutoff", { enabled: enabled === true }, localStorage.getItem(TOKEN_KEY));
    setEmergencyDbUploadCutoff(data?.settings?.enabled === true);
    setMessage(data.message || "Emergency DB upload cutoff updated.");
  });

  const loadPriceMasterMeta = async () => {
    try {
      const response = await fetch("/api/save-history?priceMasterMeta=1", { cache: "no-store", headers: { Authorization: "Bearer " + (localStorage.getItem(TOKEN_KEY) || "") } });
      const data = await response.json();
      if (!response.ok || data?.success === false) throw new Error(data?.error || "Unable to load Price List status.");
      setPriceMasterMeta({
        version:Number(data?.version || 0),
        rowCount:Number(data?.rowCount || 0),
        updatedAt:data?.updatedAt || null,
        fileName:data?.fileName || ""
      });
    } catch (e) {
      setPriceMasterUploadError(e.message || "Unable to load Price List status.");
    }
  };

  const uploadPriceMasterExcel = async (file) => {
    if (!file) return;
    setPriceMasterUploadBusy(true);
    setPriceMasterUploadMessage("");
    setPriceMasterUploadError("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {type:"array", cellDates:true, raw:true});
      const rowsOut = [];
      const cleanHeader = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s_\-\.]+/g, "");
      const indexesFor = (headers) => {
        const aliases = {
          partNo:["partno","partnumber","partnumbercode","partcode","partnumber"],
          description:["partdescription","description","partdesc"],
          mrp:["mrp","maximumretailprice","price"]
        };
        const out = {};
        Object.entries(aliases).forEach(([key, names]) => {
          const idx = headers.findIndex(h => names.includes(h));
          if (idx >= 0) out[key] = idx;
        });
        return out;
      };
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:"",blankrows:false});
        if (!rows.length) continue;
        const headers = rows[0].map(cleanHeader);
        const idx = indexesFor(headers);
        if (idx.partNo === undefined || idx.description === undefined || idx.mrp === undefined) continue;
        for (const row of rows.slice(1)) {
          const partNo = String(row[idx.partNo] ?? "").trim().toUpperCase().replace(/\s+/g,"");
          const description = String(row[idx.description] ?? "").trim();
          const mrpText = String(row[idx.mrp] ?? "").replace(/,/g,"").replace(/[^0-9.\-]/g,"");
          const mrp = Number(mrpText);
          if (!partNo || !description || !Number.isFinite(mrp) || mrp < 0) continue;
          rowsOut.push({partNo,description,mrp});
        }
      }
      const deduped = new Map();
      rowsOut.forEach(row => deduped.set(row.partNo,row));
      const rows = [...deduped.values()];
      if (!rows.length) throw new Error("No valid Price List rows were found. Required columns: Part No, Part Description, MRP.");
      const uploadId = "price-master-" + Date.now() + "-" + Math.random().toString(36).slice(2,8);
      // Keep requests comfortably below Vercel/Neon request-size limits while
      // reducing the number of DB transactions for large masters.
      const batchSize = 5000;
      for (let start=0; start<rows.length; start+=batchSize) {
        const batch=rows.slice(start,start+batchSize);
        const finalize = start + batch.length >= rows.length;
        const response=await fetch("/api/save-history",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            Authorization:"Bearer " + (localStorage.getItem(TOKEN_KEY) || "")
          },
          body:JSON.stringify({
            action:"admin-upload-price-master",
            uploadId,
            fileName:file.name,
            replace:start===0,
            finalize,
            rows:batch
          })
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok || data?.success===false) throw new Error(data?.error || "Price List upload failed.");
        setPriceMasterUploadMessage(
          "Uploading Price List… " +
          Math.min(start+batch.length,rows.length).toLocaleString("en-IN") +
          " / " + rows.length.toLocaleString("en-IN")
        );
        if (finalize) {
          setPriceMasterMeta(prev => ({...prev,version:Number(data?.version || 0),rowCount:Number(data?.rowCount || rows.length)}));
        }
      }
      await loadPriceMasterMeta();
      const latest=await fetch("/api/save-history?priceMaster=1");
      const latestData=await latest.json().catch(()=>({}));
      setPriceMasterUploadMessage(
        rows.length.toLocaleString("en-IN") +
        " parts uploaded successfully. Price List Version " +
        Number(latestData?.version || 0) + "."
      );
    } catch(e) {
      setPriceMasterUploadError(e.message || "Price List upload failed.");
    } finally {
      setPriceMasterUploadBusy(false);
    }
  };

  const loadCampaignMeta = async () => {
    try {
      const data = await api("admin-campaign-meta", {}, localStorage.getItem(TOKEN_KEY));
      setCampaignMeta(data?.meta || { rows:0, vehicles:0, fileName:"", uploadedAt:null });
    } catch (e) {
      setCampaignUploadError(e.message || "Unable to load campaign data status.");
    }
  };

  const uploadCampaignExcel = async (file) => {
    if (!file) return;

    setCampaignUploadBusy(true);
    setCampaignUploadMessage("");
    setCampaignUploadError("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type:"array", cellDates:true, raw:true });
      const allRows = [];

      const cleanHeader = (value) =>
        String(value ?? "")
          .trim()
          .toLowerCase()
          .replace(/[\s_\-]+/g, "");

      const headerMap = {
        chassisnumber: "chassisNumber",
        engine: "engine",
        registrationnumber: "registrationNumber",
        campaignnumber: "campaignNumber",
        campaigndesc: "campaignDesc",
        fromdate: "fromDate",
        todate: "toDate",
        item: "item",
        quantity: "quantity",
      };

      const toDateValue = (value) => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().slice(0,10);
        }
        if (typeof value === "number") {
          const parsed = XLSX.SSF.parse_date_code(value);
          if (parsed?.y && parsed?.m && parsed?.d) {
            return String(parsed.y).padStart(4,"0") + "-" +
              String(parsed.m).padStart(2,"0") + "-" +
              String(parsed.d).padStart(2,"0");
          }
        }
        const text = String(value ?? "").trim();
        if (!text) return "";
        const m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
        if (m) {
          const year = m[3].length === 2 ? "20" + m[3] : m[3];
          return year + "-" + String(m[2]).padStart(2,"0") + "-" + String(m[1]).padStart(2,"0");
        }
        return text;
      };

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const rows = XLSX.utils.sheet_to_json(sheet, {
          header:1,
          raw:true,
          defval:"",
          blankrows:false,
        });
        if (!rows.length) continue;

        const headers = rows[0].map(cleanHeader);
        const indexes = {};
        headers.forEach((header, index) => {
          if (headerMap[header] && indexes[headerMap[header]] === undefined) {
            indexes[headerMap[header]] = index;
          }
        });

        if (indexes.chassisNumber === undefined || indexes.campaignDesc === undefined) {
          continue;
        }

        for (const row of rows.slice(1)) {
          const get = (key) => indexes[key] === undefined ? "" : row[indexes[key]];
          const chassisNumber = String(get("chassisNumber") ?? "").trim();
          const campaignDesc = String(get("campaignDesc") ?? "").trim();
          if (!chassisNumber || !campaignDesc) continue;

          allRows.push({
            chassisNumber,
            engine: String(get("engine") ?? "").trim(),
            registrationNumber: String(get("registrationNumber") ?? "").trim(),
            campaignNumber: String(get("campaignNumber") ?? "").trim(),
            campaignDesc,
            fromDate: toDateValue(get("fromDate")),
            toDate: toDateValue(get("toDate")),
            item: String(get("item") ?? "").trim(),
            quantity: String(get("quantity") ?? "").trim(),
          });
        }
      }

      if (!allRows.length) {
        throw new Error("No valid campaign rows were found. Check the Excel headers: Chassis Number, Campaign Desc, etc.");
      }

      const uploadId = "campaign-" + Date.now();
      const batchSize = 250;
      for (let start = 0; start < allRows.length; start += batchSize) {
        const batch = allRows.slice(start, start + batchSize);
        const data = await api("admin-upload-campaign-batch", {
          uploadId,
          fileName:file.name,
          replace:start === 0,
          rows:batch,
        }, localStorage.getItem(TOKEN_KEY));
        if (!data?.success) throw new Error(data?.error || "Campaign upload failed.");
        setCampaignUploadMessage("Uploading campaign data… " + Math.min(start + batch.length, allRows.length) + " / " + allRows.length);
      }

      await loadCampaignMeta();
      setCampaignUploadMessage(
        allRows.length.toLocaleString("en-IN") + " campaign rows uploaded successfully."
      );
    } catch (e) {
      setCampaignUploadError(e.message || "Campaign Excel upload failed.");
    } finally {
      setCampaignUploadBusy(false);
    }
  };

  const submitAccountRequest = () => run(async () => {
    const data = await api("request-account", requestForm);
    setMessage(data.message + " Request ID: " + data.requestId);
    setRequestForm({personName:"",dealerName:"",email:"",mobile:"",referralCode:""});
  });

  const checkAccountRequest = () => run(async () => {
    const data = await api("check-account-request", requestStatusForm);
    const status = String(data.request.status || "").trim().toUpperCase();
    setRequestStatusResult({ text: data.request.alreadyRegistered ? ("Account already registered. Status: " + status) : ("Request status: " + status), status });
  });

  const loadAccountRequests = async () => {
    const data = await api("admin-list-account-requests", {}, localStorage.getItem(TOKEN_KEY));
    setAccountRequests(data.requests || []);
  };

  const reviewAccountRequest = (request, decision) => run(async () => {
    let password = "";
    if (decision === "approve") {
      password = window.prompt("Set initial password for " + request.email + " (minimum 8 characters):") || "";
      if (password.length < 8) throw new Error("Approval cancelled or password is shorter than 8 characters.");
    } else if (!window.confirm("Reject account request from " + request.email + "?")) return;
    const data = await api("admin-review-account-request", {requestId:request.id,decision,password}, localStorage.getItem(TOKEN_KEY));
    setMessage(data.message || "Request updated.");
    await loadAccountRequests();
    await loadAdminUsers();
  });

  const loadAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const data = await api("admin-list-users", {}, localStorage.getItem(TOKEN_KEY));
      setAdminUsers(data.users || []);
      await loadAccountRequests();
      await loadAdminAnalytics(analyticsUserId, analyticsRange);
    } catch (e) {
      setError(e.message || "Unable to load users.");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    const syncAdminRoute = () => setAdminRoute(window.location.pathname);
    window.addEventListener("popstate", syncAdminRoute);
    window.addEventListener("service-decision-admin-route", syncAdminRoute);
    return () => {
      window.removeEventListener("popstate", syncAdminRoute);
      window.removeEventListener("service-decision-admin-route", syncAdminRoute);
    };
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const section = adminRoute.split("/")[2] || "overview";
    if (!adminOpen) { void loadAccountRequests(); return; }
    if (section === "users") { void loadAdminUsers(); return; }
    if (section === "cache") { void loadJobCardCacheSettings(); return; }
    if (section === "masters") { void loadCampaignMeta(); void loadPriceMasterMeta(); return; }
    if (section === "system") { void loadEmergencyDbUploadCutoff(); void loadRegistrationSearchSetting(); return; }
    if (section === "uploads") { void loadAccountRequests(); return; }
    if (section === "analytics" || section === "overview" || section === "database") void loadAdminAnalytics(analyticsUserId, analyticsRange);
  }, [user?.role, adminOpen, analyticsIncludeAdmins, adminRoute]);

  const createUser = () => run(async () => {
    if (!adminForm.userId && adminForm.password.length < 8) {
      throw new Error("Password must be at least 8 characters for a new user.");
    }
    if (adminForm.password && adminForm.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    const data = await api("admin-create-user", adminForm, localStorage.getItem(TOKEN_KEY));
    setAdminForm({ userId:null, personName:"", dealerName:"", email:"", mobile:"", password:"" });
    setMessage(data.message || (adminForm.userId ? "User account updated successfully." : "User account created successfully."));
    await loadAdminUsers();
  });

  const editUser = (target) => {
    setAdminForm({
      userId: target.id,
      personName: target.personName || "",
      dealerName: target.dealerName || "",
      email: target.email || "",
      mobile: target.mobile || "",
      password: "",
    });
    setMessage("");
    setError("");
  };

  const saveProfile = () => run(async () => {
    const data = await api("update-profile", {
      personName: profileForm.personName,
      dealerName: profileForm.dealerName,
      mobile: profileForm.mobile,
      preferences: {
        booking1: profileForm.booking1,
        booking2: profileForm.booking2,
        whatsappOpeningLine: profileForm.whatsappOpeningLine,
        singleColumns: profileForm.singleColumns,
        bulkColumns: profileForm.bulkColumns,
        singleColumnLabels: profileForm.singleColumnLabels,
        bulkColumnLabels: profileForm.bulkColumnLabels,
        letterhead: profileForm.letterhead || null,
        signature: profileForm.signature || null,
        signaturePlacement: profileForm.signaturePlacement || { x: 70, y: 91, width: 20 },
         theme: profileForm.theme || "blue",
      }
    }, localStorage.getItem(TOKEN_KEY));
    setUser(normalizeLoggedInUser(data.user));
    setProfileOpen(false);
    setMessage("Profile and dashboard preferences saved.");
  });

  useEffect(() => {
    const handleOverlayPopState = (event) => {
      const overlay = event?.state?.serviceDecisionOverlay || "";
      if (overlay === "admin") {
        setAdminOpen(true);
        setProfileOpen(true);
        setShowPassword(false);
      } else if (overlay === "profile") {
        setAdminOpen(false);
        setProfileOpen(true);
        setShowPassword(false);
      } else {
        setAdminOpen(false);
        setProfileOpen(false);
        setShowPassword(false);
      }
    };
    window.addEventListener("popstate", handleOverlayPopState);
    return () => window.removeEventListener("popstate", handleOverlayPopState);
  }, []);

  const openProfile = () => {
    try { window.history.pushState({ ...(window.history.state || {}), serviceDecisionOverlay: "profile" }, "", window.location.href); } catch {}
    const p = user?.preferences || {};
    setProfileForm({
      personName:user?.personName || "",
      dealerName:user?.dealerName || "",
      mobile:user?.mobile || "",
      booking1:p.booking1 || "",
      booking2:p.booking2 || "",
      whatsappOpeningLine:p.whatsappOpeningLine || "",
      singleColumns:Array.isArray(p.singleColumns) && p.singleColumns.length ? p.singleColumns : ["date","jobCard","reading","plant","parts"],
      bulkColumns:Array.isArray(p.bulkColumns) && p.bulkColumns.length ? p.bulkColumns : ["customerName","vin","reg","saleDate","model","currentReading","services"],
      singleColumnLabels:{date:"Date",jobCard:"Job Card",reading:"Reading",plant:"Plant",parts:"Part No. / Service / Qty",...(p.singleColumnLabels || {})},
      bulkColumnLabels:{serial:"S.No. / Due",customerName:"Customer Name",vin:"VIN",reg:"Reg. No.",saleDate:"Sale Date",model:"Model",currentReading:"Current Reading",services:"Service To Be Completed",...(p.bulkColumnLabels || {})},
      letterhead:p.letterhead || null,
      signature:p.signature || null,
      signaturePlacement:p.signaturePlacement || { x:70, y:91, width:20 },
       theme:p.theme || "blue",
    });
    setProfileOpen(true);
    setError("");
    setMessage("");
  };

  const resetUserPassword = (target) => {
    const newPassword = window.prompt(`Enter new password for ${target.personName} (minimum 8 characters):`);
    if (!newPassword) return;
    run(async () => {
      await api("admin-reset-password", { userId:target.id, newPassword }, localStorage.getItem(TOKEN_KEY));
      setMessage(`Password reset for ${target.personName}.`);
      await loadAdminUsers();
    });
  };

  const toggleUserStatus = (target) => {
    const next = target.status === "active" ? "inactive" : "active";
    run(async () => {
      await api("admin-set-status", { userId:target.id, status:next }, localStorage.getItem(TOKEN_KEY));
      setMessage(`${target.personName} is now ${next}.`);
      await loadAdminUsers();
    });
  };

  if (loading && !user) return <div className="auth-loading">Loading Service Decision...</div>;

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-login-shell">
          <section className="auth-visual">
            <div className="auth-visual-overlay">
              <div className="auth-visual-brand">
                <div className="auth-al-mark">AL</div>
                <div>
                  <div className="auth-visual-brand-name">ASHOK LEYLAND</div>
                  <div className="auth-visual-tagline">POWERING BUSINESS AHEAD</div>
                </div>
              </div>

              <div className="auth-visual-copy">
                <div className="auth-visual-kicker">COMMERCIAL VEHICLE SERVICE</div>
                <h1>Service Decision</h1>
                <p>Smart vehicle service analysis for faster decisions, better uptime and stronger service business.</p>
              </div>

              <div className="auth-benefits">
                <div><span>✓</span><strong>Accurate</strong><small>Service Analysis</small></div>
                <div><span>✓</span><strong>Reliable</strong><small>Vehicle Service Planning</small></div>
                <div><span>₹</span><strong>Revenue</strong><small>Service Opportunity</small></div>
                <div><span>↗</span><strong>Grow</strong><small>Customer Business</small></div>
              </div>
            </div>
          </section>

          <section className="auth-card">
            <div className="auth-card-brand">
              <div className="auth-service-icon">⚙</div>
              <div>
                <div className="auth-brand">Service <span>Decision</span></div>
                <div className="auth-subtitle">Vehicle Service Decision & Maintenance Portal</div>
              </div>
            </div>

            <div className="auth-divider" />
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-message">{message}</div>}

            <div className="auth-form-heading">
              <h2>Welcome Back</h2>
              <p>Sign in to continue to your service dashboard.</p>
            </div>

            <label>Email / User ID</label>
            <div className="auth-input-wrap">
              <span>✉</span>
              <input id="auth-identifier" placeholder="Enter your registered email" />
            </div>

            <label>Password</label>
            <div className="auth-input-wrap">
              <span>▣</span>
              <input id="auth-password" type="password" placeholder="Enter your password" onKeyDown={e => e.key === "Enter" && login()} />
            </div>

            <button type="button" className="auth-primary" onClick={() => login(false)} disabled={loading}>
              {loading ? "Signing In..." : "Login  →"}
            </button>

            {sessionConflict && (
              <div className="auth-modal-backdrop">
                <div className="auth-modal session-conflict-modal">
                  <h2>Existing Session Found</h2>
                  <p className="auth-hint">This account is already active on another device/browser.</p>
                  <div className="session-conflict-details">
                    <div><strong>Previous device:</strong> {sessionConflict.deviceName || "Unknown device"}</div>
                    <div><strong>IP address:</strong> {sessionConflict.ipAddress || "Unavailable"}</div>
                    <div><strong>Last active:</strong> {sessionConflict.lastSeenAt ? new Date(sessionConflict.lastSeenAt).toLocaleString("en-IN") : "Unavailable"}</div>
                  </div>
                  <p className="auth-hint">Do you want to terminate the previous session and continue with this login?</p>
                  <div className="auth-modal-actions">
                    <button type="button" className="auth-secondary" onClick={() => { setSessionConflict(null); setPendingLoginCredentials(null); }}>
                      No / Cancel
                    </button>
                    <button type="button" className="auth-primary" onClick={() => { if (!pendingLoginCredentials || loading) return; void login(true, pendingLoginCredentials); }} disabled={loading || !pendingLoginCredentials}>
                      {loading ? "Terminating & Signing In..." : "Yes, Terminate Old Session"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button className="auth-secondary auth-secondary-outline" onClick={() => setShowAccountHelp(v => !v)}>
              {showAccountHelp ? "Hide Account Creation" : "Sign Up / Request Account"}
            </button>

            {showAccountHelp && (
              <div className="auth-account-help">
                <div className="auth-help-title">Request an Account (No OTP)</div>
                <label>Your Name</label><input value={requestForm.personName} onChange={e=>setRequestForm(v=>({...v,personName:e.target.value}))} />
                <label>Dealer / Workshop Name</label><input value={requestForm.dealerName} onChange={e=>setRequestForm(v=>({...v,dealerName:e.target.value}))} />
                <label>Email</label><input type="email" value={requestForm.email} onChange={e=>setRequestForm(v=>({...v,email:e.target.value}))} />
                <label>Mobile Number</label><input type="tel" inputMode="tel" value={requestForm.mobile} onChange={e=>setRequestForm(v=>({...v,mobile:e.target.value}))} />
                <label>Referral Code (optional)</label><input value={requestForm.referralCode} onChange={e=>setRequestForm(v=>({...v,referralCode:e.target.value.toUpperCase()}))} />
                <button className="auth-primary" onClick={submitAccountRequest} disabled={loading}>Submit Account Request</button>
                <div className="auth-help-title" style={{marginTop:18}}>Check Request Status</div>
                <label>Mobile Number</label><input type="tel" inputMode="tel" placeholder="Enter registered mobile number" value={requestStatusForm.mobile} onChange={e=>setRequestStatusForm(v=>({...v,mobile:e.target.value}))} />
                <button className="auth-secondary" onClick={checkAccountRequest} disabled={loading}>Check Status</button>
                {requestStatusResult && <div className={`auth-contact-row auth-request-status-result ${requestStatusResult.status === "INACTIVE" || requestStatusResult.status === "REJECTED" ? "status-inactive" : requestStatusResult.status === "ACTIVE" || requestStatusResult.status === "APPROVED" ? "status-active" : requestStatusResult.status.includes("PENDING") ? "status-pending" : ""}`} role="status">{requestStatusResult.text}</div>}
              </div>
            )}

            <button className="auth-forgot-link" onClick={() => setShowForgotHelp(v => !v)}>
              {showForgotHelp ? "Hide Password Help" : "Forgot Password?"}
            </button>

            {showForgotHelp && (
              <div className="auth-help-panel">
                <strong>Forgot Password</strong>
                <p>Please contact the administrator to reset your password. Password reset is handled manually.</p>
                <div className="auth-contact-row"><strong>Email:</strong> {ADMIN_CONTACT_EMAIL}</div>
                <div className="auth-contact-row"><strong>Contact:</strong> {ADMIN_CONTACT_MOBILE}</div>
              </div>
            )}

            <div className="auth-card-footer">Secure access · Service Decision Portal</div>
          </section>
        </div>
      </div>
    );
  }
  return (
    <div className="app-auth-shell">
      <div className="auth-userbar" aria-hidden="true"></div>
      {user && user.role !== "admin" && <div className="auth-referral-panel"><strong>Refer a Workshop</strong><span>Your referral code: <b>{referralStats.referralCode || "—"}</b></span><span>Successful referrals: <b>{referralStats.referralCount}</b></span><button type="button" onClick={()=>navigator.clipboard?.writeText(referralStats.referralCode)}>Copy Code</button></div>}

      {error && <div className="auth-inline-error">{error}</div>}
      {message && <div className="auth-inline-message">{message}</div>}

      {showPassword && (
        <div className="auth-modal-backdrop">
          <div className="auth-modal">
            <h2>Change Password</h2>
            <p className="auth-hint">Enter your current password, then set a new password.</p>
            <label>Current Password</label>
            <input type="password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} />
            <label>New Password</label>
            <input type="password" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})} placeholder="Minimum 8 characters" />
            <label>Confirm New Password</label>
            <input type="password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm({...passwordForm,confirmPassword:e.target.value})} />
            <div className="auth-modal-actions">
              <button className="auth-secondary" onClick={()=>setShowPassword(false)}>Cancel</button>
              <button className="auth-primary" onClick={changePassword} disabled={loading}>Change Password</button>
            </div>
          </div>
        </div>
      )}

      {profileOpen && (
        <ProfileSettingsModal
          form={profileForm}
          setForm={setProfileForm}
          onSave={saveProfile}
          onClose={()=>setProfileOpen(false)}
          loading={loading}
          onChangePassword={()=>{ setProfileOpen(false); setShowPassword(true); setError(""); setMessage(""); }}
          onLogout={logout}
          isAdmin={user.role === "admin"}
          onAdmin={()=>{ adminOpenedFromProfileRef.current = true; try { window.history.pushState({ ...(window.history.state || {}), serviceDecisionOverlay: "admin" }, "", window.location.href); } catch {} setAdminOpen(true); setError(""); setMessage(""); }}
        />
      )}

      
      {!adminOpen && (
        <div className="mobile-bottom-nav" aria-label="Mobile app navigation">
          {[
            ["home","⌂","Home"],
            ["estimate","₹","Estimate"],
            ["registration-search","🔎","Reg. Search"],
            ["document-scanner","▧","Document Scanner"],
          ].map(([key,icon,label]) => (
            <button key={key} type="button" className="mobile-bottom-nav-item" onClick={() => {
              setMobileMoreOpen(false);
              window.dispatchEvent(new CustomEvent("service-decision-mobile-nav",{detail:{mode:key}}));
            }}>
              <span className="mobile-bottom-nav-icon">{icon}</span><span>{label}</span>
            </button>
          ))}
          <div className="mobile-bottom-nav-more-wrap">
            {mobileMoreOpen && (
              <div className="mobile-bottom-nav-more-menu" role="menu" aria-label="More tools">
                <button type="button" className="mobile-bottom-nav-more-option" role="menuitem" onClick={() => { setMobileMoreOpen(false); window.dispatchEvent(new CustomEvent("service-decision-mobile-nav",{detail:{mode:"single"}})); }}><span aria-hidden="true">▣</span><span>Single Vehicle Service</span></button>
                <button type="button" className="mobile-bottom-nav-more-option" role="menuitem" onClick={() => { setMobileMoreOpen(false); window.dispatchEvent(new CustomEvent("service-decision-mobile-nav",{detail:{mode:"bulk"}})); }}><span aria-hidden="true">▤</span><span>Bulk Vehicle Service</span></button>
                <button type="button" className="mobile-bottom-nav-more-option" role="menuitem" onClick={() => { setMobileMoreOpen(false); window.dispatchEvent(new CustomEvent("service-decision-mobile-nav",{detail:{mode:"warranty-tags"}})); }}><span aria-hidden="true">▦</span><span>Warranty Tag</span></button>
              </div>
            )}
            <button type="button" className={`mobile-bottom-nav-item mobile-bottom-nav-more ${mobileMoreOpen ? "active" : ""}`} aria-expanded={mobileMoreOpen} aria-haspopup="menu" onClick={() => setMobileMoreOpen(open => !open)}>
              <span className="mobile-bottom-nav-icon">•••</span><span>More</span>
            </button>
          </div>
          <button type="button" className="mobile-bottom-nav-item profile profile-button-with-dot" onClick={() => { setMobileMoreOpen(false); window.dispatchEvent(new CustomEvent("service-decision-mobile-nav",{detail:{mode:"profile"}})); }}>
            <span className="mobile-bottom-nav-icon">●</span><span>Profile</span>
            {user?.role === "admin" && accountRequests.some(r=>r.status === "pending") && <span className="profile-alert-dot" aria-label="Pending account requests" title="Pending account requests" />}
          </button>
        </div>
      )}

      {adminOpen && user.role === "admin" ? (
        <AdminPanel
          users={adminUsers}
          accountRequests={accountRequests}
          onReviewAccountRequest={reviewAccountRequest}
          onRefreshAccountRequests={loadAccountRequests}
          form={adminForm}
          setForm={setAdminForm}
          loading={adminLoading || loading}
          onCreate={createUser}
          onEdit={editUser}
          onRefresh={loadAdminUsers}
          onReset={resetUserPassword}
          onToggleStatus={toggleUserStatus}
          onBack={()=>{setAdminOpen(false);setProfileOpen(false);adminOpenedFromProfileRef.current=false;setError("");setMessage("");try{window.history.pushState({serviceDecisionMode:"profile"},"","/profile");}catch{}Promise.resolve().then(()=>window.dispatchEvent(new CustomEvent("service-decision-mobile-nav",{detail:{mode:"profile"}})));}}
          analytics={adminAnalytics}
          analyticsUserId={analyticsUserId}
          analyticsRange={analyticsRange}
          analyticsLoading={analyticsLoading}
          analyticsIncludeAdmins={analyticsIncludeAdmins}
          onSetAnalyticsIncludeAdmins={setAnalyticsIncludeAdmins}
          onAnalytics={loadAdminAnalytics}
          jobCardCacheSettings={jobCardCacheSettings}
          onJobCardCacheSettings={updateJobCardCacheSettings}
          emergencyDbUploadCutoff={emergencyDbUploadCutoff}
          onEmergencyDbUploadCutoff={updateEmergencyDbUploadCutoff}
          registrationSearchEnabled={registrationSearchEnabled}
          onRegistrationSearchSetting={updateRegistrationSearchSetting}
          campaignMeta={campaignMeta}
          campaignUploadBusy={campaignUploadBusy}
          campaignUploadMessage={campaignUploadMessage}
          campaignUploadError={campaignUploadError}
          onUploadCampaignExcel={uploadCampaignExcel}
          priceMasterMeta={priceMasterMeta}
          priceMasterUploadBusy={priceMasterUploadBusy}
          priceMasterUploadMessage={priceMasterUploadMessage}
          priceMasterUploadError={priceMasterUploadError}
          onUploadPriceMasterExcel={uploadPriceMasterExcel}
        />
      ) : cloneElement(children, {
        user,
        onOpenProfile: openProfile,
        onOpenAdmin: () => { adminOpenedFromProfileRef.current = false; try { window.history.pushState({ ...(window.history.state || {}), serviceDecisionOverlay: "admin" }, "", window.location.href); } catch {} setAdminOpen(true); setError(""); setMessage(""); },
        onChangePassword: () => { setShowPassword(true); setError(""); setMessage(""); },
        onLogout: logout,
      })}
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl, maxWidth = 1600, maxHeight = 2260, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function detectLetterheadCrop(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 700 / img.width, 1000 / img.height);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently:true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const w=canvas.width, h=canvas.height;
      const pixels=ctx.getImageData(0,0,w,h).data;
      const border=[];
      const step=Math.max(1,Math.floor(Math.min(w,h)/120));
      const push=(x,y)=>{
        const i=(y*w+x)*4;
        border.push([pixels[i],pixels[i+1],pixels[i+2]]);
      };
      for(let x=0;x<w;x+=step){ push(x,0); push(x,h-1); }
      for(let y=0;y<h;y+=step){ push(0,y); push(w-1,y); }
      const avg=border.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>v/border.length);

      // Detect the largest connected region whose colour/brightness differs
      // from the surrounding desk/background. This is much more reliable for
      // a white/light paper than the old "all dark pixels" bounding box.
      const mask=new Uint8Array(w*h);
      let active=0;
      for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
          const i=(y*w+x)*4;
          const dr=pixels[i]-avg[0], dg=pixels[i+1]-avg[1], db=pixels[i+2]-avg[2];
          const dist=Math.sqrt(dr*dr+dg*dg+db*db);
          const lum=0.299*pixels[i]+0.587*pixels[i+1]+0.114*pixels[i+2];
          const bgLum=0.299*avg[0]+0.587*avg[1]+0.114*avg[2];
          if(dist>16 || Math.abs(lum-bgLum)>12){ mask[y*w+x]=1; active++; }
        }
      }

      // Close small gaps so the sheet becomes one connected component.
      for(let pass=0;pass<2;pass++){
        const next=new Uint8Array(mask);
        for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
          const p=y*w+x;
          if(mask[p] || mask[p-1] || mask[p+1] || mask[p-w] || mask[p+w]) next[p]=1;
        }
        mask.set(next);
      }

      const seen=new Uint8Array(w*h);
      const qx=new Int32Array(w*h), qy=new Int32Array(w*h);
      let best=null;
      for(let sy=1;sy<h-1;sy+=2){
        for(let sx=1;sx<w-1;sx+=2){
          const seed=sy*w+sx;
          if(!mask[seed] || seen[seed]) continue;
          let head=0,tail=0,minX=sx,maxX=sx,minY=sy,maxY=sy,count=0;
          qx[tail]=sx; qy[tail]=sy; tail++; seen[seed]=1;
          while(head<tail){
            const x=qx[head], y=qy[head]; head++; count++;
            if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
            const np=[y*w+x-1,y*w+x+1,(y-1)*w+x,(y+1)*w+x];
            for(const n of np){
              if(n<0||n>=w*h||seen[n]||!mask[n]) continue;
              seen[n]=1; qx[tail]=n%w; qy[tail]=Math.floor(n/w); tail++;
            }
          }
          const bw=maxX-minX+1, bh=maxY-minY+1, area=bw*bh;
          const fill=count/Math.max(1,area);
          const plausible=area>w*h*0.05 && area<w*h*0.92 && bw>w*0.28 && bh>h*0.18 && fill>0.12;
          if(plausible && (!best || area>best.area)) best={minX,maxX,minY,maxY,area};
        }
      }

      if(!best){
        resolve({left:3,top:3,right:97,bottom:97});
        return;
      }
      const padX=Math.max(6,(best.maxX-best.minX+1)*0.025);
      const padY=Math.max(6,(best.maxY-best.minY+1)*0.025);
      resolve({
        left:Math.max(0,((best.minX-padX)/w)*100),
        top:Math.max(0,((best.minY-padY)/h)*100),
        right:Math.min(100,((best.maxX+padX)/w)*100),
        bottom:Math.min(100,((best.maxY+padY)/h)*100)
      });
    };
    img.onerror=()=>resolve({left:3,top:3,right:97,bottom:97});
    img.src=dataUrl;
  });
}
function normalizeLetterheadCorners(value) {
  if (value?.tl && value?.tr && value?.br && value?.bl) return value;
  const left=Number(value?.left ?? 3), top=Number(value?.top ?? 3);
  const right=Number(value?.right ?? 97), bottom=Number(value?.bottom ?? 97);
  return {
    tl:{x:left,y:top}, tr:{x:right,y:top},
    br:{x:right,y:bottom}, bl:{x:left,y:bottom}
  };
}

function renderLetterheadCrop(dataUrl, corners, filterName) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const p=normalizeLetterheadCorners(corners);
      const src=[
        [img.width*p.tl.x/100,img.height*p.tl.y/100],
        [img.width*p.tr.x/100,img.height*p.tr.y/100],
        [img.width*p.br.x/100,img.height*p.br.y/100],
        [img.width*p.bl.x/100,img.height*p.bl.y/100]
      ];
      const topW=Math.hypot(src[1][0]-src[0][0],src[1][1]-src[0][1]);
      const bottomW=Math.hypot(src[2][0]-src[3][0],src[2][1]-src[3][1]);
      const leftH=Math.hypot(src[3][0]-src[0][0],src[3][1]-src[0][1]);
      const rightH=Math.hypot(src[2][0]-src[1][0],src[2][1]-src[1][1]);
      const outW=Math.max(500,Math.min(1600,Math.round(Math.max(topW,bottomW))));
      const outH=Math.max(700,Math.min(2260,Math.round(Math.max(leftH,rightH)*outW/Math.max(1,(topW+bottomW)/2))));
      const canvas=document.createElement("canvas");
      canvas.width=outW; canvas.height=outH;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});

      // Projective transform: destination rectangle -> the four selected source corners.
      const x0=src[0][0],y0=src[0][1], x1=src[1][0],y1=src[1][1];
      const x2=src[2][0],y2=src[2][1], x3=src[3][0],y3=src[3][1];
      const dw=outW-1, dh=outH-1;
      const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3;
      const dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3;
      const den=dx1*dy2-dx2*dy1;
      const g=Math.abs(den)>0.000001 ? (dx3*dy2-dx2*dy3)/den : 0;
      const h=Math.abs(den)>0.000001 ? (dx1*dy3-dx3*dy1)/den : 0;
      const a=x1-x0+g*x1, b=x3-x0+h*x3, c0=x0;
      const d=y1-y0+g*y1, e=y3-y0+h*y3, f=y0;

      const srcCanvas=document.createElement("canvas");
      srcCanvas.width=img.width; srcCanvas.height=img.height;
      const sctx=srcCanvas.getContext("2d",{willReadFrequently:true});
      sctx.drawImage(img,0,0);
      const sd=sctx.getImageData(0,0,img.width,img.height).data;
      const od=ctx.createImageData(outW,outH);
      const applyPixelFilter=(r,g,b)=>{
        const lum=0.299*r+0.587*g+0.114*b;
        if(filterName==="bright") return [Math.min(255,r*1.08+8),Math.min(255,g*1.08+8),Math.min(255,b*1.08+8)];
        if(filterName==="contrast") return [Math.max(0,Math.min(255,(r-128)*1.25+128)),Math.max(0,Math.min(255,(g-128)*1.25+128)),Math.max(0,Math.min(255,(b-128)*1.25+128))];
        if(filterName==="gray") return [lum,lum,lum];
        if(filterName==="scan"){const v=lum>205?255:lum<115?0:Math.round((lum-115)*255/90);return [v,v,v];}
        return [r,g,b];
      };
      const sw=img.width, sh=img.height;
      for(let y=0;y<outH;y++){
        const v=y/dh;
        for(let x=0;x<outW;x++){
          const u=x/dw;
          const q=1+g*u+h*v;
          const sx=(a*u+b*v+c0)/q;
          const sy=(d*u+e*v+f)/q;
          const ix=Math.max(0,Math.min(sw-1,Math.round(sx)));
          const iy=Math.max(0,Math.min(sh-1,Math.round(sy)));
          const si=(iy*sw+ix)*4, oi=(y*outW+x)*4;
          const fp=applyPixelFilter(sd[si],sd[si+1],sd[si+2]);
          od.data[oi]=fp[0]; od.data[oi+1]=fp[1]; od.data[oi+2]=fp[2]; od.data[oi+3]=255;
        }
      }
      ctx.putImageData(od,0,0);
      resolve(canvas.toDataURL("image/jpeg",0.88));
    };
    img.onerror=reject;
    img.src=dataUrl;
  });
}
function LetterheadScanner({ initialValue, onUse, onClose }) {
  const [source,setSource]=useState(initialValue?.image || "");
  const [corners,setCorners]=useState(normalizeLetterheadCorners(initialValue?.corners || initialValue?.crop));
  const [filterName,setFilterName]=useState(initialValue?.filter || "scan");
  const [cameraOpen,setCameraOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [dragCorner,setDragCorner]=useState(null);
  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const fileRef=useRef(null);
  const previewRef=useRef(null);

  useEffect(()=>()=>{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());},[]);

  const openCamera=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
      streamRef.current=stream; setCameraOpen(true);
      setTimeout(()=>{if(videoRef.current){videoRef.current.srcObject=stream;void videoRef.current.play();}},80);
    }catch(e){window.alert("Camera permission was not granted. Allow camera permission in the browser and try again.");}
  };
  const closeCamera=()=>{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;setCameraOpen(false);};

  const loadImage=async(data)=>{
    setSource(data); setBusy(true);
    try{
      const detected=await detectLetterheadCrop(data);
      setCorners(normalizeLetterheadCorners(detected));
    }finally{setBusy(false);}
  };
  const capture=async()=>{
    if(!videoRef.current)return;
    const video=videoRef.current, canvas=document.createElement("canvas");
    canvas.width=video.videoWidth||1280; canvas.height=video.videoHeight||720;
    canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL("image/jpeg",0.92); closeCamera(); await loadImage(data);
  };
  const chooseFile=async(e)=>{
    const file=e.target.files?.[0]; if(!file)return;
    await loadImage(await fileToDataUrl(file)); e.target.value="";
  };
  const autoCrop=async()=>{
    if(!source)return; setBusy(true);
    try{setCorners(normalizeLetterheadCorners(await detectLetterheadCrop(source)));}finally{setBusy(false);}
  };

  const setCorner=(key,e)=>{
    if(!previewRef.current)return;
    const r=previewRef.current.getBoundingClientRect();
    const x=Math.max(0,Math.min(100,((e.clientX-r.left)/r.width)*100));
    const y=Math.max(0,Math.min(100,((e.clientY-r.top)/r.height)*100));
    setCorners(prev=>({...prev,[key]:{x,y}}));
  };
  const beginDrag=(key,e)=>{
    e.preventDefault(); e.stopPropagation(); setDragCorner(key);
    const move=ev=>setCorner(key,ev);
    const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);setDragCorner(null);};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
  };

  const filterCss={
    original:"none",
    bright:"brightness(1.12) contrast(1.05)",
    contrast:"contrast(1.35)",
    gray:"grayscale(1) contrast(1.1)",
    scan:"grayscale(1) brightness(1.08) contrast(1.4)"
  };
  const filterLabels={original:"Original",bright:"Bright + Clear",contrast:"High Contrast",gray:"Grayscale",scan:"Document Scan"};
  const useImage=async()=>{
    if(!source)return;
    setBusy(true);
    try{
      const image=await renderLetterheadCrop(source,corners,filterName);
      onUse({image,corners,filter:filterName});
    }finally{setBusy(false);}
  };

  return <div className="auth-modal-backdrop" style={{zIndex:10010}}>
    <div className="auth-modal" style={{maxWidth:760,width:"min(760px,calc(100vw - 24px))",maxHeight:"94vh",overflow:"auto",boxSizing:"border-box"}}>
      <h2>Company Letterhead Scanner</h2>
      <p className="auth-hint">Drag the four corners to select the document precisely. The preview will update when you apply the filter.</p>

      {cameraOpen ? <div style={{display:"grid",gap:10}}>
        <video ref={videoRef} playsInline muted style={{width:"100%",maxHeight:"55vh",background:"#111",borderRadius:8,objectFit:"contain"}}/>
        <div className="auth-modal-actions"><button className="auth-secondary" onClick={closeCamera}>Cancel</button><button className="auth-primary" onClick={capture}>Capture Photo</button></div>
      </div> : <>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <button className="auth-primary" onClick={openCamera}>📷 Scan Letterhead</button>
          <button className="auth-secondary" onClick={()=>fileRef.current?.click()}>Upload Image</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={chooseFile} style={{display:"none"}}/>
        </div>

        {source && <div style={{display:"grid",gap:10}}>
          <div ref={previewRef} style={{position:"relative",width:"100%",maxHeight:"48vh",overflow:"hidden",background:"#111",borderRadius:10,touchAction:"none",userSelect:"none"}}>
            <img src={source} alt="Letterhead" draggable="false" style={{display:"block",width:"100%",height:"auto",maxHeight:"48vh",objectFit:"contain",filter:filterCss[filterName]}}/>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
              <polygon points={[corners.tl,corners.tr,corners.br,corners.bl].map(p=>p.x+","+p.y).join(" ")} fill="rgba(30,130,70,.10)" stroke="#00b86b" strokeWidth="0.7"/>
            </svg>
            {Object.entries(corners).map(([key,p])=><div key={key} onPointerDown={e=>beginDrag(key,e)} title="Drag corner" style={{position:"absolute",left:p.x+"%",top:p.y+"%",transform:"translate(-50%,-50%)",width:24,height:24,borderRadius:"50%",background:"#00b86b",border:"3px solid #fff",boxShadow:"0 2px 8px #0008",touchAction:"none",cursor:dragCorner===key?"grabbing":"grab"}}/> )}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <button className="auth-secondary" onClick={autoCrop} disabled={busy}>✨ Auto Detect Corners</button>
            <span className="auth-hint">Green corners = final paper area</span>
          </div>

          <div style={{background:"#eef4f0",borderRadius:9,padding:10}}>
            <div style={{fontWeight:800,marginBottom:7}}>Document Filter</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:7}}>
              {Object.keys(filterLabels).map(f=><button key={f} type="button" className={filterName===f?"auth-primary":"auth-secondary"} onClick={()=>setFilterName(f)}>{filterLabels[f]}</button>)}
            </div>
            <div className="auth-hint" style={{marginTop:7}}>The live photo preview above will update when you apply the filter. The saved image will use the same filter.</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
            <div><b>Top-left</b> {Math.round(corners.tl.x)}%, {Math.round(corners.tl.y)}%</div>
            <div><b>Top-right</b> {Math.round(corners.tr.x)}%, {Math.round(corners.tr.y)}%</div>
            <div><b>Bottom-right</b> {Math.round(corners.br.x)}%, {Math.round(corners.br.y)}%</div>
            <div><b>Bottom-left</b> {Math.round(corners.bl.x)}%, {Math.round(corners.bl.y)}%</div>
          </div>
        </div>}

        {busy && <div className="auth-hint" style={{textAlign:"center",padding:8}}>Processing... please wait</div>}
        <div className="auth-modal-actions">
          <button className="auth-secondary" onClick={onClose}>Cancel</button>
          {source && <button className="auth-primary" onClick={useImage} disabled={busy}>✓ Save This Letterhead</button>}
        </div>
      </>}
    </div>
  </div>;
}
function SignaturePad({ initialValue, onUse, onClose }) {
  const canvasRef=useRef(null);
  const drawingRef=useRef(false);
  const [hasInk,setHasInk]=useState(false);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
    if(initialValue?.image){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);img.src=initialValue.image;setHasInk(true);}
  },[initialValue?.image]);
  const point=e=>{const rect=canvasRef.current.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:(t.clientX-rect.left)*(canvasRef.current.width/rect.width),y:(t.clientY-rect.top)*(canvasRef.current.height/rect.height)};};
  const start=e=>{e.preventDefault();drawingRef.current=true;const p=point(e),ctx=canvasRef.current.getContext("2d");ctx.beginPath();ctx.moveTo(p.x,p.y);};
  const move=e=>{if(!drawingRef.current)return;e.preventDefault();const p=point(e),ctx=canvasRef.current.getContext("2d");ctx.lineWidth=3.2;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#111";ctx.lineTo(p.x,p.y);ctx.stroke();setHasInk(true);};
  const end=()=>{drawingRef.current=false;};
  const clear=()=>{const c=canvasRef.current;c.getContext("2d").clearRect(0,0,c.width,c.height);setHasInk(false);};
  const save=()=>{if(!hasInk){window.alert("Please draw your signature.");return;}onUse({image:canvasRef.current.toDataURL("image/png")});};
  return <div className="auth-modal-backdrop" style={{zIndex:10020}}>
    <div className="auth-modal" style={{maxWidth:900,width:"min(900px,calc(100vw - 24px))",boxSizing:"border-box"}}>
      <h2>Authorized Signature</h2>
      <p className="auth-hint">Sign on the white board. After saving, drag the signature in the A4 preview below to set its position and size.</p>
      <div style={{background:"#fff",border:"1px solid #bbb",borderRadius:8,padding:8}}>
        <canvas ref={canvasRef} width={1200} height={420} style={{display:"block",width:"100%",height:"auto",background:"#fff",touchAction:"none"}} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>
      </div>
      <div className="auth-modal-actions"><button className="auth-secondary" onClick={clear}>Clear</button><button className="auth-secondary" onClick={onClose}>Cancel</button><button className="auth-primary" onClick={save}>Save Signature</button></div>
    </div>
  </div>;
}
function ProfileSettingsModal({ form, setForm, onSave, onClose, loading, onChangePassword, onLogout, isAdmin, onAdmin }) {
  const singleCols=[["date","Date"],["jobCard","Job Card"],["reading","Reading"],["plant","Plant"],["parts","Part No. / Service / Qty"]];
  const bulkCols=[["customerName","Customer Name"],["vin","VIN"],["reg","Reg. No."],["saleDate","Sale Date"],["model","Model"],["currentReading","Current Reading"],["services","Service To Be Completed"]];
  const [scannerOpen,setScannerOpen]=useState(false);
  const [signatureOpen,setSignatureOpen]=useState(false);
  const [placement,setPlacement]=useState(form.signaturePlacement || {x:70,y:91,width:20});
  useEffect(()=>{setForm(prev=>({...prev,signaturePlacement:placement}));},[placement,setForm]);
  const setLabel=(group,key,value)=>setForm({...form,[group]:{...(form[group]||{}),[key]:value}});
  const editor=(group,key,label)=>(
    <div style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:7,alignItems:"center"}}>
      <input type="checkbox" checked={(form[group]||[]).includes(key)} onChange={e=>setForm({...form,[group]:e.target.checked?[...(form[group]||[]),key]:(form[group]||[]).filter(x=>x!==key)})}/>
      <input value={(form[group+"Labels"]||{})[key]||label} onChange={e=>setLabel(group+"Labels",key,e.target.value)} />
    </div>
  );
  const savePlacement=()=>setForm({...form,signaturePlacement:placement});
  return <div><div className="auth-modal-backdrop"><div className="auth-modal" style={{maxWidth:820,width:"min(820px,calc(100vw - 32px))",maxHeight:"90vh",overflow:"auto",boxSizing:"border-box"}}>
    <h2>Profile & Dashboard Settings</h2>
    <p className="auth-hint">These settings are saved only for your user ID. Drag the table header divider with the mouse to set the column width.</p>
    <label>Person Name</label><input value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})}/>
    <label>Dealer / Workshop Name</label><input value={form.dealerName} onChange={e=>setForm({...form,dealerName:e.target.value})}/>
    <label>Mobile</label><input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})}/>
     <div className="profile-theme-section">
       <div className="profile-theme-title">Dashboard Theme</div>
       <div className="profile-theme-options">
         {[["blue","Classic Blue"],["green","Excel Green"],["navy","Navy"],["teal","Teal"],["purple","Purple"]].map(([key,label]) => (
           <button key={key} type="button" className={"profile-theme-option theme-"+key+" "+((form.theme || "blue")===key ? "active" : "")} onClick={()=>setForm({...form,theme:key})}>
             <span className="profile-theme-swatch"></span>{label}
           </button>
         ))}
       </div>
     </div>
    <label className="booking-field-label">Advance Booking Contact 1 {!form.booking1 && <span className="booking-field-dot" />}</label><input value={form.booking1} onChange={e=>setForm({...form,booking1:e.target.value})} placeholder="Optional mobile number"/>
    <label className="booking-field-label">Advance Booking Contact 2 {!form.booking2 && <span className="booking-field-dot" />}</label><input value={form.booking2} onChange={e=>setForm({...form,booking2:e.target.value})} placeholder="Optional mobile number"/>
    <label>WhatsApp Opening Line (Optional)</label><textarea value={form.whatsappOpeningLine} onChange={e=>setForm({...form,whatsappOpeningLine:e.target.value})} placeholder="Applies to the top of the WhatsApp due message. Leave blank if no extra line is required." rows={3} style={{minHeight:72,resize:"vertical"}}/>
    <div className="auth-hint">This is your personal wording. It will be saved with your user ID and reused in future WhatsApp due summaries.</div>

    <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid #ddd"}}>
      <div style={{fontWeight:800,fontSize:16}}>Estimate PDF / Print Branding</div>
      <div className="auth-hint">The letterhead will not appear on this screen. It will be used only as the background for Estimate PDF / Print.</div>
      <div style={{display:"grid",gap:10}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
          <button className="auth-primary" type="button" onClick={()=>setScannerOpen(true)}>📷 {form.letterhead ? "Change Letterhead" : "Scan Letterhead"}</button>
          {form.letterhead && <button className="auth-secondary" type="button" onClick={()=>setForm({...form,letterhead:null})}>Remove</button>}
          {form.letterhead && <span className="auth-hint">Letterhead saved</span>}
        </div>
        {form.letterhead?.image && <div style={{border:"1px solid #ddd",borderRadius:8,padding:8,background:"#f7f7f7"}}><img src={form.letterhead.image} alt="Saved letterhead" style={{width:"100%",maxHeight:180,objectFit:"contain",background:"#fff"}} /></div>}

        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
          <button className="auth-primary" type="button" onClick={()=>setSignatureOpen(true)}>✍️ {form.signature ? "Change Signature" : "Add Authorized Signature"}</button>
          {form.signature && <button className="auth-secondary" type="button" onClick={()=>setForm({...form,signature:null})}>Remove</button>}
          {form.signature && <span className="auth-hint">Signature saved</span>}
        </div>
        {form.signature?.image && <div style={{border:"1px solid #ddd",borderRadius:8,padding:8,background:"#f7f7f7"}}><img src={form.signature.image} alt="Saved signature" style={{width:"260px",maxWidth:"100%",height:90,objectFit:"contain",background:"#fff"}} /></div>}
        {form.signature && <div style={{borderTop:"1px solid #eee",paddingTop:10}}>
          <div style={{fontWeight:700,marginBottom:6}}>Signature Position & Size</div>
          <div className="auth-hint">Drag the green signature box in the A4 preview below. Drag the bottom-right handle to resize it.</div>
          <div style={{display:"flex",justifyContent:"center",padding:"10px 0"}}>
            <div id="signature-placement-preview" style={{position:"relative",width:"min(330px,100%)",aspectRatio:"210 / 297",background:"#fff",border:"1px solid #bbb",boxShadow:"0 2px 8px #0002",overflow:"hidden",touchAction:"none"}}
              onPointerMove={e=>{
                if(!window.__sigDrag)return;
                const box=e.currentTarget.getBoundingClientRect();
                const dx=((e.clientX-window.__sigDrag.startX)/box.width)*100;
                const dy=((e.clientY-window.__sigDrag.startY)/box.height)*100;
                if(window.__sigDrag.mode==="move") setPlacement({...window.__sigDrag.base,x:Math.max(2,Math.min(78,window.__sigDrag.base.x+dx)),y:Math.max(60,Math.min(91,window.__sigDrag.base.y+dy))});
                if(window.__sigDrag.mode==="resize") setPlacement({...window.__sigDrag.base,width:Math.max(8,Math.min(45,window.__sigDrag.base.width+dx))});
              }}
              onPointerUp={()=>{window.__sigDrag=null;}}
              onPointerLeave={()=>{window.__sigDrag=null;}}
            >
              <div style={{position:"absolute",left:"8%",right:"8%",top:"8%",height:"1px",background:"#ddd"}}/>
              <div style={{position:"absolute",left:"8%",right:"8%",bottom:"13%",height:"1px",background:"#ddd"}}/>
              <div style={{position:"absolute",left:(placement.x||70)+"%",top:(placement.y||91)+"%",width:(placement.width||20)+"%",height:"10%",border:"2px solid #00a86b",background:"#00a86b18",transform:"translate(-0%,-0%)",touchAction:"none"}}
                onPointerDown={e=>{e.stopPropagation();window.__sigDrag={mode:"move",startX:e.clientX,startY:e.clientY,base:{...placement}};}}
              >
                {form.signature?.image && <img src={form.signature.image} alt="" style={{width:"100%",height:"100%",objectFit:"contain",pointerEvents:"none"}}/>}
                <div title="Resize" onPointerDown={e=>{e.stopPropagation();window.__sigDrag={mode:"resize",startX:e.clientX,startY:e.clientY,base:{...placement}};}} style={{position:"absolute",right:-6,bottom:-6,width:16,height:16,borderRadius:"50%",background:"#00a86b",border:"2px solid #fff",cursor:"nwse-resize"}}/>
              </div>
              <div style={{position:"absolute",left:"8%",right:"8%",bottom:"8%",textAlign:"right",fontSize:9,color:"#555"}}>Authorized Signatory</div>
            </div>
          </div>
          <div className="auth-hint" style={{marginTop:7}}>Position and size update automatically. For final changes, use <b>Save Profile & Settings</b> below.</div>
        </div>}
      </div>
    </div>

    <div style={{fontWeight:800,marginTop:18}}>Single Vehicle Service History Table</div>
    <div className="auth-hint">Checkbox = show/hide · Text box = custom heading · width by mouse drag.</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"6px 12px",margin:"8px 0 16px",minWidth:0}}>{singleCols.map(([k,l])=>editor("singleColumns",k,l))}</div>
    <div style={{fontWeight:800}}>Bulk Vehicle Due / Service Summary Table</div>
    <div className="auth-hint">Checkbox = show/hide · Text box = custom heading · width by mouse drag.</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"6px 12px",margin:"8px 0",minWidth:0}}>{bulkCols.map(([k,l])=>editor("bulkColumns",k,l))}<div style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:7,alignItems:"center"}}><span></span><input value={(form.bulkColumnLabels||{}).serial||"S.No. / Due"} onChange={e=>setLabel("bulkColumnLabels","serial",e.target.value)} placeholder="S.No. / Due"/></div></div>
    <div className="profile-dashboard-theme">
      <div className="profile-settings-section-title">Dashboard Theme</div>
      <div className="profile-theme-options">
        {[["blue","Classic Blue"],["green","Excel Green"],["navy","Navy"],["teal","Teal"],["purple","Purple"]].map(([key,label]) => (
          <button key={key} type="button" className={`profile-theme-option theme-${key} ${(form.theme || "blue")===key ? "active" : ""}`} onClick={()=>setForm({...form,theme:key})}>
            <span className="profile-theme-swatch" aria-hidden="true"></span>{label}
          </button>
        ))}
      </div>
    </div>
    <div className="mobile-profile-account-actions">
      {/* Admin Dashboard, Change Password and Logout are available on the outer Profile page. */}
    </div>
    <div className="auth-modal-actions"><button className="auth-secondary" onClick={onClose}>Cancel</button><button className="auth-primary" onClick={onSave} disabled={loading}>Save Profile & Settings</button></div>
  </div></div>
  {scannerOpen && <LetterheadScanner initialValue={form.letterhead} onUse={v=>{setForm({...form,letterhead:v});setScannerOpen(false);}} onClose={()=>setScannerOpen(false)}/>}
  {signatureOpen && <SignaturePad initialValue={form.signature} onUse={v=>{setForm({...form,signature:v});setSignatureOpen(false);}} onClose={()=>setSignatureOpen(false)}/>}
  </div>;
}
function AdminPanel({ users, accountRequests = [], onReviewAccountRequest, onRefreshAccountRequests, form, setForm, loading, onCreate, onEdit, onRefresh, onReset, onToggleStatus, onBack, analytics, analyticsUserId, analyticsRange, analyticsLoading, analyticsIncludeAdmins, onSetAnalyticsIncludeAdmins, onAnalytics, jobCardCacheSettings, onJobCardCacheSettings, emergencyDbUploadCutoff, onEmergencyDbUploadCutoff, registrationSearchEnabled, onRegistrationSearchSetting, campaignMeta, campaignUploadBusy, campaignUploadMessage, campaignUploadError, onUploadCampaignExcel, priceMasterMeta, priceMasterUploadBusy, priceMasterUploadMessage, priceMasterUploadError, onUploadPriceMasterExcel }) {
  const analyticsDetailRef = useRef(null);
  const adminSectionFromPath = () => {
    const part = window.location.pathname.split("/")[2] || "overview";
    return ["overview","cache","database","uploads","masters","system","analytics","users"].includes(part) ? part : "overview";
  };
  const [adminSection, setAdminSection] = useState(adminSectionFromPath);
  const [view, setView] = useState(() => {
    const part = window.location.pathname.split("/")[2];
    return part === "database" ? "database" : part === "uploads" ? "uploads" : part === "users" ? "management" : "overview";
  });
  useEffect(() => {
    const syncSection = () => {
      const part = adminSectionFromPath(); setAdminSection(part);
      if (part === "database") setView("database");
      else if (part === "uploads") setView("uploads");
      else if (part === "users") setView("management");
      else if (part === "analytics" || part === "overview") setView("overview");
    };
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);
  const goAdminSection = (section) => {
    const next = "/admin/" + section;
    if (window.location.pathname !== next) window.history.pushState({ ...(window.history.state || {}), serviceDecisionAdminSection: section }, "", next);
    setAdminSection(section);
    window.dispatchEvent(new CustomEvent("service-decision-admin-route"));
    if (section === "database") setView("database");
    else if (section === "uploads") setView("uploads");
    else if (section === "users") setView("management");
    else setView("overview");
  };
  const localDateString = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const [dbStartDate, setDbStartDate] = useState(localDateString());
  const [dbEndDate, setDbEndDate] = useState(localDateString());
  const [dbData, setDbData] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [pendingVehicleUploads, setPendingVehicleUploads] = useState([]);
  const [pendingVehicleUploadsLoading, setPendingVehicleUploadsLoading] = useState(false);
  const [pendingVehicleUploadsError, setPendingVehicleUploadsError] = useState("");
  const loadPendingVehicleUploads = async () => {
    setPendingVehicleUploadsLoading(true);
    setPendingVehicleUploadsError("");
    try {
      const data = await api("admin-pending-vehicle-uploads", {}, localStorage.getItem(TOKEN_KEY));
      setPendingVehicleUploads(Array.isArray(data?.uploads) ? data.uploads : []);
    } catch (e) {
      setPendingVehicleUploadsError(e.message || "Unable to load pending vehicle uploads.");
    } finally {
      setPendingVehicleUploadsLoading(false);
    }
  };
  const loadDatabaseView = async (startDate = dbStartDate, endDate = dbEndDate) => {
    setDbLoading(true);
    setDbError("");
    try {
      const data = await api("admin-database-view", { startDate, endDate }, localStorage.getItem(TOKEN_KEY));
      setDbData(data);
      setDbStartDate(startDate);
      setDbEndDate(endDate);
    } catch (e) {
      setDbError(e.message || "Unable to load database view.");
    } finally {
      setDbLoading(false);
    }
  };
  useEffect(() => {
    if (view === "database") {
      const today = localDateString();
      loadDatabaseView(today, today);
    }
  }, [view]);
  useEffect(() => {
    if (view !== "uploads") return undefined;
    loadPendingVehicleUploads();
    const timer = window.setInterval(loadPendingVehicleUploads, 30000);
    return () => window.clearInterval(timer);
  }, [view]);

  const selected = analyticsUserId
    ? analytics.summary.find(u => Number(u.id) === Number(analyticsUserId))
    : null;

  useEffect(() => {
    if (analyticsUserId && analyticsDetailRef.current) {
      setTimeout(() => analyticsDetailRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 80);
    }
  }, [analyticsUserId]);

  const summary = analytics.summary || [];
  const periods = analytics.periods || [];
  const breakdown = analytics.breakdown || [];

  const displayDealerName = (u) => {
    if (
      u?.role === "admin" &&
      String(u?.dealerName || "").trim().toLowerCase() === "service decision admin"
    ) {
      return "Kandla Motors";
    }
    return u?.dealerName || "";
  };

  const totals = summary.reduce((acc,u)=>({
    users:acc.users+1,
    active:acc.active+(u.status==="active"?1:0),
    logins:acc.logins+(u.totalLogins||0),
    vehicles:acc.vehicles,
    files:acc.files+(u.filesProcessed||0),
    activities:acc.activities+(u.totalActivities||0),
  }),{users:0,active:0,logins:0,vehicles:0,files:0,activities:0});
  totals.vehicles = Number(analytics.uniqueVehiclesAnalyzed || 0);

  const topUsers = [...summary].sort((a,b)=>(b.vehiclesAnalyzed||0)-(a.vehiclesAnalyzed||0));
  const topActiveUsers = [...summary].sort((a,b)=>(b.totalActivities||0)-(a.totalActivities||0));
  const recentUsers = [...summary].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,8);
  const now = Date.now();
  const inactiveUsers = summary
    .filter(u => u.role !== "admin" && u.status === "active")
    .map(u => ({...u, _last:new Date(u.lastActivityAt || u.createdAt || 0).getTime()}))
    .filter(u => !u._last || (now-u._last) > 7*24*60*60*1000)
    .sort((a,b)=>a._last-b._last);
  const maxVehicles = Math.max(1,...periods.map(p=>Number(p.vehicles||0)));
  const maxActivities = Math.max(1,...periods.map(p=>Number(p.activities||0)));

  const metricCard = (label,value,sub="") => (
    <div className="admin-kpi">
      <div className="admin-kpi-label">{label}</div>
      <div className="admin-kpi-value">{value}</div>
      {sub && <div className="admin-kpi-sub">{sub}</div>}
    </div>
  );

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header">
          <div>
            <div className="admin-title">Admin Dashboard</div>
            <div className="admin-subtitle">User management, usage analytics and activity history</div>
          </div>
          <button className="auth-secondary admin-back" onClick={onBack}>Back to Dashboard</button>
        </div>

        <nav className="admin-category-nav" aria-label="Admin categories">
          {[
            ["cache","Cache Control"],["database","Database"],["uploads","Upload Monitor"],
            ["masters","Masters"],["system","System Controls"],["analytics","Analytics"],["users","User Management"]
          ].map(([key,label]) => <button key={key} type="button" className={adminSection===key?"active":""} onClick={()=>goAdminSection(key)}>{label}</button>)}
        </nav>
        {adminSection === "analytics" && <div className="admin-kpi-grid">
          {metricCard("Total Users", totals.users)}
          {metricCard("Active Users", totals.active)}
          {metricCard("Total Logins", totals.logins)}
          {metricCard("Vehicles Analysed", totals.vehicles)}
          {metricCard("Excel Files", totals.files)}
          {metricCard("Activities", totals.activities)}
        </div>}

        {adminSection === "cache" && <div className="admin-panel-card" style={{marginTop:12,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div>
              <div className="admin-panel-card-title">Job Card Browser Cache</div>
              <div className="admin-panel-card-sub">Central Neon Job Card index and browser IndexedDB rebuild control</div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontWeight:700}}>
              <span>Cache System</span>
              <input type="checkbox" checked={jobCardCacheSettings?.enabled !== false} onChange={e=>onJobCardCacheSettings({enabled:e.target.checked})} />
              <span>{jobCardCacheSettings?.enabled !== false ? "ON" : "OFF"}</span>
            </label>
          </div>
          <div className="admin-cache-metrics">
            <div className="admin-cache-metric"><span>Current Database Job Cards</span><strong>{Number(jobCardCacheSettings?.currentDatabaseJobCards ?? jobCardCacheSettings?.cachedJobCards ?? 0).toLocaleString("en-IN")}</strong></div>
            <div className="admin-cache-metric"><span>Job Cards Queued for Cache Rebuild</span><strong>{Number(jobCardCacheSettings?.cachedJobCards || jobCardCacheSettings?.currentDatabaseJobCards || 0).toLocaleString("en-IN")}</strong><small>{jobCardCacheSettings?.lastRebuildAt ? "Rebuild requested " + new Date(jobCardCacheSettings.lastRebuildAt).toLocaleString("en-IN") : "No rebuild requested"}</small></div>
            <div className="admin-cache-metric"><span>Last Automatic Rebuild</span><strong>{jobCardCacheSettings?.lastAutoRebuildAt ? new Date(jobCardCacheSettings.lastAutoRebuildAt).toLocaleString("en-IN") : "Not recorded"}</strong>{jobCardCacheSettings?.lastAutoRebuildError && <small className="admin-cache-error">{jobCardCacheSettings.lastAutoRebuildError}</small>}</div>
          </div>
          <div className="admin-cache-actions">
            <button className="auth-primary" disabled={Boolean(jobCardCacheSettings?.rebuilding)} onClick={()=>onJobCardCacheSettings({operation:"rebuild"})}>Build Cache Now</button>
            <button className="auth-secondary" onClick={()=>onJobCardCacheSettings({operation:"refresh"})}>Refresh Counts</button>
          </div>
        </div>}

        {adminSection === "system" && <><div className="admin-panel-card" style={{marginTop:12,padding:"18px 20px",border:"1px solid #cbd5e1"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div>
              <div className="admin-panel-card-title">Registration Number Service Search</div>
              <div className="admin-panel-card-sub">Global control for Stable and Beta. When OFF, registration-number service search is blocked for all users on both portals.</div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontWeight:800,color:registrationSearchEnabled ? "#166534" : "#b91c1c"}}>
              <span>{registrationSearchEnabled ? "SEARCH ENABLED" : "SEARCH DISABLED"}</span>
              <input type="checkbox" checked={registrationSearchEnabled} onChange={e => {
                const enabled = e.target.checked;
                if (!window.confirm(enabled ? "Enable registration-number service search on BOTH Stable and Beta portals?" : "Disable registration-number service search for ALL users on BOTH Stable and Beta portals?")) return;
                onRegistrationSearchSetting(enabled);
              }} />
            </label>
          </div>
          <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:registrationSearchEnabled ? "#ecfdf5" : "#fee2e2",color:registrationSearchEnabled ? "#166534" : "#991b1b",fontWeight:700}}>
            {registrationSearchEnabled ? "ON: registration number service search is available on both portals." : "OFF: registration number service search is blocked for everyone on both portals."}
          </div>
        </div>

        <div className="admin-panel-card" style={{marginTop:16,padding:"18px 20px",border:"2px solid #dc2626",background:"#fff7f7"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div>
              <div className="admin-panel-card-title" style={{color:"#b91c1c"}}>Emergency DB Upload Cutoff</div>
              <div className="admin-panel-card-sub">Stops new Excel history uploads to Neon. Service Decision calculations continue locally in the browser.</div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontWeight:800,color:emergencyDbUploadCutoff ? "#b91c1c" : "#166534"}}>
              <span>{emergencyDbUploadCutoff ? "CUTOFF ACTIVE" : "DB UPLOAD ACTIVE"}</span>
              <input type="checkbox" checked={emergencyDbUploadCutoff} onChange={e => {
                const enabled = e.target.checked;
                if (enabled && !window.confirm("Enable Emergency DB Upload Cutoff? New Excel history data will NOT be saved to Neon until you turn this OFF.")) return;
                onEmergencyDbUploadCutoff(enabled);
              }} />
            </label>
          </div>
          <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:emergencyDbUploadCutoff ? "#fee2e2" : "#ecfdf5",color:emergencyDbUploadCutoff ? "#991b1b" : "#166534",fontWeight:700}}>
            {emergencyDbUploadCutoff ? "Emergency mode ON: Excel upload + Service Decision remain available, but history persistence is paused." : "Normal mode: new Excel Job Cards are saved using the hybrid browser-cache + Neon duplicate-check system."}
          </div>
        </div></>}

        {adminSection === "masters" && <><div className="admin-panel-card" style={{marginTop:12,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div>
              <div className="admin-panel-card-title">Vehicle Campaign Master</div>
              <div className="admin-panel-card-sub">
                Upload the current campaign Excel. Chassis Number = VIN. A new upload replaces the previous campaign master.
              </div>
            </div>
            <button
              className="auth-primary"
              type="button"
              onClick={() => document.getElementById("admin-campaign-excel-input")?.click()}
              disabled={campaignUploadBusy}
            >
              {campaignUploadBusy ? "Uploading..." : "Upload Campaign Excel"}
            </button>
          </div>

          <input
            id="admin-campaign-excel-input"
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv"
            style={{display:"none"}}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                if (window.confirm("Replace the current Campaign Master with the selected Excel file?")) {
                  void onUploadCampaignExcel(file);
                }
              }
            }}
          />

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginTop:16}}>
            <div>
              <div className="admin-panel-card-sub">Campaign Rows</div>
              <strong>{Number(campaignMeta?.rows || 0).toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <div className="admin-panel-card-sub">Vehicles with Campaign</div>
              <strong>{Number(campaignMeta?.vehicles || 0).toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <div className="admin-panel-card-sub">Last Uploaded File</div>
              <strong>{campaignMeta?.fileName || "Not uploaded"}</strong>
            </div>
            <div>
              <div className="admin-panel-card-sub">Last Updated</div>
              <strong>{campaignMeta?.uploadedAt ? new Date(campaignMeta.uploadedAt).toLocaleString("en-IN") : "Not uploaded"}</strong>
            </div>
          </div>

          {(campaignUploadMessage || campaignUploadError) && (
            <div style={{
              marginTop:12,
              padding:"10px 12px",
              borderRadius:8,
              background:campaignUploadError ? "#fff1f2" : "#ecfdf5",
              color:campaignUploadError ? "#b91c1c" : "#166534",
              fontWeight:700
            }}>
              {campaignUploadError || campaignUploadMessage}
            </div>
          )}

          <div style={{marginTop:12,fontSize:11,color:"#6b7280"}}>
            Required headers: Chassis Number, Engine, Registration Number, Campaign Number, Campaign Desc, From Date, To Date, Item, Quantity.
          </div>
        </div>

        <div className="admin-panel-card" style={{marginTop:16,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div>
              <div className="admin-panel-card-title">Part Price List Master</div>
              <div className="admin-panel-card-sub">Upload Excel with Part No, Part Description and MRP. Every new Excel upload creates the next Price List Version and replaces the previous master.</div>
            </div>
            <button className="auth-primary" type="button" onClick={()=>document.getElementById("admin-price-master-input")?.click()} disabled={priceMasterUploadBusy}>
              {priceMasterUploadBusy ? "Uploading..." : "Upload Price List Excel"}
            </button>
          </div>
          <input id="admin-price-master-input" type="file" accept=".xlsx,.xls,.xlsm,.csv" style={{display:"none"}} onChange={e=>{
            const file=e.target.files?.[0]; e.target.value="";
            if(file && window.confirm("Replace the current Price List Master with the selected Excel file?")) void onUploadPriceMasterExcel(file);
          }} />
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginTop:16}}>
            <div><div className="admin-panel-card-sub">Price List Version</div><strong>{Number(priceMasterMeta?.version||0)}</strong></div>
            <div><div className="admin-panel-card-sub">Parts in Master</div><strong>{Number(priceMasterMeta?.rowCount||0).toLocaleString("en-IN")}</strong></div>
            <div><div className="admin-panel-card-sub">Last Uploaded File</div><strong>{priceMasterMeta?.fileName||"Not uploaded"}</strong></div>
            <div><div className="admin-panel-card-sub">Last Updated</div><strong>{priceMasterMeta?.updatedAt ? new Date(priceMasterMeta.updatedAt).toLocaleString("en-IN") : "Not uploaded"}</strong></div>
          </div>
          {(priceMasterUploadMessage || priceMasterUploadError) && <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:priceMasterUploadError?"#fff1f2":"#ecfdf5",color:priceMasterUploadError?"#b91c1c":"#166534",fontWeight:700}}>{priceMasterUploadError||priceMasterUploadMessage}</div>}
          <div style={{marginTop:12,fontSize:11,color:"#6b7280"}}>Required headers: Part No, Part Description, MRP. Same Part No duplicate rows me last valid row will be used. This master will be shared by Website and Android Estimate app.</div>
        </div></>}

        {(adminSection === "analytics" || adminSection === "database" || adminSection === "uploads" || adminSection === "users") && <>{adminSection === "analytics" && <div className="admin-analytics-toolbar professional">
          <div className="admin-dashboard-scope-tabs">
            <button className={analyticsIncludeAdmins ? "active" : ""} onClick={() => { onSetAnalyticsIncludeAdmins(true); onAnalytics(null, analyticsRange); }}>All Statistics (Including Admin)</button>
            <button className={!analyticsIncludeAdmins ? "active" : ""} onClick={() => { onSetAnalyticsIncludeAdmins(false); onAnalytics(null, analyticsRange); }}>Statistics Without Admin</button>
          </div>
          <div className="admin-view-tabs">
            {[
              ["overview","Overview"],
              ["users","User Insights"],
              ["activity","Activity"]
            ].map(([key,label])=>
              <button key={key} className={view===key ? "active" : ""} onClick={()=>setView(key)}>{label}</button>
            )}
          </div>
          <div className="admin-range-tabs">
            {[1,7,30,90].map(days=>
              <button key={days} className={analyticsRange===days ? "active" : ""} onClick={()=>onAnalytics(analyticsUserId,days)}>
                {days === 1 ? "Today" : `${days}D`}
              </button>
            )}
          </div>
          {analyticsLoading && <span className="admin-loading-pill">Updating...</span>}
        </div>}

        {adminSection === "analytics" && view === "overview" && (
          <>
            <div className="admin-section-title">Vehicle Productivity Overview</div>
            <div className="admin-dashboard-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Vehicles Checked Per Day</div>
                <div className="admin-panel-card-sub">Vehicles analysed per day</div>
                <div className="admin-bar-chart">
                  {periods.map(p=>{
                    const v=Number(p.vehicles||0);
                    const h=Math.max(v?4:0,Math.round(v/maxVehicles*100));
                    return <div className="admin-bar-col" key={`v-${String(p.activity_date)}`} title={`${p.activity_date}: ${v} vehicles`}>
                      <div className="admin-bar-value">{v||""}</div>
                      <div className="admin-bar" style={{height:`${h}%`}} />
                      <div className="admin-bar-label">{new Date(p.activity_date).toLocaleDateString(undefined,{day:"2-digit",month:"short"})}</div>
                    </div>;
                  })}
                </div>
              </div>
            </div>

            <div className="admin-dashboard-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Top Users by Vehicles Analysed</div>
                <div className="admin-ranked-list">
                  {topUsers.slice(0,5).map((u,i)=><button className="admin-rank-row" key={u.id} onClick={()=>onAnalytics(Number(u.id),analyticsRange)}>
                    <span className="rank-no">{i+1}</span><span className="rank-name">{u.personName}</span><span className="rank-value">{u.vehiclesAnalyzed||0}</span>
                  </button>)}
                  {!topUsers.length && <div className="admin-empty">No user activity yet.</div>}
                </div>
              </div>
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Recent Users</div>
                <div className="admin-mini-list">
                  {recentUsers.map(u=><button key={u.id} onClick={()=>onAnalytics(Number(u.id),analyticsRange)}>
                    <span><strong>{u.personName}</strong><small>{displayDealerName(u)}</small></span>
                    <em>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</em>
                  </button>)}
                </div>
              </div>
            </div>
          </>
        )}

        {adminSection === "analytics" && view === "users" && (
          <>
            <div className="admin-section-title">User Insights</div>
            <div className="admin-dashboard-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Most Active Users</div>
                <div className="admin-ranked-list">
                  {topActiveUsers.slice(0,8).map((u,i)=><button className="admin-rank-row" key={u.id} onClick={()=>onAnalytics(Number(u.id),analyticsRange)}>
                    <span className="rank-no">{i+1}</span><span className="rank-name">{u.personName}</span><span className="rank-value">{u.totalActivities||0}</span>
                  </button>)}
                </div>
              </div>
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Top Inactive Users</div>
                <div className="admin-panel-card-sub">Active accounts with no activity for more than 7 days</div>
                <div className="admin-ranked-list">
                  {inactiveUsers.slice(0,8).map((u,i)=><button className="admin-rank-row inactive" key={u.id} onClick={()=>onAnalytics(Number(u.id),analyticsRange)}>
                    <span className="rank-no">{i+1}</span><span className="rank-name">{u.personName}<small>{u.dealerName}</small></span><span className="rank-value">{u._last ? new Date(u._last).toLocaleDateString() : "Never"}</span>
                  </button>)}
                  {!inactiveUsers.length && <div className="admin-empty">No inactive users in this period.</div>}
                </div>
              </div>
            </div>
            <div className="admin-dashboard-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Recently Registered</div>
                <div className="admin-mini-list">
                  {recentUsers.map(u=><button key={u.id} onClick={()=>onAnalytics(Number(u.id),analyticsRange)}>
                    <span><strong>{u.personName}</strong><small>{u.email}</small></span>
                    <em>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</em>
                  </button>)}
                </div>
              </div>
            </div>
          </>
        )}

        {adminSection === "analytics" && view === "activity" && (
          <>
            <div className="admin-section-title">Activity Analytics</div>
            <div className="admin-dashboard-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Activity Types</div>
                <div className="admin-horizontal-bars">
                  {breakdown.map(b=>{
                    const max=Math.max(1,...breakdown.map(x=>Number(x.count||0)));
                    const pct=Math.round(Number(b.count||0)/max*100);
                    return <div className="admin-hbar-row" key={b.activity_type}><span>{b.activity_type}</span><div><i style={{width:`${pct}%`}} /></div><b>{b.count}</b></div>;
                  })}
                </div>
              </div>
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Vehicle Checks Summary</div>
                <div className="admin-kpi-grid compact">
                  {metricCard("Vehicles Checked", periods.reduce((n,p)=>n+Number(p.vehicles||0),0))}
                  
                  
                  {metricCard("Files", periods.reduce((n,p)=>n+Number(p.files||0),0))}
                </div>
              </div>
            </div>
            <div className="admin-panel-card">
              <div className="admin-panel-card-title">Recent Activity</div>
              <div className="admin-table-wrap admin-activity-wrap">
                <table className="admin-table">
                  <thead><tr><th>Date / Time</th><th>User</th><th>Dealer</th><th>Activity</th><th>Mode</th><th>Vehicles</th><th>Files</th><th>VIN</th></tr></thead>
                  <tbody>
                    {(analytics.recent||[]).map(a=><tr key={a.id}><td>{new Date(a.activity_time).toLocaleString()}</td><td>{a.person_name}</td><td>{a.dealer_name}</td><td>{a.activity_type === "UI Interaction" ? `Click: ${a.details?.label || "Control"}` : a.activity_type}</td><td>{a.mode||"—"}</td><td>{a.vehicle_count||0}</td><td>{a.file_count||0}</td><td>{a.vin||"—"}</td></tr>)}
                    {!(analytics.recent||[]).length && <tr><td colSpan="8" className="admin-empty">No activity recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {adminSection === "database" && (
          <>
            <div className="admin-section-title">Database View</div>
            <div className="admin-panel-card" style={{marginBottom:16}}>
              <div className="admin-panel-card-title">New Data Stored in DM Database</div>
              <div className="admin-panel-card-sub">Counts use database record creation time in India Standard Time, not vehicle sale date or job-card service date.</div>
              <div style={{display:"flex",gap:10,alignItems:"end",flexWrap:"wrap",marginTop:14}}>
                <button className="admin-analytics-btn" onClick={() => { const d=localDateString(); setDbStartDate(d); setDbEndDate(d); loadDatabaseView(d,d); }}>Today</button>
                <button className="admin-analytics-btn" onClick={() => { const end=localDateString(); const start=localDateString(new Date(Date.now()-6*24*60*60*1000)); setDbStartDate(start); setDbEndDate(end); loadDatabaseView(start,end); }}>Last 7 Days</button>
                <div><label style={{display:"block",fontSize:12,fontWeight:700,marginBottom:5}}>From date</label><input type="date" value={dbStartDate} onChange={e=>setDbStartDate(e.target.value)} style={{padding:8,border:"1px solid #cbd5e1",borderRadius:6}} /></div>
                <div><label style={{display:"block",fontSize:12,fontWeight:700,marginBottom:5}}>To date</label><input type="date" value={dbEndDate} onChange={e=>setDbEndDate(e.target.value)} style={{padding:8,border:"1px solid #cbd5e1",borderRadius:6}} /></div>
                <button className="auth-primary" style={{width:"auto",marginTop:0}} disabled={dbLoading || !dbStartDate || !dbEndDate || dbStartDate>dbEndDate} onClick={()=>loadDatabaseView(dbStartDate,dbEndDate)}>{dbLoading ? "Loading..." : "Apply Range"}</button>
                {dbLoading && <span className="admin-loading-pill">Refreshing database counts...</span>}
              </div>
              {dbError && <div className="auth-inline-error">{dbError}</div>}
              <div className="admin-dashboard-grid" style={{marginTop:16}}>
                <div className="admin-kpi"><div className="admin-kpi-label">Vehicles Added</div><div className="admin-kpi-value">{Number(dbData?.vehicleCount||0).toLocaleString("en-IN")}</div><div className="admin-kpi-sub">New VIN records</div></div>
                <div className="admin-kpi"><div className="admin-kpi-label">Line Items Added</div><div className="admin-kpi-value">{Number(dbData?.lineItemCount||0).toLocaleString("en-IN")}</div><div className="admin-kpi-sub">New service-history rows</div></div>
                <div className="admin-kpi"><div className="admin-kpi-label">Total Vehicle Modified</div><div className="admin-kpi-value">{Number(dbData?.modifiedVehicleCount||0).toLocaleString("en-IN")}</div><div className="admin-kpi-sub">Existing vehicles with newly added Job Cards</div></div>
                <div className="admin-kpi"><div className="admin-kpi-label">Total Vehicle Timestamp Refreshed</div><div className="admin-kpi-value">{Number(dbData?.refreshedVehicleCount||0).toLocaleString("en-IN")}</div><div className="admin-kpi-sub">Unique vehicles refreshed in selected period</div></div>
              </div>
              <div className="admin-panel-card-sub" style={{marginTop:12}}>Selected period: {dbStartDate} to {dbEndDate}. Counts are exact; each detail table shows up to 200 latest rows.</div>
            </div>

            <div className="admin-panel-card" style={{marginBottom:16}}>
              <div className="admin-panel-card-title">Vehicle Records Added</div>
              <div style={{overflowX:"auto",marginTop:10}}>
                <table className="admin-table">
                  <thead><tr><th>Created At</th><th>VIN</th><th>Registration</th><th>Customer</th><th>Model</th></tr></thead>
                  <tbody>
                    {(dbData?.vehicles||[]).map((v,i)=><tr key={v.vin||i}><td>{v.created_at?new Date(v.created_at).toLocaleString("en-IN"):"—"}</td><td>{v.vin||"—"}</td><td>{v.registration||"—"}</td><td>{v.customer_name||"—"}</td><td>{v.model||"—"}</td></tr>)}
                    {!(dbData?.vehicles||[]).length && <tr><td colSpan="5" className="admin-empty">No vehicle records added in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
              {dbData?.vehicleRowsLimited && <div className="admin-panel-card-sub">Showing latest 200 vehicle records. Total count above includes all records.</div>}
            </div>

          </>
        )}

        {adminSection === "users" && (
          <>
            <div className="admin-section-title">User Management</div>
            <div className="admin-grid admin-management-grid">
              <div className="admin-form-card">
                <h3>{form.userId ? "Edit User Account" : "Create User Account"}</h3>
                <label>Person Name *</label>
                <input value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})} />
                <label>Dealer Name *</label>
                <input value={form.dealerName} onChange={e=>setForm({...form,dealerName:e.target.value})} />
                <label>Email / User ID *</label>
                <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
                <label>Mobile (optional)</label>
                <input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} placeholder="10 digit mobile" />
                <label>Password {form.userId ? "(optional)" : "*"}</label>
                <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={form.userId ? "Leave blank to keep current password" : "Minimum 8 characters"} />
                <button className="auth-primary" onClick={onCreate} disabled={loading}>{form.userId ? "Save User Changes" : "Create User"}</button>
                {form.userId && <button className="auth-secondary" onClick={()=>setForm({userId:null,personName:"",dealerName:"",email:"",mobile:"",password:""})}>Cancel Edit</button>}
              </div>

              <div className="admin-users-card">
                <div className="admin-users-header">
                  <h3>Pending Account Requests {accountRequests.filter(r=>r.status==="pending").length > 0 && <span className="pending-request-dot" title="Pending requests">{accountRequests.filter(r=>r.status==="pending").length}</span>}</h3>
                  <button className="auth-secondary admin-refresh" onClick={()=>void onRefreshAccountRequests()} disabled={loading}>Refresh</button>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Dealer</th><th>Email</th><th>Mobile</th><th>Referral</th><th>Requested</th><th>Action</th></tr></thead>
                    <tbody>{accountRequests.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.person_name}</td><td>{r.dealer_name}</td><td>{r.email}</td><td>{r.mobile || "—"}</td><td>{r.referral_code || "—"}</td><td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td><td>{r.status==="pending" ? <div className="admin-row-actions"><button onClick={()=>onReviewAccountRequest(r,"approve")}>Approve</button><button onClick={()=>onReviewAccountRequest(r,"reject")}>Reject</button></div> : r.status}</td></tr>)}{!accountRequests.length && <tr><td colSpan="8" className="admin-empty">No account requests found.</td></tr>}</tbody>
                  </table>
                </div>
              </div>

              <div className="admin-users-card">
                <div className="admin-users-header"><h3>Users</h3><button className="auth-secondary admin-refresh" onClick={onRefresh} disabled={loading}>Refresh</button></div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Dealer</th><th>Email</th><th>Status</th><th>Last Login</th><th>Last Activity</th><th>Analytics</th><th>Action</th></tr></thead>
                    <tbody>
                      {users.map(u=><tr key={u.id}>
                        <td>{u.id}</td><td>{u.personName}</td><td>{displayDealerName(u)}</td><td>{u.email}</td>
                        <td>{u.role === "admin" ? "ADMIN" : u.status}</td>
                        <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                        <td>{u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleString() : "—"}</td>
                        <td><button className="admin-analytics-btn" onClick={()=>onAnalytics(Number(u.id),analyticsRange)}>View</button></td>
                        <td><div className="admin-row-actions">
                          {u.role !== "admin" && <button onClick={()=>onEdit(u)}>Edit</button>}
                          {u.role !== "admin" && <button onClick={()=>onReset(u)}>Reset Password</button>}
                          {u.role !== "admin" && <button onClick={()=>onToggleStatus(u)}>{u.status === "active" ? "Deactivate" : "Activate"}</button>}
                        </div></td>
                      </tr>)}
                      {!users.length && <tr><td colSpan="9" className="admin-empty">No users found.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {adminSection === "uploads" && (
          <section>
            <div className="admin-section-title">Failed / Incomplete Vehicle Uploads</div>
            <div className="admin-panel-card" style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div>
                  <div className="admin-panel-card-title">Pending Chassis Tracker</div>
                  <div className="admin-panel-card-sub">Only unfinished chassis appear here. A chassis is removed automatically after its Vehicle Master, expected Job Cards and Line Items pass database verification.</div>
                </div>
                <button className="auth-secondary admin-refresh" type="button" onClick={loadPendingVehicleUploads} disabled={pendingVehicleUploadsLoading}>
                  {pendingVehicleUploadsLoading ? "Refreshing..." : "Refresh List"}
                </button>
              </div>
              <div className="admin-kpi-grid compact" style={{marginTop:14}}>
                {metricCard("Pending Chassis", pendingVehicleUploads.length)}
                {metricCard("Failed", pendingVehicleUploads.filter(row=>row.status==="failed").length)}
                {metricCard("Processing / Queued", pendingVehicleUploads.filter(row=>row.status==="processing"||row.status==="queued"||row.status==="verification_pending").length)}
              </div>
              {pendingVehicleUploadsError && <div style={{marginTop:12,padding:10,borderRadius:8,background:"#fff1f2",color:"#b91c1c",fontWeight:700}}>{pendingVehicleUploadsError}</div>}
              <div className="admin-table-wrap" style={{marginTop:14}}>
                <table className="admin-table" style={{minWidth:900}}>
                  <thead><tr><th>Chassis Number</th><th>Registration No.</th><th>Customer</th><th>Model</th><th>Status</th><th>Expected JCs</th><th>Expected Lines</th><th>Error / Detail</th><th>Last Attempt</th></tr></thead>
                  <tbody>
                    {pendingVehicleUploads.map(row=><tr key={row.vin}>
                      <td style={{fontWeight:800,whiteSpace:"nowrap"}}>{row.vin}</td>
                      <td>{row.registration || "—"}</td>
                      <td>{row.customer_name || "—"}</td>
                      <td>{row.model || "—"}</td>
                      <td><span style={{fontWeight:800,color:row.status==="failed"?"#b91c1c":row.status==="processing"?"#1d4ed8":"#92400e"}}>{String(row.status||"pending").replace(/_/g," ").toUpperCase()}</span></td>
                      <td>{Number(row.expected_job_cards_count||0).toLocaleString("en-IN")}</td>
                      <td>{Number(row.expected_lines_count||0).toLocaleString("en-IN")}</td>
                      <td style={{minWidth:220,whiteSpace:"normal"}}>{row.error_message || (row.status==="processing" ? "Upload interrupted or still processing. Verify by retrying." : "Awaiting successful database verification.")}</td>
                      <td style={{whiteSpace:"nowrap"}}>{row.last_attempt_at ? new Date(row.last_attempt_at).toLocaleString("en-IN") : "Not attempted yet"}</td>
                    </tr>)}
                    {!pendingVehicleUploadsLoading && !pendingVehicleUploads.length && <tr><td colSpan="9" className="admin-empty">No pending or failed vehicle uploads.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="admin-panel-card-sub" style={{marginTop:12}}>Retry: upload the relevant DMS history Excel through Single Vehicle or Bulk Vehicle. No manual chassis entry is required.</div>
            </div>
          </section>
        )}
        {selected && (
          <div ref={analyticsDetailRef} className="admin-selected-analytics">
            <div className="admin-section-title">Selected User · {selected.personName}</div>
            <div className="admin-kpi-grid compact">
              {metricCard("Logins", selected.totalLogins||0)}
              {metricCard("Active Days", selected.activeDays||0)}
              {metricCard("Excel Files", selected.filesProcessed||0)}
              {metricCard("Vehicles", selected.vehiclesAnalyzed||0)}
              {metricCard("Single", selected.singleAnalyses||0)}
              {metricCard("Bulk", selected.bulkAnalyses||0)}
            </div>
            <button className="auth-secondary" onClick={()=>onAnalytics(null,analyticsRange)}>Clear User Filter</button>
          </div>
        )}

        </>}
        <div className="admin-note">Passwords are stored as secure hashes. Analytics record account activity and usage events; passwords are never stored in activity logs.</div>
      </div>
    </div>
  );
}