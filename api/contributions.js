import crypto from "crypto";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL1,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle: true,
});

const clean = (v) => String(v ?? "").trim();
const normVin = (v) => clean(v).toUpperCase();
const hash = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const monthStart = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  return `${year}-${month}-01`;
};
const nextMonthStart = (s) => { const [y,m] = s.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0,10); };
const monthEnd = (s) => { const [y,m] = s.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0,10); };

async function auth(client, req) {
  const token = clean(req.headers?.authorization).replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await client.query(
    `SELECT u.id,u.role,u.status,u.mobile,u.person_name,u.email,s.last_seen_at
       FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'
      LIMIT 1`, [hash(token)]);
  if (!r.rows[0]) return null;
  const seen = r.rows[0].last_seen_at ? new Date(r.rows[0].last_seen_at).getTime() : 0;
  if (!seen || Date.now() - seen > 12 * 60 * 60 * 1000) {
    await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hash(token)]);
    return null;
  }
  return r.rows[0];
}

async function ensureSchema(client) {
  // Idempotent runtime bootstrap; does not change existing account status.
  await client.query(`
    CREATE TABLE IF NOT EXISTS contribution_months (
      month_start DATE PRIMARY KEY, month_end DATE NOT NULL,
      target_points INTEGER NOT NULL DEFAULT 50 CHECK(target_points=50),
      free_month BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(month_end>=month_start)
    );
    CREATE TABLE IF NOT EXISTS contribution_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), assigned_user_id BIGINT REFERENCES app_users(id),
      status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','Assigned','Submitted','Processing','Completed','Failed','Cancelled','Expired')),
      vehicle_vins TEXT[] NOT NULL, assigned_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
      last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(cardinality(vehicle_vins)=50), CHECK(array_position(vehicle_vins,NULL) IS NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_contribution_tasks_user_status ON contribution_tasks(assigned_user_id,status);
    CREATE INDEX IF NOT EXISTS idx_contribution_tasks_expiry ON contribution_tasks(expires_at) WHERE status IN ('Assigned','Submitted','Processing');
    CREATE TABLE IF NOT EXISTS contribution_task_vehicles (
      task_id UUID NOT NULL REFERENCES contribution_tasks(id) ON DELETE CASCADE, vin TEXT NOT NULL,
      PRIMARY KEY(task_id,vin)
    );
    CREATE TABLE IF NOT EXISTS contribution_vehicle_reservations (
      vin TEXT PRIMARY KEY, task_id UUID NOT NULL REFERENCES contribution_tasks(id) ON DELETE CASCADE,
      reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(task_id,vin)
    );
    CREATE TABLE IF NOT EXISTS contribution_points_ledger (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES app_users(id),
      month_start DATE NOT NULL REFERENCES contribution_months(month_start), task_id UUID REFERENCES contribution_tasks(id),
      entry_type TEXT NOT NULL CHECK(entry_type IN ('earned','donated','received','used_for_eligibility','expired','admin_adjustment')),
      points INTEGER NOT NULL CHECK(points>0), transfer_id UUID, idempotency_key TEXT NOT NULL UNIQUE,
      note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_contribution_ledger_user_month ON contribution_points_ledger(user_id,month_start);
    CREATE TABLE IF NOT EXISTS contribution_donations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sender_user_id BIGINT NOT NULL REFERENCES app_users(id),
      receiver_user_id BIGINT NOT NULL REFERENCES app_users(id), points INTEGER NOT NULL CHECK(points>0),
      month_start DATE NOT NULL REFERENCES contribution_months(month_start), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(sender_user_id<>receiver_user_id)
    );
    DO $do$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_contribution_ledger_transfer') THEN
        ALTER TABLE contribution_points_ledger ADD CONSTRAINT fk_contribution_ledger_transfer
        FOREIGN KEY(transfer_id) REFERENCES contribution_donations(id);
      END IF;
    END $do$;
    CREATE TABLE IF NOT EXISTS contribution_notifications (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES app_users(id),
      month_start DATE NOT NULL REFERENCES contribution_months(month_start), notification_type TEXT NOT NULL,
      sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id,month_start,notification_type)
    );
    INSERT INTO contribution_months(month_start,month_end,target_points,free_month)
    VALUES(DATE '2026-11-01',DATE '2026-11-30',50,TRUE)
    ON CONFLICT(month_start) DO UPDATE SET month_end=EXCLUDED.month_end,target_points=50,free_month=TRUE;
  `);
}

