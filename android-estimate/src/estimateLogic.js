const PART_STANDARDIZATION = {
  EN699991: 'Engine Oil',
  F7A01500: 'Engine Oil Filter',
  G9999994: 'Gear Oil',
  GB699991: 'Axle Oil',
  PSB99994: 'Steering Oil',
  PD600391: 'Steering Oil Filter',
  CFD99991: 'Clutch Oil',
  U9999995: 'Clutch Oil',
  C9999993: 'Coolant',
  S9999997: 'Hub Grease',
  F1721500: 'GASKET HUB CAP FRONT FA90',
  FJ607400: 'GASKET-10TG HUB-12 HOLES',
  H5001220: 'SPLIT PIN',
  F1771900: 'WHEEL BEARING GREASE / SEAL',
  CLOTH: 'CLOTH',
  P5105609: 'Fuel Filter',
  P5105688: 'Air Filter Kit',
  P5105689: 'Air Filter Kit',
  XFM00500: 'DEF Filter Air',
  PET00001: 'DEF Filter Suction',
  XFM00800: 'DEF Inline Filter',
  PD600968: 'APDA Filter'
};

export const AGGREGATES = [
  ['Engine Oil', 'engineOil'],
  ['Coolant', 'coolant'],
  ['Gear Oil', 'gearOil'],
  ['Hub Grease', 'hubGrease'],
  ['Axle Oil', 'axleOil'],
  ['Fuel Filter', 'fuelFilter'],
  ['Steering Oil', 'steeringOil'],
  ['Air Filter', 'airFilter'],
  ['Clutch Oil', 'clutchOil'],
  ['DEF Filter', 'defFilter'],
  ['DEF Inline Filter', 'defInline'],
  ['APDA Filter', 'apdaFilter']
];

export const REFERENCE_PARTS = {
  engineOil: ['EN699991', 'F7A01500'],
  gearOil: ['G9999994'],
  axleOil: ['GB699991'],
  steeringOil: ['PSB99994', 'PD600391'],
  clutchOil: ['CFD99991', 'U9999995'],
  defInline: ['XFM00800'],
  coolant: ['C9999993'],
  hubGrease: ['S9999997', 'F1721500', 'FJ607400', 'H5001220', 'F1771900', 'CLOTH'],
  fuelFilter: ['P5105609'],
  airFilter: ['P5105688', 'P5105689'],
  defFilter: ['XFM00500', 'PET00001'],
  apdaFilter: ['PD600968']
};

/**
 * Service Quantity Rules defined strictly per user specification:
 * - Engine oil: 12-22 (range, default 18)
 * - Gear oil: 6-9 (range, default 8.5)
 * - Steering oil: 3 (Fixed)
 * - Axle oil: 12-33 (range, default 16.5)
 * - Clutch oil: 0.5 (Fixed)
 * - Coolant: 15-30 (range, default 20)
 * - Hub grease: 3-7 (range, default 3) -> Only applicable to S9999997 (grease).
 *   FJ607400, F1721500, F1771900, H5001220 & Cloth are gaskets/seals/hardware; range is NOT applicable to them.
 */
export const AGGREGATE_RULES = {
  engineOil: {
    type: 'range',
    min: 12,
    max: 22,
    defaultQty: 18,
    applicableParts: ['EN699991']
  },
  gearOil: {
    type: 'range',
    min: 6,
    max: 9,
    defaultQty: 8.5,
    applicableParts: ['G9999994']
  },
  steeringOil: {
    type: 'fixed',
    fixedQty: 3,
    defaultQty: 3,
    applicableParts: ['PSB99994']
  },
  axleOil: {
    type: 'range',
    min: 12,
    max: 33,
    defaultQty: 16.5,
    applicableParts: ['GB699991']
  },
  clutchOil: {
    type: 'fixed',
    fixedQty: 0.5,
    defaultQty: 0.5,
    applicableParts: ['CFD99991', 'U9999995']
  },
  coolant: {
    type: 'range',
    min: 15,
    max: 30,
    defaultQty: 20,
    applicableParts: ['C9999993']
  },
  hubGrease: {
    type: 'range',
    min: 3,
    max: 7,
    defaultQty: 3,
    applicableParts: ['S9999997']
  }
};

