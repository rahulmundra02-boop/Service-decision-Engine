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
  const sessionValidationRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAccountHelp, setShowAccountHelp] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword:"", newPassword:"", confirmPassword:"" });
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ userId:null, personName:"", dealerName:"", email:"", mobile:"", password:"" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ personName:"", dealerName:"", mobile:"", booking1:"", booking2:"", singleColumns:["date","jobCard","reading","plant","parts"], bulkColumns:["customerName","vin","reg","saleDate","model","currentReading","services"], singleColumnLabels:{date:"Date",jobCard:"Job Card",reading:"Reading",plant:"Plant",parts:"Part No. / Service / Qty"}, bulkColumnLabels:{serial:"S.No. / Due",customerName:"Customer Name",vin:"VIN",reg:"Reg. No.",saleDate:"Sale Date",model:"Model",currentReading:"Current Reading",services:"Service To Be Completed"} });
  const [adminAnalytics, setAdminAnalytics] = useState({ summary:[], recent:[], periods:[] });
  const [analyticsUserId, setAnalyticsUserId] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsIncludeAdmins, setAnalyticsIncludeAdmins] = useState(true);
  const [jobCardCacheSettings, setJobCardCacheSettings] = useState({ enabled:true, intervalHours:24, version:1, lastRebuildAt:null, nextRebuildAt:null, cachedJobCards:0 });
  const [emergencyDbUploadCutoff, setEmergencyDbUploadCutoff] = useState(false);
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
      if (!target) return;
      const textValue = String(
        target.getAttribute("data-activity") ||
        target.getAttribute("aria-label") ||
        target.getAttribute("title") ||
        target.innerText ||
        target.value ||
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
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    api("me", {}, token)
      .then(data => setUser(normalizeLoggedInUser(data.user)))
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

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const pendingClicks = clickQueueRef.current.splice(0, 100);
    if (token && pendingClicks.length) {
      try { await api("log-activity-batch", { events: pendingClicks }, token); } catch {}
    }
    try { await api("logout", {}, token); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    setUser(null);
    setAdminOpen(false);
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

    const handleClick = () => {
      void validateSession();
    };

    document.addEventListener("click", handleClick, true);

    const timer = window.setInterval(() => {
      void validateSession();
    }, 10 * 1000);

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

  const updateEmergencyDbUploadCutoff = (enabled) => run(async () => {
    const data = await api("admin-emergency-db-upload-cutoff", { enabled: enabled === true }, localStorage.getItem(TOKEN_KEY));
    setEmergencyDbUploadCutoff(data?.settings?.enabled === true);
    setMessage(data.message || "Emergency DB upload cutoff updated.");
  });

  const loadPriceMasterMeta = async () => {
    try {
      const response = await fetch("/api/save-history?priceMaster=1");
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
      if (!rows.length) throw new Error("Valid Price List rows nahi mile. Required columns: Part No, Part Description, MRP.");
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
        throw new Error("Valid campaign rows nahi mile. Excel headers check karein: Chassis Number, Campaign Desc etc.");
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

  const loadAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const data = await api("admin-list-users", {}, localStorage.getItem(TOKEN_KEY));
      setAdminUsers(data.users || []);
      await loadAdminAnalytics(analyticsUserId, analyticsRange);
    } catch (e) {
      setError(e.message || "Unable to load users.");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin" && adminOpen) {
      loadAdminUsers();
      loadJobCardCacheSettings();
      loadEmergencyDbUploadCutoff();
      loadCampaignMeta();
      loadPriceMasterMeta();
    }
  }, [user?.role, adminOpen, analyticsIncludeAdmins]);

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
      }
    }, localStorage.getItem(TOKEN_KEY));
    setUser(normalizeLoggedInUser(data.user));
    setProfileOpen(false);
    setMessage("Profile and dashboard preferences saved.");
  });

  const openProfile = () => {
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
                <div className="auth-help-title">Account Creation</div>
                <div className="auth-help-text">Need a Service Decision account? Contact the administrator. Account creation is free and quick.</div>
                <div className="auth-contact-row"><strong>Email:</strong> {ADMIN_CONTACT_EMAIL}</div>
                <div className="auth-contact-row"><strong>Contact:</strong> {ADMIN_CONTACT_MOBILE}</div>
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
      <div className="auth-userbar">
        <span><strong>{user.personName}</strong> · {user.dealerName}</span>
        <div className="auth-user-actions">
          <button className="profile-button-with-dot" onClick={openProfile}>
            Profile & Settings
            {!(user?.preferences?.booking1 || user?.preferences?.booking2) && <span className="profile-alert-dot" />}
          </button>
          {user.role === "admin" && <button onClick={() => { setAdminOpen(true); setError(""); setMessage(""); }}>Admin</button>}
          <button onClick={() => { setShowPassword(true); setError(""); setMessage(""); }}>Change Password</button>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </div>

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
        />
      )}

      {adminOpen && user.role === "admin" ? (
        <AdminPanel
          users={adminUsers}
          form={adminForm}
          setForm={setAdminForm}
          loading={adminLoading || loading}
          onCreate={createUser}
          onEdit={editUser}
          onRefresh={loadAdminUsers}
          onReset={resetUserPassword}
          onToggleStatus={toggleUserStatus}
          onBack={()=>{setAdminOpen(false);setError("");setMessage("");}}
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
      ) : cloneElement(children, { user })}
    </div>
  );
}

