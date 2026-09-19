
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

function clean(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return value;
}

function normalizeDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeRecord(record = {}) {
  const normalized = { ...record };
  for (const field of ["date", "inwardDate", "checkInDate", "startDate", "endDate"]) {
    if (normalized[field]) normalized[field] = normalizeDate(normalized[field]);
  }
  return normalized;
}

function normalizeVehicle(vehicle = {}) {
  return { ...vehicle, registration: vehicle.registration || vehicle.reg || "", sale: normalizeDate(vehicle.sale) };
}

function normalizeAmount(record = {}) {
  const direct = record?.amount;
  if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
    const n = Number(String(direct).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // Backend fallback for future/import variants where the amount header is
  // preserved inside rawFields but the normalized field was not populated.
  const raw = record?.rawFields || {};
  const keys = Object.keys(raw);
  const preferred = [
    "amount",
    "net amount",
    "line amount",
    "item amount",
    "labour amount",
    "part amount",
    "net value",
    "line value",
  ];

  for (const wanted of preferred) {
    const key = keys.find((candidate) =>
      candidate === wanted || candidate.startsWith(wanted + "__")
    );
    if (!key) continue;
    const value = String(raw[key] ?? "").trim();
    if (!value) continue;
    const n = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const records = Array.isArray(body.records) ? body.records : [];
  const vehicle = normalizeVehicle(body.vehicle || {});
  const recordsNormalized = records.map(normalizeRecord);
  const vin = String(vehicle.vin || vehicle.chassis || "").trim().toUpperCase();

  if (!vin) return res.status(400).json({ success: false, error: "VIN/Chassis is required for database storage." });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Add the new line-level amount field automatically for the existing
    // production table. Existing history remains valid with NULL amounts.
    await client.query(
      "ALTER TABLE service_history ADD COLUMN IF NOT EXISTS amount NUMERIC"
    );

    const vehicleResult = await client.query(
      "INSERT INTO vehicles (vin,registration,customer_number,customer_name,engine,model,sale_date,last_refreshed_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) " +
      "ON CONFLICT (vin) DO UPDATE SET " +
      "registration=COALESCE(EXCLUDED.registration,vehicles.registration), " +
      "customer_number=COALESCE(EXCLUDED.customer_number,vehicles.customer_number), " +
      "customer_name=COALESCE(EXCLUDED.customer_name,vehicles.customer_name), " +
      "engine=COALESCE(EXCLUDED.engine,vehicles.engine), " +
      "model=COALESCE(EXCLUDED.model,vehicles.model), " +
      "sale_date=COALESCE(EXCLUDED.sale_date,vehicles.sale_date), " +
      "last_refreshed_at=NOW() RETURNING id",
      [vin, clean(vehicle.registration), clean(vehicle.customerNumber), clean(vehicle.customerName),
       clean(vehicle.engine), clean(vehicle.model), clean(vehicle.sale)]
    );

    const vehicleId = vehicleResult.rows[0].id;
    const jobCards = new Map();

    for (const record of recordsNormalized) {
      const jobCardNo = String(record.jobCard || record.jobCardNo || "").trim();
      if (!jobCardNo) continue;
      if (!jobCards.has(jobCardNo)) jobCards.set(jobCardNo, []);
      jobCards.get(jobCardNo).push(record);
    }

    const jobCardNumbers = [...jobCards.keys()];
    let existing = new Set();

    if (jobCardNumbers.length) {
      const existingResult = await client.query(
        "SELECT job_card_no FROM job_cards WHERE vehicle_id=$1 AND job_card_no=ANY($2::text[])",
        [vehicleId, jobCardNumbers]
      );
      existing = new Set(existingResult.rows.map((row) => row.job_card_no));
    }

    const newJobCardRows = [];
    for (const [jobCardNo, lines] of jobCards) {
      if (existing.has(jobCardNo)) continue;
      const first = lines[0];
      newJobCardRows.push([
        vehicleId, jobCardNo,
        clean(first.invoice || first.invoiceNo || first.billingDocument),
        clean(first.date), clean(first.reading), clean(first.readingUnit || first.unit),
        clean(first.cumulative), clean(first.cumulativeUnit),
        clean(first.secondaryReading), clean(first.secondaryUnit),
        clean(first.secondaryCumulative), clean(first.secondaryCumulativeUnit),
        clean(first.inwardDate || first.inward), clean(first.checkInDate),
        clean(first.startDate), clean(first.endDate)
      ]);
    }

    const insertedJobCards = [];
    if (newJobCardRows.length) {
      const values = [];
      const placeholders = newJobCardRows.map((row) => {
        const p = row.map((value) => { values.push(value); return "__P__values.length__"; });
        return "(" + p.join(",") + ")";
      }).map((p) => p.replace(/"__P__values\.length__"/g, ""));
      // Rebuild placeholders with PostgreSQL parameter numbers.
      let n = 0;
      const finalPlaceholders = newJobCardRows.map((row) => {
        return "(" + row.map(() => "$" + (++n)).join(",") + ")";
      });

      const result = await client.query(
        "INSERT INTO job_cards " +
        "(vehicle_id,job_card_no,invoice_no,job_date,reading,reading_unit,cumulative_reading,cumulative_unit," +
        "secondary_reading,secondary_unit,secondary_cumulative_reading,secondary_cumulative_unit,inward_date,check_in_date,start_date,end_date) " +
        "VALUES " + finalPlaceholders.join(",") +
        " ON CONFLICT (vehicle_id,job_card_no) DO NOTHING RETURNING id,job_card_no",
        values
      );
      insertedJobCards.push(...result.rows);
    }

    const insertedMap = new Map(insertedJobCards.map((row) => [row.job_card_no, row.id]));
    const serviceRows = [];

    for (const [jobCardNo, lines] of jobCards) {
      const jobCardId = insertedMap.get(jobCardNo);
      if (!jobCardId) continue;
      for (const record of lines) {
        serviceRows.push([
          jobCardId, clean(record.serviceType), clean(record.itemCategory), clean(record.partCode),
          clean(record.part || record.partDescription), clean(record.standardizedPart),
          clean(record.qty || record.quantity), normalizeAmount(record), clean(record.customerVoice),
          clean(record.codifiedCustomerVoice), clean(record.repairTypeLine),
          clean(record.faultCode || record.complaintCode), clean(record.repairType)
        ]);
      }
    }

    let newServiceLines = 0;
    if (serviceRows.length) {
      const values = [];
      let n = 0;
      const placeholders = serviceRows.map((row) =>
        "(" + row.map((value) => { values.push(value); return "$" + (++n); }).join(",") + ")"
      );
      const result = await client.query(
        "INSERT INTO service_history " +
        "(job_card_id,service_type,item_category,part_code,part_description,standardized_part,quantity,amount," +
        "customer_voice,codified_customer_voice,repair_line_item_type,complaint_code,repair_type) " +
        "VALUES " + placeholders.join(",") + " RETURNING id",
        values
      );
      newServiceLines = result.rowCount;
    }

    await client.query("COMMIT");
    return res.status(200).json({
      success: true, vin, uploadedRecords: recordsNormalized.length,
      newJobCards: insertedJobCards.length,
      duplicateJobCards: jobCardNumbers.length - insertedJobCards.length,
      newServiceLines, lastRefreshedAt: new Date().toISOString()
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Save History Error:", error);
    return res.status(500).json({ success: false, error: error?.message || "Service history save failed" });
  } finally {
    client.release();
  }
}