export const ORIGINAL_AL_DESCRIPTIONS = {
  EN699991: 'ENGINE OIL (CH4/15W40)',
  F7A01500: 'FILTER ELEMENT - ENGINE OIL',
  G9999994: 'GEAR OIL (80W90)',
  GB699991: 'AXLE OIL (85W140)',
  PSB99994: 'POWER STEERING OIL',
  PD600391: 'STEERING OIL FILTER ELEMENT',
  CFD99991: 'CLUTCH FLUID (DOT 4)',
  U9999995: 'CLUTCH FLUID',
  C9999993: 'ENGINE COOLANT PREMIX',
  S9999997: 'HUB GREASE (BLUE)',
  F1721500: 'GASKET HUB CAP FRONT FA90',
  FJ607400: 'GASKET-10TG HUB-12 HOLES',
  H5001220: 'SPLIT PIN',
  F1771900: 'WHEEL BEARING GREASE / SEAL',
  CLOTH: 'CLEANING CLOTH / COTTON WASTE',
  P5105609: 'FUEL FILTER ELEMENT KIT',
  P5105688: 'AIR FILTER ELEMENT (PRIMARY)',
  P5105689: 'AIR FILTER ELEMENT (SECONDARY)',
  XFM00500: 'DEF DOSING PUMP AIR FILTER',
  PET00001: 'DEF TANK SUCTION FILTER',
  XFM00800: 'DEF INLINE DOSING FILTER',
  PD600968: 'APDA DESICCANT CARTRIDGE'
};

export const SERVICE_PART_CATALOG = Object.entries(
  Object.values(REFERENCE_PARTS).flat().reduce((acc, code) => {
    const clean = String(code || '').toUpperCase().replace(/\s+/g, '').trim();
    if (clean) {
      acc[clean] = {
        partNo: clean,
        description: ORIGINAL_AL_DESCRIPTIONS[clean] || PART_STANDARDIZATION[clean] || clean
      };
    }
    return acc;
  }, {})
).map(([, item]) => item);


const LABOUR = {
  airFilter: ['AIS110', 'R and R Air Filter And Replace Element'],
  defFilter: ['ATS455Z', 'R & R DEF tank suction filter'],
  coolant: ['CLG125', 'Drain and Refill Coolant'],
  clutchOil: ['CLH125', 'Drain and Refill Clutch Oil and Bleed Sy'],
  engineOil: ['ELS105', 'Drain and Refill Engine Oil and Filter'],
  fuelFilter: ['FUL110', 'R and R Fuel Filter / Pre Filter'],
  gearOil: ['GBX130', 'Drain oil in Gearbox and Refill'],
  axleOil: ['RAX145', 'Drain and Refill oil in Rear Axle'],
  steeringOil: ['STH110', 'Drain and Refill Steering Box oil'],
  apdaFilter: ['AIR165Z', 'R & R APDA Desiccant Cartridges'],
  hubGrease: ['WHL165A', 'Hub Greasing - Front Axle - 2 Hubs']
};

const families = {
  engineOil: ['ENGINE OIL', 'ENGINE OIL FILTER', 'FUEL FILTER & ENGINE OIL FILTER KIT'],
  coolant: ['COOLANT'],
  gearOil: ['GEAR OIL'],
  hubGrease: ['HUB GREASE'],
  axleOil: ['AXLE OIL'],
  fuelFilter: ['FUEL FILTER'],
  steeringOil: ['STEERING OIL'],
  airFilter: ['AIR FILTER'],
  clutchOil: ['CLUTCH OIL'],
  defFilter: ['DEF FILTER'],
  defInline: ['DEF INLINE FILTER'],
  apdaFilter: ['APDA FILTER']
};

export const normalizeCode = (v) =>
  String(v || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\([A-Z0-9]+\)$/i, '')
    .trim();

