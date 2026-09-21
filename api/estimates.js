import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL1,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const INACTIVITY_HOURS = 12;

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function authToken(req) {
  return clean(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS saved_estimates (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      estimate_no TEXT NOT NULL,
      vehicle_no TEXT NOT NULL DEFAULT '',
      vehicle_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      selected_services JSONB NOT NULL DEFAULT '[]'::jsonb,
      parts JSONB NOT NULL DEFAULT '[]'::jsonb,
      labour JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, estimate_no)
    );
    CREATE INDEX IF NOT EXISTS idx_saved_estimates_user_updated
      ON saved_estimates(user_id, updated_at DESC);
  `);
}

async function getCurrentUser(client, req) {
  const token = authToken(req);
  if (!token) return null;
  const tokenHash = hashValue(token);
  const result = await client.query(
    `SELECT u.id,u.status
       FROM auth_sessions s
       JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1
        AND s.expires_at>NOW()
        AND s.last_seen_at >= NOW() - INTERVAL '12 hours'
        AND u.status='active'
      LIMIT 1`,
    [tokenHash]
  );
  if (!result.rows[0]) return null;

  await client.query(
    "UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1",
    [tokenHash]
  );
  await client.query(
    "UPDATE app_users SET last_activity_at=NOW() WHERE id=$1",
    [result.rows[0].id]
  );
  return result.rows[0];
}

function jsonValue(value, fallback) {
  return value === undefined || value === null ? fallback : value;
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

    const user = await getCurrentUser(client, req);
    if (!user) {
      await client.query("ROLLBACK");
      return res.status(401).json({ success:false, error:"Session expired." });
    }

    if (action === "list") {
      const result = await client.query(
        `SELECT id,estimate_no,vehicle_no,updated_at,created_at
           FROM saved_estimates
          WHERE user_id=$1
          ORDER BY updated_at DESC, id DESC
          LIMIT 200`,
        [user.id]
      );
      await client.query("COMMIT");
      return res.json({ success:true, estimates:result.rows });
    }

    if (action === "get") {
      const id = Number(body.id || 0);
      if (!Number.isInteger(id) || id <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success:false, error:"Invalid estimate ID." });
      }

      const result = await client.query(
        `SELECT id,estimate_no,vehicle_no,vehicle_data,selected_services,parts,labour,created_at,updated_at
           FROM saved_estimates
          WHERE id=$1 AND user_id=$2
          LIMIT 1`,
        [id, user.id]
      );

      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success:false, error:"Saved estimate not found." });
      }

      await client.query("COMMIT");
      return res.json({ success:true, estimate:result.rows[0] });
    }

    if (action === "save") {
      const estimateNo = clean(body.estimateNo);
      const vehicleNo = clean(body.vehicleNo).replace(/\s+/g, "").toUpperCase();
      if (!estimateNo) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success:false, error:"Estimate number is required." });
      }

      const result = await client.query(
        `INSERT INTO saved_estimates
          (user_id,estimate_no,vehicle_no,vehicle_data,selected_services,parts,labour,updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,NOW())
         ON CONFLICT (user_id,estimate_no)
         DO UPDATE SET
           vehicle_no=EXCLUDED.vehicle_no,
           vehicle_data=EXCLUDED.vehicle_data,
           selected_services=EXCLUDED.selected_services,
           parts=EXCLUDED.parts,
           labour=EXCLUDED.labour,
           updated_at=NOW()
         RETURNING id,estimate_no,vehicle_no,vehicle_data,selected_services,parts,labour,created_at,updated_at`,
        [
          user.id,
          estimateNo,
          vehicleNo,
          JSON.stringify(jsonValue(body.vehicle, {})),
          JSON.stringify(jsonValue(body.selectedServices, [])),
          JSON.stringify(jsonValue(body.parts, [])),
          JSON.stringify(jsonValue(body.labour, [])),
        ]
      );

      await client.query("COMMIT");
      return res.json({ success:true, estimate:result.rows[0] });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ success:false, error:"Invalid estimate action." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("saved estimates error", error);
    return res.status(500).json({ success:false, error:error.message || "Saved estimate request failed." });
  } finally {
    client.release();
  }
}