async function dashboard(client, user) {
  const ms = monthStart();
  await client.query(
    `INSERT INTO contribution_months(month_start,month_end,target_points,free_month)
     VALUES($1,$2,50,FALSE) ON CONFLICT(month_start) DO NOTHING`, [ms, monthEnd(ms)]);
  const month = (await client.query("SELECT * FROM contribution_months WHERE month_start=$1", [ms])).rows[0];
  const earned = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN entry_type IN ('earned','received','admin_adjustment') THEN points
       WHEN entry_type IN ('donated','used_for_eligibility','expired') THEN -points ELSE 0 END),0)::int AS balance,
       COALESCE(SUM(CASE WHEN entry_type='earned' THEN points ELSE 0 END),0)::int AS earned
       FROM contribution_points_ledger WHERE user_id=$1 AND month_start=$2`, [user.id, ms]);
  const points = Number(earned.rows[0]?.earned || 0);
  const balance = Number(earned.rows[0]?.balance || 0);
  const previousMonth = new Date(Date.UTC(Number(ms.slice(0,4)), Number(ms.slice(5,7))-1, 1)); previousMonth.setUTCMonth(previousMonth.getUTCMonth()-1); const prevMs = previousMonth.toISOString().slice(0,10);
  const previousBalanceResult = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN entry_type IN ('earned','received','admin_adjustment') THEN points WHEN entry_type IN ('donated','used_for_eligibility','expired') THEN -points ELSE 0 END),0)::int AS balance FROM contribution_points_ledger WHERE user_id=$1 AND month_start=$2`, [user.id, prevMs]);
  const eligibilityBalance = Number(previousBalanceResult.rows[0]?.balance || 0);
  const eligible = user.role === "admin" || month.free_month || eligibilityBalance >= 50;
  const task = await client.query(
    `SELECT id,status,vehicle_vins,assigned_at,expires_at,submitted_at,completed_at,attempt_count
       FROM contribution_tasks WHERE assigned_user_id=$1 AND status IN ('Assigned','Submitted','Processing','Failed','Expired')
       ORDER BY created_at DESC LIMIT 1`, [user.id]);
  const next = nextMonthStart(ms);
  const prior = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN entry_type IN ('earned','received','admin_adjustment') THEN points
      WHEN entry_type IN ('donated','used_for_eligibility','expired') THEN -points ELSE 0 END),0)::int AS balance
     FROM contribution_points_ledger WHERE user_id=$1 AND month_start=$2`, [user.id, next]);
  return { monthStart: ms, monthEnd: month.month_end, freeMonth: month.free_month, target: 50, earnedPoints: points,
    availablePoints: balance, eligible, adminExempt: user.role === "admin", nextMonthStart: next,
    nextMonthBalance: Number(prior.rows[0]?.balance || 0), activeTask: task.rows[0] || null };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success:false, error:"POST required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSchema(client);
    const user = await auth(client, req);
    if (!user) { await client.query("ROLLBACK"); return res.status(401).json({success:false,error:"Session expired. Please sign in again."}); }
    const body = req.body || {};
    const action = clean(body.action);
    const ms = monthStart();

    if (action === "dashboard") {
      const data = await dashboard(client, user);
      await client.query("COMMIT");
      return res.json({success:true,...data});
    }

    if (action === "assign-task") {
      if (user.role !== "admin") {
        const d = await dashboard(client, user);
        if (!d.eligible) { await client.query("ROLLBACK"); return res.status(403).json({success:false,error:"Next month ke liye 50 points complete karna zaroori hai.",dashboard:d}); }
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext('contribution-task-queue'))");
      await client.query(`UPDATE contribution_tasks SET status='Expired'
        WHERE status IN ('Assigned','Submitted') AND expires_at<NOW()`);
      await client.query(`DELETE FROM contribution_vehicle_reservations r USING contribution_tasks t
        WHERE r.task_id=t.id AND t.status IN ('Expired','Cancelled','Completed','Failed')`);
      const existing = await client.query(`SELECT id,status,vehicle_vins,assigned_at,expires_at FROM contribution_tasks
        WHERE assigned_user_id=$1 AND status IN ('Assigned','Submitted','Processing') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [user.id]);
      if (existing.rows[0]) { await client.query("COMMIT"); return res.json({success:true,task:existing.rows[0],existing:true}); }
      const vehicles = await client.query(`SELECT v.vin FROM vehicles v
        WHERE NULLIF(TRIM(v.vin),'') IS NOT NULL
          AND v.last_refreshed_at IS NOT NULL AND v.last_refreshed_at <= NOW()-INTERVAL '7 days'
          AND NOT EXISTS(SELECT 1 FROM contribution_vehicle_reservations r WHERE UPPER(TRIM(r.vin))=UPPER(TRIM(v.vin)))
        ORDER BY v.last_refreshed_at ASC NULLS FIRST, v.vin ASC
        LIMIT 1000`);
      const eligible = [];
      const seen = new Set();
      for (const row of vehicles.rows) { const vin=normVin(row.vin); if(vin && !seen.has(vin)){seen.add(vin);eligible.push(vin);} if(eligible.length===50)break; }
      if (eligible.length < 50) { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:`Abhi sirf ${eligible.length} eligible vehicles available hain; 50 hone par task milega.`}); }
      const task = (await client.query(`INSERT INTO contribution_tasks(assigned_user_id,status,vehicle_vins,assigned_at,expires_at)
        VALUES($1,'Assigned',$2,NOW(),NOW()+INTERVAL '60 minutes') RETURNING id,status,vehicle_vins,assigned_at,expires_at`, [user.id,eligible])).rows[0];
      for (const vin of eligible) {
        await client.query("INSERT INTO contribution_task_vehicles(task_id,vin) VALUES($1,$2) ON CONFLICT DO NOTHING",[task.id,vin]);
        await client.query("INSERT INTO contribution_vehicle_reservations(vin,task_id) VALUES($1,$2)",[vin,task.id]);
      }
      await client.query("COMMIT");
      return res.json({success:true,task,existing:false});
    }

    if (action === "cancel-task" || action === "retry-task") {
      const taskId = clean(body.taskId);
      const task = await client.query("SELECT * FROM contribution_tasks WHERE id=$1 AND assigned_user_id=$2 FOR UPDATE",[taskId,user.id]);
      if (!task.rows[0] || !["Assigned","Submitted","Failed","Expired"].includes(task.rows[0].status)) {
        await client.query("ROLLBACK"); return res.status(404).json({success:false,error:"Active task not found."});
      }
      if (action === "cancel-task") {
        await client.query("UPDATE contribution_tasks SET status='Cancelled' WHERE id=$1",[taskId]);
        await client.query("DELETE FROM contribution_vehicle_reservations WHERE task_id=$1",[taskId]);
        await client.query("COMMIT"); return res.json({success:true,status:"Cancelled"});
      }
      if (Number(task.rows[0].attempt_count)>=3) { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"Is task ke 3 attempts complete ho chuke hain."}); }
      if (action === "retry-task" && !["Failed","Expired"].includes(task.rows[0].status) && new Date(task.rows[0].expires_at).getTime() > Date.now()) {
        await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"Active task ko retry nahi kar sakte. Pehle task expire hone dein ya cancel karein."});
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext('contribution-task-queue'))");
      await client.query("DELETE FROM contribution_vehicle_reservations WHERE task_id=$1",[taskId]);
      try {
        for (const rawVin of task.rows[0].vehicle_vins || []) {
          await client.query("INSERT INTO contribution_vehicle_reservations(vin,task_id) VALUES($1,$2)",[normVin(rawVin),taskId]);
        }
      } catch (reservationError) {
        await client.query("ROLLBACK");
        return res.status(409).json({success:false,error:"Is task ke kuch VIN kisi doosre active task mein reserve ho chuke hain. Naya task lein."});
      }
      await client.query("UPDATE contribution_tasks SET status='Assigned',assigned_at=NOW(),expires_at=NOW()+INTERVAL '60 minutes',submitted_at=NULL,last_error=NULL,attempt_count=attempt_count+1 WHERE id=$1",[taskId]);
      await client.query("COMMIT"); return res.json({success:true,status:"Assigned",expiresInSeconds:3600});
    }

    if (action === "submit-task") {
      const taskId = clean(body.taskId);
      const taskResult = await client.query("SELECT * FROM contribution_tasks WHERE id=$1 AND assigned_user_id=$2 FOR UPDATE",[taskId,user.id]);
      const task = taskResult.rows[0];
      if (!task || task.status !== "Assigned") { await client.query("ROLLBACK"); return res.status(404).json({success:false,error:"Assigned task not found."}); }
      if (new Date(task.expires_at).getTime() <= Date.now()) {
        await client.query("UPDATE contribution_tasks SET status='Expired',last_error='60-minute timer expired' WHERE id=$1",[taskId]);
        await client.query("DELETE FROM contribution_vehicle_reservations WHERE task_id=$1",[taskId]);
        await client.query("COMMIT"); return res.status(410).json({success:false,error:"60-minute task timer expire ho gaya."});
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const vins = [...new Set(rows.map(r=>normVin(r?.vin || r?.VIN || r?.chassis || r?.["Chassis Number"])).filter(Boolean))];
      const assigned = new Set((task.vehicle_vins || []).map(normVin));
      if (vins.length !== 50 || assigned.size !== 50 || vins.some(v=>!assigned.has(v))) {
        await client.query("UPDATE contribution_tasks SET status='Failed',last_error='Submitted VIN set did not match assigned 50 VINs' WHERE id=$1",[taskId]);
        await client.query("DELETE FROM contribution_vehicle_reservations WHERE task_id=$1",[taskId]);
        await client.query("COMMIT"); return res.status(400).json({success:false,error:"Excel mein assigned task ke exactly 50 unique VINs hone chahiye. Task failed; retry kar sakte ho."});
      }
      // Points are awarded only if every assigned VIN has stored service history.
      const verified = await client.query(`SELECT COUNT(DISTINCT UPPER(TRIM(v.vin)))::int AS n
        FROM vehicles v WHERE UPPER(TRIM(v.vin))=ANY($1::text[])
        AND EXISTS(SELECT 1 FROM job_cards j WHERE j.vehicle_id=v.id)`, [task.vehicle_vins.map(normVin)]);
      if (Number(verified.rows[0]?.n || 0) !== 50) {
        await client.query("UPDATE contribution_tasks SET status='Failed',last_error='Not all 50 VINs have saved Job Card history' WHERE id=$1",[taskId]);
        await client.query("DELETE FROM contribution_vehicle_reservations WHERE task_id=$1",[taskId]);
        await client.query("COMMIT"); return res.status(422).json({success:false,error:"50 mein se sabhi VIN ki Job Card history database mein verify nahi hui. Points nahi mile; upload sahi karke retry karein."});
      }
      await client.query("UPDATE contribution_tasks SET status='Completed',submitted_at=NOW(),completed_at=NOW(),last_error=NULL WHERE id=$1",[taskId]);
      await client.query("DELETE FROM contribution_vehicle_reservations WHERE task_id=$1",[taskId]);
      await client.query(`INSERT INTO contribution_points_ledger(user_id,month_start,task_id,entry_type,points,idempotency_key,note)
        VALUES($1,$2,$3,'earned',1,$4,'Verified 50-VIN contribution task')
        ON CONFLICT(idempotency_key) DO NOTHING`,[user.id,ms,taskId,`task:${taskId}:earned`]);
      const data = await dashboard(client,user);
      await client.query("COMMIT");
      return res.json({success:true,status:"Completed",pointsAwarded:1,dashboard:data});
    }

    if (action === "donate-points") {
      const receiverMobile = clean(body.mobile).replace(/\D/g,"").replace(/^91(?=\d{10}$)/,"");
      const points = Number(body.points);
      if (!/^\d{10}$/.test(receiverMobile) || !Number.isInteger(points) || points<1 || points>50) {
        await client.query("ROLLBACK"); return res.status(400).json({success:false,error:"Registered 10-digit mobile aur valid points enter karein."});
      }
      const receiver = await client.query("SELECT id FROM app_users WHERE regexp_replace(COALESCE(mobile,''),'\D','','g') IN ($1,$2) AND status='active' LIMIT 1",[receiverMobile,`91${receiverMobile}`]);
      if (!receiver.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({success:false,error:"Is mobile se active registered account nahi mila."}); }
      if (String(receiver.rows[0].id)===String(user.id)) { await client.query("ROLLBACK"); return res.status(400).json({success:false,error:"Apne account ko points donate nahi kar sakte."}); }
      const d = await dashboard(client,user);
      if (d.availablePoints < points) { await client.query("ROLLBACK"); return res.status(409).json({success:false,error:"Itne available points nahi hain."}); }
      const donation = (await client.query("INSERT INTO contribution_donations(sender_user_id,receiver_user_id,points,month_start) VALUES($1,$2,$3,$4) RETURNING id",[user.id,receiver.rows[0].id,points,ms])).rows[0];
      await client.query("INSERT INTO contribution_points_ledger(user_id,month_start,entry_type,points,transfer_id,idempotency_key,note) VALUES($1,$2,'donated',$3,$4,$5,'Points donated')",[user.id,ms,points,donation.id,`donation:${donation.id}:sender`]);
      await client.query("INSERT INTO contribution_points_ledger(user_id,month_start,entry_type,points,transfer_id,idempotency_key,note) VALUES($1,$2,'received',$3,$4,$5,'Points received')",[receiver.rows[0].id,ms,points,donation.id,`donation:${donation.id}:receiver`]);
      await client.query("COMMIT"); return res.json({success:true,message:`${points} point(s) successfully donated.`});
    }

    await client.query("ROLLBACK");
    return res.status(400).json({success:false,error:"Unknown contribution action."});
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Contribution API:",err);
    return res.status(500).json({success:false,error:"Contribution service failed. Please retry."});
  } finally { client.release(); }
}
