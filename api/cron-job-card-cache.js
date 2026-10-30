import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL1 || "";
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 8000,
});

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || "");
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, error: "Unauthorized cron request." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT setting_value FROM app_settings WHERE setting_key='job_card_cache' LIMIT 1 FOR UPDATE"
    );
    const current = result.rows[0]?.setting_value || {
      enabled: true, intervalHours: 24, version: 1,
      lastRebuildAt: null, lastAutoRebuildAt: null
    };

    const now = new Date();
    const intervalHours = Math.max(1, Number(current.intervalHours || 24));
    const lastRebuildMs = current.lastRebuildAt ? new Date(current.lastRebuildAt).getTime() : 0;
    const due = current.enabled !== false && (!lastRebuildMs || now.getTime() >= lastRebuildMs + intervalHours * 3600000);

    if (!due) {
      const nextRebuildAt = lastRebuildMs
        ? new Date(lastRebuildMs + intervalHours * 3600000).toISOString()
        : null;
      await client.query("COMMIT");
      return res.status(200).json({ success: true, rebuilt: false, reason: current.enabled === false ? "cache_disabled" : "not_due", nextRebuildAt });
    }

    const countResult = await client.query(
      "SELECT COUNT(DISTINCT UPPER(TRIM(job_card_no)))::int AS count FROM job_cards WHERE job_card_no IS NOT NULL AND TRIM(job_card_no)<>''"
    );
    const completedAt = now.toISOString();
    const updated = {
      ...current,
      enabled: current.enabled !== false,
      intervalHours,
      version: Number(current.version || 0) + 1,
      lastRebuildAt: completedAt,
      lastAutoRebuildAt: completedAt,
      lastAutoRebuildError: null,
      cachedJobCards: Number(countResult.rows[0]?.count || 0)
    };
    await client.query(
      "INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ('job_card_cache',$1::jsonb,NOW()) ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",
      [JSON.stringify(updated)]
    );
    await client.query("COMMIT");
    return res.status(200).json({
      success: true, rebuilt: true, completedAt,
      nextRebuildAt: new Date(now.getTime() + intervalHours * 3600000).toISOString(),
      cachedJobCards: updated.cachedJobCards,
      version: updated.version
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Job Card cache scheduled refresh failed:", error);
    return res.status(500).json({ success: false, error: "Scheduled cache refresh failed." });
  } finally {
    client.release();
  }
}
