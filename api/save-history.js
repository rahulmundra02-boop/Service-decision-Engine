
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

function normalizeRate(record = {}) {
  const qty = Number(record?.qty ?? record?.quantity ?? 0);
  const netValue = record?.netValue;

  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (netValue === undefined || netValue === null || String(netValue).trim() === "") return null;

  const total = Number(String(netValue).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(total)) return null;

  // DMS Net Value is the total pre-tax value for the line.
  // DB stores only the derived per-unit rate.
  const rate = total / qty;
  return Number.isFinite(rate) ? rate : null;
}

function normalizeLineIdentityText(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function serviceLineIdentityFromRecord(record = {}) {
  const category = normalizeLineIdentityText(record.itemCategory);
  const partCode = normalizeLineIdentityText(record.partCode).replace(/\s+/g, "");
  if (partCode) return `${category}|CODE:${partCode}`;

  return [
    category,
    normalizeLineIdentityText(record.part || record.partDescription),
    normalizeLineIdentityText(record.standardizedPart),
    normalizeLineIdentityText(record.repairTypeLine),
    normalizeLineIdentityText(record.faultCode || record.complaintCode),
    normalizeLineIdentityText(record.repairType),
  ].join("|");
}

function serviceLineIdentityFromDb(row = {}) {
  const category = normalizeLineIdentityText(row.item_category);
  const partCode = normalizeLineIdentityText(row.part_code).replace(/\s+/g, "");
  if (partCode) return `${category}|CODE:${partCode}`;

  return [
    category,
    normalizeLineIdentityText(row.part_description),
    normalizeLineIdentityText(row.standardized_part),
    normalizeLineIdentityText(row.repair_line_item_type),
    normalizeLineIdentityText(row.complaint_code),
    normalizeLineIdentityText(row.repair_type),
  ].join("|");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const vin = String(req.query?.vin || "").trim().toUpperCase();
    const registration = String(req.query?.registration || "").replace(/\s+/g, "").trim().toUpperCase();
    const partNo = String(req.query?.partNo || "").trim().toUpperCase().replace(/\s+/g, "");

    const client = await pool.connect();
    try {
      if (partNo) {
        const result = await client.query(
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "WHERE sh.item_category LIKE 'P002%' " +
          "AND UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))=$1 " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC LIMIT 1",
          [partNo]
        );
        const row = result.rows[0] || null;
        return res.status(200).json({
          success:true,
          part: row ? {
            partNo: row.part_code,
            description: row.part_description || "",
            rate: Number(row.rate || 0),
            rateInclGst: Number((Number(row.rate || 0) * 1.18).toFixed(2))
          } : null
        });
      }

      if (registration) {
        const vehicleResult = await client.query(
          "SELECT v.id, v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date " +
          "FROM vehicles v " +
          "WHERE UPPER(REPLACE(TRIM(v.registration), ' ', ''))=$1 " +
          "ORDER BY v.last_refreshed_at DESC NULLS LAST, v.id DESC LIMIT 1",
          [registration]
        );
        const vehicle = vehicleResult.rows[0] || null;
        if (!vehicle) {
          return res.status(200).json({ success:true, rows:[], modelRows:[], globalPartRates:[], vehicle:null });
        }

        const historyResult = await client.query(
          "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
          "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
          "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
          "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
          "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
          "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
          "WHERE v.id=$1 ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC",
          [vehicle.id]
        );
        const rows = historyResult.rows;
        const modelName = String(vehicle.model || "").trim();
        let modelRows = [];
        if (modelName) {
          const modelResult = await client.query(
            "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
            "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
            "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
            "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
            "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
            "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
            "WHERE UPPER(TRIM(v.model))=UPPER(TRIM($1)) AND v.vin<>$2 " +
            "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC",
            [modelName, vehicle.vin]
          );
          modelRows = modelResult.rows;
        }
        const rateResult = await client.query(
          "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))) " +
          "sh.part_code, sh.rate, jc.job_date " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "ORDER BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')), jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC"
        );
        return res.status(200).json({
          success:true,
          registration,
          vehicle,
          rows,
          model:modelName || null,
          modelRows,
          globalPartRates:rateResult.rows
        });
      }

      if (!vin) return res.status(400).json({ success:false,error:"VIN/Chassis is required." });
      const result = await client.query(
        "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
        "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
        "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
        "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
        "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
        "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
        "WHERE v.vin=$1 ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC",
        [vin]
      );

      const modelName = String(result.rows.find(row => String(row.model || "").trim())?.model || "").trim();
      let modelRows = [];
      if (modelName) {
        const modelResult = await client.query(
          "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, " +
          "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
          "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
          "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
          "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
          "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
          "WHERE UPPER(TRIM(v.model))=UPPER(TRIM($1)) AND v.vin<>$2 " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC",
          [modelName, vin]
        );
        modelRows = modelResult.rows;
      }

      const rateResult = await client.query(
        "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))) " +
        "sh.part_code, sh.rate, jc.job_date " +
        "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
        "JOIN vehicles v ON v.id=jc.vehicle_id " +
        "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
        "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
        "ORDER BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')), jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC"
      );

      return res.status(200).json({
        success:true, vin, rows:result.rows, model:modelName||null,
        modelRows, globalPartRates:rateResult.rows
      });
    } catch (error) {
      console.error("Read History Error:", error);
      return res.status(500).json({ success:false,error:error?.message||"Service history read failed" });
    } finally { client.release(); }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
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

    // Store only the per-unit rate for future estimates.
    // Ensure the temporary amount column exists so this migration is safe
    // even if no upload happened after the earlier amount-field change.
    await client.query(
      "ALTER TABLE service_history ADD COLUMN IF NOT EXISTS amount NUMERIC"
    );
    await client.query(
      "ALTER TABLE service_history ADD COLUMN IF NOT EXISTS rate NUMERIC"
    );
    await client.query(
      "UPDATE service_history SET rate = CASE " +
      "WHEN quantity IS NOT NULL AND quantity <> 0 AND amount IS NOT NULL " +
      "THEN amount / quantity ELSE rate END " +
      "WHERE rate IS NULL AND amount IS NOT NULL"
    );
    await client.query(
      "ALTER TABLE service_history DROP COLUMN IF EXISTS amount"
    );

    // These job-card fields are not needed for Service Decision / Estimate
    // storage. Keep them out of the DB to reduce unnecessary table size.
    await client.query(
      "ALTER TABLE job_cards " +
      "DROP COLUMN IF EXISTS invoice_no, " +
      "DROP COLUMN IF EXISTS reading, " +
      "DROP COLUMN IF EXISTS reading_unit, " +
      "DROP COLUMN IF EXISTS secondary_reading, " +
      "DROP COLUMN IF EXISTS secondary_unit, " +
      "DROP COLUMN IF EXISTS inward_date, " +
      "DROP COLUMN IF EXISTS check_in_date, " +
      "DROP COLUMN IF EXISTS start_date, " +
      "DROP COLUMN IF EXISTS end_date"
    );
    await client.query(
      "ALTER TABLE service_history DROP COLUMN IF EXISTS service_type"
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
    let existingJobCards = new Map();

    if (jobCardNumbers.length) {
      const existingResult = await client.query(
        "SELECT id, job_card_no, job_date, cumulative_reading, cumulative_unit, " +
        "secondary_cumulative_reading, secondary_cumulative_unit " +
        "FROM job_cards WHERE vehicle_id=$1 AND job_card_no=ANY($2::text[])",
        [vehicleId, jobCardNumbers]
      );
      existingJobCards = new Map(existingResult.rows.map((row) => [row.job_card_no, row]));
    }

    const insertedJobCards = [];
    const updatedJobCards = [];
    const newJobCardRows = [];

    for (const [jobCardNo, lines] of jobCards) {
      const first = lines[0];
      const existingJobCard = existingJobCards.get(jobCardNo);

      if (existingJobCard) {
        const updateResult = await client.query(
          "UPDATE job_cards SET " +
          "job_date=COALESCE($1,job_date), " +
          "cumulative_reading=COALESCE($2,cumulative_reading), " +
          "cumulative_unit=COALESCE($3,cumulative_unit), " +
          "secondary_cumulative_reading=COALESCE($4,secondary_cumulative_reading), " +
          "secondary_cumulative_unit=COALESCE($5,secondary_cumulative_unit) " +
          "WHERE id=$6 AND (" +
          "job_date IS DISTINCT FROM COALESCE($1,job_date) OR " +
          "cumulative_reading IS DISTINCT FROM COALESCE($2,cumulative_reading) OR " +
          "cumulative_unit IS DISTINCT FROM COALESCE($3,cumulative_unit) OR " +
          "secondary_cumulative_reading IS DISTINCT FROM COALESCE($4,secondary_cumulative_reading) OR " +
          "secondary_cumulative_unit IS DISTINCT FROM COALESCE($5,secondary_cumulative_unit)) " +
          "RETURNING id,job_card_no",
          [
            clean(first.date),
            clean(first.cumulative),
            clean(first.cumulativeUnit),
            clean(first.secondaryCumulative),
            clean(first.secondaryCumulativeUnit),
            existingJobCard.id
          ]
        );
        if (updateResult.rowCount) updatedJobCards.push(...updateResult.rows);
      } else {
        newJobCardRows.push([
          vehicleId, jobCardNo,
          clean(first.date),
          clean(first.cumulative), clean(first.cumulativeUnit),
          clean(first.secondaryCumulative), clean(first.secondaryCumulativeUnit)
        ]);
      }
    }

    if (newJobCardRows.length) {
      const values = [];
      let n = 0;
      const placeholders = newJobCardRows.map((row) =>
        "(" + row.map((value) => {
          values.push(value);
          return "$" + (++n);
        }).join(",") + ")"
      );
      const result = await client.query(
        "INSERT INTO job_cards " +
        "(vehicle_id,job_card_no,job_date,cumulative_reading,cumulative_unit," +
        "secondary_cumulative_reading,secondary_cumulative_unit) " +
        "VALUES " + placeholders.join(",") +
        " ON CONFLICT (vehicle_id,job_card_no) DO NOTHING RETURNING id,job_card_no",
        values
      );
      insertedJobCards.push(...result.rows);
    }

    const allJobCardIds = await client.query(
      "SELECT id, job_card_no FROM job_cards WHERE vehicle_id=$1 AND job_card_no=ANY($2::text[])",
      [vehicleId, jobCardNumbers]
    );
    const jobCardIdByNumber = new Map(
      allJobCardIds.rows.map((row) => [row.job_card_no, row.id])
    );

    const allJobCardIdsArray = allJobCardIds.rows.map((row) => row.id);
    const existingServiceRows = new Map();

    if (allJobCardIdsArray.length) {
      const existingServiceResult = await client.query(
        "SELECT id, job_card_id, item_category, part_code, part_description, standardized_part, " +
        "quantity, rate, customer_voice, codified_customer_voice, repair_line_item_type, " +
        "complaint_code, repair_type " +
        "FROM service_history WHERE job_card_id=ANY($1::int[]) ORDER BY id ASC",
        [allJobCardIdsArray]
      );

      for (const row of existingServiceResult.rows) {
        const key = row.job_card_id;
        if (!existingServiceRows.has(key)) existingServiceRows.set(key, []);
        existingServiceRows.get(key).push(row);
      }
    }

    let newServiceLines = 0;
    let updatedServiceLines = 0;
    let unchangedServiceLines = 0;

    // Existing Job Card: reconcile incoming lines instead of skipping the whole card.
    // Same line identity + changed values -> UPDATE.
    // Same line identity + no change -> IGNORE.
    // New line identity -> INSERT.
    // Lines missing from the new upload are preserved.
    for (const [jobCardNo, lines] of jobCards) {
      const jobCardId = jobCardIdByNumber.get(jobCardNo);
      if (!jobCardId) continue;

      const existingLines = existingServiceRows.get(jobCardId) || [];
      const existingByIdentity = new Map();

      for (const row of existingLines) {
        const identity = serviceLineIdentityFromDb(row);
        if (!existingByIdentity.has(identity)) existingByIdentity.set(identity, []);
        existingByIdentity.get(identity).push(row);
      }

      for (const record of lines) {
        const identity = serviceLineIdentityFromRecord(record);
        const candidates = existingByIdentity.get(identity) || [];
        const existingRow = candidates.shift();

        const incomingCategory = clean(record.itemCategory);
        const incomingPartCode = clean(record.partCode);
        const incomingDescription = clean(record.part || record.partDescription);
        const incomingStandardizedPart = clean(record.standardizedPart);
        const incomingQuantity = clean(record.qty || record.quantity);
        const incomingRate = normalizeRate(record);
        const incomingCustomerVoice = clean(record.customerVoice);
        const incomingCodifiedVoice = clean(record.codifiedCustomerVoice);
        const incomingRepairLine = clean(record.repairTypeLine);
        const incomingComplaint = clean(record.faultCode || record.complaintCode);
        const incomingRepairType = clean(record.repairType);

        if (existingRow) {
          const updateResult = await client.query(
            "UPDATE service_history SET " +
            "item_category=COALESCE($1,item_category), " +
            "part_code=COALESCE($2,part_code), " +
            "part_description=COALESCE($3,part_description), " +
            "standardized_part=COALESCE($4,standardized_part), " +
            "quantity=COALESCE($5,quantity), " +
            "rate=COALESCE($6,rate), " +
            "customer_voice=COALESCE($7,customer_voice), " +
            "codified_customer_voice=COALESCE($8,codified_customer_voice), " +
            "repair_line_item_type=COALESCE($9,repair_line_item_type), " +
            "complaint_code=COALESCE($10,complaint_code), " +
            "repair_type=COALESCE($11,repair_type) " +
            "WHERE id=$12 AND (" +
            "item_category IS DISTINCT FROM COALESCE($1,item_category) OR " +
            "part_code IS DISTINCT FROM COALESCE($2,part_code) OR " +
            "part_description IS DISTINCT FROM COALESCE($3,part_description) OR " +
            "standardized_part IS DISTINCT FROM COALESCE($4,standardized_part) OR " +
            "quantity IS DISTINCT FROM COALESCE($5,quantity) OR " +
            "rate IS DISTINCT FROM COALESCE($6,rate) OR " +
            "customer_voice IS DISTINCT FROM COALESCE($7,customer_voice) OR " +
            "codified_customer_voice IS DISTINCT FROM COALESCE($8,codified_customer_voice) OR " +
            "repair_line_item_type IS DISTINCT FROM COALESCE($9,repair_line_item_type) OR " +
            "complaint_code IS DISTINCT FROM COALESCE($10,complaint_code) OR " +
            "repair_type IS DISTINCT FROM COALESCE($11,repair_type)) " +
            "RETURNING id",
            [
              incomingCategory,
              incomingPartCode,
              incomingDescription,
              incomingStandardizedPart,
              incomingQuantity,
              incomingRate,
              incomingCustomerVoice,
              incomingCodifiedVoice,
              incomingRepairLine,
              incomingComplaint,
              incomingRepairType,
              existingRow.id
            ]
          );

          if (updateResult.rowCount) updatedServiceLines++;
          else unchangedServiceLines++;
        } else {
          await client.query(
            "INSERT INTO service_history " +
            "(job_card_id,item_category,part_code,part_description,standardized_part,quantity,rate," +
            "customer_voice,codified_customer_voice,repair_line_item_type,complaint_code,repair_type) " +
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            [
              jobCardId,
              incomingCategory,
              incomingPartCode,
              incomingDescription,
              incomingStandardizedPart,
              incomingQuantity,
              incomingRate,
              incomingCustomerVoice,
              incomingCodifiedVoice,
              incomingRepairLine,
              incomingComplaint,
              incomingRepairType
            ]
          );
          newServiceLines++;
        }
      }
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
