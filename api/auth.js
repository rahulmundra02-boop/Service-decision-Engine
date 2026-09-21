import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL1,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const SESSION_DAYS = 30;
const SESSION_INACTIVITY_HOURS = 12;
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
      last_activity_at TIMESTAMPTZ,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    ALTER TABLE app_users ALTER COLUMN mobile DROP NOT NULL;
    ALTER TABLE app_users ALTER COLUMN status SET DEFAULT 'active';
    ALTER TABLE app_users ALTER COLUMN email_verified SET DEFAULT TRUE;
    ALTER TABLE app_users ALTER COLUMN mobile_verified SET DEFAULT TRUE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

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
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      device_name TEXT,
      ip_address TEXT,
      user_agent TEXT
    );

    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS device_name TEXT;
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

    CREATE TABLE IF NOT EXISTS user_activity (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      activity_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      mode TEXT,
      vehicle_count INTEGER NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      vin TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_user_activity_user_time ON user_activity(user_id, activity_time DESC);
    CREATE INDEX IF NOT EXISTS idx_user_activity_type ON user_activity(activity_type);
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
            u.email_verified,u.mobile_verified,u.created_at,u.last_login_at,u.last_activity_at,
            s.last_seen_at
       FROM auth_sessions s
       JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,
    [tokenHash]
  );
  if (!result.rows[0]) return null;

  const lastSeen = result.rows[0].last_seen_at ? new Date(result.rows[0].last_seen_at).getTime() : 0;
  if (!lastSeen || Date.now() - lastSeen > SESSION_INACTIVITY_HOURS * 60 * 60 * 1000) {
    await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [tokenHash]);
    return null;
  }

  await client.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1", [tokenHash]);
  await client.query("UPDATE app_users SET last_activity_at=NOW() WHERE id=$1", [result.rows[0].id]);
  return result.rows[0];
}


