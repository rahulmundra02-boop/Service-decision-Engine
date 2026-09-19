import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const OTP_MINUTES = 10;
const SESSION_DAYS = 30;

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function normalizeMobile(value) {
  const raw = clean(value).replace(/[^\d+]/g, "");
  if (raw.startsWith("00")) return "+" + raw.slice(2);
  if (/^\d{10}$/.test(raw)) return "+91" + raw;
  return raw;
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex")));
  });
  return `${salt}:${derived}`;
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex")));
  });
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      person_name TEXT NOT NULL,
      dealer_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mobile TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('standard','admin')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive')),
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS auth_otps (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('email','mobile')),
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_auth_otps_user ON auth_otps(user_id, purpose, channel, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  `);
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) {
    console.warn("Email provider not configured; email OTP could not be sent.");
    return false;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error("Email OTP service failed.");
  return true;
}

async function sendMobileOtp(mobile, otp) {
  if (!process.env.SMS_WEBHOOK_URL) {
    console.warn("SMS provider not configured; mobile OTP could not be sent.");
    return false;
  }
  const response = await fetch(process.env.SMS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      mobile,
      otp,
      template: process.env.SMS_OTP_TEMPLATE || "Service Decision verification OTP: {{otp}}",
    }),
  });
  if (!response.ok) throw new Error("Mobile OTP service failed.");
  return true;
}

async function issueOtp(client, user, purpose, channel) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
  await client.query(
    "UPDATE auth_otps SET used_at=NOW() WHERE user_id=$1 AND purpose=$2 AND channel=$3 AND used_at IS NULL",
    [user.id, purpose, channel]
  );
  await client.query(
    "INSERT INTO auth_otps (user_id,purpose,channel,otp_hash,expires_at) VALUES ($1,$2,$3,$4,$5)",
    [user.id, purpose, channel, hashValue(otp), expiresAt]
  );

  if (channel === "email") {
    await sendEmail(
      user.email,
      purpose === "registration" ? "Service Decision - Email Verification OTP" : "Service Decision - Password Recovery OTP",
      `<p>Hello ${user.person_name},</p><p>Your OTP is <strong style="font-size:20px">${otp}</strong>.</p><p>This OTP is valid for ${OTP_MINUTES} minutes.</p><p>If you did not request this, you can ignore this email.</p>`
    );
  } else {
    await sendMobileOtp(user.mobile, otp);
  }
  return expiresAt;
}

async function getUserByToken(client, token) {
  if (!token) return null;
  const result = await client.query(
    `SELECT u.id,u.person_name,u.dealer_name,u.email,u.mobile,u.role,u.status,
            u.email_verified,u.mobile_verified,u.created_at,u.last_login_at,u.last_activity_at
       FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,
    [hashValue(token)]
  );
  if (!result.rows[0]) return null;
  await client.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1", [hashValue(token)]);
  await client.query("UPDATE app_users SET last_activity_at=NOW() WHERE id=$1", [result.rows[0].id]);
  return result.rows[0];
}

