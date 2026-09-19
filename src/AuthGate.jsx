import { useEffect, useRef, useState } from "react";
import "./AuthGate.css";

const TOKEN_KEY = "serviceDecisionAuthToken";
const ADMIN_CONTACT_EMAIL = "rahul.mundra02@gmail.com";
const ADMIN_CONTACT_MOBILE = "9461768278";

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
  if (!response.ok || data.success === false) throw new Error(data.error || "Request failed.");
  return data;
}

export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAccountHelp, setShowAccountHelp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword:"", newPassword:"", confirmPassword:"" });
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ personName:"", dealerName:"", email:"", mobile:"", password:"" });
  const [adminAnalytics, setAdminAnalytics] = useState({ summary:[], recent:[], periods:[] });
  const [analyticsUserId, setAnalyticsUserId] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    api("me", {}, token)
      .then(data => setUser(data.user))
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

  const login = () => run(async () => {
    const identifier = document.getElementById("auth-identifier")?.value || "";
    const password = document.getElementById("auth-password")?.value || "";
    const data = await api("login", { identifier, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  });

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    try { await api("logout", {}, token); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setAdminOpen(false);
  };

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


  const loadAdminAnalytics = async (userId = null) => {
    setAnalyticsLoading(true);
    try {
      const payload = userId ? { userId } : {};
      const data = await api("admin-analytics", payload, localStorage.getItem(TOKEN_KEY));
      setAdminAnalytics(data || { summary:[], recent:[], periods:[] });
      setAnalyticsUserId(userId);
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
      await loadAdminAnalytics(analyticsUserId);
    } catch (e) {
      setError(e.message || "Unable to load users.");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin" && adminOpen) loadAdminUsers();
  }, [user?.role, adminOpen]);

  const createUser = () => run(async () => {
    if (adminForm.password.length < 8) throw new Error("Password must be at least 8 characters.");
    const data = await api("admin-create-user", adminForm, localStorage.getItem(TOKEN_KEY));
    setAdminForm({ personName:"", dealerName:"", email:"", mobile:"", password:"" });
    setMessage(data.message || "User account created successfully.");
    await loadAdminUsers();
  });

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
          <button className="auth-primary" onClick={login} disabled={loading}>Login</button>

          <button className="auth-secondary" onClick={() => setShowAccountHelp(v => !v)}>
            {showAccountHelp ? "Hide Account Help" : "Sign Up / Request Account"}
          </button>

          {showAccountHelp && (
            <div className="auth-account-help">
              <div className="auth-help-title">Account Creation</div>
              <div className="auth-help-text">Self sign-up is not enabled. Your account will be created by the Service Decision administrator.</div>
              <div className="auth-contact-row"><strong>Email:</strong> {ADMIN_CONTACT_EMAIL}</div>
              <div className="auth-contact-row"><strong>Contact:</strong> {ADMIN_CONTACT_MOBILE}</div>
            </div>
          )}

          <button className="auth-secondary" onClick={() => setShowAccountHelp(true)}>
            Forgot Password?
          </button>

          {showAccountHelp && (
            <div className="auth-help-panel">
              <strong>Forgot Password</strong>
              <p>Please contact the administrator. Password recovery is handled manually; no OTP or third-party service is used.</p>
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

      {adminOpen && user.role === "admin" ? (
        <AdminPanel
          users={adminUsers}
          form={adminForm}
          setForm={setAdminForm}
          loading={adminLoading || loading}
          onCreate={createUser}
          onRefresh={loadAdminUsers}
          onReset={resetUserPassword}
          onToggleStatus={toggleUserStatus}
          onBack={()=>{setAdminOpen(false);setError("");setMessage("");}}
          analytics={adminAnalytics}
          analyticsUserId={analyticsUserId}
          analyticsLoading={analyticsLoading}
          onAnalytics={loadAdminAnalytics}
        />
      ) : children}
    </div>
  );
}

function AdminPanel({ users, form, setForm, loading, onCreate, onRefresh, onReset, onToggleStatus, onBack, analytics, analyticsUserId, analyticsLoading, onAnalytics }) {
  const analyticsDetailRef = useRef(null);
  const selected = analyticsUserId
    ? analytics.summary.find(u => Number(u.id) === Number(analyticsUserId))
    : null;
  useEffect(() => {
    if (analyticsUserId && analyticsDetailRef.current) {
      setTimeout(() => analyticsDetailRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 80);
    }
  }, [analyticsUserId]);

  const totals = analytics.summary.reduce((acc,u)=>({
    users:acc.users+1,
    active:acc.active+(u.status==="active"?1:0),
    logins:acc.logins+(u.totalLogins||0),
    vehicles:acc.vehicles+(u.vehiclesAnalyzed||0),
    files:acc.files+(u.filesProcessed||0),
  }),{users:0,active:0,logins:0,vehicles:0,files:0});

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

        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Total Users</span><strong>{totals.users}</strong></div>
          <div className="admin-stat"><span>Active Users</span><strong>{totals.active}</strong></div>
          <div className="admin-stat"><span>Total Logins</span><strong>{totals.logins}</strong></div>
          <div className="admin-stat"><span>Vehicles Analysed</span><strong>{totals.vehicles}</strong></div>
          <div className="admin-stat"><span>Excel Files</span><strong>{totals.files}</strong></div>
        </div>

        <div className="admin-section-title">Create / Update User</div>
        <div className="admin-grid admin-management-grid">
          <div className="admin-form-card">
            <h3>User Account</h3>
            <label>Person Name *</label>
            <input value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})} />
            <label>Dealer Name *</label>
            <input value={form.dealerName} onChange={e=>setForm({...form,dealerName:e.target.value})} />
            <label>Email / User ID *</label>
            <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
            <label>Mobile (optional)</label>
            <input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} placeholder="10 digit mobile" />
            <label>Password *</label>
            <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Minimum 8 characters" />
            <button className="auth-primary" onClick={onCreate} disabled={loading}>Create / Update User</button>
          </div>

          <div className="admin-users-card">
            <div className="admin-users-header">
              <h3>Users</h3>
              <button className="auth-secondary admin-refresh" onClick={onRefresh} disabled={loading}>Refresh</button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>ID</th><th>Name</th><th>Dealer</th><th>Email</th><th>Status</th><th>Last Login</th><th>Last Activity</th><th>Analytics</th><th>Action</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.id}</td><td>{u.personName}</td><td>{u.dealerName}</td><td>{u.email}</td>
                      <td>{u.role === "admin" ? "ADMIN" : u.status}</td>
                      <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                      <td>{u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleString() : "—"}</td>
                      <td><button className="admin-analytics-btn" onClick={()=>onAnalytics(Number(u.id))}>
                          View
                        </button></td>
                      <td>{u.role !== "admin" && <div className="admin-row-actions">
                        <button onClick={()=>onReset(u)}>Reset Password</button>
                        <button onClick={()=>onToggleStatus(u)}>{u.status === "active" ? "Deactivate" : "Activate"}</button>
                      </div>}</td>
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan="9" className="admin-empty">No users found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div ref={analyticsDetailRef} className="admin-section-title admin-analytics-section-title">Usage Analytics</div>
        <div className="admin-analytics-toolbar">
          <button className={!analyticsUserId ? "active" : ""} onClick={()=>onAnalytics(null)}>All Users</button>
          {selected && <div className="admin-selected-user">{selected.personName} · {selected.dealerName}</div>}
          {analyticsLoading && <span>Loading...</span>}
        </div>

        {selected ? (
          <div className="admin-user-analytics">
            <div className="admin-stat-grid user-stats">
              <div className="admin-stat"><span>Total Logins</span><strong>{selected.totalLogins}</strong></div>
              <div className="admin-stat"><span>Active Days</span><strong>{selected.activeDays}</strong></div>
              <div className="admin-stat"><span>Excel Files</span><strong>{selected.filesProcessed}</strong></div>
              <div className="admin-stat"><span>Vehicles Analysed</span><strong>{selected.vehiclesAnalyzed}</strong></div>
              <div className="admin-stat"><span>Single Analyses</span><strong>{selected.singleAnalyses}</strong></div>
              <div className="admin-stat"><span>Bulk Analyses</span><strong>{selected.bulkAnalyses}</strong></div>
              <div className="admin-stat"><span>Schedule Views</span><strong>{selected.scheduleViews}</strong></div>
            </div>
          </div>
        ) : (
          <div className="admin-user-analytics">
            <div className="admin-stat-grid user-stats">
              <div className="admin-stat"><span>Registered Users</span><strong>{totals.users}</strong></div>
              <div className="admin-stat"><span>Active Users</span><strong>{totals.active}</strong></div>
              <div className="admin-stat"><span>Logins</span><strong>{totals.logins}</strong></div>
              <div className="admin-stat"><span>Vehicles Analysed</span><strong>{totals.vehicles}</strong></div>
              <div className="admin-stat"><span>Files Processed</span><strong>{totals.files}</strong></div>
            </div>
          </div>
        )}

        <div className="admin-section-title">Recent Activity</div>
        <div className="admin-table-wrap admin-activity-wrap">
          <table className="admin-table">
            <thead><tr><th>Date / Time</th><th>User</th><th>Dealer</th><th>Activity</th><th>Mode</th><th>Vehicles</th><th>Files</th><th>VIN</th></tr></thead>
            <tbody>
              {analytics.recent.map(a=>(
                <tr key={a.id}>
                  <td>{new Date(a.activity_time).toLocaleString()}</td>
                  <td>{a.person_name}</td><td>{a.dealer_name}</td><td>{a.activity_type}</td>
                  <td>{a.mode || "—"}</td><td>{a.vehicle_count || 0}</td><td>{a.file_count || 0}</td><td>{a.vin || "—"}</td>
                </tr>
              ))}
              {!analytics.recent.length && <tr><td colSpan="8" className="admin-empty">No activity recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="admin-section-title">Last 30 Days</div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Activities</th><th>Logins</th><th>Vehicles Analysed</th></tr></thead>
            <tbody>
              {analytics.periods.map(p=>(
                <tr key={p.activity_date}><td>{new Date(p.activity_date).toLocaleDateString()}</td><td>{p.activities}</td><td>{p.logins}</td><td>{p.vehicles}</td></tr>
              ))}
              {!analytics.periods.length && <tr><td colSpan="4" className="admin-empty">No activity in the last 30 days.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="admin-note">Passwords are stored as secure hashes. Analytics record account activity and usage events; passwords are never stored in activity logs.</div>
      </div>
    </div>
  );
}