function category(row) {
  const c = String(row?.item_category || '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (/(^|[^A-Z0-9])P001([^A-Z0-9]|$)/.test(c)) return 'labour';
  if (/(^|[^A-Z0-9])P002([^A-Z0-9]|$)/.test(c)) return 'part';
  return '';
}

function standardName(row) {
  const code = normalizeCode(row?.part_code);
  return String(
    PART_STANDARDIZATION[code] || row?.standardized_part || row?.part_description || ''
  ).toUpperCase();
}

function isPostWarrantyRepair(row) {
  const value = String(row?.repair_line_item_type || row?.repair_type || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  return value.includes('POSTWARRANTY') || value.includes('PAID') || value.includes('WARRANTY');
}

function rank(row) {
  const t = row?.job_date ? new Date(row.job_date).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function bestRate(rows, paidOnly = false) {
  const paidRows = rows.filter((r) => isPostWarrantyRepair(r) && Number(r?.rate) > 0);
  const pool = paidOnly && paidRows.length > 0 ? paidRows : rows.filter((r) => Number(r?.rate) > 0);
  const sorted = pool.sort((a, b) => rank(b) - rank(a)).slice(0, 10);
  return sorted.length ? Math.max(...sorted.map((r) => Number(r.rate))) : 0;
}

function makeGlobalRateMap(globalRates) {
  if (!Array.isArray(globalRates)) return new Map();
  if (globalRates._rateMap) return globalRates._rateMap;
  const map = new Map();
  for (let i = 0; i < globalRates.length; i++) {
    const item = globalRates[i];
    const code = normalizeCode(item?.part_code);
    const rate = Number(item?.rate || 0);
    if (code && rate > 0) {
      const prev = map.get(code) || 0;
      if (rate > prev) map.set(code, rate);
    }
  }
  globalRates._rateMap = map;
  return map;
}

function globalRate(code, globalRates) {
  const wanted = normalizeCode(code);
  if (!wanted) return 0;
  const map = makeGlobalRateMap(globalRates);
  return map.get(wanted) || 0;
}

function latestQty(rows, fallback = 1) {
  const valid = rows.filter((r) => Number(r?.quantity) > 0).sort((a, b) => rank(b) - rank(a));
  return valid.length ? Number(valid[0].quantity) : fallback;
}

function matchesLabour(row, key) {
  if (category(row) !== 'labour') return false;
  const text = [
    row?.part_description,
    row?.standardized_part,
    row?.repair_line_item_type,
    row?.repair_type,
    row?.part_code,
    row?.complaint_code
  ]
    .join(' ')
    .toUpperCase();
  const ref = LABOUR[key];
  if (ref && text.includes(ref[0])) return true;
  const tests = {
    engineOil: (t) =>
      t.includes('ENGINE OIL') &&
      (t.includes('FILTER') || t.includes('REFILL') || t.includes('DRAIN')),
    gearOil: (t) =>
      t.includes('GEARBOX') || t.includes('GEAR BOX') || t.includes('GEAR OIL'),
    axleOil: (t) =>
      t.includes('REAR AXLE') || t.includes('REAR AXEL') || t.includes('AXLE OIL'),
    steeringOil: (t) =>
      t.includes('STEERING') &&
      (t.includes('OIL') || t.includes('BOX') || t.includes('FLUID')),
    clutchOil: (t) =>
      t.includes('CLUTCH') &&
      (t.includes('OIL') || t.includes('BLEED') || t.includes('REFILL')),
    coolant: (t) => t.includes('COOLANT'),
    fuelFilter: (t) => t.includes('FUEL') && t.includes('FILTER'),
    airFilter: (t) => t.includes('AIR') && t.includes('FILTER'),
    hubGrease: (t) => t.includes('HUB') && t.includes('GREAS'),
    defFilter: (t) => t.includes('DEF') && (t.includes('SUCTION') || t.includes('FILTER')),
    defInline: (t) => t.includes('DEF') && t.includes('INLINE') && t.includes('FILTER'),
    apdaFilter: (t) => t.includes('APDA') || t.includes('DESICCANT')
  };
  return tests[key] ? tests[key](text) : false;
}

/**
 * Calculates service quantity based on user's exact specification:
 * 1. Checks rule for the aggregate and specific part code.
 * 2. If 'fixed' rule (Steering Oil = 3, Clutch Oil = 0.5), returns fixed quantity immediately.
 * 3. If 'range' rule:
 *    - Filters DB rows for that model / vehicle in the defined range (e.g. Engine Oil: 12-22).
 *    - Prioritizes Post Warranty Repair rows.
 *    - Takes top 10 most recent rows.
 *    - Calculates the most frequent quantity (MODE - maximum time quantity).
 *    - If no DB rows exist in the range, returns defaultQty.
 * 4. For non-grease parts under Hub Grease (FJ607400, F1721500, F1771900, H5001220, CLOTH)
 *    and other regular parts: normal historical mode is applied, fallback 1.
 */
export function determineQuantity(key, code, vehicleRows = [], modelRows = []) {
  const normCode = normalizeCode(code);
  const rule = AGGREGATE_RULES[key];

  // If rule applies to this specific part
  if (rule && rule.applicableParts.map(normalizeCode).includes(normCode)) {
    // Fixed Quantity (e.g. Steering Oil = 3, Clutch Oil = 0.5)
    if (rule.type === 'fixed') {
      return rule.fixedQty;
    }

    // Range Quantity (e.g. Engine Oil 12-22, Gear Oil 6-9, Axle Oil 12-33, Coolant 15-30, Hub Grease 3-7)
    if (rule.type === 'range') {
      const min = rule.min;
      const max = rule.max;

      const matchesPartCode = (r) =>
        category(r) === 'part' && normalizeCode(r?.part_code) === normCode;

      const vMatch = (vehicleRows || []).filter(matchesPartCode);
      const mMatch = (modelRows || []).filter(matchesPartCode);
      const candidateRows = vMatch.length > 0 ? vMatch : mMatch;

      // Filter entries that fall strictly within the [min, max] range
      const inRangeRows = candidateRows.filter((r) => {
        const q = Number(r?.quantity);
        return Number.isFinite(q) && q >= min && q <= max;
      });

      if (inRangeRows.length > 0) {
        // Prioritize Post Warranty Repair entries
        const pwRows = inRangeRows.filter(isPostWarrantyRepair);
        const activePool = pwRows.length > 0 ? pwRows : inRangeRows;

        // Sort by job_date descending (most recent first)
        const sorted = activePool.slice().sort((a, b) => rank(b) - rank(a));

        // Take top 10 entries
        const top10 = sorted.slice(0, 10);

        // Find the quantity that appears the maximum number of times (MODE)
        const counts = new Map();
        for (const row of top10) {
          const q = Number(row?.quantity);
          if (q > 0) {
            counts.set(q, (counts.get(q) || 0) + 1);
          }
        }

        if (counts.size > 0) {
          // Sort by frequency (descending), then by quantity value (descending)
          const sortedCounts = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
          return sortedCounts[0][0];
        }
      }

      // If no valid entries in range in DB, fallback to defaultQty
      return rule.defaultQty;
    }
  }

  // Non-range parts (filters, gaskets FJ607400, F1721500, F1771900, H5001220, CLOTH, etc.)
  // Range is NOT applicable to them!
  const matchesPartCode = (r) =>
    category(r) === 'part' &&
    normalizeCode(r?.part_code) === normCode &&
    Number(r?.quantity) > 0;

  const vMatch = (vehicleRows || []).filter(matchesPartCode);
  const mMatch = (modelRows || []).filter(matchesPartCode);
  const candidateRows = vMatch.length > 0 ? vMatch : mMatch;

  if (candidateRows.length > 0) {
    const pwRows = candidateRows.filter(isPostWarrantyRepair);
    const activePool = pwRows.length > 0 ? pwRows : candidateRows;
    const sorted = activePool.slice().sort((a, b) => rank(b) - rank(a)).slice(0, 10);

    const counts = new Map();
    for (const row of sorted) {
      const q = Number(row?.quantity);
      if (q > 0) {
        counts.set(q, (counts.get(q) || 0) + 1);
      }
    }
    if (counts.size > 0) {
      const sortedCounts = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
      return sortedCounts[0][0];
    }
  }

  return 1;
}

function historicalItem(
  type,
  key,
  allVehicleRows,
  allModelRows,
  partNo,
  globalRates,
  fixedQty = null,
  fixedDescription = '',
  priceMaster = {}
) {
  const code = normalizeCode(partNo);
  if (!code && type === 'part') return null;

  const vRows = (allVehicleRows || []).filter(
    (r) => category(r) === type && normalizeCode(r?.part_code) === code
  );
  const mRows = (allModelRows || []).filter(
    (r) => category(r) === type && normalizeCode(r?.part_code) === code
  );
  const safeRows = vRows.length ? vRows : mRows;

  let qty = 1;
  if (fixedQty !== null) {
    qty = Number(fixedQty);
  } else if (type === 'labour') {
    qty = latestQty(safeRows, 1);
  } else {
    qty = determineQuantity(key, code, allVehicleRows, allModelRows);
  }

  if (!(qty > 0)) return null;

  // Rate lookup: best historical rate from top 10 post-warranty / paid rows
  const historyRate = bestRate(safeRows, type === 'part');
  const dbRate = globalRate(code, globalRates);
  const finalRate = Math.max(historyRate, dbRate);

  // Description lookup: prioritize actual DB part_description, then standardized_part, then ORIGINAL_AL_DESCRIPTIONS
  const orderedRows = safeRows.slice().sort((a, b) => rank(b) - rank(a));
  const selectedRow = orderedRows[0] || {};

  const description = String(
    selectedRow.part_description ||
      selectedRow.standardized_part ||
      fixedDescription ||
      ORIGINAL_AL_DESCRIPTIONS[code] ||
      PART_STANDARDIZATION[code] ||
      code ||
      ''
  ).trim();

  const item = {
    id: `${type}-${key}-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    serviceKey: key,
    partNo: code,
    description,
    qty,
    rate: Number((type === 'part' ? finalRate * 1.18 : finalRate).toFixed(2)),
    baseRate: finalRate,
    source: finalRate
      ? type === 'part'
        ? 'Historical DB (18% GST added)'
        : 'Historical DB - Labour base rate'
      : 'Manual'
  };
  if (type === 'part') {
    const master = priceMaster?.[code];
    if (master) {
      if (master.description) item.description = master.description;
      const mrp = Number(master.mrp || 0);
      if (mrp > 0) {
        item.baseRate = Number((mrp / 1.18).toFixed(2));
        item.rate = Number(mrp.toFixed(2));
        item.source = 'Price List Master (MRP)';
      }
    }
  }
  return item;
}

function bestAlternativePart(key, codes, vehicle, model, globalRates, priceMaster = {}) {
  const options = [];
  for (const code of codes) {
    const item = historicalItem('part', key, vehicle, model, code, globalRates, null, '', priceMaster);
    if (item) options.push(item);
  }
  if (!options.length) return null;
  return options.sort((a, b) => Number(b.qty) - Number(a.qty))[0];
}

export function buildServiceItems(a = [], b = [], c = [], d = [], e = {}) {
  let rows, modelRows, globalRates, selectedKeys, priceMaster;
  if (Array.isArray(a) && a.length > 0 && typeof a[0] === 'string') {
    selectedKeys = a;
    rows = b;
    modelRows = c;
    globalRates = d;
    priceMaster = e || {};
  } else if (Array.isArray(d) && d.length > 0 && typeof d[0] === 'string') {
    rows = a;
    modelRows = b;
    globalRates = c;
    selectedKeys = d;
    priceMaster = e || {};
  } else {
    const args = [a, b, c, d];
    const keyArg = args.find((x) => Array.isArray(x) && x.every((i) => typeof i === 'string'));
    selectedKeys = keyArg || [];
    rows = Array.isArray(a) && a !== keyArg ? a : [];
    modelRows = Array.isArray(b) && b !== keyArg ? b : [];
    globalRates = Array.isArray(c) && c !== keyArg ? c : [];
    priceMaster = e || {};
  }

  const vehicle = Array.isArray(rows) ? rows : [];
  const model = Array.isArray(modelRows) ? modelRows : [];
  const output = [];

  for (const key of selectedKeys) {
    if (key === 'clutchOil' || key === 'airFilter') {
      const selectedPart = bestAlternativePart(key, REFERENCE_PARTS[key], vehicle, model, globalRates, priceMaster);
      if (selectedPart) output.push(selectedPart);
    } else if (key === 'hubGrease') {
      // 1. Grease part S9999997 (Range 3-7 applies!)
      const greaseItem = historicalItem(
        'part',
        key,
        vehicle,
        model,
        'S9999997',
        globalRates,
        null,
        'HUB GREASE (BLUE)',
        priceMaster
      );
      if (greaseItem) output.push(greaseItem);

      // 2. Gaskets & Non-grease parts (FJ607400, F1721500, F1771900, H5001220, CLOTH)
      // Range 3-7 DOES NOT apply to these gaskets/hardware per user specification!
      const nonGreaseParts = [
        ['F1721500', 'GASKET HUB CAP FRONT FA90'],
        ['FJ607400', 'GASKET-10TG HUB-12 HOLES'],
        ['H5001220', 'SPLIT PIN'],
        ['F1771900', 'WHEEL BEARING GREASE / SEAL'],
        ['CLOTH', 'CLEANING CLOTH / COTTON WASTE']
      ];

      for (const [code, desc] of nonGreaseParts) {
        const item = historicalItem('part', key, vehicle, model, code, globalRates, null, desc, priceMaster);
        if (item) output.push(item);
      }
    } else {
      for (const code of REFERENCE_PARTS[key] || []) {
        const item = historicalItem('part', key, vehicle, model, code, globalRates, null, '', priceMaster);
        if (item) output.push(item);
      }
    }

    // Labour is automatic only when a real DB labour code exists.
    // Never create a blank labour row for aggregates that do not have a mapped labour code.
    const ref = LABOUR[key];
    if (ref?.[0]) {
      const labourCode = normalizeCode(ref[0]);
      const exactVehicleLabour = vehicle.filter(
        (r) => category(r) === 'labour' && normalizeCode(r?.part_code) === labourCode
      );
      const exactModelLabour = model.filter(
        (r) => category(r) === 'labour' && normalizeCode(r?.part_code) === labourCode
      );
      if (exactVehicleLabour.length || exactModelLabour.length) {
        const item = historicalItem('labour', key, vehicle, model, labourCode, globalRates, null, '', priceMaster);
        if (item && item.description && Number(item.qty) > 0 && Number(item.rate) > 0) {
          item.description = ref[1];
          output.push(item);
        }
      }
    }
  }

  // Deduplicate parts by serviceKey + partNo
  const seen = new Set();
  const deduped = output.filter((item) => {
    if (item.type !== 'part') return true;
    const k = item.serviceKey + '|' + normalizeCode(item.partNo);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Return structure that supports both array and object (.parts, .labour) consumption
  const result = [...deduped];
  result.parts = deduped.filter((x) => x.type === 'part');
  result.labour = deduped.filter((x) => x.type === 'labour');
  return result;
}

export function prebuildAllAggregates(rows = [], modelRows = [], globalRates = []) {
  makeGlobalRateMap(globalRates);
  const cache = {};
  for (const item of AGGREGATES) {
    const key = Array.isArray(item) ? item[1] : item?.key;
    if (key) {
      cache[key] = buildServiceItems([key], rows, modelRows, globalRates);
    }
  }
  return cache;
}

export function makeManualItem(type = 'part') {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    partNo: '',
    description: '',
    qty: '',
    rate: 0,
    source: 'Manual'
  };
}

export function rateForManualPart(partNo, modelRows = [], globalRates = [], priceMaster = {}) {
  const code = normalizeCode(partNo);
  if (!code) return null;
  const master = priceMaster?.[code];
  if (master?.mrp > 0 || master?.description) {
    const mrp = Number(master.mrp || 0);
    return {
      partNo: code,
      description: master.description || code,
      rate: mrp > 0 ? Number(mrp.toFixed(2)) : 0,
      baseRate: mrp > 0 ? Number((mrp / 1.18).toFixed(2)) : 0,
      source: 'Price List Master (MRP)'
    };
  }
  const historyRate = bestRate(
    (modelRows || []).filter(
      (r) => category(r) === 'part' && normalizeCode(r?.part_code) === code
    ),
    true
  );
  const dbRate = globalRate(code, globalRates);
  const finalRate = Math.max(historyRate, dbRate);
  if (!finalRate) return null;

  const descRow = (modelRows || []).find(
    (r) => normalizeCode(r?.part_code) === code && (r?.part_description || r?.standardized_part)
  );
  return {
    partNo: code,
    description: descRow?.part_description || descRow?.standardized_part || ORIGINAL_AL_DESCRIPTIONS[code] || code,
    rate: Number((finalRate * 1.18).toFixed(2)),
    source: 'Historical Database'
  };
}

export function totals(parts = [], labour = []) {
  const partsTotal = (parts || []).reduce(
    (sum, r) => sum + (Number(r.qty) || 0) * (Number(r.rate) || 0),
    0
  );
  const labourSubtotal = (labour || []).reduce(
    (sum, r) => sum + (Number(r.qty) || 0) * (Number(r.rate) || 0),
    0
  );
  const labourGst = labourSubtotal * 0.18;
  return {
    partsTotal,
    labourSubtotal,
    labourGst,
    subtotal: partsTotal + labourSubtotal,
    total: partsTotal + labourSubtotal + labourGst
  };
}
