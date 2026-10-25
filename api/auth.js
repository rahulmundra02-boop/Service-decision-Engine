import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL1,
  ssl: { rejectUnauthorized: false },
  // Neon session-mode pool is limited to 15 total clients across serverless instances.
  // Keep each Vercel function instance to one short-lived DB connection and
  // release idle sockets quickly to avoid EMAXCONNSESSION during concurrent requests.
  max: 1,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle: true,
});

const SESSION_DAYS = 0.5;
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

let authSchemaEnsured = false;
async function initAuthSchemaOnce(client) {
  if (authSchemaEnsured) return;

  // Multiple Vercel instances can cold-start at the same time. Serialize
  // schema bootstrap across instances and re-check after acquiring the lock.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('service-decision-auth-schema'))");
  if (authSchemaEnsured) return;

  try {
    await ensureSchema(client);
    await bootstrapAdmin(client);
    authSchemaEnsured = true;
  } catch (err) {
    authSchemaEnsured = false;
    throw err;
  }
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
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'al_internal';
    UPDATE app_users SET user_type='al_internal' WHERE user_type IS NULL OR user_type='';

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

    CREATE TABLE IF NOT EXISTS account_requests (
      id BIGSERIAL PRIMARY KEY,
      person_name TEXT NOT NULL,
      dealer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      mobile TEXT NOT NULL,
      referral_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE account_requests ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'al_internal';
    ALTER TABLE account_requests ADD COLUMN IF NOT EXISTS company_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_account_requests_mobile_created ON account_requests(mobile, created_at DESC);
    CREATE TABLE IF NOT EXISTS customer_companies (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_user_companies (
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      company_id BIGINT NOT NULL REFERENCES customer_companies(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id, company_id)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_user_companies_company ON customer_user_companies(company_id);
    CREATE TABLE IF NOT EXISTS customer_company_requests (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,company_id BIGINT NOT NULL REFERENCES customer_companies(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),reviewed_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,company_id,status));
    CREATE TABLE IF NOT EXISTS customer_vehicle_requests (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,vin TEXT NOT NULL,vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),reviewed_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS customer_vehicle_access (user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,granted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,vehicle_id));
    CREATE TABLE IF NOT EXISTS customer_hidden_vehicle_sources (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,source_type TEXT NOT NULL CHECK(source_type IN ('company','direct')),company_id BIGINT REFERENCES customer_companies(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_hidden_source_unique ON customer_hidden_vehicle_sources(user_id,vehicle_id,source_type,COALESCE(company_id,0));
    CREATE TABLE IF NOT EXISTS customer_access_audit (id BIGSERIAL PRIMARY KEY,actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,target_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS idx_customer_company_requests_status ON customer_company_requests(status,created_at);
    CREATE INDEX IF NOT EXISTS idx_customer_vehicle_requests_status ON customer_vehicle_requests(status,created_at);
    CREATE INDEX IF NOT EXISTS idx_customer_vehicle_access_vehicle ON customer_vehicle_access(vehicle_id);
    INSERT INTO customer_companies(name, normalized_name)
    SELECT DISTINCT TRIM(customer_name), LOWER(REGEXP_REPLACE(TRIM(customer_name), '[[:space:]]+', ' ', 'g'))
      FROM vehicles
     WHERE NULLIF(TRIM(customer_name),'') IS NOT NULL
    ON CONFLICT(normalized_name) DO NOTHING;
    CREATE TABLE IF NOT EXISTS customer_timestamp_update_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      vin TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
      UNIQUE(user_id,vehicle_id,status)
    );
    CREATE TABLE IF NOT EXISTS user_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      referred_user_id BIGINT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_user_activity_time ON user_activity(activity_time);

    CREATE TABLE IF NOT EXISTS campaign_records (
      id BIGSERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      chassis_number TEXT NOT NULL,
      engine TEXT,
      registration_number TEXT,
      campaign_number TEXT,
      campaign_desc TEXT NOT NULL,
      from_date DATE,
      to_date DATE,
      item TEXT,
      quantity TEXT,
      uploaded_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_records_chassis
      ON campaign_records(UPPER(TRIM(chassis_number)));

    CREATE INDEX IF NOT EXISTS idx_campaign_records_campaign_desc
      ON campaign_records(campaign_desc);

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO app_settings (setting_key, setting_value)
    VALUES ('job_card_cache', '{"enabled":true,"intervalHours":24,"version":1,"lastRebuildAt":null}'::jsonb)
    ON CONFLICT (setting_key) DO NOTHING;

    INSERT INTO app_settings (setting_key, setting_value)
    VALUES ('emergency_db_upload_cutoff', '{"enabled":false}'::jsonb)
    ON CONFLICT (setting_key) DO NOTHING;
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

const AUTO_INACTIVE_DAYS = 10;

async function autoDeactivateInactiveUsers(client) {
  const deactivated = await client.query(
    `UPDATE app_users
        SET status='inactive'
      WHERE role <> 'admin'
        AND status='active'
        AND COALESCE(last_activity_at,last_login_at,created_at) < NOW() - ($1 * INTERVAL '1 day')
      RETURNING id`,
    [AUTO_INACTIVE_DAYS]
  );

  const ids = deactivated.rows.map((row) => Number(row.id)).filter(Number.isInteger);
  if (ids.length) {
    await client.query("DELETE FROM auth_sessions WHERE user_id = ANY($1::bigint[])", [ids]);
  }

  return ids;
}

async function getUserByToken(client, token) {
  if (!token) return null;
  const tokenHash = hashValue(token);
  const result = await client.query(
    `SELECT u.id,u.person_name,u.dealer_name,u.email,u.mobile,u.role,u.status,
            u.email_verified,u.mobile_verified,u.created_at,u.last_login_at,u.last_activity_at,
            u.preferences,u.user_type,
            s.last_seen_at,s.device_name
       FROM auth_sessions s
       JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,
    [tokenHash]
  );
  if (!result.rows[0]) return null;
  if (/service estimate android/i.test(clean(result.rows[0].device_name))) {
    await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [tokenHash]);
    return null;
  }

  const lastSeen = result.rows[0].last_seen_at ? new Date(result.rows[0].last_seen_at).getTime() : 0;
  if (!lastSeen || Date.now() - lastSeen > SESSION_INACTIVITY_HOURS * 60 * 60 * 1000) {
    await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [tokenHash]);
    return null;
  }

  await client.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1", [tokenHash]);
  await client.query("UPDATE app_users SET last_activity_at=NOW() WHERE id=$1", [result.rows[0].id]);
  return result.rows[0];
}


async function ensureUserVehicleAnalysisTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_vehicle_analysis (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      vin TEXT NOT NULL,
      analysis_date DATE NOT NULL,
      first_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, vin, analysis_date)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_vehicle_analysis_user_date
      ON user_vehicle_analysis(user_id, analysis_date)
  `);
}

async function recordUserVehicleAnalyses(client, userId, payload = {}) {
  if (!userId) return;
  const activityType = clean(payload.activityType);
  if (activityType !== "Single Vehicle Analysis" && activityType !== "Bulk Vehicle Analysis") return;

  const vins = new Set();
  const singleVin = clean(payload.vin);
  if (singleVin) vins.add(singleVin.toUpperCase());

  const detailVins = Array.isArray(payload.details?.vins) ? payload.details.vins : [];
  for (const value of detailVins) {
    const vin = clean(value);
    if (vin) vins.add(vin.toUpperCase());
  }

  if (!vins.size) return;

  for (const vin of vins) {
    await client.query(
      `INSERT INTO user_vehicle_analysis (user_id,vin,analysis_date,first_activity_at)
       VALUES ($1,$2,(NOW() AT TIME ZONE 'Asia/Kolkata')::date,NOW())
       ON CONFLICT (user_id,vin,analysis_date) DO NOTHING`,
      [userId, vin]
    );
  }
}

async function backfillUserVehicleAnalyses(client) {
  await ensureUserVehicleAnalysisTable(client);

  await client.query(`
    INSERT INTO user_vehicle_analysis (user_id,vin,analysis_date,first_activity_at)
    SELECT DISTINCT
      a.user_id,
      UPPER(TRIM(a.vin)) AS vin,
      (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date AS analysis_date,
      a.activity_time
    FROM user_activity a
    WHERE a.activity_type IN ('Single Vehicle Analysis','Bulk Vehicle Analysis')
      AND NULLIF(TRIM(a.vin),'') IS NOT NULL
    ON CONFLICT (user_id,vin,analysis_date) DO NOTHING
  `);

  await client.query(`
    INSERT INTO user_vehicle_analysis (user_id,vin,analysis_date,first_activity_at)
    SELECT DISTINCT
      a.user_id,
      UPPER(TRIM(v.value)) AS vin,
      (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date AS analysis_date,
      a.activity_time
    FROM user_activity a
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(a.details->'vins')='array' THEN a.details->'vins'
        ELSE '[]'::jsonb
      END
    ) v
    WHERE a.activity_type IN ('Single Vehicle Analysis','Bulk Vehicle Analysis')
      AND NULLIF(TRIM(v.value),'') IS NOT NULL
    ON CONFLICT (user_id,vin,analysis_date) DO NOTHING
  `);
}

async function logActivity(client, userId, activityType, payload = {}) {
  if (!userId) return;
  const activity = clean(activityType) || "Activity";
  const details = payload.details || {};
  await client.query(
    `INSERT INTO user_activity
      (user_id,activity_type,mode,vehicle_count,file_count,vin,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      userId,
      activity,
      clean(payload.mode) || null,
      Number(payload.vehicleCount || 0),
      Number(payload.fileCount || 0),
      clean(payload.vin) || null,
      JSON.stringify(details),
    ]
  );

  if (activity === "Single Vehicle Analysis" || activity === "Bulk Vehicle Analysis") {
    await ensureUserVehicleAnalysisTable(client);
    await recordUserVehicleAnalyses(client, userId, { ...payload, activityType:activity, details });
  }
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
    userType: user.user_type || 'al_internal',
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
                email_verified=TRUE,mobile_verified=TRUE
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
    await initAuthSchemaOnce(client);
    await autoDeactivateInactiveUsers(client);

    if (action === "login") {
      const identifier = clean(body.identifier);
      const password = body.password;
      const terminateExistingSession = body.terminateExistingSession === true;
      const requestIp = clean(String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "").split(",")[0]);
      const requestUserAgent = clean(req.headers["user-agent"] || "");
      const requestDeviceName = clean(body.deviceName) || "Unknown device";
      if (/service estimate android/i.test(requestDeviceName)) {
        await client.query("ROLLBACK");
        return res.status(410).json({
          success:false,
          discontinued:true,
          error:"The Service Decision Engine Android application has been discontinued. Please use https://service-decision-engine.vercel.app/."
        });
      }
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

    if (action === "log-activity-batch") {
      const currentUser = await getUserByToken(client, authToken(req));
      if (!currentUser) {
        await client.query("ROLLBACK");
        return res.status(401).json({success:false,error:"Session expired."});
      }
      // Rolling retention cleanup runs whenever a batch is received.
      await client.query("DELETE FROM user_activity WHERE activity_time < NOW() - INTERVAL '7 days'");
      const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
      for (const event of events) {
        const label = clean(event?.details?.label).slice(0, 180);
        const tag = clean(event?.details?.tag).slice(0, 32);
        if (!label || !tag) continue;
        await logActivity(client, currentUser.id, "UI Interaction", {
          details: {label,tag,page:clean(event?.details?.page).slice(0,120)}
        });
      }
      await client.query("COMMIT");
      return res.json({success:true,recorded:events.length});
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


    if (action === "admin-database-view") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const startDate = clean(body.startDate);
      const endDate = clean(body.endDate);
      if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Please select a valid date range."});
      }

      const rangeParams = [startDate, endDate];
      const rangeFilter = "created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')";

      await client.query(`
        CREATE TABLE IF NOT EXISTS vehicle_upload_events (
          id BIGSERIAL PRIMARY KEY,
          vin TEXT NOT NULL,
          vehicle_existed_before BOOLEAN NOT NULL DEFAULT FALSE,
          new_job_cards INTEGER NOT NULL DEFAULT 0,
          event_type TEXT NOT NULL DEFAULT 'refresh',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_vehicle_upload_events_created_at ON vehicle_upload_events(created_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_vehicle_upload_events_vin_created_at ON vehicle_upload_events(vin,created_at)");

      const [vehicleCount, lineCount, vehicles, modifiedVehicleCount, refreshedVehicleCount] = await Promise.all([
        client.query(
          "SELECT COUNT(*)::int AS count FROM vehicles WHERE " + rangeFilter,
          rangeParams
        ),
        client.query(
          "SELECT COUNT(*)::int AS count FROM service_history WHERE " + rangeFilter,
          rangeParams
        ),
        client.query(
          "SELECT vin,registration,customer_name,model,created_at,last_refreshed_at FROM vehicles WHERE vin IS NOT NULL AND TRIM(vin)<>'' AND (" +
          "(last_refreshed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND last_refreshed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')) " +
          "OR EXISTS (SELECT 1 FROM vehicle_upload_events e WHERE UPPER(TRIM(e.vin))=UPPER(TRIM(vehicles.vin)) AND e.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND e.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))) " +
          "ORDER BY COALESCE(last_refreshed_at,created_at) DESC LIMIT 200",
          rangeParams
        ),
        client.query(
          "SELECT COUNT(DISTINCT UPPER(TRIM(vin)))::int AS count FROM vehicle_upload_events " +
          "WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') " +
          "AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') " +
          "AND vehicle_existed_before=TRUE AND new_job_cards>0",
          rangeParams
        ),
        client.query(
          "SELECT COUNT(DISTINCT UPPER(TRIM(v.vin)))::int AS count FROM vehicles v " +
          "WHERE v.vin IS NOT NULL AND TRIM(v.vin)<>'' AND (" +
          "(v.last_refreshed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') " +
          "AND v.last_refreshed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')) " +
          "OR EXISTS (SELECT 1 FROM vehicle_upload_events e WHERE UPPER(TRIM(e.vin))=UPPER(TRIM(v.vin)) " +
          "AND e.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') " +
          "AND e.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')))",
          rangeParams
        )
      ]);

      await client.query("COMMIT");
      return res.status(200).json({
        success:true,
        startDate,
        endDate,
        vehicleCount:vehicleCount.rows[0]?.count || 0,
        lineItemCount:lineCount.rows[0]?.count || 0,
        modifiedVehicleCount:modifiedVehicleCount.rows[0]?.count || 0,
        refreshedVehicleCount:refreshedVehicleCount.rows[0]?.count || 0,
        vehicles:vehicles.rows,
        vehicleRowsLimited:vehicles.rowCount >= 200
      });
    }

    // Lazy retention cleanup: removes expired interaction logs on admin access.
    if (action === "admin-analytics") {
      await client.query("DELETE FROM user_activity WHERE activity_time < NOW() - INTERVAL '7 days'");
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const targetUserId = body.userId ? Number(body.userId) : null;
      const rangeDays = [1,7,30,90].includes(Number(body.rangeDays)) ? Number(body.rangeDays) : 30;
      const includeAdmins = body.includeAdmins !== false;
      const userConditions = [];
      const params = [];
      if (Number.isInteger(targetUserId) && targetUserId > 0) {
        userConditions.push("u.id=$1");
        params.push(targetUserId);
      }
      if (!includeAdmins) userConditions.push("u.role <> 'admin'");
      const userWhere = userConditions.length ? "WHERE " + userConditions.join(" AND ") : "";

      const summaryActivityFilter = rangeDays === 1
        ? "(a.activity_time AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date"
        : "a.activity_time >= NOW() - (" + (targetUserId ? "$2" : "$1") + " * INTERVAL '1 day')";
      const summaryQueryParams = rangeDays === 1
        ? (targetUserId ? [targetUserId] : [])
        : (targetUserId ? [targetUserId, rangeDays] : [rangeDays]);

      // Historical VIN backfill is a one-time migration task, not dashboard work.
      // New analyses are recorded by logActivity; avoid rescanning all activity rows on every analytics refresh.

      const summary = await client.query(
        `SELECT
           u.id,u.person_name,u.dealer_name,u.email,u.mobile,u.role,u.status,u.created_at,u.last_login_at,u.last_activity_at,
           COUNT(a.id)::int AS total_activities,
           COUNT(*) FILTER (WHERE a.activity_type='Login')::int AS total_logins,
           COUNT(DISTINCT (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date) FILTER (WHERE a.activity_type <> 'Logout')::int AS active_days,
           (
             SELECT COUNT(*)::int
             FROM user_vehicle_analysis uva
             WHERE uva.user_id=u.id
               AND uva.analysis_date >=
                 CASE WHEN ${rangeDays} = 1
                   THEN (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                   ELSE (NOW() AT TIME ZONE 'Asia/Kolkata')::date - (${rangeDays} - 1)
                 END
           ) AS vehicles_analyzed,
           COALESCE(SUM(a.file_count),0)::int AS files_processed,
           COUNT(*) FILTER (WHERE a.activity_type='Single Vehicle Analysis')::int AS single_analyses,
           COUNT(*) FILTER (WHERE a.activity_type='Bulk Vehicle Analysis')::int AS bulk_analyses,
           COUNT(*) FILTER (WHERE a.activity_type='Service Schedule Viewed')::int AS schedule_views
         FROM app_users u
         LEFT JOIN user_activity a
           ON a.user_id=u.id
          AND ${summaryActivityFilter}
          ${!includeAdmins ? " AND u.role <> 'admin'" : ""}
         ${userWhere}
         GROUP BY u.id
         ORDER BY u.role DESC,u.created_at DESC`,
        summaryQueryParams
      );

      const totalVehiclesResult = await client.query(
        `SELECT COUNT(DISTINCT UPPER(TRIM(v.vin)))::int AS total_vehicles
           FROM vehicles v
          WHERE v.vin IS NOT NULL AND TRIM(v.vin) <> ''`
      );

      const uniqueVehiclesAnalyzedResult = await client.query(
        `SELECT COUNT(DISTINCT UPPER(TRIM(uva.vin)))::int AS unique_vehicles_analyzed
           FROM user_vehicle_analysis uva
           JOIN app_users u ON u.id=uva.user_id
          WHERE uva.analysis_date >=
            CASE WHEN ${rangeDays} = 1
              THEN (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              ELSE (NOW() AT TIME ZONE 'Asia/Kolkata')::date - (${rangeDays} - 1)
            END
            ${targetUserId ? "AND uva.user_id=$1" : ""}
            ${!includeAdmins ? "AND u.role <> 'admin'" : ""}`,
        targetUserId ? [targetUserId] : []
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

      // Today uses a dedicated SQL path with no artificial $1/$2 range parameter.
      // This prevents PostgreSQL placeholder errors and keeps 7D/30D/90D logic unchanged.
      let periods;
      let breakdown;

      if (rangeDays === 1) {
        const todayConditions = [
          "(a.activity_time AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date"
        ];
        const todayParams = [];

        if (targetUserId) {
          todayConditions.unshift("a.user_id=$1");
          todayParams.push(targetUserId);
        }
        if (!includeAdmins) {
          todayConditions.push("a.user_id IN (SELECT id FROM app_users WHERE role <> 'admin')");
        }

        const todayWhere = todayConditions.join(" AND ");

        periods = await client.query(
          `WITH activity_counts AS (
             SELECT
               COUNT(*)::int AS activities,
               COUNT(*) FILTER (WHERE a.activity_type='Login')::int AS logins,
               COALESCE(SUM(a.file_count),0)::int AS files
             FROM user_activity a
             JOIN app_users u ON u.id=a.user_id
             WHERE (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date =
               (NOW() AT TIME ZONE 'Asia/Kolkata')::date
               ${targetUserId ? "AND a.user_id=$1" : ""}
               ${!includeAdmins ? "AND u.role <> 'admin'" : ""}
           ),
           vehicle_counts AS (
             SELECT COUNT(DISTINCT UPPER(TRIM(uva.vin)))::int AS vehicles
             FROM user_vehicle_analysis uva
             JOIN app_users u ON u.id=uva.user_id
             WHERE uva.analysis_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date
               ${targetUserId ? "AND uva.user_id=$1" : ""}
               ${!includeAdmins ? "AND u.role <> 'admin'" : ""}
           )
           SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,
                  ac.activities, ac.logins, vc.vehicles, ac.files
             FROM activity_counts ac CROSS JOIN vehicle_counts vc`,
          todayParams
        );

        breakdown = await client.query(
          `SELECT a.activity_type,
                  COUNT(*)::int AS count,
                  COALESCE(SUM(a.vehicle_count),0)::int AS vehicles,
                  COALESCE(SUM(a.file_count),0)::int AS files
             FROM user_activity a
             JOIN app_users u ON u.id=a.user_id
            WHERE (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date =
              (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              ${targetUserId ? "AND a.user_id=$1" : ""}
              ${!includeAdmins ? "AND u.role <> 'admin'" : ""}
            GROUP BY a.activity_type
            ORDER BY count DESC, a.activity_type ASC`,
          todayParams
        );
      } else {
        const analyticsQueryParams = targetUserId ? [targetUserId, rangeDays] : [rangeDays];
        const rangeParam = targetUserId ? "$2" : "$1";

        const scopedAnalyticsCondition = `
          ${targetUserId ? "a.user_id=$1 AND " : ""}
          ${!includeAdmins ? "a.user_id IN (SELECT id FROM app_users WHERE role <> 'admin') AND " : ""}
          a.activity_time >= NOW() - (${rangeParam} * INTERVAL '1 day')`.replace(/\s+/g, " ").trim();

        periods = await client.query(
          `WITH days AS (
             SELECT generate_series(
               (NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($1 - 1),
               (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
               INTERVAL '1 day'
             )::date AS activity_date
           ),
           activity_counts AS (
             SELECT
               (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,
               COUNT(*)::int AS activities,
               COUNT(*) FILTER (WHERE a.activity_type='Login')::int AS logins,
               COALESCE(SUM(a.file_count),0)::int AS files
             FROM user_activity a
             JOIN app_users u ON u.id=a.user_id
             WHERE (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN
               (NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($1 - 1)
               AND (NOW() AT TIME ZONE 'Asia/Kolkata')::date
               ${targetUserId ? "AND a.user_id=$2" : ""}
               ${!includeAdmins ? "AND u.role <> 'admin'" : ""}
             GROUP BY 1
           ),
           vehicle_counts AS (
             SELECT
               uva.analysis_date AS activity_date,
               COUNT(DISTINCT UPPER(TRIM(uva.vin)))::int AS vehicles
             FROM user_vehicle_analysis uva
             JOIN app_users u ON u.id=uva.user_id
             WHERE uva.analysis_date BETWEEN
               (NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($1 - 1)
               AND (NOW() AT TIME ZONE 'Asia/Kolkata')::date
               ${targetUserId ? "AND uva.user_id=$2" : ""}
               ${!includeAdmins ? "AND u.role <> 'admin'" : ""}
             GROUP BY 1
           )
           SELECT d.activity_date,
                  COALESCE(ac.activities,0)::int AS activities,
                  COALESCE(ac.logins,0)::int AS logins,
                  COALESCE(vc.vehicles,0)::int AS vehicles,
                  COALESCE(ac.files,0)::int AS files
             FROM days d
             LEFT JOIN activity_counts ac ON ac.activity_date=d.activity_date
             LEFT JOIN vehicle_counts vc ON vc.activity_date=d.activity_date
             ORDER BY d.activity_date`,
          targetUserId ? [rangeDays, targetUserId] : [rangeDays]
        );

        breakdown = await client.query(
          `SELECT a.activity_type,
                  COUNT(*)::int AS count,
                  COALESCE(SUM(a.vehicle_count),0)::int AS vehicles,
                  COALESCE(SUM(a.file_count),0)::int AS files
             FROM user_activity a
             JOIN app_users u ON u.id=a.user_id
            WHERE (a.activity_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN
              (NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($1 - 1)
              AND (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              ${targetUserId ? "AND a.user_id=$2" : ""}
              ${!includeAdmins ? "AND u.role <> 'admin'" : ""}
            GROUP BY a.activity_type
            ORDER BY count DESC, a.activity_type ASC`,
          targetUserId ? [rangeDays, targetUserId] : [rangeDays]
        );
      }

      await client.query("COMMIT");
      return res.json({
        success:true,
        rangeDays,
        includeAdmins,
        totalVehicles:Number(totalVehiclesResult.rows[0]?.total_vehicles || 0),
        uniqueVehiclesAnalyzed:Number(uniqueVehiclesAnalyzedResult.rows[0]?.unique_vehicles_analyzed || 0),
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

    if (action === "admin-stale-chassis") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const result = await client.query(
        `SELECT
           UPPER(TRIM(v.vin)) AS chassis_no,
           v.last_refreshed_at AS last_updated_at
         FROM vehicles v
         WHERE v.vin IS NOT NULL AND TRIM(v.vin) <> ''
           AND v.last_refreshed_at IS NOT NULL
         ORDER BY v.last_refreshed_at ASC, UPPER(TRIM(v.vin)) ASC`
      );

      const buckets = {"7plus": [], "6": [], "5": [], "4": [], "3": [], "2": [], "1": []};

      for (const row of result.rows) {
        if (!row.chassis_no || !row.last_updated_at) continue;
        const serviceDate = new Date(row.last_updated_at);
        const today = new Date();
        serviceDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const ageDays = Math.floor((today.getTime() - serviceDate.getTime()) / (24 * 60 * 60 * 1000));
        if (ageDays >= 7) buckets["7plus"].push(row.chassis_no);
        else if (ageDays >= 1 && ageDays <= 6) buckets[String(ageDays)].push(row.chassis_no);
      }

      await client.query("COMMIT");
      return res.json({
        success:true,
        buckets,
        counts:Object.fromEntries(Object.entries(buckets).map(([key,list]) => [key,list.length]))
      });
    }
    if (action === "campaigns-by-vin") {
      const user = await getUserByToken(client, authToken(req));
      if (!user) {
        await client.query("ROLLBACK");
        return res.status(401).json({success:false,error:"Session expired."});
      }
      // Customer accounts must use the customer-safe portal payload only.
      // Campaign records are internal service-tool data and are not part of the customer portal.
      if (user.user_type === "al_customer") {
        await client.query("ROLLBACK");
        return res.status(403).json({success:false,error:"Campaign lookup is not available for customer accounts."});
      }

      const vin = clean(body.vin);
      if (!vin) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"VIN is required."});
      }

      const result = await client.query(
        `SELECT campaign_number,campaign_desc,from_date,to_date,item,quantity
           FROM campaign_records
          WHERE UPPER(TRIM(chassis_number)) = UPPER(TRIM($1))
          ORDER BY from_date ASC NULLS LAST, campaign_number ASC, id ASC`,
        [vin]
      );

      await client.query("COMMIT");
      return res.json({
        success:true,
        vin,
        campaigns:result.rows.map(row => ({
          campaignNumber:row.campaign_number || "",
          campaignDesc:row.campaign_desc || "",
          fromDate:row.from_date || null,
          toDate:row.to_date || null,
          item:row.item || "",
          quantity:row.quantity || "",
        }))
      });
    }

    if (action === "admin-campaign-meta") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const result = await client.query(`SELECT
           COUNT(*)::int AS rows,
           COUNT(DISTINCT UPPER(TRIM(chassis_number)))::int AS vehicles,
           MAX(uploaded_at) AS uploaded_at
         FROM campaign_records`);
      const latest = await client.query(`SELECT file_name
           FROM campaign_records
          ORDER BY uploaded_at DESC, id DESC
          LIMIT 1`);

      await client.query("COMMIT");
      return res.json({
        success:true,
        meta:{
          rows:Number(result.rows[0]?.rows || 0),
          vehicles:Number(result.rows[0]?.vehicles || 0),
          uploadedAt:result.rows[0]?.uploaded_at || null,
          fileName:latest.rows[0]?.file_name || ""
        }
      });
    }

    if (action === "admin-upload-campaign-batch") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const rows = Array.isArray(body.rows) ? body.rows : [];
      const uploadId = clean(body.uploadId);
      const fileName = clean(body.fileName) || "Campaign Master";
      const replace = body.replace === true;

      if (!uploadId || !rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Campaign upload batch is empty."});
      }
      if (rows.length > 250) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Campaign batch is too large."});
      }

      if (replace) {
        await client.query("DELETE FROM campaign_records");
      }

      for (const row of rows) {
        const chassis = clean(row?.chassisNumber);
        const campaignDesc = clean(row?.campaignDesc);
        if (!chassis || !campaignDesc) continue;

        await client.query(
          `INSERT INTO campaign_records
            (upload_id,file_name,chassis_number,engine,registration_number,campaign_number,campaign_desc,from_date,to_date,item,quantity,uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12)`,
          [
            uploadId,
            fileName,
            chassis,
            clean(row?.engine) || null,
            clean(row?.registrationNumber) || null,
            clean(row?.campaignNumber) || null,
            campaignDesc,
            clean(row?.fromDate) || null,
            clean(row?.toDate) || null,
            clean(row?.item) || null,
            clean(row?.quantity) || null,
            admin.user.id
          ]
        );
      }

      await logActivity(client, admin.user.id, "Admin Campaign Master Upload", {
        details:{ fileName, uploadId, rows:rows.length, replace }
      });

      await client.query("COMMIT");
      return res.json({
        success:true,
        rows:rows.length,
        uploadId,
        message:replace ? "Campaign master replaced and upload started." : "Campaign batch uploaded."
      });
    }

    if (action === "job-card-cache-rebuild-complete") {
      const sessionUser = await getUserByToken(client, authToken(req));
      if (!sessionUser) {
        await client.query("ROLLBACK");
        return res.status(401).json({success:false,error:"Session expired."});
      }

      const currentResult = await client.query(
        "SELECT setting_value FROM app_settings WHERE setting_key='job_card_cache' LIMIT 1"
      );
      const current = currentResult.rows[0]?.setting_value || {
        enabled:true,
        intervalHours:24,
        version:1,
        lastRebuildAt:null,
        lastAutoRebuildAt:null
      };

      const completedAt = new Date().toISOString();
      const updatedSettings = {
        ...current,
        lastAutoRebuildAt: completedAt,
        lastAutoRebuildBy: Number(sessionUser.id || 0) || null
      };

      await client.query(
        "INSERT INTO app_settings (setting_key,setting_value,updated_at) " +
        "VALUES ('job_card_cache',$1::jsonb,NOW()) " +
        "ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",
        [JSON.stringify(updatedSettings)]
      );

      await client.query("COMMIT");
      return res.json({
        success:true,
        completedAt,
        settings:{
          ...updatedSettings,
          enabled: updatedSettings.enabled !== false,
          intervalHours: Math.max(1, Number(updatedSettings.intervalHours || 24))
        }
      });
    }

    if (action === "job-card-cache-settings") {
      const result = await client.query(
        "SELECT setting_value, updated_at FROM app_settings WHERE setting_key='job_card_cache' LIMIT 1"
      );
      const settings = result.rows[0]?.setting_value || { enabled:true, intervalHours:24, version:1, lastRebuildAt:null, lastAutoRebuildAt:null };
      const countResult = await client.query(
        "SELECT COUNT(DISTINCT UPPER(TRIM(job_card_no)))::int AS count FROM job_cards WHERE job_card_no IS NOT NULL AND TRIM(job_card_no)<>''"
      );
      const intervalHours = Math.max(1, Number(settings.intervalHours || 24));
      const lastRebuildAt = settings.lastRebuildAt || null;
      const nextRebuildAt = lastRebuildAt
        ? new Date(new Date(lastRebuildAt).getTime() + intervalHours * 60 * 60 * 1000).toISOString()
        : null;
      await client.query("COMMIT");
      return res.json({
        success:true,
        settings:{
          enabled: settings.enabled !== false,
          intervalHours,
          version: Number(settings.version || 1),
          lastRebuildAt,
          lastAutoRebuildAt: settings.lastAutoRebuildAt || null,
          nextRebuildAt,
          cachedJobCards: Number(countResult.rows[0]?.count || 0),
          updatedAt: result.rows[0]?.updated_at || null
        }
      });
    }

    if (action === "registration-search-settings") {
      const result = await client.query("SELECT setting_value, updated_at FROM app_settings WHERE setting_key='registration_search_enabled' LIMIT 1");
      const settings = result.rows[0]?.setting_value || { enabled:true };
      await client.query("COMMIT");
      return res.json({success:true,settings:{enabled:settings.enabled !== false,updatedAt:result.rows[0]?.updated_at || null}});
    }

    if (action === "admin-registration-search-settings") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }
      const enabled = body.enabled === true;
      await client.query("INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ('registration_search_enabled',$1::jsonb,NOW()) ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()", [JSON.stringify({enabled})]);
      await logActivity(client, admin.user.id, "Registration Number Service Search", {details:{enabled}});
      await client.query("COMMIT");
      return res.json({success:true,settings:{enabled,updatedAt:new Date().toISOString()},message:enabled ? "Registration number service search is enabled on both portals." : "Registration number service search is disabled on both portals."});
    }

    if (action === "emergency-db-upload-cutoff-settings") {
      const result = await client.query(
        "SELECT setting_value, updated_at FROM app_settings WHERE setting_key='emergency_db_upload_cutoff' LIMIT 1"
      );
      const settings = result.rows[0]?.setting_value || { enabled:false };
      await client.query("COMMIT");
      return res.json({ success:true, settings:{ enabled:settings.enabled === true, updatedAt:result.rows[0]?.updated_at || null } });
    }

    if (action === "admin-emergency-db-upload-cutoff") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }
      const enabled = body.enabled === true;
      await client.query(
        "INSERT INTO app_settings (setting_key,setting_value,updated_at) " +
        "VALUES ('emergency_db_upload_cutoff',$1::jsonb,NOW()) " +
        "ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",
        [JSON.stringify({enabled})]
      );
      await logActivity(client, admin.user.id, "Emergency DB Upload Cutoff", { details:{ enabled } });
      await client.query("COMMIT");
      return res.json({
        success:true,
        settings:{enabled,updatedAt:new Date().toISOString()},
        message:enabled ? "Emergency DB Upload Cutoff is now ON. New Excel history uploads are paused." : "Emergency DB Upload Cutoff is now OFF. Excel history uploads are active again."
      });
    }

    if (action === "admin-job-card-cache-settings") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const currentResult = await client.query(
        "SELECT setting_value FROM app_settings WHERE setting_key='job_card_cache' LIMIT 1"
      );
      const current = currentResult.rows[0]?.setting_value || { enabled:true, intervalHours:24, version:1, lastRebuildAt:null };
      const operation = String(body.operation || "save").trim().toLowerCase();
      let enabled = current.enabled !== false;
      let intervalHours = Math.max(1, Number(current.intervalHours || 24));
      if (operation === "reset") {
        enabled = true;
        intervalHours = 24;
      } else {
        if (body.enabled !== undefined) enabled = body.enabled === true;
        if (body.intervalHours !== undefined) {
          const requested = Number(body.intervalHours);
          if (![6,12,24,48,168].includes(requested)) {
            await client.query("ROLLBACK");
            return res.status(400).json({success:false,error:"Invalid cache rebuild interval."});
          }
          intervalHours = requested;
        }
      }

      const shouldRebuild = operation === "rebuild" || operation === "reset";
      const version = shouldRebuild ? Number(current.version || 0) + 1 : Number(current.version || 1);
      const lastRebuildAt = shouldRebuild ? new Date().toISOString() : (current.lastRebuildAt || null);
      await client.query(
        "INSERT INTO app_settings (setting_key,setting_value,updated_at) " +
        "VALUES ('job_card_cache',$1::jsonb,NOW()) " +
        "ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",
        [JSON.stringify({enabled,intervalHours,version,lastRebuildAt})]
      );
      const countResult = await client.query(
        "SELECT COUNT(DISTINCT UPPER(TRIM(job_card_no)))::int AS count FROM job_cards WHERE job_card_no IS NOT NULL AND TRIM(job_card_no)<>''"
      );
      await client.query("COMMIT");
      return res.json({
        success:true,
        settings:{
          enabled,
          intervalHours,
          version,
          lastRebuildAt,
          nextRebuildAt:new Date(new Date(lastRebuildAt).getTime()+intervalHours*60*60*1000).toISOString(),
          cachedJobCards:Number(countResult.rows[0]?.count || 0),
          updatedAt:new Date().toISOString()
        },
        message: operation === "reset" ? "Job Card cache policy reset and all browser caches marked for rebuild." : "Job Card cache policy updated and all browser caches marked for rebuild."
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
      const dashboardOnly = body.dashboardOnly === true;
      const preferences = body.preferences && typeof body.preferences === "object"
        ? body.preferences
        : {};

      if (!dashboardOnly && (!personName || !dealerName)) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Name and dealer name are required."});
      }

      // Merge incoming preferences with the user's existing preferences instead of
      // replacing the entire JSON object. This prevents fields such as booking
      // contacts from being lost when an older/newer UI sends only part of the
      // preference set.
      const existingPreferences = sessionUser.preferences && typeof sessionUser.preferences === "object"
        ? sessionUser.preferences
        : {};

      // Dashboard autosave is intentionally restricted to dashboard settings.
      // It must never overwrite profile-only fields such as booking contacts.
      const mergedPreferences = dashboardOnly
        ? { ...existingPreferences, ...preferences,
            booking1: existingPreferences.booking1 || "",
            booking2: existingPreferences.booking2 || "" }
        : { ...existingPreferences, ...preferences };

      const updated = dashboardOnly
        ? await client.query(
            "UPDATE app_users SET preferences=$1::jsonb WHERE id=$2 RETURNING *",
            [JSON.stringify(mergedPreferences),sessionUser.id]
          )
        : await client.query(
            "UPDATE app_users SET person_name=$1,dealer_name=$2,mobile=$3,preferences=$4::jsonb WHERE id=$5 RETURNING *",
            [personName,dealerName,mobile || null,JSON.stringify(mergedPreferences),sessionUser.id]
          );
      await client.query("COMMIT");
      return res.json({success:true,user:userPayload(updated.rows[0]),message:"Profile and preferences saved."});
    }

    if (action === "list-customer-companies") {
      await client.query("INSERT INTO customer_companies(name,normalized_name) SELECT DISTINCT TRIM(customer_name),LOWER(REGEXP_REPLACE(TRIM(customer_name),'[[:space:]]+',' ','g')) FROM vehicles WHERE NULLIF(TRIM(customer_name),'') IS NOT NULL ON CONFLICT(normalized_name) DO NOTHING");
      const result = await client.query("SELECT id,name FROM customer_companies ORDER BY name ASC LIMIT 5000");
      await client.query("COMMIT");
      return res.json({success:true,companies:result.rows});
    }

    if (action === "request-account") {
      const personName = clean(body.personName);
      const userType = body.userType === "al_customer" ? "al_customer" : "al_internal";
      const dealerName = clean(body.dealerName);
      const email = normalizeEmail(body.email);
      const mobile = normalizeMobile(body.mobile);
      const referralCode = "";
      const companyIds = Array.isArray(body.companyIds) ? [...new Set(body.companyIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))] : [];
      if (!personName || !dealerName || !/^\S+@\S+\.\S+$/.test(email) || mobile.replace(/\D/g, "").length < 10) {
        await client.query("ROLLBACK");
        return res.status(400).json({success:false,error:"Name, transport/dealer name, valid email and mobile number are required."});
      }
      if (userType === "al_customer" && companyIds.length) {
        const validCompanies = await client.query("SELECT COUNT(*)::int AS count FROM customer_companies WHERE id = ANY($1::bigint[])",[companyIds]);
        if (Number(validCompanies.rows[0]?.count || 0) !== companyIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({success:false,error:"One or more selected companies are invalid. Refresh the company list and try again."});
        }
      }
      const existing = await client.query("SELECT id FROM app_users WHERE lower(email)=lower($1) OR regexp_replace(COALESCE(mobile,''),'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g') LIMIT 1",[email,mobile]);
      if (existing.rows[0]) { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"An account already exists with this email or mobile number."}); }
      const duplicate = await client.query("SELECT id FROM account_requests WHERE (lower(email)=lower($1) OR regexp_replace(mobile,'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g')) AND status='pending' LIMIT 1",[email,mobile]);
      if (duplicate.rows[0]) { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"An account request for this email or mobile is already pending."}); }
      const result = await client.query(
        "INSERT INTO account_requests(person_name,dealer_name,email,mobile,referral_code,user_type,company_ids) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id,created_at",
        [personName,dealerName,email,mobile,referralCode || null,userType,JSON.stringify(userType === "al_customer" ? companyIds : [])]
      );
      await client.query("COMMIT");
      return res.json({success:true,requestId:result.rows[0].id,createdAt:result.rows[0].created_at,message:"Account request submitted successfully. Use your mobile number to check status."});
    }

    if (action === "check-account-request") {
      const mobile = normalizeMobile(body.mobile);
      if (!mobile || mobile.replace(/\D/g, "").length < 10) { await client.query("ROLLBACK"); return res.status(400).json({success:false,error:"Enter the mobile number used for the request or account."}); }
      const request = await client.query("SELECT id,status,created_at FROM account_requests WHERE regexp_replace(COALESCE(mobile,''),'[^0-9]','','g')=regexp_replace($1,'[^0-9]','','g') ORDER BY created_at DESC LIMIT 1",[mobile]);
      if (request.rows[0]) { await client.query("COMMIT"); return res.json({success:true,request:request.rows[0]}); }
      const user = await client.query("SELECT status,created_at FROM app_users WHERE regexp_replace(COALESCE(mobile,''),'[^0-9]','','g')=regexp_replace($1,'[^0-9]','','g') ORDER BY created_at DESC LIMIT 1",[mobile]);
      await client.query("COMMIT");
      if (user.rows[0]) return res.json({success:true,request:{status:user.rows[0].status === "active" ? "approved" : user.rows[0].status,alreadyRegistered:true}});
      return res.status(404).json({success:false,error:"No account request or registered account found for this mobile number."});
    }

    if (action === "admin-list-account-requests") {
      const admin = await requireAdmin(client, req);
      if (admin.error) { await client.query("ROLLBACK"); return res.status(admin.status).json({success:false,error:admin.error}); }
      const result = await client.query("SELECT ar.id,ar.person_name,ar.dealer_name,ar.email,ar.mobile,ar.referral_code,ar.user_type,ar.company_ids,COALESCE(co.company_names,'') AS company_names,ar.status,ar.created_at,ar.reviewed_at FROM account_requests ar LEFT JOIN LATERAL (SELECT string_agg(cc.name, ', ' ORDER BY cc.name) AS company_names FROM jsonb_array_elements_text(ar.company_ids) ids(value) JOIN customer_companies cc ON cc.id=ids.value::bigint) co ON TRUE ORDER BY CASE WHEN ar.status='pending' THEN 0 ELSE 1 END,ar.created_at DESC");
      await client.query("COMMIT");
      return res.json({success:true,requests:result.rows});
    }

    if (action === "admin-review-account-request") {
      const admin = await requireAdmin(client, req);
      if (admin.error) { await client.query("ROLLBACK"); return res.status(admin.status).json({success:false,error:admin.error}); }
      const requestId = Number(body.requestId);
      const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "";
      const password = body.password;
      if (!Number.isInteger(requestId) || !decision || (decision === "approved" && !validPassword(password))) { await client.query("ROLLBACK"); return res.status(400).json({success:false,error:"Approval requires a password of at least 8 characters."}); }
      const found = await client.query("SELECT * FROM account_requests WHERE id=$1 FOR UPDATE",[requestId]);
      if (!found.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({success:false,error:"Account request not found."}); }
      const r = found.rows[0];
      if (r.status !== "pending") { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"This request has already been reviewed."}); }
      let approvedCompanyIds = Array.isArray(r.company_ids) ? r.company_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0) : [];
      if (decision === "approved" && (r.user_type || "al_internal") === "al_customer" && Array.isArray(body.approvedCompanyIds)) {
        approvedCompanyIds = [...new Set(body.approvedCompanyIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
        if (approvedCompanyIds.length) {
          const validCompanies = await client.query("SELECT COUNT(*)::int AS count FROM customer_companies WHERE id = ANY($1::bigint[])",[approvedCompanyIds]);
          if (Number(validCompanies.rows[0]?.count || 0) !== approvedCompanyIds.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({success:false,error:"One or more selected company mappings are invalid. Refresh and try again."});
          }
        }
      }
      if (decision === "approved") {
        const duplicate = await client.query("SELECT id FROM app_users WHERE lower(email)=lower($1) OR regexp_replace(COALESCE(mobile,''),'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g') LIMIT 1",[r.email,r.mobile]);
        if (duplicate.rows[0]) { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"A user already exists with this email/mobile. Review users first."}); }
        const passwordHash = await hashPassword(password);
        const created = await client.query(
          "INSERT INTO app_users(person_name,dealer_name,email,mobile,password_hash,role,status,email_verified,mobile_verified,user_type) VALUES($1,$2,$3,$4,$5,'standard','active',TRUE,TRUE,$6) RETURNING id",
          [r.person_name,r.dealer_name,r.email,r.mobile,passwordHash,r.user_type || "al_internal"]
        );
        if ((r.user_type || "al_internal") === "al_customer") {
          for (const companyId of approvedCompanyIds) {
            await client.query("INSERT INTO customer_user_companies(user_id,company_id) SELECT $1,id FROM customer_companies WHERE id=$2 ON CONFLICT(user_id,company_id) DO NOTHING",[created.rows[0].id,companyId]);
          }
        }
      }
      await client.query("UPDATE account_requests SET status=$1,reviewed_by=$2,reviewed_at=NOW() WHERE id=$3",[decision,admin.user.id,requestId]);
      await logActivity(client,admin.user.id,decision === "approved" ? "Admin Account Approved" : "Admin Account Rejected",{details:{requestId,email:r.email}});
      await client.query("COMMIT");
      return res.json({success:true,message:decision === "approved" ? "Account approved and created." : "Account request rejected."});
    }

    if (action === "customer-portal-data") {
      const user=await getUserByToken(client,authToken(req));
      if(!user){await client.query("ROLLBACK");return res.status(401).json({success:false,error:"Session expired."});}
      if(user.user_type!=="al_customer"){await client.query("ROLLBACK");return res.status(403).json({success:false,error:"Customer portal access required."});}
      const section=String(body.section||"home");
      const wantsFleet=section==="fleet";
      const wantsProfile=section==="profile";
      const wantsDue=section==="due";
      const wantsAccountMeta=wantsFleet||wantsProfile;
      const companies=wantsAccountMeta?await client.query("SELECT cc.id,cc.name FROM customer_user_companies uc JOIN customer_companies cc ON cc.id=uc.company_id WHERE uc.user_id=$1 ORDER BY cc.name",[user.id]):{rows:[]};
      const allCompanies=wantsFleet?await client.query("SELECT id,name FROM customer_companies ORDER BY name LIMIT 5000"):{rows:[]};
      const companyRequests=wantsAccountMeta?await client.query("SELECT r.id,r.company_id,c.name AS company_name,r.status,r.created_at FROM customer_company_requests r JOIN customer_companies c ON c.id=r.company_id WHERE r.user_id=$1 ORDER BY r.created_at DESC",[user.id]):{rows:[]};
      const vehicleRequests=wantsAccountMeta?await client.query("SELECT id,vin,status,created_at FROM customer_vehicle_requests WHERE user_id=$1 ORDER BY created_at DESC",[user.id]):{rows:[]};
      const timestampRequests=(section==="home"||wantsDue||wantsProfile)?await client.query("SELECT r.id,r.vehicle_id,r.vin,r.created_at,v.last_refreshed_at FROM customer_timestamp_update_requests r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.user_id=$1 AND r.status='pending' AND (v.last_refreshed_at IS NULL OR v.last_refreshed_at < r.created_at) ORDER BY r.created_at DESC",[user.id]):{rows:[]};
      const pageSize=500;
      const requestedPage=Number(body.page);
      const page=Number.isSafeInteger(requestedPage)&&requestedPage>=1?Math.min(requestedPage,100000):1;
      const vehicleSearch=clean(body.search).slice(0,100);
      const vehicles=await client.query(`WITH sources AS (
        SELECT v.id,v.vin,v.registration,v.customer_name,v.model,v.engine,v.sale_date,v.last_refreshed_at,'company'::text source_type,cc.id company_id,cc.name source_name
        FROM customer_user_companies uc JOIN customer_companies cc ON cc.id=uc.company_id JOIN vehicles v ON LOWER(REGEXP_REPLACE(TRIM(COALESCE(v.customer_name,'')),'[[:space:]]+',' ','g'))=cc.normalized_name WHERE uc.user_id=$1
        UNION ALL
        SELECT v.id,v.vin,v.registration,v.customer_name,v.model,v.engine,v.sale_date,v.last_refreshed_at,'direct'::text,NULL::bigint,'Direct assignment'::text
        FROM customer_vehicle_access a JOIN vehicles v ON v.id=a.vehicle_id WHERE a.user_id=$1
      ), visible_sources AS (
        SELECT s.* FROM sources s WHERE NOT EXISTS(SELECT 1 FROM customer_hidden_vehicle_sources h WHERE h.user_id=$1 AND h.vehicle_id=s.id AND h.source_type=s.source_type AND COALESCE(h.company_id,0)=COALESCE(s.company_id,0))
      ), uv AS (
        SELECT id,vin,registration,customer_name,model,engine,sale_date,last_refreshed_at,string_agg(DISTINCT source_name,', ' ORDER BY source_name) access_sources,
               json_agg(DISTINCT jsonb_build_object('sourceType',source_type,'companyId',company_id,'sourceName',source_name)) access_source_details
        FROM visible_sources GROUP BY id,vin,registration,customer_name,model,engine,sale_date,last_refreshed_at
      )
      SELECT v.*,COUNT(*) OVER()::int total_visible_vehicles
      FROM uv v
      WHERE ($2::text='' OR v.registration ILIKE '%'||$2||'%' OR v.vin ILIKE '%'||$2||'%' OR v.model ILIKE '%'||$2||'%' OR v.customer_name ILIKE '%'||$2||'%')
      ORDER BY v.registration NULLS LAST,v.vin LIMIT $3 OFFSET $4`,[user.id,vehicleSearch,pageSize,(page-1)*pageSize]);
      const visibleVehicles=vehicles.rows;
      const vehicleIds=visibleVehicles.map(v=>Number(v.id)).filter(Number.isSafeInteger);
      let scheduleRows=[];
      if(vehicleIds.length && wantsDue){
        const history=await client.query(
          `SELECT jc.vehicle_id,jc.job_card_no,jc.job_date,jc.cumulative_reading,jc.cumulative_unit,
                  jc.secondary_cumulative_reading,jc.secondary_cumulative_unit,
                  sh.item_category,sh.part_code,sh.part_description,sh.standardized_part,sh.quantity
           FROM job_cards jc JOIN service_history sh ON sh.job_card_id=jc.id
           WHERE jc.vehicle_id=ANY($1::bigint[])
           ORDER BY jc.job_date ASC NULLS LAST,jc.id ASC,sh.id ASC`,
          [vehicleIds]
        );
        scheduleRows=history.rows;
        const latestReadings=await client.query(
          `SELECT DISTINCT ON (jc.vehicle_id) jc.vehicle_id,jc.job_card_no,jc.job_date,jc.cumulative_reading,jc.cumulative_unit,
                  jc.secondary_cumulative_reading,jc.secondary_cumulative_unit
           FROM job_cards jc WHERE jc.vehicle_id=ANY($1::bigint[])
           ORDER BY jc.vehicle_id,jc.job_date DESC NULLS LAST,jc.id DESC`,
          [vehicleIds]
        );
        for(const row of latestReadings.rows){
          scheduleRows.push({...row,item_category:"",part_code:"",part_description:"",standardized_part:"",quantity:0});
        }
      }
      const scheduleByVehicle=new Map();
      for(const row of scheduleRows){
        const id=Number(row.vehicle_id);
        if(!scheduleByVehicle.has(id))scheduleByVehicle.set(id,[]);
        scheduleByVehicle.get(id).push({
          vin:"",reg:"",customerName:"",engine:"",model:"",sale:null,
          date:row.job_date?new Date(row.job_date):null,
          jobCard:String(row.job_card_no||""),
          cumulative:Number(row.cumulative_reading||0),
          cumulativeUnit:String(row.cumulative_unit||""),
          secondaryCumulativeReading:Number(row.secondary_cumulative_reading||0),
          secondaryCumulativeUnit:String(row.secondary_cumulative_unit||""),
          standardizedPart:String(row.standardized_part||""),
          partDescription:String(row.part_description||""),
          partCode:String(row.part_code||""),
          itemCategory:String(row.item_category||""),
          qty:Number(row.quantity||0),
          repairTypeLine:""
        });
      }
      await client.query("COMMIT");
      return res.json({success:true,companies:companies.rows,allCompanies:allCompanies.rows,companyRequests:companyRequests.rows,vehicleRequests:vehicleRequests.rows,timestampRequests:timestampRequests.rows,pendingTimestampCount:timestampRequests.rows.length,vehicles:visibleVehicles.map(({total_visible_vehicles,...v})=>({
        ...v,
        schedule_history:scheduleByVehicle.get(Number(v.id))||[],
      })),totalVehicles:Number(visibleVehicles[0]?.total_visible_vehicles||0),page,pageSize});
    }
    if(action==="customer-request-timestamp-update"){
      const user=await getUserByToken(client,authToken(req));
      if(!user){await client.query("ROLLBACK");return res.status(401).json({success:false,error:"Session expired."});}
      if(user.user_type!=="al_customer"){await client.query("ROLLBACK");return res.status(403).json({success:false,error:"Customer portal access required."});}
      const vehicleId=Number(body.vehicleId),vin=clean(body.vin).toUpperCase();
      if(!Number.isSafeInteger(vehicleId)||vehicleId<1||!vin){await client.query("ROLLBACK");return res.status(400).json({success:false,error:"Valid vehicle is required."});}
      const access=await client.query("SELECT 1 FROM (SELECT v.id FROM customer_user_companies uc JOIN customer_companies cc ON cc.id=uc.company_id JOIN vehicles v ON LOWER(REGEXP_REPLACE(TRIM(COALESCE(v.customer_name,'')),'[[:space:]]+',' ','g'))=cc.normalized_name WHERE uc.user_id=$1 AND v.id=$2 UNION SELECT vehicle_id FROM customer_vehicle_access WHERE user_id=$1 AND vehicle_id=$2) a LIMIT 1",[user.id,vehicleId]);
      if(!access.rowCount){await client.query("ROLLBACK");return res.status(403).json({success:false,error:"You do not have access to this vehicle."});}
      const freshness=await client.query("SELECT last_refreshed_at, (last_refreshed_at IS NOT NULL AND last_refreshed_at > NOW() - INTERVAL '7 days') AS too_recent FROM vehicles WHERE id=$1 AND UPPER(TRIM(vin))=$2",[vehicleId,vin]);
      if(!freshness.rowCount){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Vehicle not found."});}
      if(freshness.rows[0].too_recent){await client.query("ROLLBACK");return res.status(409).json({success:false,error:"This vehicle was updated within the last 24 hours. A timestamp update request is not needed."});}
      const existing=await client.query("SELECT id FROM customer_timestamp_update_requests WHERE user_id=$1 AND vehicle_id=$2 AND status='pending'",[user.id,vehicleId]);
      if(existing.rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,error:"A timestamp update request is already pending for this vehicle."});}
      await client.query("INSERT INTO customer_timestamp_update_requests(user_id,vehicle_id,vin) VALUES($1,$2,$3)",[user.id,vehicleId,vin]);
      await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id,details) VALUES($1,$1,'customer_requested_timestamp_update','vehicle',$2,$3::jsonb)",[user.id,String(vehicleId),JSON.stringify({vin})]);
      await client.query("COMMIT");return res.json({success:true,message:"Timestamp and service-history update request sent to the administrator."});
    }
    if (action === "customer-remove-company" || action === "customer-request-company" || action === "customer-request-vehicle" || action === "customer-remove-vehicle-source") {
      const user=await getUserByToken(client,authToken(req));
      if(!user){await client.query("ROLLBACK");return res.status(401).json({success:false,error:"Session expired."});}
      if(user.user_type!=="al_customer"){await client.query("ROLLBACK");return res.status(403).json({success:false,error:"Customer portal access required."});}
      if(action==="customer-remove-company"){
        const id=Number(body.companyId);
        const removed=await client.query("DELETE FROM customer_user_companies WHERE user_id=$1 AND company_id=$2 RETURNING company_id",[user.id,id]);
        if(!removed.rowCount){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Company mapping not found."});}
        await client.query("UPDATE customer_company_requests SET status='rejected',reviewed_at=NOW() WHERE user_id=$1 AND company_id=$2 AND status='pending'",[user.id,id]);
        await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id) VALUES($1,$1,'customer_removed_company','company',$2)",[user.id,String(id)]);
        await client.query("COMMIT");return res.json({success:true,message:"Company removed. Other approved access paths remain available."});
      }
      if(action==="customer-request-company"){
        const id=Number(body.companyId);
        if(!Number.isSafeInteger(id)||id<1){await client.query("ROLLBACK");return res.status(400).json({success:false,error:"Select a valid company."});}
        if((await client.query("SELECT 1 FROM customer_companies WHERE id=$1",[id])).rowCount===0){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Company not found."});}
        if((await client.query("SELECT 1 FROM customer_user_companies WHERE user_id=$1 AND company_id=$2",[user.id,id])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,error:"Company already linked."});}
        await client.query("INSERT INTO customer_company_requests(user_id,company_id) VALUES($1,$2) ON CONFLICT(user_id,company_id,status) DO NOTHING",[user.id,id]);
        await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id) VALUES($1,$1,'customer_requested_company','company',$2)",[user.id,String(id)]);
        await client.query("COMMIT");return res.json({success:true,message:"Company link request sent for Super Admin approval."});
      }
      if(action==="customer-request-vehicle"){
        const vin=clean(body.vin).toUpperCase();
        if(!vin||vin.length<8||vin.length>32){await client.query("ROLLBACK");return res.status(400).json({success:false,error:"Enter a valid VIN/chassis number."});}
        const v=await client.query("SELECT id,vin FROM vehicles WHERE UPPER(TRIM(vin))=$1",[vin]);
        if(!v.rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Vehicle not found in the service database. Contact Super Admin to verify the VIN."});}
        const exists=await client.query("SELECT 1 FROM customer_vehicle_access WHERE user_id=$1 AND vehicle_id=$2 UNION SELECT 1 FROM customer_user_companies uc JOIN customer_companies c ON c.id=uc.company_id JOIN vehicles x ON LOWER(REGEXP_REPLACE(TRIM(COALESCE(x.customer_name,'')),'[[:space:]]+',' ','g'))=c.normalized_name WHERE uc.user_id=$1 AND x.id=$2 LIMIT 1",[user.id,v.rows[0].id]);
        if(exists.rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,error:"You already have access to this vehicle."});}
        if((await client.query("SELECT 1 FROM customer_vehicle_requests WHERE user_id=$1 AND UPPER(TRIM(vin))=$2 AND status='pending'",[user.id,vin])).rowCount){await client.query("ROLLBACK");return res.status(409).json({success:false,error:"A request for this VIN is already pending."});}
        await client.query("INSERT INTO customer_vehicle_requests(user_id,vin,vehicle_id) VALUES($1,$2,$3)",[user.id,vin,v.rows[0].id]);
        await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id) VALUES($1,$1,'customer_requested_vehicle','vehicle',$2)",[user.id,vin]);
        await client.query("COMMIT");return res.json({success:true,message:"Vehicle access request sent for Super Admin approval."});
      }
      const vehicleId=Number(body.vehicleId),sourceType=body.sourceType==="direct"?"direct":"company",companyId=sourceType==="company"?Number(body.companyId):null;
      if(!Number.isSafeInteger(vehicleId)||vehicleId<1||(sourceType==="company"&&(!Number.isSafeInteger(companyId)||companyId<1))){await client.query("ROLLBACK");return res.status(400).json({success:false,error:"Valid vehicle access source is required."});}
      const access=sourceType==="direct"?await client.query("SELECT 1 FROM customer_vehicle_access WHERE user_id=$1 AND vehicle_id=$2",[user.id,vehicleId]):await client.query("SELECT 1 FROM customer_user_companies uc JOIN customer_companies cc ON cc.id=uc.company_id JOIN vehicles v ON LOWER(REGEXP_REPLACE(TRIM(COALESCE(v.customer_name,'')),'[[:space:]]+',' ','g'))=cc.normalized_name WHERE uc.user_id=$1 AND uc.company_id=$2 AND v.id=$3",[user.id,companyId,vehicleId]);
      if(!access.rowCount){await client.query("ROLLBACK");return res.status(403).json({success:false,error:"You do not have this access source."});}
      await client.query("INSERT INTO customer_hidden_vehicle_sources(user_id,vehicle_id,source_type,company_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[user.id,vehicleId,sourceType,companyId]);
      if(sourceType==="direct")await client.query("DELETE FROM customer_vehicle_access WHERE user_id=$1 AND vehicle_id=$2",[user.id,vehicleId]);
      await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id,details) VALUES($1,$1,'customer_removed_vehicle_source','vehicle',$2,$3::jsonb)",[user.id,String(vehicleId),JSON.stringify({sourceType,companyId})]);
      await client.query("COMMIT");return res.json({success:true,message:"Vehicle removed from your list. Other approved access paths remain available."});
    }
    if(action==="admin-vehicle-timestamp-list"){
      const admin=await requireAdmin(client,req);if(admin.error){await client.query("ROLLBACK");return res.status(admin.status).json({success:false,error:admin.error});}
      const requestedOffset=Number(body.offset||0);
      const offset=Number.isSafeInteger(requestedOffset)&&requestedOffset>0?Math.min(requestedOffset,10000000):0;
      const rows=await client.query(
        "SELECT vin,last_refreshed_at FROM vehicles WHERE vin IS NOT NULL AND TRIM(vin)<>'' ORDER BY last_refreshed_at ASC NULLS FIRST, UPPER(TRIM(vin)) ASC LIMIT 50 OFFSET $1",
        [offset]
      );
      const count=await client.query("SELECT COUNT(*)::int AS total FROM vehicles WHERE vin IS NOT NULL AND TRIM(vin)<>''");
      await client.query("COMMIT");
      return res.json({success:true,rows:rows.rows,total:Number(count.rows[0]?.total||0),offset,limit:50,hasPrevious:offset>0,hasNext:offset+rows.rows.length<Number(count.rows[0]?.total||0)});
    }
    if(action==="admin-customer-access-data"){
      const admin=await requireAdmin(client,req);if(admin.error){await client.query("ROLLBACK");return res.status(admin.status).json({success:false,error:admin.error});}
      const companyRequests=await client.query("SELECT r.id,r.user_id,u.person_name,u.email,r.company_id,c.name company_name,r.created_at FROM customer_company_requests r JOIN app_users u ON u.id=r.user_id JOIN customer_companies c ON c.id=r.company_id WHERE r.status='pending' ORDER BY r.created_at");
      const vehicleRequests=await client.query("SELECT r.id,r.user_id,u.person_name,u.email,r.vin,r.created_at FROM customer_vehicle_requests r JOIN app_users u ON u.id=r.user_id WHERE r.status='pending' ORDER BY r.created_at");
      const companies=await client.query("SELECT id,name FROM customer_companies ORDER BY name LIMIT 5000");
      const timestampRequests=await client.query("SELECT r.id,r.user_id,u.person_name,u.email,r.vehicle_id,r.vin,r.created_at,v.registration,v.model,v.last_refreshed_at FROM customer_timestamp_update_requests r JOIN app_users u ON u.id=r.user_id JOIN vehicles v ON v.id=r.vehicle_id WHERE r.status='pending' ORDER BY r.created_at");
      const customers=await client.query("SELECT id,person_name,dealer_name,email,status FROM app_users WHERE user_type='al_customer' ORDER BY person_name");
      await client.query("COMMIT");return res.json({success:true,companyRequests:companyRequests.rows,vehicleRequests:vehicleRequests.rows,timestampRequests:timestampRequests.rows,companies:companies.rows,customers:customers.rows});
    }
    if(action==="admin-review-customer-request"){
      const admin=await requireAdmin(client,req);if(admin.error){await client.query("ROLLBACK");return res.status(admin.status).json({success:false,error:admin.error});}
      const type=body.requestType==="vehicle"?"vehicle":"company",id=Number(body.requestId),decision=body.decision==="approve"?"approved":body.decision==="reject"?"rejected":"";
      if(!Number.isSafeInteger(id)||id<1||!decision){await client.query("ROLLBACK");return res.status(400).json({success:false,error:"Valid request and decision are required."});}
      const table=type==="vehicle"?"customer_vehicle_requests":"customer_company_requests";
      const found=await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);
      if(!found.rows[0]||found.rows[0].status!=="pending"){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Pending access request not found."});}
      const r=found.rows[0];
      if(decision==="approved"&&type==="company")await client.query("INSERT INTO customer_user_companies(user_id,company_id) VALUES($1,$2) ON CONFLICT(user_id,company_id) DO NOTHING",[r.user_id,r.company_id]);
      if(decision==="approved"&&type==="vehicle"){
        const v=await client.query("SELECT id FROM vehicles WHERE id=COALESCE($1,(SELECT id FROM vehicles WHERE UPPER(TRIM(vin))=UPPER(TRIM($2)) LIMIT 1))",[r.vehicle_id,r.vin]);
        if(!v.rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Vehicle no longer exists."});}
        await client.query("INSERT INTO customer_vehicle_access(user_id,vehicle_id,granted_by) VALUES($1,$2,$3) ON CONFLICT(user_id,vehicle_id) DO UPDATE SET granted_by=EXCLUDED.granted_by",[r.user_id,v.rows[0].id,admin.user.id]);
        await client.query("DELETE FROM customer_hidden_vehicle_sources WHERE user_id=$1 AND vehicle_id=$2 AND source_type='direct'",[r.user_id,v.rows[0].id]);
      }
      await client.query(`UPDATE ${table} SET status=$1,reviewed_by=$2,reviewed_at=NOW() WHERE id=$3`,[decision,admin.user.id,id]);
      await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[admin.user.id,r.user_id,"admin_"+decision,type,type==="company"?String(r.company_id):r.vin,JSON.stringify({requestId:id})]);
      await client.query("COMMIT");return res.json({success:true,message:decision==="approved"?"Customer access approved.":"Customer access request rejected."});
    }
    if(action==="admin-assign-customer-vehicle"){
      const admin=await requireAdmin(client,req);if(admin.error){await client.query("ROLLBACK");return res.status(admin.status).json({success:false,error:admin.error});}
      const userId=Number(body.userId),vin=clean(body.vin).toUpperCase();
      if(!Number.isSafeInteger(userId)||userId<1||!vin){await client.query("ROLLBACK");return res.status(400).json({success:false,error:"Select customer and enter VIN."});}
      const target=await client.query("SELECT id FROM app_users WHERE id=$1 AND user_type='al_customer'",[userId]),v=await client.query("SELECT id,vin FROM vehicles WHERE UPPER(TRIM(vin))=$1",[vin]);
      if(!target.rows[0]||!v.rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,error:"Customer or vehicle not found."});}
      await client.query("INSERT INTO customer_vehicle_access(user_id,vehicle_id,granted_by) VALUES($1,$2,$3) ON CONFLICT(user_id,vehicle_id) DO UPDATE SET granted_by=EXCLUDED.granted_by",[userId,v.rows[0].id,admin.user.id]);
      await client.query("DELETE FROM customer_hidden_vehicle_sources WHERE user_id=$1 AND vehicle_id=$2 AND source_type='direct'",[userId,v.rows[0].id]);
      await client.query("INSERT INTO customer_access_audit(actor_user_id,target_user_id,action,entity_type,entity_id) VALUES($1,$2,'admin_direct_vehicle_assignment','vehicle',$3)",[admin.user.id,userId,vin]);
      await client.query("COMMIT");return res.json({success:true,message:"Vehicle assigned to customer."});
    }

    if (action === "my-referrals") {
      const user = await getUserByToken(client, authToken(req));
      if (!user) { await client.query("ROLLBACK"); return res.status(401).json({success:false,error:"Session expired."}); }
      const result = await client.query("SELECT COUNT(*)::int AS total FROM user_referrals WHERE referrer_user_id=$1",[user.id]);
      await client.query("COMMIT");
      return res.json({success:true,referralCode:String(user.email || "").split("@")[0].toUpperCase(),referralCount:Number(result.rows[0]?.total || 0)});
    }

    if (action === "admin-list-users") {
      const admin = await requireAdmin(client, req);
      if (admin.error) {
        await client.query("ROLLBACK");
        return res.status(admin.status).json({success:false,error:admin.error});
      }

      const users = await client.query(
        `SELECT id,person_name,dealer_name,email,mobile,role,status,user_type,created_at,last_login_at,last_activity_at
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
        "UPDATE app_users SET password_hash=$1,email_verified=TRUE,mobile_verified=TRUE WHERE id=$2 RETURNING *",
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

      // Manual reactivation must also reset the inactivity clock. Otherwise
      // autoDeactivateInactiveUsers() runs on the next API request and immediately
      // marks this account inactive again using its old last_activity_at value.
      const updated = status === "active"
        ? await client.query(
            "UPDATE app_users SET status='active',last_activity_at=NOW() WHERE id=$1 RETURNING *",
            [userId]
          )
        : await client.query(
            "UPDATE app_users SET status='inactive' WHERE id=$1 RETURNING *",
            [userId]
          );
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
