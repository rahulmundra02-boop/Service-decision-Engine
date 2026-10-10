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
const description = item => normalize(item?.standardizedFamily || item?.description);
const partCode = item => code(item?.partNo);
const hasText = (item, words) => {
  const text = description(item) + " " + normalize(partCode(item));
  return words.some(word => text.includes(normalize(word)));
};
const positiveParts = parts => (parts || []).filter(item =>
  item?.type === "part" && partCode(item) && qty(item) > 0
);
const sumQty = items => items.reduce((sum, item) => sum + qty(item), 0);
const textHasAny = (text, words) => words.some(word => text.includes(normalize(word)));

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
        description(item) === "ENGINE OIL" && partCode(item) !== "F7A01500"
      );
      const oilFilters = aggregateParts.filter(item => description(item) === "ENGINE OIL FILTER");
      if (!oil.length) add(key, "Engine Oil part is missing; the oil filter cannot substitute for engine oil.");
      if (oilFilters.length !== 1 || Math.abs(qty(oilFilters[0]) - 1) > 0.001) {
        add(key, "Engine Oil Filter family must contain exactly one filter (quantity 1).");
      }
    }

    if (key === "steeringOil") {
      const oil = aggregateParts.some(item => description(item) === "STEERING OIL");
      const filters = aggregateParts.filter(item => description(item) === "STEERING OIL FILTER");
      if (!oil) add(key, "Steering Oil part is missing.");
      if (filters.length !== 1 || Math.abs(qty(filters[0]) - 1) > 0.001) {
        add(key, "Steering Oil Filter family must contain exactly one filter (quantity 1).");
      }
    }

    if (key === "defFilter") {
      const kit = aggregateParts.filter(item => description(item) === "DEF FILTER KIT");
      const air = aggregateParts.filter(item => ["DEF DOSING PUMP AIR FILTER", "DEF FILTER AIR"].includes(description(item)));
      const suction = aggregateParts.filter(item => ["DEF TANK SUCTION FILTER", "DEF FILTER SUCTION"].includes(description(item)));
      const kitValid = kit.length === 1 && aggregateParts.length === 1 && Math.abs(qty(kit[0]) - 1) <= 0.001;
      const componentsValid = air.length === 1 && suction.length === 1 && aggregateParts.length === 2 &&
        Math.abs(qty(air[0]) - 1) <= 0.001 && Math.abs(qty(suction[0]) - 1) <= 0.001;
      if (!kitValid && !componentsValid) {
        add(key, "DEF Filter must be exactly one DEF Filter Kit (qty 1), or one DEF Air Filter + one DEF Suction Filter (qty 1 each).");
      }
    }

    if (key === "fuelFilter") {
      const kits = aggregateParts.filter(item => description(item) === "FUEL FILTER KIT");
      const individual = aggregateParts.filter(item => description(item) === "FUEL FILTER");
      const distinctCodes = new Set(individual.map(partCode).filter(Boolean));
      const kitValid = kits.length === 1 && aggregateParts.length === 1 && Math.abs(qty(kits[0]) - 1) <= 0.001;
      const pairValid = individual.length === 2 && aggregateParts.length === 2 && distinctCodes.size === 2 &&
        individual.every(item => Math.abs(qty(item) - 1) <= 0.001);
      if (!kitValid && !pairValid) {
        add(key, "Fuel Filter must be either one Fuel Filter Kit (qty 1), or two different Fuel Filter part numbers (qty 1 each).");
      }
    }

    if (key === "airFilter") {
      const kits = aggregateParts.filter(item => description(item) === "AIR FILTER KIT");
      const individual = aggregateParts.filter(item => description(item) === "AIR FILTER");
      const distinctCodes = new Set(individual.map(partCode).filter(Boolean));
      const kitValid = kits.length === 1 && aggregateParts.length === 1 && Math.abs(qty(kits[0]) - 1) <= 0.001;
      const pairValid = individual.length === 2 && aggregateParts.length === 2 && distinctCodes.size === 2 &&
        individual.every(item => Math.abs(qty(item) - 1) <= 0.001);
      if (!kitValid && !pairValid) {
        add(key, "Air Filter must be either one Air Filter Kit (qty 1), or two different Air Filter part numbers (qty 1 each).");
      }
    }

    if (key === "coolant" && aggregateParts.length !== 1) {
      add(key, "Use one matching Coolant part number only; do not add every matching Coolant part from the DB.");
    }

    if (key === "defInline" && (aggregateParts.length !== 1 || Math.abs(qty(aggregateParts[0]) - 1) > 0.001)) {
      add(key, "DEF Inline Filter selection must contain exactly one filter (quantity 1).");
    }

    if (key === "apdaFilter" && (aggregateParts.length !== 1 || Math.abs(qty(aggregateParts[0]) - 1) > 0.001)) {
      add(key, "APDA Filter selection must contain exactly one piece (quantity 1).");
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