function ProfileSettingsModal({ form, setForm, onSave, onClose, loading }) {
  const toggleColumn=(key,value,checked)=>{const list=Array.isArray(form[key])?form[key]:[];setForm({...form,[key]:checked?[...new Set([...list,value])]:list.filter(x=>x!==value)});};
  const setLabel=(group,key,value)=>setForm({...form,[group]:{...(form[group]||{}),[key]:value}});
  const singleCols=[["date","Date"],["jobCard","Job Card"],["reading","Reading"],["plant","Plant"],["parts","Part / Service / Qty"]];
  const bulkCols=[["customerName","Customer Name"],["vin","VIN"],["reg","Reg. No."],["saleDate","Sale Date"],["model","Model"],["currentReading","Current Reading"],["services","Service To Be Completed"]];
  const editor=(group,key,label)=>{const lg=group==="singleColumns"?"singleColumnLabels":"bulkColumnLabels";return <div key={key} style={{display:"grid",gridTemplateColumns:"20px minmax(0,1fr)",gap:6,alignItems:"center",minWidth:0,marginBottom:6}}><input type="checkbox" checked={(form[group]||[]).includes(key)} onChange={e=>toggleColumn(group,key,e.target.checked)} style={{width:16,height:16,margin:0,justifySelf:"center"}}/><input value={(form[lg]||{})[key]||label} onChange={e=>setLabel(lg,key,e.target.value)} placeholder={label} style={{width:"100%",minWidth:0,boxSizing:"border-box"}}/></div>};
  return <div className="auth-modal-backdrop"><div className="auth-modal" style={{maxWidth:820,width:"min(820px,calc(100vw - 32px))",maxHeight:"90vh",overflow:"auto",boxSizing:"border-box"}}><h2>Profile & Dashboard Settings</h2><p className="auth-hint">Ye settings sirf aapki user ID ke liye save hongi. Table width header divider ko mouse se drag karke set hogi.</p><label>Person Name</label><input value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})}/><label>Dealer / Workshop Name</label><input value={form.dealerName} onChange={e=>setForm({...form,dealerName:e.target.value})}/><label>Mobile</label><input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})}/><label className="booking-field-label">Advance Booking Contact 1 {!form.booking1 && <span className="booking-field-dot" />}</label><input value={form.booking1} onChange={e=>setForm({...form,booking1:e.target.value})} placeholder="Optional mobile number"/><label className="booking-field-label">Advance Booking Contact 2 {!form.booking2 && <span className="booking-field-dot" />}</label><input value={form.booking2} onChange={e=>setForm({...form,booking2:e.target.value})} placeholder="Optional mobile number"/><label>WhatsApp Opening Line (Optional)</label><textarea value={form.whatsappOpeningLine} onChange={e=>setForm({...form,whatsappOpeningLine:e.target.value})} placeholder="Applies to the top of the WhatsApp due message. Leave blank if no extra line is required." rows={3} style={{minHeight:72,resize:"vertical"}}/><div className="auth-hint">This is your personal wording. It will be saved with your user ID and reused in future WhatsApp due summaries.</div><div style={{fontWeight:800}}>Single Vehicle Service History Table</div><div className="auth-hint">Checkbox = show/hide · Text box = custom heading · width by mouse drag.</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"6px 12px",margin:"8px 0 16px",minWidth:0}}>{singleCols.map(([k,l])=>editor("singleColumns",k,l))}</div><div style={{fontWeight:800}}>Bulk Vehicle Due / Service Summary Table</div><div className="auth-hint">Checkbox = show/hide · Text box = custom heading · width by mouse drag.</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"6px 12px",margin:"8px 0",minWidth:0}}>{bulkCols.map(([k,l])=>editor("bulkColumns",k,l))}<div style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:7,alignItems:"center"}}><span></span><input value={(form.bulkColumnLabels||{}).serial||"S.No. / Due"} onChange={e=>setLabel("bulkColumnLabels","serial",e.target.value)} placeholder="S.No. / Due"/></div></div><div className="auth-modal-actions"><button className="auth-secondary" onClick={onClose}>Cancel</button><button className="auth-primary" onClick={onSave} disabled={loading}>Save Profile & Settings</button></div></div></div>;
}

