const QTY_RULES = {
  engineOil: { min: 12, max: 22, label: "Engine Oil quantity must be 12–22 L" },
  gearOil: { min: 6, max: 9, label: "Gear Oil quantity must be 6–9 L" },
  steeringOil: { fixed: 3, label: "Steering Oil quantity should be 3 L" },
  axleOil: { min: 12, max: 33, label: "Axle Oil quantity must be 12–33 L" },
  clutchOil: { fixed: 0.5, label: "Clutch Oil quantity should be 0.5 L" },
  coolant: { min: 15, max: 30, label: "Coolant quantity must be 15–30 L" },
};

const LABELS = {
  engineOil: "Engine Oil",
  coolant: "Coolant",
  gearOil: "Gear Oil",
  axleOil: "Axle Oil",
  fuelFilter: "Fuel Filter",
  steeringOil: "Steering Oil",
  airFilter: "Air Filter",
  clutchOil: "Clutch Oil",
  defFilter: "DEF Filter",
  defInline: "DEF Inline Filter",
  apdaFilter: "APDA Filter",
};

const normalize = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const code = value => String(value || "").toUpperCase().replace(/\s+/g, "").trim();
const qty = item => Number(item?.qty || 0);
const description = item => normalize(item?.description);
const partCode = item => code(item?.partNo);
const hasText = (item, words) => {
  const text = description(item) + " " + normalize(partCode(item));
  return words.some(word => text.includes(normalize(word)));
};
const positiveParts = parts => (parts || []).filter(item =>
  item?.type === "part" && partCode(item) && qty(item) > 0
);
const sumQty = items => items.reduce((sum, item) => sum + qty(item), 0);

function validateQty(key, items, issues) {
  const rule = QTY_RULES[key];
  if (!rule) return;
  const candidates = items.filter(item => item.serviceKey === key);
  if (!candidates.length) return;
  const main = candidates.filter(item => {
    const text = description(item);
    if (key === "engineOil") return !text.includes("FILTER") && !text.includes("KIT");
    if (key === "steeringOil") return !text.includes("FILTER");
    return true;
  });
  if (!main.length) return;
  const total = sumQty(main);
  if (rule.fixed !== undefined && Math.abs(total - rule.fixed) > 0.001) {
    issues.push({ key: key + "-qty", aggregate: LABELS[key], message: rule.label + " (estimate: " + total + ")." });
  } else if (rule.min !== undefined && (total < rule.min || total > rule.max)) {
    issues.push({ key: key + "-qty", aggregate: LABELS[key], message: rule.label + " (estimate: " + total + ")." });
  }
}

/**
 * Checks the prepared/editable estimate against the aggregate grouping rules
 * already defined by the Service Decision Engine. Hub Greasing is deliberately
 * excluded: its model-specific hardcoded part/labour rules must remain untouched.
 * This is validation-only; it never invents a part number, rate, or quantity.
 */
export function validateEstimateAggregateSelection({ selectedServices = [], parts = [] } = {}) {
  const selected = [...new Set((selectedServices || []).filter(key => key && key !== "hubGrease"))];
  const validParts = positiveParts(parts);
  const issues = [];
  const add = (key, message) => issues.push({ key: key + "-" + issues.length, aggregate: LABELS[key] || key, message });

  for (const key of selected) {
    const aggregateParts = validParts.filter(item => item.serviceKey === key);
    if (!aggregateParts.length) {
      add(key, "No valid part line is present for this selected aggregate. Verify the part number and quantity before finalising.");
      continue;
    }

    if (key === "engineOil") {
      const oil = aggregateParts.filter(item =>
        !description(item).includes("FILTER") &&
        !description(item).includes("KIT") &&
        partCode(item) !== "F7A01500"
      );
      const oilFilter = validParts.some(item =>
        hasText(item, ["ENGINE OIL FILTER", "F7A01500"])
      );
      const fuelItems = validParts.filter(item => hasText(item, ["FUEL FILTER", "FUELFILTER", "P5105609"]));
      const fuelPair = sumQty(fuelItems) >= 2;
      const fuelKit = fuelItems.some(item =>
        hasText(item, ["KIT"]) && qty(item) >= 1
      );
      if (!oil.length) add(key, "Engine Oil part is missing; the oil filter or a kit cannot substitute for engine oil.");
      if (!oilFilter) add(key, "Engine Oil Filter is missing from the estimate.");
      if (!fuelPair && !fuelKit) add(key, "Fuel Filter grouping is incomplete: include a compatible pair (total quantity 2 or more) or a confirmed kit. Do not add an unverified part number.");
    }

    if (key === "steeringOil") {
      const oil = aggregateParts.some(item =>
        !description(item).includes("FILTER") &&
        (hasText(item, ["STEERING OIL", "POWER STEERING", "PSB99994"]))
      );
      const filter = validParts.some(item =>
        hasText(item, ["STEERING OIL FILTER", "PD600391"])
      );
      if (!oil) add(key, "Steering Oil part is missing.");
      if (!filter) add(key, "Steering Oil Filter is missing from the estimate.");
    }

    if (key === "defFilter") {
      const kit = aggregateParts.some(item => hasText(item, ["DEF FILTER KIT"]) && qty(item) >= 1);
      const air = aggregateParts.some(item => hasText(item, ["DEF DOSING PUMP AIR FILTER", "DEF FILTER AIR", "XFM00500"]));
      const suction = aggregateParts.some(item => hasText(item, ["DEF TANK SUCTION FILTER", "DEF FILTER SUCTION", "PET00001"]));
      if (!kit && !(air && suction)) {
        add(key, "DEF Filter grouping is incomplete: include a confirmed DEF filter kit, or both DEF Air Filter and DEF Suction Filter.");
      }
    }

    if (key === "fuelFilter") {
      const kit = aggregateParts.some(item => hasText(item, ["FUEL FILTER KIT", "FUEL FILTER ELEMENT KIT"]) && qty(item) >= 1);
      if (!kit && sumQty(aggregateParts.filter(item => hasText(item, ["FUEL FILTER", "FUELFILTER"]))) < 2) {
        add(key, "Fuel Filter grouping needs a compatible pair (total quantity 2 or more) or a confirmed kit.");
      }
    }

    validateQty(key, aggregateParts, issues);

    for (const item of aggregateParts) {
      if (!(Number(item.rate) > 0)) {
        add(key, "Rate is missing for part " + (item.partNo || "(blank)") + ". Confirm the current Price List Master rate.");
      }
    }
  }

  return issues;
}
