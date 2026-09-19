import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const SESSION_DAYS = 30;
const DEFAULT_ADMIN_EMAIL = "rahul.mundra02@gmail.com";
const DEFAULT_ADMIN_MOBILE = "9461768278";
const DEFAULT_ADMIN_NAME = "Rahul Mundra";
const DEFAULT_ADMIN_DEALER = "Service Decision Admin";

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
    crypto.scrypt(password, salt, 64, (err, key) =>
      err ? reject(err) : resolve(key.toString("hex"))
    );
  });
  return `${salt}:${derived}`;
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) =>
      err ? reject(err) : resolve(key.toString("hex"))
    );
  });
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
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
      mobile TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('standard','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','inactive')),
      email_verified BOOLEAN NOT NULL DEFAULT TRUE,
      mobile_verified BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ
    );

    ALTER TABLE app_users ALTER COLUMN mobile DROP NOT NULL;
    ALTER TABLE app_users ALTER COLUMN status SET DEFAULT 'active';
    ALTER TABLE app_users ALTER COLUMN email_verified SET DEFAULT TRUE;
    ALTER TABLE app_users ALTER COLUMN mobile_verified SET DEFAULT TRUE;

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

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  `);
}

async function bootstrapAdmin(client) {
  const adminCount = await client.query(
    "SELECT COUNT(*)::int AS count FROM app_users WHERE role='admin'"
  );
  if (Number(adminCount.rows[0]?.count || 0) > 0) return;

  const adminPassword = clean(process.env.ADMIN_PASSWORD);
  if (!validPassword(adminPassword)) return;

  const email = normalizeEmail(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  const mobile = normalizeMobile(process.env.ADMIN_MOBILE || DEFAULT_ADMIN_MOBILE);
  const personName = clean(process.env.ADMIN_NAME || DEFAULT_ADMIN_NAME);
  const dealerName = clean(process.env.ADMIN_DEALER || DEFAULT_ADMIN_DEALER);
  const passwordHash = await hashPassword(adminPassword);

  const existing = await client.query("SELECT id FROM app_users WHERE email=$1 LIMIT 1", [email]);

  if (existing.rows[0]) {
    await client.query(
      `UPDATE app_users
          SET person_name=$1,dealer_name=$2,mobile=$3,password_hash=$4,
              role='admin',status='active',email_verified=TRUE,mobile_verified=TRUE
        WHERE id=$5`,
      [personName, dealerName, mobile, passwordHash, existing.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO app_users
        (person_name,dealer_name,email,mobile,password_hash,role,status,email_verified,mobile_verified)
       VALUES ($1,$2,$3,$4,$5,'admin','active',TRUE,TRUE)`,
      [personName, dealerName, email, mobile, passwordHash]
    );
  }
}