async function logActivity(client, userId, activityType, payload = {}) {
  if (!userId) return;
  await client.query(
    `INSERT INTO user_activity
      (user_id,activity_type,mode,vehicle_count,file_count,vin,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      userId,
      clean(activityType) || "Activity",
      clean(payload.mode) || null,
      Number(payload.vehicleCount || 0),
      Number(payload.fileCount || 0),
      clean(payload.vin) || null,
      JSON.stringify(payload.details || {}),
    ]
  );
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
    preferences: user.preferences || {},
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
  const userId = Number(body.userId || 0);

  if (!personName || !dealerName || !email) {
    throw new Error("Name, dealer name and email are required.");
  }

  const existingById = userId > 0
    ? await client.query("SELECT * FROM app_users WHERE id=$1 LIMIT 1", [userId])
    : { rows: [] };
  const existingByEmail = await client.query("SELECT * FROM app_users WHERE email=$1 LIMIT 1", [email]);
  const existing = existingById.rows[0] || existingByEmail.rows[0];

  if (existing) {
    if (existing.role === "admin" && Number(existing.id) !== userId) {
      throw new Error("Admin account cannot be overwritten by email.");
    }

    if (password && !validPassword(password)) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (password) {
      const passwordHash = await hashPassword(password);
      await client.query(
        `UPDATE app_users
            SET person_name=$1,dealer_name=$2,email=$3,mobile=$4,password_hash=$5,
                status='active',email_verified=TRUE,mobile_verified=TRUE
          WHERE id=$6`,
        [personName, dealerName, email, mobile || null, passwordHash, existing.id]
      );
    } else {
      await client.query(
        `UPDATE app_users
            SET person_name=$1,dealer_name=$2,email=$3,mobile=$4
          WHERE id=$5`,
        [personName, dealerName, email, mobile || null, existing.id]
      );
    }
    return (await client.query("SELECT * FROM app_users WHERE id=$1", [existing.id])).rows[0];
  }

  if (!validPassword(password)) {
    throw new Error("Password (minimum 8 characters) is required when creating a new user.");
  }

  const passwordHash = await hashPassword(password);
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
      const terminateExistingSession = body.terminateExistingSession === true;
      const requestIp = clean(String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "").split(",")[0]);
      const requestUserAgent = clean(req.headers["user-agent"] || "");
      const requestDeviceName = clean(body.deviceName) || "Unknown device";
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

      // Standard users can have only one active session. Admin accounts are exempt.
      if (user.role !== "admin") {
        // Serialize concurrent login attempts for the same user so two new sessions
        // cannot pass the single-session check at the same time.
        await client.query("SELECT pg_advisory_xact_lock($1)", [Number(user.id)]);
        const activeSessions = await client.query(
          "SELECT id,device_name,ip_address,user_agent,created_at,last_seen_at FROM auth_sessions WHERE user_id=$1 AND expires_at>NOW() AND last_seen_at > NOW() - INTERVAL '12 hours' ORDER BY last_seen_at DESC",
          [user.id]
        );

        if (activeSessions.rows.length && !terminateExistingSession) {
          await client.query("ROLLBACK");
          const old = activeSessions.rows[0];
          return res.status(409).json({
            success:false,
            error:"This account is already logged in on another device.",
            sessionConflict:true,
            previousSession:{
              id:old.id,
              deviceName:old.device_name || "Unknown device",
              ipAddress:old.ip_address || "Unavailable",
              userAgent:old.user_agent || "",
              lastSeenAt:old.last_seen_at,
              createdAt:old.created_at
            }
          });
        }

        if (activeSessions.rows.length && terminateExistingSession) {
          await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[user.id]);
        }
      }

      const token = generateToken();
      const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
      await client.query(
        "INSERT INTO auth_sessions (user_id,token_hash,expires_at,device_name,ip_address,user_agent) VALUES ($1,$2,$3,$4,$5,$6)",
        [user.id, hashValue(token), expires, requestDeviceName, requestIp || null, requestUserAgent || null]
      );
      await client.query(
        "UPDATE app_users SET last_login_at=NOW(),last_activity_at=NOW() WHERE id=$1",
        [user.id]
      );
      await logActivity(client, user.id, "Login", { details: { identifierType: email === identifier.toLowerCase() ? "email" : "mobile" } });
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
      const currentUser = await getUserByToken(client, authToken(req));
      if (currentUser) {
        await logActivity(client, currentUser.id, "Logout");
        await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashValue(authToken(req))]);
      }
      await client.query("COMMIT");
      return res.json({ success:true });
    }

    if (action === "log-activity") {
      const currentUser = await getUserByToken(client, authToken(req));
      if (!currentUser) {
        await client.query("ROLLBACK");
        return res.status(401).json({ success:false, error:"Session expired." });
      }
      const allowed = new Set([
        "Excel Upload","Single Vehicle Analysis","Bulk Vehicle Analysis",
        "Service Schedule Viewed","Clear","Reading Override","PDF Export"
      ]);
      if (!allowed.has(clean(body.activityType))) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success:false, error:"Invalid activity type." });
      }
      await logActivity(client, currentUser.id, body.activityType, body);
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


    if (action === "admin-analytics") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const targetUserId = body.userId ? Number(body.userId) : null;
      const rangeDays = [7,30,90].includes(Number(body.rangeDays)) ? Number(body.rangeDays) : 30;
      const includeAdmins = body.includeAdmins !== false;
      const userConditions = [];
      const params = [];
      if (Number.isInteger(targetUserId) && targetUserId > 0) {
        userConditions.push("u.id=$1");
        params.push(targetUserId);
      }
      if (!includeAdmins) userConditions.push("u.role <> 'admin'");
      const userWhere = userConditions.length ? "WHERE " + userConditions.join(" AND ") : "";

      const summary = await client.query(
        `SELECT
           u.id,u.person_name,u.dealer_name,u.email,u.mobile,u.role,u.status,u.created_at,u.last_login_at,u.last_activity_at,
           COUNT(a.id)::int AS total_activities,
           COUNT(*) FILTER (WHERE a.activity_type='Login')::int AS total_logins,
           COUNT(DISTINCT (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date) FILTER (WHERE a.activity_type <> 'Logout')::int AS active_days,
           COALESCE(SUM(a.vehicle_count),0)::int AS vehicles_analyzed,
           COALESCE(SUM(a.file_count),0)::int AS files_processed,
           COUNT(*) FILTER (WHERE a.activity_type='Single Vehicle Analysis')::int AS single_analyses,
           COUNT(*) FILTER (WHERE a.activity_type='Bulk Vehicle Analysis')::int AS bulk_analyses,
           COUNT(*) FILTER (WHERE a.activity_type='Service Schedule Viewed')::int AS schedule_views
         FROM app_users u
         LEFT JOIN user_activity a ON a.user_id=u.id
         ${userWhere}
         GROUP BY u.id
         ORDER BY u.role DESC,u.created_at DESC`,
        params
      );

      const recent = await client.query(
        `SELECT a.id,a.user_id,u.person_name,u.dealer_name,a.activity_type,a.activity_time,
                a.mode,a.vehicle_count,a.file_count,a.vin,a.details
           FROM user_activity a
           JOIN app_users u ON u.id=a.user_id
          WHERE 1=1${targetUserId ? " AND a.user_id=$1" : ""}${!includeAdmins ? " AND u.role <> 'admin'" : ""}
          ORDER BY a.activity_time DESC
          LIMIT 200`,
        params
      );

      const periods = await client.query(
        `SELECT (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,
                COUNT(*)::int AS activities,
                COUNT(*) FILTER (WHERE a.activity_type='Login')::int AS logins,
                COALESCE(SUM(a.vehicle_count),0)::int AS vehicles,
                COALESCE(SUM(a.file_count),0)::int AS files
           FROM user_activity a
          WHERE ${targetUserId ? "a.user_id=$1 AND " : ""}${!includeAdmins ? "a.user_id IN (SELECT id FROM app_users WHERE role <> 'admin') AND " : ""}a.activity_time >= NOW() - (${targetUserId ? "$2" : "$1"} * INTERVAL '1 day')
          GROUP BY 1 ORDER BY 1`,
        targetUserId ? [targetUserId, rangeDays] : [rangeDays]
      );

      const breakdown = await client.query(
        `SELECT a.activity_type, COUNT(*)::int AS count,
                COALESCE(SUM(a.vehicle_count),0)::int AS vehicles,
                COALESCE(SUM(a.file_count),0)::int AS files
           FROM user_activity a
          WHERE ${targetUserId ? "a.user_id=$1 AND " : ""}${!includeAdmins ? "a.user_id IN (SELECT id FROM app_users WHERE role <> 'admin') AND " : ""}a.activity_time >= NOW() - (${targetUserId ? "$2" : "$1"} * INTERVAL '1 day')
          GROUP BY a.activity_type
          ORDER BY count DESC, a.activity_type`,
        targetUserId ? [targetUserId, rangeDays] : [rangeDays]
      );

      await client.query("COMMIT");
      return res.json({
        success:true,
        rangeDays,
        includeAdmins,
        summary:summary.rows.map(row => ({
          ...userPayload(row),
          totalActivities:Number(row.total_activities||0),
          totalLogins:Number(row.total_logins||0),
          activeDays:Number(row.active_days||0),
          vehiclesAnalyzed:Number(row.vehicles_analyzed||0),
          filesProcessed:Number(row.files_processed||0),
          singleAnalyses:Number(row.single_analyses||0),
          bulkAnalyses:Number(row.bulk_analyses||0),
          scheduleViews:Number(row.schedule_views||0),
        })),
        recent:recent.rows,
        periods:periods.rows,
        breakdown:breakdown.rows
      });
    }

    if (action === "update-profile") {
      const sessionUser = await getUserByToken(client, authToken(req));
      if (!sessionUser) {
        await client.query("ROLLBACK");
        return res.status(401).json({success:false,error:"Session expired."});
      }

      const personName = clean(body.personName);
      const dealerName = clean(body.dealerName);
      const mobile = normalizeMobile(body.mobile);
      const preferences = body.preferences && typeof body.preferences === "object"
        ? body.preferences
        : {};

      if (!personName || !dealerName) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Name and dealer name are required."});
      }

      // Merge incoming preferences with the user's existing preferences instead of
      // replacing the entire JSON object. This prevents fields such as booking
      // contacts from being lost when an older/newer UI sends only part of the
      // preference set.
      const mergedPreferences = {
        ...(sessionUser.preferences && typeof sessionUser.preferences === "object" ? sessionUser.preferences : {}),
        ...preferences,
      };

      const updated = await client.query(
        "UPDATE app_users SET person_name=$1,dealer_name=$2,mobile=$3,preferences=$4::jsonb WHERE id=$5 RETURNING *",
        [personName,dealerName,mobile || null,JSON.stringify(mergedPreferences),sessionUser.id]
      );
      await client.query("COMMIT");
      return res.json({success:true,user:userPayload(updated.rows[0]),message:"Profile and preferences saved."});
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
      await logActivity(client, admin.user.id, "Admin User Saved", { details: { targetUserId: user.id, targetEmail: user.email } });
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
      await logActivity(client, admin.user.id, "Admin Password Reset", { details: { targetUserId: userId } });
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
      await logActivity(client, admin.user.id, "Admin Status Changed", { details: { targetUserId: userId, status } });
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
