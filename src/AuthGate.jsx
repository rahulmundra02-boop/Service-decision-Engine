import { useEffect, useState } from "react";
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

  const loadAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const data = await api("admin-list-users", {}, localStorage.getItem(TOKEN_KEY));
      setAdminUsers(data.users || []);
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
        />
      ) : children}
    </div>
  );
}

function AdminPanel({ users, form, setForm, loading, onCreate, onRefresh, onReset, onToggleStatus, onBack }) {
  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header">
          <div>
            <div className="admin-title">Admin Panel</div>
            <div className="admin-subtitle">Create and manage Service Decision user accounts</div>
          </div>
          <button className="auth-secondary admin-back" onClick={onBack}>Back to Dashboard</button>
        </div>

        <div className="admin-grid">
          <div className="admin-form-card">
            <h3>Create / Update User</h3>
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
                <thead><tr><th>ID</th><th>Name</th><th>Dealer</th><th>Email</th><th>Mobile</th><th>Status</th><th>Last Login</th><th>Action</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.id}</td><td>{u.personName}</td><td>{u.dealerName}</td><td>{u.email}</td><td>{u.mobile || "-"}</td>
                      <td>{u.role === "admin" ? "ADMIN" : u.status}</td>
                      <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                      <td>{u.role !== "admin" && <div className="admin-row-actions">
                        <button onClick={()=>onReset(u)}>Reset Password</button>
                        <button onClick={()=>onToggleStatus(u)}>{u.status === "active" ? "Deactivate" : "Activate"}</button>
                      </div>}</td>
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan="8" className="admin-empty">No users found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="admin-note">Passwords are stored as secure hashes. The administrator cannot view an existing password, but can set or reset a new password and provide it to the user.</div>
      </div>
    </div>
  );
}
