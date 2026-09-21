
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
          "WITH per_job_card AS (" +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY jc.id ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS job_row " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "WHERE sh.item_category LIKE 'P002%' " +
          "AND UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))=$1 " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0" +
          "), latest10 AS (" +
          "SELECT * FROM per_job_card WHERE job_row=1 " +
          "ORDER BY job_date DESC NULLS LAST, job_card_id DESC, history_id DESC LIMIT 10" +
          "), rate_frequency AS (" +
          "SELECT rate, COUNT(*) AS frequency, MAX(job_date) AS latest_rate_date FROM latest10 GROUP BY rate" +
          "), winner AS (" +
          "SELECT rate, frequency FROM rate_frequency ORDER BY frequency DESC, latest_rate_date DESC, rate DESC LIMIT 1" +
          ") " +
          "SELECT l.part_code, l.part_description, w.rate, l.job_date, w.frequency AS rate_frequency, (SELECT COUNT(*) FROM latest10) AS sample_size " +
          "FROM latest10 l CROSS JOIN winner w " +
          "ORDER BY l.job_date DESC NULLS LAST, l.job_card_id DESC, l.history_id DESC LIMIT 1",
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
"WITH per_job_card AS (" +
          "SELECT UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) AS normalized_part_code, sh.part_code, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')), jc.id ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS job_row " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0" +
          "), latest_per_job_card AS (" +
          "SELECT * FROM per_job_card WHERE job_row=1" +
          "), numbered AS (" +
          "SELECT *, ROW_NUMBER() OVER (PARTITION BY normalized_part_code ORDER BY job_date DESC NULLS LAST, job_card_id DESC, history_id DESC) AS part_job_rank " +
          "FROM latest_per_job_card" +
          "), sample AS (" +
          "SELECT * FROM numbered WHERE part_job_rank <= 10" +
          "), rate_frequency AS (" +
          "SELECT normalized_part_code, rate, COUNT(*) AS frequency, MAX(job_date) AS latest_rate_date FROM sample GROUP BY normalized_part_code, rate" +
          "), winners AS (" +
          "SELECT normalized_part_code, rate, frequency, ROW_NUMBER() OVER (PARTITION BY normalized_part_code ORDER BY frequency DESC, latest_rate_date DESC, rate DESC) AS rate_rank FROM rate_frequency" +
          ") " +
          "SELECT s.part_code, w.rate, s.job_date, w.frequency AS rate_frequency, " +
          "(SELECT COUNT(*) FROM sample s2 WHERE s2.normalized_part_code=s.normalized_part_code) AS sample_size " +
          "FROM sample s JOIN winners w ON w.normalized_part_code=s.normalized_part_code AND w.rate=s.rate " +
          "WHERE w.rate_rank=1 AND s.part_job_rank=1"
);;
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
"WITH per_job_card AS (" +
          "SELECT UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) AS normalized_part_code, sh.part_code, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')), jc.id ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS job_row " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0" +
          "), latest_per_job_card AS (" +
          "SELECT * FROM per_job_card WHERE job_row=1" +
          "), numbered AS (" +
          "SELECT *, ROW_NUMBER() OVER (PARTITION BY normalized_part_code ORDER BY job_date DESC NULLS LAST, job_card_id DESC, history_id DESC) AS part_job_rank " +
          "FROM latest_per_job_card" +
          "), sample AS (" +
          "SELECT * FROM numbered WHERE part_job_rank <= 10" +
          "), rate_frequency AS (" +
          "SELECT normalized_part_code, rate, COUNT(*) AS frequency, MAX(job_date) AS latest_rate_date FROM sample GROUP BY normalized_part_code, rate" +
          "), winners AS (" +
          "SELECT normalized_part_code, rate, frequency, ROW_NUMBER() OVER (PARTITION BY normalized_part_code ORDER BY frequency DESC, latest_rate_date DESC, rate DESC) AS rate_rank FROM rate_frequency" +
          ") " +
          "SELECT s.part_code, w.rate, s.job_date, w.frequency AS rate_frequency, " +
          "(SELECT COUNT(*) FROM sample s2 WHERE s2.normalized_part_code=s.normalized_part_code) AS sample_size " +
          "FROM sample s JOIN winners w ON w.normalized_part_code=s.normalized_part_code AND w.rate=s.rate " +
          "WHERE w.rate_rank=1 AND s.part_job_rank=1"
);;
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