async function getUserByToken(client, token) {
  if (!token) return null;
  const tokenHash = hashValue(token);
  const result = await client.query(
    `SELECT u.id,u.person_name,u.dealer_name,u.email,u.mobile,u.role,u.status,
            u.email_verified,u.mobile_verified,u.created_at,u.last_login_at,u.last_activity_at
       FROM auth_sessions s
       JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,
    [tokenHash]
  );
  if (!result.rows[0]) return null;

  await client.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1", [tokenHash]);
  await client.query("UPDATE app_users SET last_activity_at=NOW() WHERE id=$1", [result.rows[0].id]);
  return result.rows[0];
}

function userPayload(user) {
  return {
    id: user.id,
    personName: user.person_name,
    dealerName: user.dealer_name,
    email: user.email,
    mobile: user.mobile || "",
    role: user.role,
    status: user.status,
    emailVerified: user.email_verified,
    mobileVerified: user.mobile_verified,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    lastActivityAt: user.last_activity_at,
  };
}

function authToken(req) {
  return clean(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

async function requireAdmin(client, req) {
  const user = await getUserByToken(client, authToken(req));
  if (!user) return { error: "Session expired.", status: 401 };
  if (user.role !== "admin") return { error: "Admin access required.", status: 403 };
  return { user };
}

async function createOrUpdateUser(client, body) {
  const personName = clean(body.personName);
  const dealerName = clean(body.dealerName);
  const email = normalizeEmail(body.email);
  const mobile = normalizeMobile(body.mobile);
  const password = body.password;

  if (!personName || !dealerName || !email || !validPassword(password)) {
    throw new Error("Name, dealer name, email and password (minimum 8 characters) are required.");
  }

  const existing = await client.query("SELECT * FROM app_users WHERE email=$1 LIMIT 1", [email]);
  const passwordHash = await hashPassword(password);

  if (existing.rows[0]) {
    const user = existing.rows[0];
    await client.query(
      `UPDATE app_users
          SET person_name=$1,dealer_name=$2,mobile=$3,password_hash=$4,
              status='active',email_verified=TRUE,mobile_verified=TRUE
        WHERE id=$5`,
      [personName, dealerName, mobile || null, passwordHash, user.id]
    );
    return (await client.query("SELECT * FROM app_users WHERE id=$1", [user.id])).rows[0];
  }

  const created = await client.query(
    `INSERT INTO app_users
      (person_name,dealer_name,email,mobile,password_hash,role,status,email_verified,mobile_verified)
     VALUES ($1,$2,$3,$4,$5,'standard','active',TRUE,TRUE)
     RETURNING *`,
    [personName, dealerName, email, mobile || null, passwordHash]
  );
  return created.rows[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success:false, error:"Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const action = clean(body.action);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureSchema(client);
    await bootstrapAdmin(client);

    if (action === "login") {
      const identifier = clean(body.identifier);
      const password = body.password;
      const email = normalizeEmail(identifier);
      const mobile = normalizeMobile(identifier);

      const found = await client.query(
        "SELECT * FROM app_users WHERE email=$1 OR mobile=$2 LIMIT 1",
        [email, mobile]
      );

      if (!found.rows[0] || !(await verifyPassword(password, found.rows[0].password_hash))) {
        await client.query("ROLLBACK");
        return res.status(401).json({ success:false, error:"Invalid login details." });
      }

      const user = found.rows[0];
      if (user.status !== "active") {
        await client.query("ROLLBACK");
        return res.status(403).json({ success:false, error:"This account is inactive. Please contact the administrator." });
      }

      const token = generateToken();
      const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
      await client.query(
        "INSERT INTO auth_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)",
        [user.id, hashValue(token), expires]
      );
      await client.query(
        "UPDATE app_users SET last_login_at=NOW(),last_activity_at=NOW() WHERE id=$1",
        [user.id]
      );
      await client.query("COMMIT");
      return res.json({ success:true, token, user:userPayload(user) });
    }

    if (action === "me") {
      const user = await getUserByToken(client, authToken(req));
      if (!user) {
        await client.query("ROLLBACK");
        return res.status(401).json({ success:false, error:"Session expired." });
      }
      await client.query("COMMIT");
      return res.json({ success:true, user:userPayload(user) });
    }

    if (action === "logout") {
      await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashValue(authToken(req))]);
      await client.query("COMMIT");
      return res.json({ success:true });
    }

    if (action === "change-password") {
      const user = await getUserByToken(client, authToken(req));
      if (!user) {
        await client.query("ROLLBACK");
        return res.status(401).json({success:false,error:"Session expired."});
      }

      const passwordRow = await client.query("SELECT password_hash FROM app_users WHERE id=$1", [user.id]);
      const currentPassword = body.currentPassword;
      const newPassword = body.newPassword;

      if (!(await verifyPassword(currentPassword, passwordRow.rows[0]?.password_hash))) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Current password is incorrect."});
      }
      if (!validPassword(newPassword)) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"New password must be at least 8 characters."});
      }

      const passwordHash = await hashPassword(newPassword);
      await client.query("UPDATE app_users SET password_hash=$1 WHERE id=$2", [passwordHash,user.id]);
      await client.query("DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2", [user.id,hashValue(authToken(req))]);
      await client.query("COMMIT");
      return res.json({success:true,message:"Password changed successfully."});
    }

    if (action === "admin-list-users") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const users = await client.query(
        `SELECT id,person_name,dealer_name,email,mobile,role,status,created_at,last_login_at,last_activity_at
           FROM app_users ORDER BY role DESC, created_at DESC`
      );
      await client.query("COMMIT");
      return res.json({success:true,users:users.rows.map(userPayload)});
    }

    if (action === "admin-create-user") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const user = await createOrUpdateUser(client, body);
      await client.query("COMMIT");
      return res.json({success:true,user:userPayload(user),message:"User account created/updated successfully."});
    }

    if (action === "admin-reset-password") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const userId = Number(body.userId);
      const newPassword = body.newPassword;
      if (!Number.isInteger(userId) || !validPassword(newPassword)) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Valid user and password (minimum 8 characters) are required."});
      }

      const passwordHash = await hashPassword(newPassword);
      const updated = await client.query(
        "UPDATE app_users SET password_hash=$1,status='active',email_verified=TRUE,mobile_verified=TRUE WHERE id=$2 RETURNING *",
        [passwordHash,userId]
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({success:false,error:"User not found."});
      }

      await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[userId]);
      await client.query("COMMIT");
      return res.json({success:true,message:"Password reset successfully."});
    }

    if (action === "admin-set-status") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const userId = Number(body.userId);
      const status = body.status === "inactive" ? "inactive" : "active";
      if (userId === Number(admin.user.id)) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"You cannot deactivate your own admin account."});
      }

      const updated = await client.query("UPDATE app_users SET status=$1 WHERE id=$2 RETURNING *",[status,userId]);
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({success:false,error:"User not found."});
      }

      if (status === "inactive") await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[userId]);
      await client.query("COMMIT");
      return res.json({success:true,user:userPayload(updated.rows[0])});
    }

    if (action === "register" || action === "verify-registration" || action === "resend-registration" || action === "request-reset" || action === "reset-password") {
      await client.query("ROLLBACK");
      return res.status(410).json({
        success:false,
        error:"Self-service registration and OTP password recovery are disabled. Please contact the Service Decision administrator."
      });
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
