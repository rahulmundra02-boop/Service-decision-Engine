import { cloneElement, useEffect, useRef, useState } from "react";
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
  const [sessionConflict, setSessionConflict] = useState(null);

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

  const login = (terminateExistingSession = false) => run(async () => {
    const identifier = document.getElementById("auth-identifier")?.value || "";
    const password = document.getElementById("auth-password")?.value || "";
    try {
      const data = await api("login", {
        identifier,
        password,
        terminateExistingSession,
        deviceName: getDeviceName(),
      });
      setSessionConflict(null);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      setUser(normalizeLoggedInUser(data.user));
    } catch (e) {
      if (e?.sessionConflict) {
        setSessionConflict(e.previousSession || {});
        return;
      }
      throw e;
    }
  });

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    try { await api("logout", {}, token); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    setUser(null);
    setAdminOpen(false);
  };

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    if (!localStorage.getItem(ACTIVITY_KEY)) {
      const serverActivity = user?.lastActivityAt ? new Date(user.lastActivityAt).getTime() : Date.now();
      localStorage.setItem(ACTIVITY_KEY, String(serverActivity || Date.now()));
    }

    let lastPing = 0;
    const touch = () => {
      const now = Date.now();
      const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (last && now - last >= INACTIVITY_MS) return;
      localStorage.setItem(ACTIVITY_KEY, String(now));

      if (now - lastPing >= 60 * 1000) {
        lastPing = now;
        api("me", {}, token).catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ACTIVITY_KEY);
          setUser(null);
          setAdminOpen(false);
        });
      }
    };

    const events = ["click","keydown","mousemove","scroll","touchstart"];
    events.forEach(name => window.addEventListener(name, touch, { passive:true }));

    const timer = window.setInterval(() => {
      const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (!last || Date.now() - last < INACTIVITY_MS) return;

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
      setAdminOpen(false);
      setUser(null);
      setMessage("Session expired after 12 hours of inactivity. Please login again.");
    }, 60 * 1000);

    return () => {
      events.forEach(name => window.removeEventListener(name, touch));
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
    if (user?.role === "admin" && adminOpen) loadAdminUsers();
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
        <div className="auth-card">
          <div className="auth-brand">Service Decision</div>
          <div className="auth-subtitle">Vehicle Service Decision & Maintenance Portal</div>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <h2>Sign In</h2>
          <label>Email / User ID</label>
          <input id="auth-identifier" placeholder="Enter your registered email" />
          <label>Password</label>
          <input id="auth-password" type="password" placeholder="Enter your password" onKeyDown={e => e.key === "Enter" && login()} />
          <button className="auth-primary" onClick={() => login(false)} disabled={loading}>Login</button>

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
                  <button className="auth-secondary" onClick={() => setSessionConflict(null)}>No / Cancel</button>
                  <button className="auth-primary" onClick={() => { setSessionConflict(null); void login(true); }}>Yes, Terminate Old Session</button>
                </div>
              </div>
            </div>
          )}

          <button className="auth-secondary" onClick={() => setShowAccountHelp(v => !v)}>
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

          <button className="auth-secondary" onClick={() => setShowForgotHelp(v => !v)}>
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

function AdminPanel({ users, form, setForm, loading, onCreate, onEdit, onRefresh, onReset, onToggleStatus, onBack, analytics, analyticsUserId, analyticsRange, analyticsLoading, analyticsIncludeAdmins, onSetAnalyticsIncludeAdmins, onAnalytics }) {
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
    vehicles:acc.vehicles+(u.vehiclesAnalyzed||0),
    files:acc.files+(u.filesProcessed||0),
    activities:acc.activities+(u.totalActivities||0),
  }),{users:0,active:0,logins:0,vehicles:0,files:0,activities:0});

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
            {[7,30,90].map(days=>
              <button key={days} className={analyticsRange===days ? "active" : ""} onClick={()=>onAnalytics(analyticsUserId,days)}>{days}D</button>
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
