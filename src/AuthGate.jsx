import { useEffect, useState } from "react";
import "./AuthGate.css";

const TOKEN_KEY = "serviceDecisionAuthToken";

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
  const [screen, setScreen] = useState("login");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState({userId:null, email:"", mobile:""});
  const [form, setForm] = useState({personName:"",dealerName:"",email:"",mobile:"",password:"",confirmPassword:""});
  const [identifier, setIdentifier] = useState("");
  const [recovery, setRecovery] = useState({userId:null,channel:"email",otp:"",newPassword:"",confirmPassword:""});

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    api("me",{},token).then(data=>setUser(data.user)).catch(()=>localStorage.removeItem(TOKEN_KEY)).finally(()=>setLoading(false));
  }, []);

  const submit = async (fn) => {
    setError(""); setMessage(""); setLoading(true);
    try { await fn(); } catch(e) { setError(e.message || "Something went wrong."); } finally { setLoading(false); }
  };

  const login = () => submit(async()=>{
    const data=await api("login",{identifier,password:form.password});
    localStorage.setItem(TOKEN_KEY,data.token); setUser(data.user);
  });

  const register = () => submit(async()=>{
    if(form.password!==form.confirmPassword) throw new Error("Passwords do not match.");
    const data=await api("register",form);
    setRegistration({userId:data.userId,email:form.email,mobile:form.mobile});
    setScreen("verify");
    setMessage("Account created. Verify both email and mobile OTP.");
  });

  const verify = (channel,otp) => submit(async()=>{
    const data=await api("verify-registration",{userId:registration.userId,channel,otp});
    if(data.active) { setMessage("Account verified successfully. You can now login."); setScreen("login"); }
    else setMessage(`${channel==="email"?"Email":"Mobile"} verified. Please verify the other OTP.`);
  });

  const startRecovery = () => submit(async()=>{
    const channel=recovery.channel;
    const data=await api("request-reset",{identifier,channel});
    setRecovery(r=>({...r,userId:data.userId||null}));
    setScreen("reset");
    setMessage("If the account exists, a recovery OTP has been sent.");
  });

  const resetPassword = () => submit(async()=>{
    if(recovery.newPassword!==recovery.confirmPassword) throw new Error("Passwords do not match.");
    if(!recovery.userId) throw new Error("Please request a recovery OTP first.");
    await api("reset-password",{userId:recovery.userId,channel:recovery.channel,otp:recovery.otp,newPassword:recovery.newPassword});
    setScreen("login"); setMessage("Password reset successfully. Please login.");
  });

  const logout = async()=>{
    const token=localStorage.getItem(TOKEN_KEY);
    try { await api("logout",{},token); } catch {}
    localStorage.removeItem(TOKEN_KEY); setUser(null); setScreen("login");
  };

  if (loading && !user) return <div className="auth-loading">Loading Service Decision...</div>;
  if (user) return (
    <div className="app-auth-shell">
      <div className="auth-userbar">
        <span><strong>{user.personName}</strong> · {user.dealerName}</span>
        <button onClick={logout}>Logout</button>
      </div>
      {children}
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Service Decision</div>
        <div className="auth-subtitle">Vehicle Service Decision & Maintenance Portal</div>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-message">{message}</div>}

        {screen==="login" && <>
          <h2>Sign In</h2>
          <label>Email / Mobile</label>
          <input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Email or mobile number" />
          <label>Password</label>
          <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Password" onKeyDown={e=>e.key==="Enter"&&login()} />
          <button className="auth-primary" onClick={login} disabled={loading}>Login</button>
          <div className="auth-links"><button onClick={()=>{setScreen("register");setError("");setMessage("")}}>Create account</button><button onClick={()=>{setScreen("forgot");setError("");setMessage("")}}>Forgot password?</button></div>
        </>}

        {screen==="register" && <>
          <h2>Create Account</h2>
          <label>Person Name *</label><input value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})} />
          <label>Dealer Name *</label><input value={form.dealerName} onChange={e=>setForm({...form,dealerName:e.target.value})} />
          <label>Email *</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
          <label>Mobile *</label><input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} placeholder="+91XXXXXXXXXX" />
          <label>Password *</label><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Minimum 8 characters" />
          <label>Confirm Password *</label><input type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} />
          <button className="auth-primary" onClick={register} disabled={loading}>Create Account</button>
          <button className="auth-secondary" onClick={()=>setScreen("login")}>Back to Login</button>
        </>}

        {screen==="verify" && <>
          <h2>Verify Account</h2>
          <p className="auth-hint">Email OTP: {registration.email}</p>
          <OtpBox label="Email OTP" onVerify={(otp)=>verify("email",otp)} />
          <p className="auth-hint">Mobile OTP: {registration.mobile}</p>
          <OtpBox label="Mobile OTP" onVerify={(otp)=>verify("mobile",otp)} />
          <button className="auth-secondary" onClick={()=>setScreen("login")}>Back to Login</button>
        </>}

        {screen==="forgot" && <>
          <h2>Recover Password</h2>
          <label>Email or Mobile</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Registered email or mobile" />
          <div className="auth-choice"><button className={recovery.channel==="email"?"selected":""} onClick={()=>setRecovery({...recovery,channel:"email"})}>Email OTP</button><button className={recovery.channel==="mobile"?"selected":""} onClick={()=>setRecovery({...recovery,channel:"mobile"})}>Mobile OTP</button></div>
          <button className="auth-primary" onClick={startRecovery} disabled={loading}>Send Recovery OTP</button>
          <button className="auth-secondary" onClick={()=>setScreen("login")}>Back to Login</button>
        </>}

        {screen==="reset" && <>
          <h2>Set New Password</h2>
          <label>OTP</label><input value={recovery.otp} onChange={e=>setRecovery({...recovery,otp:e.target.value})} placeholder="6-digit OTP" inputMode="numeric" />
          <label>New Password</label><input type="password" value={recovery.newPassword} onChange={e=>setRecovery({...recovery,newPassword:e.target.value})} />
          <label>Confirm New Password</label><input type="password" value={recovery.confirmPassword} onChange={e=>setRecovery({...recovery,confirmPassword:e.target.value})} />
          <button className="auth-primary" onClick={resetPassword} disabled={loading}>Reset Password</button>
        </>}
      </div>
    </div>
  );
}

function OtpBox({label,onVerify}) {
  const [otp,setOtp]=useState("");
  return <div className="otp-box"><label>{label}</label><div className="otp-row"><input value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6-digit OTP" inputMode="numeric" /><button onClick={()=>onVerify(otp)}>Verify</button></div></div>;
}