function AdminPanel({ users, form, setForm, loading, onCreate, onEdit, onRefresh, onReset, onToggleStatus, onBack, analytics, analyticsUserId, analyticsRange, analyticsLoading, analyticsIncludeAdmins, onSetAnalyticsIncludeAdmins, onAnalytics, jobCardCacheSettings, onJobCardCacheSettings, emergencyDbUploadCutoff, onEmergencyDbUploadCutoff, campaignMeta, campaignUploadBusy, campaignUploadMessage, campaignUploadError, onUploadCampaignExcel, priceMasterMeta, priceMasterUploadBusy, priceMasterUploadMessage, priceMasterUploadError, onUploadPriceMasterExcel }) {
  const analyticsDetailRef = useRef(null);
  const [view, setView] = useState("overview");

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

        <div className="admin-kpi-grid">
          {metricCard("Total Users", totals.users)}
          {metricCard("Active Users", totals.active)}
          {metricCard("Total Logins", totals.logins)}
          {metricCard("Vehicles Analysed", totals.vehicles)}
          {metricCard("Excel Files", totals.files)}
          {metricCard("Activities", totals.activities)}
        </div>

        <div className="admin-panel-card" style={{marginTop:16,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div>
              <div className="admin-panel-card-title">Job Card Browser Cache</div>
              <div className="admin-panel-card-sub">Central Neon index + browser IndexedDB cache control</div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontWeight:700}}>
              <span>Cache System</span>
              <input type="checkbox" checked={jobCardCacheSettings?.enabled !== false} onChange={e=>onJobCardCacheSettings({enabled:e.target.checked})} />
              <span>{jobCardCacheSettings?.enabled !== false ? "ON" : "OFF"}</span>
            </label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginTop:16}}>
            <div><div className="admin-panel-card-sub">Cache Rebuild Interval</div>
              <select value={Number(jobCardCacheSettings?.intervalHours || 24)} onChange={e=>onJobCardCacheSettings({intervalHours:Number(e.target.value)})} style={{marginTop:6,width:"100%",padding:"9px 10px",borderRadius:8,border:"1px solid #d7dce3"}}>
                {[6,12,24,48,168].map(v=><option key={v} value={v}>{v===168?"7 Days":v+" Hours"}</option>)}
              </select>
            </div>
            <div><div className="admin-panel-card-sub">Last Global Index Update</div><strong>{jobCardCacheSettings?.lastRebuildAt ? new Date(jobCardCacheSettings.lastRebuildAt).toLocaleString("en-IN") : "Not yet rebuilt"}</strong></div>
            <div><div className="admin-panel-card-sub">Next Rebuild</div><strong>{jobCardCacheSettings?.nextRebuildAt ? new Date(jobCardCacheSettings.nextRebuildAt).toLocaleString("en-IN") : "—"}</strong></div>
            <div><div className="admin-panel-card-sub">Cached Job Cards</div><strong>{Number(jobCardCacheSettings?.cachedJobCards || 0).toLocaleString("en-IN")}</strong></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
            <button className="auth-primary" onClick={()=>onJobCardCacheSettings({operation:"rebuild"})}>Rebuild Cache Now</button>
            <button className="auth-secondary" onClick={()=>onJobCardCacheSettings({operation:"reset"})}>Clear Cache Policy</button>
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
        </div>

        <div className="admin-panel-card" style={{marginTop:16,padding:"18px 20px"}}>
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
                if (window.confirm("Current campaign master replace karke selected Excel upload karein?")) {
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
            if(file && window.confirm("Current Price List Master replace karke selected Excel upload karein?")) void onUploadPriceMasterExcel(file);
          }} />
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginTop:16}}>
            <div><div className="admin-panel-card-sub">Price List Version</div><strong>{Number(priceMasterMeta?.version||0)}</strong></div>
            <div><div className="admin-panel-card-sub">Parts in Master</div><strong>{Number(priceMasterMeta?.rowCount||0).toLocaleString("en-IN")}</strong></div>
            <div><div className="admin-panel-card-sub">Last Uploaded File</div><strong>{priceMasterMeta?.fileName||"Not uploaded"}</strong></div>
            <div><div className="admin-panel-card-sub">Last Updated</div><strong>{priceMasterMeta?.updatedAt ? new Date(priceMasterMeta.updatedAt).toLocaleString("en-IN") : "Not uploaded"}</strong></div>
          </div>
          {(priceMasterUploadMessage || priceMasterUploadError) && <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:priceMasterUploadError?"#fff1f2":"#ecfdf5",color:priceMasterUploadError?"#b91c1c":"#166534",fontWeight:700}}>{priceMasterUploadError||priceMasterUploadMessage}</div>}
          <div style={{marginTop:12,fontSize:11,color:"#6b7280"}}>Required headers: Part No, Part Description, MRP. Same Part No duplicate rows me last valid row will be used. This master will be shared by Website and Android Estimate app.</div>
        </div>

        <div className="admin-analytics-toolbar professional">
          <div className="admin-dashboard-scope-tabs">
            <button className={analyticsIncludeAdmins ? "active" : ""} onClick={() => { onSetAnalyticsIncludeAdmins(true); onAnalytics(null, analyticsRange); }}>All Statistics (Including Admin)</button>
            <button className={!analyticsIncludeAdmins ? "active" : ""} onClick={() => { onSetAnalyticsIncludeAdmins(false); onAnalytics(null, analyticsRange); }}>Statistics Without Admin</button>
          </div>
          <div className="admin-view-tabs">
            {[
              ["overview","Overview"],
              ["users","User Insights"],
              ["activity","Activity"],
              ["management","User Management"]
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
        </div>

        {view === "overview" && (
          <>
            <div className="admin-section-title">Usage Overview</div>
            <div className="admin-dashboard-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Daily Activity</div>
                <div className="admin-panel-card-sub">Last {analyticsRange} days</div>
                <div className="admin-bar-chart">
                  {periods.map(p=>{
                    const v=Number(p.activities||0);
                    const h=Math.max(4,Math.round(v/maxActivities*100));
                    return <div className="admin-bar-col" key={String(p.activity_date)} title={`${p.activity_date}: ${v} activities`}>
                      <div className="admin-bar-value">{v||""}</div>
                      <div className="admin-bar" style={{height:`${h}%`}} />
                      <div className="admin-bar-label">{new Date(p.activity_date).toLocaleDateString(undefined,{day:"2-digit",month:"short"})}</div>
                    </div>;
                  })}
                </div>
              </div>
              <div className="admin-panel-card">
                <div className="admin-panel-card-title">Vehicle Analysis Trend</div>
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

        {view === "users" && (
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
                <div className="admin-panel-card-title">User Activity Distribution</div>
                <div className="admin-horizontal-bars">
                  {topActiveUsers.slice(0,8).map(u=>{
                    const pct=Math.round((u.totalActivities||0)/Math.max(1,topActiveUsers[0]?.totalActivities||1)*100);
                    return <div className="admin-hbar-row" key={u.id}><span>{u.personName}</span><div><i style={{width:`${pct}%`}} /></div><b>{u.totalActivities||0}</b></div>;
                  })}
                </div>
              </div>
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

        {view === "activity" && (
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
                <div className="admin-panel-card-title">Activity Summary</div>
                <div className="admin-kpi-grid compact">
                  {metricCard("Activities", periods.reduce((n,p)=>n+Number(p.activities||0),0))}
                  {metricCard("Logins", periods.reduce((n,p)=>n+Number(p.logins||0),0))}
                  {metricCard("Vehicles", periods.reduce((n,p)=>n+Number(p.vehicles||0),0))}
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
                    {(analytics.recent||[]).map(a=><tr key={a.id}><td>{new Date(a.activity_time).toLocaleString()}</td><td>{a.person_name}</td><td>{a.dealer_name}</td><td>{a.activity_type}</td><td>{a.mode||"—"}</td><td>{a.vehicle_count||0}</td><td>{a.file_count||0}</td><td>{a.vin||"—"}</td></tr>)}
                    {!(analytics.recent||[]).length && <tr><td colSpan="8" className="admin-empty">No activity recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === "management" && (
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

        <div className="admin-note">Passwords are stored as secure hashes. Analytics record account activity and usage events; passwords are never stored in activity logs.</div>
      </div>
    </div>
  );
}
