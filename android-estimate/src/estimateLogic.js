const PART_STANDARDIZATION = {
  EN699991: 'Engine Oil', F7A01500: 'Engine Oil Filter',
  G9999994: 'Gear Oil', GB699991: 'Axle Oil',
  PSB99994: 'Steering Oil', PD600391: 'Steering Oil Filter',
  CFD99991: 'Clutch Oil', U9999995: 'Clutch Oil',
  C9999993: 'Coolant', S9999997: 'Hub Grease', F1771900: 'Hub Grease',
  P5105609: 'Fuel Filter', P5105688: 'Air Filter',
  XFM00500: 'DEF Filter Air', PET00001: 'DEF Filter Suction',
  XFM00800: 'DEF Inline Filter', PD600968: 'APDA Filter'
};

export const AGGREGATES = [
  ['Engine Oil', 'engineOil'], ['Coolant', 'coolant'], ['Gear Oil', 'gearOil'],
  ['Hub Grease', 'hubGrease'], ['Axle Oil', 'axleOil'], ['Fuel Filter', 'fuelFilter'],
  ['Steering Oil', 'steeringOil'], ['Air Filter', 'airFilter'], ['Clutch Oil', 'clutchOil'],
  ['DEF Filter', 'defFilter'], ['DEF Inline Filter', 'defInline'], ['APDA Filter', 'apdaFilter']
];

const REFERENCE_PARTS = {
  engineOil: ['EN699991', 'F7A01500'],
  gearOil: ['G9999994'], axleOil: ['GB699991'],
  steeringOil: ['PSB99994', 'PD600391'], clutchOil: ['CFD99991', 'U9999995'],
  defInline: ['XFM00800'], coolant: ['C9999993'],
  hubGrease: ['S9999997', 'F1771900'], fuelFilter: ['P5105609'],
  airFilter: ['P5105688'], defFilter: ['XFM00500', 'PET00001'], apdaFilter: ['PD600968']
};

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
  coolant: ['COOLANT'], gearOil: ['GEAR OIL'], hubGrease: ['HUB GREASE'],
  axleOil: ['AXLE OIL'], fuelFilter: ['FUEL FILTER'], steeringOil: ['STEERING OIL'],
  airFilter: ['AIR FILTER'], clutchOil: ['CLUTCH OIL'], defFilter: ['DEF FILTER'],
  defInline: ['DEF INLINE FILTER'], apdaFilter: ['APDA FILTER']
};

const normalizeCode = v => String(v || '').toUpperCase().replace(/\s+/g, '').trim();

function category(row) {
  const c = String(row?.item_category || '').toUpperCase().replace(/\s+/g, ' ');
  if (/(^|[^A-Z0-9])P001([^A-Z0-9]|$)/.test(c)) return 'labour';
  if (/(^|[^A-Z0-9])P002([^A-Z0-9]|$)/.test(c)) return 'part';
  return '';
}

function standardName(row) {
  const code = normalizeCode(row?.part_code);
  return String(PART_STANDARDIZATION[code] || row?.standardized_part || row?.part_description || '').toUpperCase();
}

function paid(row) {
  const value = String(row?.repair_line_item_type || '').toUpperCase().replace(/\s+/g, '');
  return value.includes('POSTWARRANTY') && value.includes('PAIDORDER');
}