function userPayload(user) {
  return {
    id: user.id,
    personName: user.person_name,
    dealerName: user.dealer_name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    status: user.status,
    emailVerified: user.email_verified,
    mobileVerified: user.mobile_verified,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    lastActivityAt: user.last_activity_at,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const action = clean(body.action);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureSchema(client);

    if (action === "register") {
      const personName = clean(body.personName);
      const dealerName = clean(body.dealerName);
      const email = normalizeEmail(body.email);
      const mobile = normalizeMobile(body.mobile);
      const password = body.password;

      if (!personName || !dealerName || !email || !mobile || !validPassword(password)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success:false, error:"Person name, dealer name, email, mobile and password (minimum 8 characters) are required." });
      }

      const existing = await client.query("SELECT id,status FROM app_users WHERE email=$1 OR mobile=$2", [email,mobile]);
      if (existing.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success:false, error:"An account already exists with this email or mobile number." });
      }

      const passwordHash = await hashPassword(password);
      const created = await client.query(
        "INSERT INTO app_users (person_name,dealer_name,email,mobile,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [personName,dealerName,email,mobile,passwordHash]
      );
      const user = created.rows[0];

      const emailSent = await issueOtp(client,user,"registration","email");
      const mobileSent = await issueOtp(client,user,"registration","mobile");
      await client.query("COMMIT");
      return res.status(200).json({
        success:true,
        action:"registration",
        userId:user.id,
        emailSent:emailSent !== false,
        mobileSent:mobileSent !== false,
        message:"Account created. Verify email and mobile OTP to activate the account."
      });
    }

    if (action === "verify-registration") {
      const userId = Number(body.userId);
      const channel = body.channel === "mobile" ? "mobile" : "email";
      const otp = clean(body.otp);
      const found = await client.query(
        "SELECT * FROM app_users WHERE id=$1 AND status='pending'",
        [userId]
      );
      if (!found.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({success:false,error:"Registration session not found."});
      }
      const otpRow = await client.query(
        "SELECT id,otp_hash,expires_at FROM auth_otps WHERE user_id=$1 AND purpose='registration' AND channel=$2 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
        [userId,channel]
      );
      if (!otpRow.rows[0] || new Date(otpRow.rows[0].expires_at) < new Date() || hashValue(otp) !== otpRow.rows[0].otp_hash) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Invalid or expired OTP."});
      }
      await client.query("UPDATE auth_otps SET used_at=NOW() WHERE id=$1",[otpRow.rows[0].id]);
      await client.query(`UPDATE app_users SET ${channel}_verified=TRUE, status=CASE WHEN email_verified AND mobile_verified THEN 'active' ELSE status END WHERE id=$1`,[userId]);
      const user = (await client.query("SELECT * FROM app_users WHERE id=$1",[userId])).rows[0];
      await client.query("COMMIT");
      return res.json({success:true, user:userPayload(user), active:user.status==="active"});
    }

    if (action === "resend-registration") {
      const userId = Number(body.userId);
      const channel = body.channel === "mobile" ? "mobile" : "email";
      const found = await client.query("SELECT * FROM app_users WHERE id=$1 AND status='pending'",[userId]);
      if (!found.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({success:false,error:"Registration session not found."}); }
      await issueOtp(client,found.rows[0],"registration",channel);
      await client.query("COMMIT");
      return res.json({success:true,message:"OTP resent."});
    }

    if (action === "login") {
      const identifier = clean(body.identifier);
      const password = body.password;
      const email = normalizeEmail(identifier);
      const mobile = normalizeMobile(identifier);
      const found = await client.query("SELECT * FROM app_users WHERE email=$1 OR mobile=$2 LIMIT 1",[email,mobile]);
      if (!found.rows[0] || !(await verifyPassword(password,found.rows[0].password_hash))) {
        await client.query("ROLLBACK");
        return res.status(401).json({success:false,error:"Invalid login details."});
      }
      const user = found.rows[0];
      if (user.status !== "active" || !user.email_verified || !user.mobile_verified) {
        await client.query("ROLLBACK");
        return res.status(403).json({success:false,error:"Account is not active. Please complete email and mobile verification."});
      }
      const token = generateToken();
      const expires = new Date(Date.now()+SESSION_DAYS*24*60*60*1000);
      await client.query("INSERT INTO auth_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",[user.id,hashValue(token),expires]);
      await client.query("UPDATE app_users SET last_login_at=NOW(),last_activity_at=NOW() WHERE id=$1",[user.id]);
      await client.query("COMMIT");
      return res.json({success:true,token,user:userPayload(user)});
    }

    if (action === "me") {
      const user = await getUserByToken(client, clean(req.headers.authorization || "").replace(/^Bearer\s+/i,""));
      if (!user) { await client.query("ROLLBACK"); return res.status(401).json({success:false,error:"Session expired."}); }
      await client.query("COMMIT");
      return res.json({success:true,user:userPayload(user)});
    }

    if (action === "logout") {
      const token = clean(req.headers.authorization || "").replace(/^Bearer\s+/i,"");
      await client.query("DELETE FROM auth_sessions WHERE token_hash=$1",[hashValue(token)]);
      await client.query("COMMIT");
      return res.json({success:true});
    }

    if (action === "request-reset") {
      const identifier = clean(body.identifier);
      const channel = body.channel === "mobile" ? "mobile" : "email";
      const email = normalizeEmail(identifier);
      const mobile = normalizeMobile(identifier);
      const found = await client.query("SELECT * FROM app_users WHERE (email=$1 OR mobile=$2) AND status='active' LIMIT 1",[email,mobile]);
      if (!found.rows[0]) { await client.query("ROLLBACK"); return res.json({success:true,message:"If the account exists, a recovery OTP has been sent."}); }
      await issueOtp(client,found.rows[0],"password_reset",channel);
      await client.query("COMMIT");
      return res.json({success:true,userId:found.rows[0].id,channel,message:"Recovery OTP sent."});
    }

    if (action === "reset-password") {
      const userId = Number(body.userId);
      const channel = body.channel === "mobile" ? "mobile" : "email";
      const otp = clean(body.otp);
      const newPassword = body.newPassword;
      if (!validPassword(newPassword)) { await client.query("ROLLBACK"); return res.status(400).json({success:false,error:"Password must be at least 8 characters."}); }
      const otpRow = await client.query("SELECT id,otp_hash,expires_at FROM auth_otps WHERE user_id=$1 AND purpose='password_reset' AND channel=$2 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",[userId,channel]);
      if (!otpRow.rows[0] || new Date(otpRow.rows[0].expires_at)<new Date() || hashValue(otp)!==otpRow.rows[0].otp_hash) {
        await client.query("ROLLBACK"); return res.status(400).json({success:false,error:"Invalid or expired OTP."});
      }
      const passwordHash = await hashPassword(newPassword);
      await client.query("UPDATE auth_otps SET used_at=NOW() WHERE id=$1",[otpRow.rows[0].id]);
      await client.query("UPDATE app_users SET password_hash=$1 WHERE id=$2",[passwordHash,userId]);
      await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[userId]);
      await client.query("COMMIT");
      return res.json({success:true,message:"Password reset successfully. Please login with your new password."});
    }

    await client.query("ROLLBACK");
    return res.status(400).json({success:false,error:"Unknown auth action."});
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Auth Error:",error);
    return res.status(500).json({success:false,error:error?.message || "Authentication service failed."});
  } finally {
    client.release();
  }
}
