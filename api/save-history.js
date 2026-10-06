import crypto from "crypto";

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

async function ensurePriceMasterSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS part_price_master (
      part_no TEXT PRIMARY KEY,
      description TEXT,
      mrp NUMERIC,
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS part_price_master_meta (
      id INTEGER PRIMARY KEY CHECK (id=1),
      version INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      file_name TEXT
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS part_price_master_staging (
      upload_id TEXT NOT NULL,
      part_no TEXT NOT NULL,
      description TEXT,
      mrp NUMERIC,
      PRIMARY KEY (upload_id, part_no)
    )
  `);
  await client.query("CREATE INDEX IF NOT EXISTS idx_price_master_staging_upload ON part_price_master_staging(upload_id)");
  await client.query("INSERT INTO part_price_master_meta (id,version,row_count,updated_at) VALUES (1,0,0,NOW()) ON CONFLICT (id) DO NOTHING");
}
function normalizePricePart(value) { return String(value ?? "").trim().toUpperCase().replace(/\\s+/g, ""); }
function normalizePriceDescription(value) { return String(value ?? "").trim(); }
function normalizeMrp(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
async function requireAdminForPriceMaster(client, req) {
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return {error:"Admin authentication required.",status:401};
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await client.query(
    "SELECT u.id,u.role FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active' LIMIT 1",
    [tokenHash]
  );
  if (!result.rows[0] || result.rows[0].role !== "admin") return {error:"Admin access required.",status:403};
  return {user:result.rows[0]};
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const vin = String(req.query?.vin || "").trim().toUpperCase();
    const registration = String(req.query?.registration || "").replace(/\s+/g, "").trim().toUpperCase();
    const partNo = String(req.query?.partNo || "").trim().toUpperCase().replace(/\s+/g, "");
    const modelsFlag = req.query?.models;
    const priceMasterFlag = String(req.query?.priceMaster || "") === "1";
    const priceMasterMetaFlag = String(req.query?.priceMasterMeta || "") === "1";
    const priceMasterPartFlag = String(req.query?.priceMasterPart || "") === "1";
    const priceMasterChunkFlag = String(req.query?.priceMasterChunk || "") === "1";
    const priceMasterOffset = Math.max(0, Number(req.query?.offset || 0));
    const priceMasterLimit = Math.min(10000, Math.max(1000, Number(req.query?.limit || 10000)));
    const priceMasterVersion = Number(req.query?.version || 0);
    const BETA_PRICE_MASTER_API = "https://service-decision-engine-nn4u69gqz-service-decision.vercel.app/api/save-history";

    // Price Master is maintained from the Beta admin upload.
    // For direct part lookups, the Beta Price Master is the source of truth.
    // Do NOT let an older Stable Neon row override the current uploaded MRP.
    if (priceMasterFlag || priceMasterMetaFlag || priceMasterChunkFlag || (priceMasterPartFlag && partNo)) {
      if (priceMasterPartFlag && partNo) {
        try {
          const sourceUrl = BETA_PRICE_MASTER_API + "?priceMasterPart=1&partNo=" + encodeURIComponent(partNo);
          const sourceResponse = await fetch(sourceUrl);
          const sourceData = await sourceResponse.json().catch(() => ({}));
          if (sourceResponse.ok && sourceData?.part?.mrp && Number(sourceData.part.mrp) > 0) {
            return res.status(200).json(sourceData);
          }
        } catch (error) {
          console.warn("Beta Price Master direct lookup unavailable:", error?.message || error);
        }

        // Only if the live Beta master is unavailable, use the local DB as fallback.
        let localClient = null;
        try {
          localClient = await pool.connect();
          const localResult = await localClient.query(
            "SELECT part_no,description,mrp FROM part_price_master WHERE part_no=$1 LIMIT 1",
            [partNo]
          );
          const localRow = localResult.rows[0] || null;
          if (localRow && localRow.mrp !== null && Number(localRow.mrp) > 0) {
            return res.status(200).json({
              success: true,
              source: "Stable Price Master Fallback",
              part: {
                partNo: localRow.part_no,
                description: localRow.description || "",
                mrp: Number(localRow.mrp)
              }
            });
          }
        } catch (error) {
          console.warn("Stable local Price Master lookup unavailable:", error?.message || error);
        } finally {
          if (localClient) localClient.release();
        }
        return res.status(404).json({success:false,error:"Part not found in Price Master."});
      }

      try {
        const sourceUrl = BETA_PRICE_MASTER_API + (
          priceMasterMetaFlag
            ? "?priceMasterMeta=1"
            : priceMasterChunkFlag
              ? "?priceMasterChunk=1&offset=" + encodeURIComponent(priceMasterOffset) + "&limit=" + encodeURIComponent(priceMasterLimit)
              : "?priceMaster=1" + (priceMasterVersion > 0 ? "&version=" + encodeURIComponent(priceMasterVersion) : "")
        );
        const sourceResponse = await fetch(sourceUrl);
        const sourceData = await sourceResponse.json().catch(() => ({}));
        return res.status(sourceResponse.ok ? 200 : sourceResponse.status).json(sourceData);
      } catch (error) {
        console.error("Price Master source proxy failed:", error);
        return res.status(502).json({success:false,error:"Price Master source unavailable."});
      }
    }
    const modelParam = String(req.query?.model || "").trim();
    const mobileEstimateFlag = String(req.query?.mobileEstimate || "") === "1";
    const serviceParts = String(req.query?.serviceParts || "")
      .split(",")
      .map((v) => v.trim().toUpperCase().replace(/\s+/g, ""))
      .filter(Boolean)
      .slice(0, 100);
    const serviceLabourCodes = [
      "AIS110","ATS455Z","CLG125","CLH125","ELS105","FUL110",
      "GBX130","RAX145","STH110","AIR165Z","WHL165A"
    ];

    const client = await pool.connect();
    try {
    // Compact mobile master lookup: return only the service-part descriptions requested by the app.
    // The Android app keeps this catalog locally and only asks for codes it is still missing.
    const serviceCatalogFlag = String(req.query?.serviceCatalog || "") === "1";
    if (serviceCatalogFlag) {
      const requestedCatalogParts = String(req.query?.parts || "")
        .split(",")
        .map((v) => v.trim().toUpperCase().replace(/\s+/g, ""))
        .filter(Boolean)
        .slice(0, 100);

      if (!requestedCatalogParts.length) {
        return res.status(200).json({ success: true, parts: [] });
      }

      const catalogResult = await client.query(
        "WITH requested(code) AS (SELECT unnest($1::text[])), ranked AS (" +
        "SELECT requested.code AS requested_code, sh.part_code, sh.part_description, " +
        "ROW_NUMBER() OVER (PARTITION BY requested.code ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
        "FROM requested " +
        "LEFT JOIN service_history sh ON (" +
        "UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', ''))=requested.code " +
        "OR UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', '')) LIKE requested.code || '(%)') " +
        "LEFT JOIN job_cards jc ON jc.id=sh.job_card_id " +
        "WHERE sh.part_code IS NOT NULL AND sh.item_category LIKE 'P002%'" +
        ") " +
        "SELECT requested_code, part_code, part_description FROM ranked WHERE rn=1",
        [requestedCatalogParts]
      );

      return res.status(200).json({
        success: true,
        parts: catalogResult.rows.map((row) => ({
          partNo: row.requested_code,
          part_code: row.part_code,
          description: row.part_description || row.part_code || row.requested_code
        }))
      });
    }

      if (mobileEstimateFlag && registration) {
        const vehicleResult = await client.query(
          "SELECT v.id, v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date " +
          "FROM vehicles v " +
          "WHERE UPPER(REPLACE(TRIM(v.registration), ' ', ''))=$1 " +
          "ORDER BY v.last_refreshed_at DESC NULLS LAST, v.id DESC LIMIT 1",
          [registration]
        );
        const vehicle = vehicleResult.rows[0] || null;
        if (!vehicle) {
          return res.status(200).json({
            success: true,
            registration,
            vehicle: null,
            rows: [],
            model: null,
            modelRows: [],
            globalPartRates: []
          });
        }

        const requestedCodes = [...new Set(serviceLabourCodes)];

        const historyResult = await client.query(
          "WITH filtered AS (" +
          "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
          "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
          "jc.driver_phone, jc.service_contact_person_phone, " +
          "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
          "sh.repair_line_item_type, sh.complaint_code, sh.repair_type, sh.id AS service_history_id, jc.id AS job_card_id, " +
          "UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', '')) AS normalized_code " +
          "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
          "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
          "WHERE v.id=$1 AND (" +
          "sh.item_category LIKE 'P002%' OR EXISTS (" +
          "SELECT 1 FROM unnest($2::text[]) AS requested(code) " +
          "WHERE UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', ''))=requested.code " +
          "OR UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', '')) LIKE requested.code || '(%)'" +
          "))" +
          "), ranked AS (" +
          "SELECT *, ROW_NUMBER() OVER (PARTITION BY normalized_code ORDER BY job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC) AS rn " +
          "FROM filtered WHERE normalized_code <> ''" +
          ") SELECT vin, registration, customer_name, engine, model, sale_date, job_card_no, job_date, " +
          "cumulative_reading, cumulative_unit, driver_phone, service_contact_person_phone, item_category, part_code, " +
          "part_description, standardized_part, quantity, rate, repair_line_item_type, complaint_code, repair_type " +
          "FROM ranked WHERE rn<=10 ORDER BY job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC",
          [vehicle.id, requestedCodes]
        );

        const modelName = String(vehicle.model || "").trim();
        let modelRows = [];
        if (modelName && requestedCodes.length) {
          const modelResult = await client.query(
            "WITH filtered AS (" +
            "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
            "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
            "jc.driver_phone, jc.service_contact_person_phone, " +
            "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
            "sh.repair_line_item_type, sh.complaint_code, sh.repair_type, sh.id AS service_history_id, jc.id AS job_card_id, " +
            "UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', '')) AS normalized_code " +
            "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
            "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
            "WHERE UPPER(TRIM(v.model))=UPPER(TRIM($1)) AND v.vin<>$2 AND (" +
            "sh.item_category LIKE 'P002%' OR EXISTS (" +
            "SELECT 1 FROM unnest($3::text[]) AS requested(code) " +
            "WHERE UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', ''))=requested.code " +
            "OR UPPER(REPLACE(TRIM(COALESCE(sh.part_code,'')), ' ', '')) LIKE requested.code || '(%)'" +
            "))" +
            "), ranked AS (" +
            "SELECT *, ROW_NUMBER() OVER (PARTITION BY normalized_code ORDER BY job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC) AS rn " +
            "FROM filtered WHERE normalized_code <> ''" +
            ") SELECT vin, registration, customer_name, engine, model, sale_date, job_card_no, job_date, " +
            "cumulative_reading, cumulative_unit, driver_phone, service_contact_person_phone, item_category, part_code, " +
            "part_description, standardized_part, quantity, rate, repair_line_item_type, complaint_code, repair_type " +
            "FROM ranked WHERE rn<=10 ORDER BY job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC;",
            [modelName, vehicle.vin, requestedCodes]
          );
          modelRows = modelResult.rows;
        }

        const rateResult = await client.query(
          "WITH paid_rates AS (" +
          "SELECT UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) AS normalized_code, " +
          "sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "AND EXISTS (" +
          "SELECT 1 FROM unnest($1::text[]) AS requested(code) " +
          "WHERE UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))=requested.code " +
          "OR UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) LIKE requested.code || '(%)'" +
          ")" +
          "), latest_ten AS (" +
          "SELECT *, ROW_NUMBER() OVER (PARTITION BY normalized_code ORDER BY job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC) AS rn " +
          "FROM paid_rates" +
          "), frequency AS (" +
          "SELECT normalized_code, MAX(part_code) AS part_code, MAX(part_description) AS part_description, rate, " +
          "COUNT(*) AS frequency, MAX(job_date) AS latest_job_date, MAX(job_card_id) AS latest_job_card_id " +
          "FROM latest_ten WHERE rn<=10 GROUP BY normalized_code, rate" +
          "), ranked AS (" +
          "SELECT *, ROW_NUMBER() OVER (PARTITION BY normalized_code ORDER BY frequency DESC, latest_job_date DESC NULLS LAST, latest_job_card_id DESC, rate DESC) AS pick " +
          "FROM frequency" +
          ") " +
          "SELECT part_code, part_description, rate, latest_job_date AS job_date FROM ranked WHERE pick=1",
          [serviceParts]
        );

        return res.status(200).json({
          success: true,
          registration,
          vehicle,
          rows: historyResult.rows,
          model: modelName || null,
          modelRows,
          globalPartRates: rateResult.rows
        });
      }

      
      if (modelsFlag) {
        const modelResult = await client.query(
          "SELECT DISTINCT TRIM(model) AS model FROM vehicles " +
          "WHERE model IS NOT NULL AND TRIM(model) <> '' " +
          "ORDER BY TRIM(model) ASC"
        );
        const models = modelResult.rows.map(r => r.model).filter(Boolean);
        return res.status(200).json({ success: true, models });
      }

      if (modelParam && !registration && !vin) {
        const modelResult = await client.query(
          "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
          "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
          "jc.driver_phone, jc.service_contact_person_phone, " +
          "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
          "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
          "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
          "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
          "WHERE UPPER(TRIM(v.model))=UPPER(TRIM($1)) OR UPPER(TRIM(v.model)) LIKE '%' || UPPER(TRIM($1)) || '%' " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC LIMIT 2000",
          [modelParam]
        );
        const rateResult = await client.query(
          "WITH paid_rates AS ( " +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "), latest_ten AS ( " +
          "SELECT * FROM paid_rates WHERE rn <= 10 " +
          "), max_rates AS ( " +
          "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(part_code), ' ', ''))) " +
          "part_code, part_description, rate, job_date, job_card_id, service_history_id " +
          "FROM latest_ten " +
          "ORDER BY UPPER(REPLACE(TRIM(part_code), ' ', '')), rate DESC, job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC " +
          ") " +
          "SELECT part_code, part_description, rate, job_date FROM max_rates"
        );
        return res.status(200).json({
          success: true,
          model: modelParam,
          rows: [],
          modelRows: modelResult.rows,
          globalPartRates: rateResult.rows
        });
      }
      if (partNo) {
        // Price Master is authoritative whenever the part exists there.
        // Check the shared Stable DB directly first, so a manual lookup does
        // not depend on the Beta deployment being reachable.
        let localClient = null;
        try {
          localClient = await pool.connect();
          const localResult = await localClient.query(
            "SELECT part_no,description,mrp FROM part_price_master WHERE part_no=$1 LIMIT 1",
            [partNo]
          );
          const localRow = localResult.rows[0] || null;
          if (localRow && localRow.mrp !== null && Number(localRow.mrp) > 0) {
            const mrp = Number(localRow.mrp);
            return res.status(200).json({
              success:true,
              part:{
                partNo:localRow.part_no,
                description:localRow.description || "",
                rate:Number((mrp / 1.18).toFixed(2)),
                rateInclGst:Number(mrp.toFixed(2)),
                mrp
              },
              source:"Price List Master (Shared DB)"
            });
          }
        } catch (error) {
          console.warn("Shared Price Master direct lookup unavailable:", error?.message || error);
        } finally {
          if (localClient) localClient.release();
        }

        // Secondary master source only if the shared DB does not contain the part.
        try {
          const sourceResponse = await fetch(
            BETA_PRICE_MASTER_API + "?priceMasterPart=1&partNo=" + encodeURIComponent(partNo)
          );
          if (sourceResponse.ok) {
            const sourceData = await sourceResponse.json().catch(() => ({}));
            const masterPart = sourceData?.part;
            if (masterPart && Number(masterPart.mrp || 0) > 0) {
              const mrp = Number(masterPart.mrp);
              return res.status(200).json({
                success:true,
                part:{
                  partNo:masterPart.partNo || partNo,
                  description:masterPart.description || "",
                  rate:Number((mrp / 1.18).toFixed(2)),
                  rateInclGst:Number(mrp.toFixed(2)),
                  mrp
                },
                source:"Price List Master (MRP)"
              });
            }
          }
        } catch (error) {
          console.warn("Secondary Price Master lookup unavailable:", error?.message || error);
        }

        // Historical DB remains only a fallback when the current Price Master
        // genuinely does not contain the requested part.
        const result = await client.query(
          "WITH paid_rates AS ( " +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id, " +
          "ROW_NUMBER() OVER (" +
          "ORDER BY (CASE WHEN UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' THEN 1 ELSE 2 END), " +
          "jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "WHERE sh.item_category LIKE 'P002%' " +
          "AND (" +
          "  UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))=$1 " +
          "  OR UPPER(REPLACE(TRIM(sh.part_code), ' ', ''))=$1 || '(L)' " +
          "  OR UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) LIKE $1 || '(%)' " +
          "  OR UPPER(REPLACE(REGEXP_REPLACE(TRIM(sh.part_code), '\\([A-Za-z0-9]+\\)$', ''), ' ', ''))=$1 " +
          ") " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          ") " +
          "SELECT part_code, part_description, rate, job_date " +
          "FROM paid_rates WHERE rn <= 10 " +
          "ORDER BY rate DESC, job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC LIMIT 1",
          [partNo]
        );
        const row = result.rows[0] || null;
        return res.status(200).json({
          success:true,
          part: row ? {
            partNo: row.part_code ? row.part_code.replace(/\([A-Za-z0-9]+\)$/, '') : partNo,
            description: row.part_description || "",
            rate: Number(row.rate || 0),
            rateInclGst: Number((Number(row.rate || 0) * 1.18).toFixed(2))
          } : null,
          source: row ? "Historical DB fallback" : "Price List Master"
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
          "jc.driver_phone, jc.service_contact_person_phone, " +
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
          "jc.driver_phone, jc.service_contact_person_phone, " +
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
          "WITH paid_rates AS ( " +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "), latest_ten AS ( " +
          "SELECT * FROM paid_rates WHERE rn <= 10 " +
          "), max_rates AS ( " +
          "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(part_code), ' ', ''))) " +
          "part_code, part_description, rate, job_date, job_card_id, service_history_id " +
          "FROM latest_ten " +
          "ORDER BY UPPER(REPLACE(TRIM(part_code), ' ', '')), rate DESC, job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC " +
          ") " +
          "SELECT part_code, part_description, rate, job_date FROM max_rates"
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
          "jc.driver_phone, jc.service_contact_person_phone, " +
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
          "jc.driver_phone, jc.service_contact_person_phone, " +
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
        "WITH paid_rates AS ( " +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "), latest_ten AS ( " +
          "SELECT * FROM paid_rates WHERE rn <= 10 " +
          "), max_rates AS ( " +
          "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(part_code), ' ', ''))) " +
          "part_code, part_description, rate, job_date, job_card_id, service_history_id " +
          "FROM latest_ten " +
          "ORDER BY UPPER(REPLACE(TRIM(part_code), ' ', '')), rate DESC, job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC " +
          ") " +
          "SELECT part_code, part_description, rate, job_date FROM max_rates"
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

  if (body.action === "admin-upload-price-master") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const fileName = String(body.fileName || "").trim().slice(0,255);
    const replace = body.replace === true;
    const finalize = body.finalize === true;
    const uploadId = String(body.uploadId || "").trim();
    if (!rows.length || !uploadId) {
      return res.status(400).json({success:false,error:"Price list rows and upload ID are required."});
    }

    const client = await pool.connect();
    const adminCheck = await requireAdminForPriceMaster(client, req);
    if (adminCheck.error) {
      client.release();
      return res.status(adminCheck.status).json({success:false,error:adminCheck.error});
    }

    try {
      await ensurePriceMasterSchema(client);
      await client.query("BEGIN");

      if (replace) {
        await client.query("DELETE FROM part_price_master_staging WHERE upload_id=$1", [uploadId]);
      }

      const values = [];
      const placeholders = [];
      let n = 0;
      for (const item of rows) {
        const partNo = normalizePricePart(item?.partNo);
        const mrp = normalizeMrp(item?.mrp);
        if (!partNo || mrp === null) continue;
        values.push(partNo, normalizePriceDescription(item?.description) || null, mrp, uploadId);
        placeholders.push("($" + (++n) + ",$" + (++n) + ",$" + (++n) + ",$" + (++n) + ")");
      }

      if (placeholders.length) {
        await client.query(
          "INSERT INTO part_price_master_staging (part_no,description,mrp,upload_id) VALUES " +
          placeholders.join(",") +
          " ON CONFLICT (upload_id,part_no) DO UPDATE SET description=EXCLUDED.description,mrp=EXCLUDED.mrp",
          values
        );
      }

      let version = null;
      let rowCount = 0;

      if (finalize) {
        const meta = await client.query("SELECT version FROM part_price_master_meta WHERE id=1 FOR UPDATE");
        version = Number(meta.rows[0]?.version || 0) + 1;

        await client.query("DELETE FROM part_price_master");
        await client.query(
          "INSERT INTO part_price_master (part_no,description,mrp,version,updated_at) " +
          "SELECT part_no,description,mrp,$1,NOW() FROM part_price_master_staging WHERE upload_id=$2",
          [version, uploadId]
        );

        const count = await client.query("SELECT COUNT(*)::int AS count FROM part_price_master");
        rowCount = Number(count.rows[0]?.count || 0);

        await client.query(
          "UPDATE part_price_master_meta SET version=$1,row_count=$2,updated_at=NOW(),file_name=$3 WHERE id=1",
          [version,rowCount,fileName || null]
        );
        await client.query("DELETE FROM part_price_master_staging WHERE upload_id=$1", [uploadId]);
      }

      await client.query("COMMIT");
      return res.status(200).json({
        success:true,
        version:version || 0,
        rowCount,
        finalized:finalize,
        message:finalize ? "Price list uploaded successfully." : "Price list batch accepted."
      });
    } catch(error) {
      await client.query("ROLLBACK").catch(()=>{});
      console.error("Price Master Upload Error:",error);
      return res.status(500).json({success:false,error:error?.message||"Price master upload failed"});
    } finally {
      client.release();
    }
  }

  // Defense-in-depth: block all DB-related POST operations while the admin emergency cutoff is active.
  // Existing GET history remains available for estimates/history.
  const cutoffResult = await pool.query(
    "SELECT setting_value FROM app_settings WHERE setting_key='emergency_db_upload_cutoff' LIMIT 1"
  );
  if (cutoffResult.rows[0]?.setting_value?.enabled === true) {
    return res.status(503).json({
      success:false,
      error:"Emergency DB Upload Cutoff is active. Database history upload is temporarily disabled."
    });
  }

  if (body.action === "get-job-card-index") {
    const afterId = Math.max(0, Number(body.afterId || 0));
    const requestedLimit = Number(body.limit || 5000);
    const limit = Math.min(
      5000,
      Math.max(100, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 5000)
    );

    const client = await pool.connect();
    try {
      if (modelsFlag) {
        const modelResult = await client.query(
          "SELECT DISTINCT TRIM(model) AS model FROM vehicles " +
          "WHERE model IS NOT NULL AND TRIM(model) <> '' " +
          "ORDER BY TRIM(model) ASC"
        );
        const models = modelResult.rows.map(r => r.model).filter(Boolean);
        return res.status(200).json({ success: true, models });
      }

      if (modelParam && !registration && !vin) {
        const modelResult = await client.query(
          "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
          "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
          "jc.driver_phone, jc.service_contact_person_phone, " +
          "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
          "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
          "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
          "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
          "WHERE UPPER(TRIM(v.model))=UPPER(TRIM($1)) OR UPPER(TRIM(v.model)) LIKE '%' || UPPER(TRIM($1)) || '%' " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC LIMIT 2000",
          [modelParam]
        );
        const rateResult = await client.query(
          "WITH paid_rates AS ( " +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "), latest_ten AS ( " +
          "SELECT * FROM paid_rates WHERE rn <= 10 " +
          "), max_rates AS ( " +
          "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(part_code), ' ', ''))) " +
          "part_code, part_description, rate, job_date, job_card_id, service_history_id " +
          "FROM latest_ten " +
          "ORDER BY UPPER(REPLACE(TRIM(part_code), ' ', '')), rate DESC, job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC " +
          ") " +
          "SELECT part_code, part_description, rate, job_date FROM max_rates"
        );
        return res.status(200).json({
          success: true,
          model: modelParam,
          rows: [],
          modelRows: modelResult.rows,
          globalPartRates: rateResult.rows
        });
      }
      const result = await client.query(
        "SELECT id, UPPER(TRIM(job_card_no)) AS job_card_no " +
        "FROM job_cards " +
        "WHERE id>$1 AND job_card_no IS NOT NULL AND TRIM(job_card_no)<>'' " +
        "ORDER BY id ASC LIMIT $2",
        [afterId, limit]
      );

      const jobCards = result.rows.map(row => ({
        id: Number(row.id),
        jobCardNo: row.job_card_no,
      }));

      return res.status(200).json({
        success: true,
        jobCards,
        nextAfterId: jobCards.length ? jobCards[jobCards.length - 1].id : afterId,
        hasMore: jobCards.length === limit,
      });
    } catch (error) {
      console.error("Job Card Index Error:", error);
      return res.status(500).json({
        success: false,
        error: error?.message || "Job Card index sync failed"
      });
    } finally {
      client.release();
    }
  }

  if (body.action === "check-job-cards") {
    const requestedJobCards = [...new Set(
      (Array.isArray(body.jobCards) ? body.jobCards : [])
        .map(value => String(value ?? "").trim().toUpperCase())
        .filter(Boolean)
    )];

    if (!requestedJobCards.length) {
      return res.status(200).json({ success:true, newJobCards:[] });
    }

    const client = await pool.connect();
    try {
      const existingResult = await client.query(
        "SELECT DISTINCT UPPER(TRIM(job_card_no)) AS job_card_no " +
        "FROM job_cards " +
        "WHERE UPPER(TRIM(job_card_no))=ANY($1::text[])",
        [requestedJobCards]
      );

      const existing = new Set(
        existingResult.rows.map(row => String(row.job_card_no || "").trim().toUpperCase())
      );
      const newJobCards = requestedJobCards.filter(jobCard => !existing.has(jobCard));

      return res.status(200).json({
        success:true,
        newJobCards,
        existingJobCards:requestedJobCards.filter(jobCard => existing.has(jobCard))
      });
    } catch (error) {
      console.error("Job Card Check Error:", error);
      return res.status(500).json({
        success:false,
        error:error?.message || "Job Card duplicate check failed"
      });
    } finally {
      client.release();
    }
  }

  // Refresh vehicle timestamp even when the uploaded Job Cards already exist.
  // This keeps Admin stale-history buckets accurate without re-uploading history.
  if (body.action === "touch-vehicle-refresh") {
    const vins = [...new Set(
      (Array.isArray(body.vins) ? body.vins : [])
        .map(value => String(value ?? "").trim().toUpperCase())
        .filter(Boolean)
    )];

    if (!vins.length) return res.status(200).json({ success:true, updatedVehicles:0 });

    const client = await pool.connect();
    try {
      if (modelsFlag) {
        const modelResult = await client.query(
          "SELECT DISTINCT TRIM(model) AS model FROM vehicles " +
          "WHERE model IS NOT NULL AND TRIM(model) <> '' " +
          "ORDER BY TRIM(model) ASC"
        );
        const models = modelResult.rows.map(r => r.model).filter(Boolean);
        return res.status(200).json({ success: true, models });
      }

      if (modelParam && !registration && !vin) {
        const modelResult = await client.query(
          "SELECT v.vin, v.registration, v.customer_name, v.engine, v.model, v.sale_date, " +
          "jc.job_card_no, jc.job_date, jc.cumulative_reading, jc.cumulative_unit, " +
          "jc.driver_phone, jc.service_contact_person_phone, " +
          "sh.item_category, sh.part_code, sh.part_description, sh.standardized_part, sh.quantity, sh.rate, " +
          "sh.repair_line_item_type, sh.complaint_code, sh.repair_type " +
          "FROM vehicles v JOIN job_cards jc ON jc.vehicle_id=v.id " +
          "LEFT JOIN service_history sh ON sh.job_card_id=jc.id " +
          "WHERE UPPER(TRIM(v.model))=UPPER(TRIM($1)) OR UPPER(TRIM(v.model)) LIKE '%' || UPPER(TRIM($1)) || '%' " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id ASC LIMIT 2000",
          [modelParam]
        );
        const rateResult = await client.query(
          "WITH paid_rates AS ( " +
          "SELECT sh.part_code, sh.part_description, sh.rate, jc.job_date, jc.id AS job_card_id, sh.id AS service_history_id, " +
          "ROW_NUMBER() OVER (PARTITION BY UPPER(REPLACE(TRIM(sh.part_code), ' ', '')) " +
          "ORDER BY jc.job_date DESC NULLS LAST, jc.id DESC, sh.id DESC) AS rn " +
          "FROM service_history sh JOIN job_cards jc ON jc.id=sh.job_card_id " +
          "JOIN vehicles v ON v.id=jc.vehicle_id " +
          "WHERE sh.item_category LIKE 'P002%' AND sh.part_code IS NOT NULL " +
          "AND UPPER(REPLACE(COALESCE(sh.repair_line_item_type, ''), ' ', '')) LIKE '%POSTWARRANTY/PAIDORDER%' " +
          "AND sh.rate IS NOT NULL AND sh.rate > 0 " +
          "), latest_ten AS ( " +
          "SELECT * FROM paid_rates WHERE rn <= 10 " +
          "), max_rates AS ( " +
          "SELECT DISTINCT ON (UPPER(REPLACE(TRIM(part_code), ' ', ''))) " +
          "part_code, part_description, rate, job_date, job_card_id, service_history_id " +
          "FROM latest_ten " +
          "ORDER BY UPPER(REPLACE(TRIM(part_code), ' ', '')), rate DESC, job_date DESC NULLS LAST, job_card_id DESC, service_history_id DESC " +
          ") " +
          "SELECT part_code, part_description, rate, job_date FROM max_rates"
        );
        return res.status(200).json({
          success: true,
          model: modelParam,
          rows: [],
          modelRows: modelResult.rows,
          globalPartRates: rateResult.rows
        });
      }
      const result = await client.query(
        "UPDATE vehicles SET last_refreshed_at=NOW() " +
        "WHERE UPPER(TRIM(vin))=ANY($1::text[]) RETURNING vin",
        [vins]
      );
      return res.status(200).json({ success:true, updatedVehicles:result.rowCount || 0 });
    } catch (error) {
      console.error("Vehicle Refresh Touch Error:", error);
      return res.status(500).json({ success:false,error:error?.message || "Vehicle refresh timestamp update failed." });
    } finally {
      client.release();
    }
  }

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
      "ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS driver_phone TEXT"
    );
    await client.query(
      "ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS service_contact_person_phone TEXT"
    );

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
        "secondary_cumulative_reading, secondary_cumulative_unit, " +
        "driver_phone, service_contact_person_phone " +
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
          "secondary_cumulative_unit=COALESCE($5,secondary_cumulative_unit), " +
          "driver_phone=COALESCE($6,driver_phone), " +
          "service_contact_person_phone=COALESCE($7,service_contact_person_phone) " +
          "WHERE id=$8 AND (" +
          "job_date IS DISTINCT FROM COALESCE($1,job_date) OR " +
          "cumulative_reading IS DISTINCT FROM COALESCE($2,cumulative_reading) OR " +
          "cumulative_unit IS DISTINCT FROM COALESCE($3,cumulative_unit) OR " +
          "secondary_cumulative_reading IS DISTINCT FROM COALESCE($4,secondary_cumulative_reading) OR " +
          "secondary_cumulative_unit IS DISTINCT FROM COALESCE($5,secondary_cumulative_unit) OR " +
          "driver_phone IS DISTINCT FROM COALESCE($6,driver_phone) OR " +
          "service_contact_person_phone IS DISTINCT FROM COALESCE($7,service_contact_person_phone)) " +
          "RETURNING id,job_card_no",
          [
            clean(first.date),
            clean(first.cumulative),
            clean(first.cumulativeUnit),
            clean(first.secondaryCumulative),
            clean(first.secondaryCumulativeUnit),
            clean(first.driverPhone),
            clean(first.serviceContactPhone),
            existingJobCard.id
          ]
        );
        if (updateResult.rowCount) updatedJobCards.push(...updateResult.rows);
      } else {
        newJobCardRows.push([
          vehicleId, jobCardNo,
          clean(first.date),
          clean(first.cumulative), clean(first.cumulativeUnit),
          clean(first.secondaryCumulative), clean(first.secondaryCumulativeUnit),
          clean(first.driverPhone), clean(first.serviceContactPhone)
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
        "secondary_cumulative_reading,secondary_cumulative_unit," +
        "driver_phone,service_contact_person_phone) " +
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
      insertedJobCardNumbers: insertedJobCards.map(row => normalizeJobCard(row.job_card_no)),
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