function rank(row) {
  const t = row?.job_date ? new Date(row.job_date).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function bestRate(rows, paidOnly = false) {
  const valid = rows.filter(r => (!paidOnly || paid(r)) && Number(r?.rate) > 0)
    .sort((a,b) => rank(b) - rank(a)).slice(0,10);
  return valid.length ? Math.max(...valid.map(r => Number(r.rate))) : 0;
}

function latestQty(rows, fallback = 1) {
  const valid = rows.filter(r => Number(r?.quantity) > 0).sort((a,b) => rank(b)-rank(a));
  return valid.length ? Number(valid[0].quantity) : fallback;
}

function matchesPart(row, key) {
  if (category(row) !== 'part') return false;
  const code = normalizeCode(row?.part_code);
  const refs = (REFERENCE_PARTS[key] || []).map(normalizeCode);
  if (refs.includes(code)) return true;
  const names = families[key] || [];
  return names.some(n => standardName(row).includes(n));
}

function matchesLabour(row, key) {
  if (category(row) !== 'labour') return false;
  const text = [
    row?.part_description, row?.standardized_part, row?.repair_line_item_type,
    row?.repair_type, row?.part_code, row?.complaint_code
  ].join(' ').toUpperCase();
  const ref = LABOUR[key];
  if (ref && text.includes(ref[0])) return true;
  const tests = {
    engineOil: t => t.includes('ENGINE OIL') && (t.includes('FILTER') || t.includes('REFILL') || t.includes('DRAIN')),
    gearOil: t => t.includes('GEARBOX') || t.includes('GEAR BOX') || t.includes('GEAR OIL'),
    axleOil: t => t.includes('REAR AXLE') || t.includes('REAR AXEL') || t.includes('AXLE OIL'),
    steeringOil: t => t.includes('STEERING') && (t.includes('OIL') || t.includes('BOX') || t.includes('FLUID')),
    clutchOil: t => t.includes('CLUTCH') && (t.includes('OIL') || t.includes('BLEED') || t.includes('REFILL')),
    coolant: t => t.includes('COOLANT'), fuelFilter: t => t.includes('FUEL') && t.includes('FILTER'),
    airFilter: t => t.includes('AIR') && t.includes('FILTER'),
    hubGrease: t => t.includes('HUB') && t.includes('GREAS'),
    defFilter: t => t.includes('DEF') && (t.includes('SUCTION') || t.includes('FILTER')),
    defInline: t => t.includes('DEF') && t.includes('INLINE') && t.includes('FILTER'),
    apdaFilter: t => t.includes('APDA') || t.includes('DESICCANT')
  };
  return tests[key] ? tests[key](text) : false;
}

function historicalItem(type, key, rows, partNo, globalRates) {
  if (!rows.length) return null;
  const qty = latestQty(rows, type === 'labour' ? 1 : 0);
  if (!(qty > 0)) return null;

  const rate = bestRate(rows, type === 'part');
  const code = normalizeCode(partNo || rows[0]?.part_code);
  let finalRate = rate;

  if (type === 'part' && code) {
    const global = (globalRates || [])
      .filter(x => normalizeCode(x?.part_code) === code)
      .map(x => Number(x?.rate)).filter(x => x > 0);
    if (global.length) finalRate = Math.max(...global);
  }

  const source = rows.slice().sort((a,b) => rank(b)-rank(a))[0] || {};
  return {
    id: `${type}-${key}-${code}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    type, serviceKey:key, partNo:code,
    description:String(source.part_description || source.standardized_part || PART_STANDARDIZATION[code] || '').trim(),
    qty,
    rate:Number((type === 'part' ? finalRate * 1.18 : finalRate).toFixed(2)),
    baseRate:finalRate,
    source: finalRate ? (type === 'part' ? 'Historical DB (18% GST added)' : 'Historical DB - Labour base rate') : 'Manual'
  };
}

export function buildServiceItems(rows = [], modelRows = [], globalRates = [], selectedKeys = []) {
  const vehicle = Array.isArray(rows) ? rows : [];
  const model = Array.isArray(modelRows) ? modelRows : [];
  const output = [];

  for (const key of selectedKeys) {
    for (const code of (REFERENCE_PARTS[key] || [])) {
      const exactVehicle = vehicle.filter(r => category(r)==='part' && normalizeCode(r?.part_code)===code && Number(r?.quantity)>0);
      const exactModel = model.filter(r => category(r)==='part' && normalizeCode(r?.part_code)===code && Number(r?.quantity)>0);
      const candidates = exactVehicle.length ? exactVehicle : exactModel;
      const item = historicalItem('part', key, candidates, code, globalRates);
      if (item) output.push(item);
    }

    const labourRows = vehicle.filter(r => matchesLabour(r,key));
    const fallbackLabour = labourRows.length ? labourRows : model.filter(r => matchesLabour(r,key));
    if (fallbackLabour.length) {
      const ref = LABOUR[key];
      const item = historicalItem('labour', key, fallbackLabour, ref?.[0] || '', []);
      if (item) {
        if (ref) item.description = ref[1];
        output.push(item);
      }
    }
  }

  const seen = new Set();
  return output.filter(item => {
    if (item.type !== 'part') return true;
    const k = item.serviceKey + '|' + normalizeCode(item.partNo);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function makeManualItem(type='part') {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    type, partNo:'', description:'', qty:'', rate:0, source:'Manual'
  };
}

export function rateForManualPart(partNo, response) {
  const part = response?.part;
  if (!part) return { rate: 0, description: '' };
  const inclGst = Number(part.rateInclGst || 0);
  const baseRate = Number(part.rate || 0);
  const rate = inclGst > 0 ? inclGst : (baseRate > 0 ? Number((baseRate * 1.18).toFixed(2)) : 0);
  return { rate, description: String(part.description || '') };
}

export function totals(parts, labour) {
  const partsTotal = (parts || []).reduce((sum, r) => sum + (Number(r.qty)||0) * (Number(r.rate)||0), 0);
  const labourSubtotal = (labour || []).reduce((sum, r) => sum + (Number(r.qty)||0) * (Number(r.rate)||0), 0);
  const labourGst = labourSubtotal * 0.18;
  return {
    partsTotal,
    labourSubtotal,
    labourGst,
    subtotal: partsTotal + labourSubtotal,
    total: partsTotal + labourSubtotal + labourGst
  };
}
