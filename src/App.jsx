import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import html2pdf from "html2pdf.js";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import "./App.css";
import AuthGate from "./AuthGate.jsx";

const PART_STANDARDIZATION = {
  'FS0501': '1st Free service',
  'FS0502': '2nd Free Service',
  'FS0503': '3rd Free Service',
  'B4847805': 'Air Filter',
  'B4847806': 'Air Filter',
  'B7763301': 'Air Filter',
  'F3931800': 'Air Filter',
  'F3931900': 'Air Filter',
  'F3933800': 'Air Filter',
  'F4000710': 'Air Filter',
  'F4002800': 'Air Filter',
  'F4002900': 'Air Filter',
  'F7403100': 'Air Filter',
  'F7816800': 'Air Filter',
  'F7A00900': 'Air Filter',
  'F7A02300': 'Air Filter',
  'F7B00700': 'Air Filter',
  'F7B00800': 'Air Filter',
  'F7B00900': 'Air Filter',
  'F7B01000': 'Air Filter',
  'F7B01100': 'Air Filter',
  'F7B01200': 'Air Filter',
  'F7B01500': 'Air Filter',
  'F7B01600': 'Air Filter',
  'F7B01800': 'Air Filter',
  'F7B01900': 'Air Filter',
  'F7B02000': 'Air Filter',
  'F7B02100': 'Air Filter',
  'F7B02700': 'Air Filter',
  'F7B02800': 'Air Filter',
  'F8006600': 'Air Filter',
  'F8008800': 'Air Filter',
  'F8095300': 'Air Filter',
  'F8211200': 'Air Filter',
  'F8211300': 'Air Filter',
  'F8221200': 'Air Filter',
  'F8221300': 'Air Filter',
  'F8272900': 'Air Filter',
  'F8283900': 'Air Filter',
  'F8284000': 'Air Filter',
  'F8348800': 'Air Filter',
  'F8800400': 'Air Filter',
  'F8845800': 'Air Filter',
  'F8845900': 'Air Filter',
  'FG800400': 'Air Filter',
  'FG800500': 'Air Filter',
  'FG800600': 'Air Filter',
  'FG800700': 'Air Filter',
  'FG800900': 'Air Filter',
  'FG801000': 'Air Filter',
  'FG801100': 'Air Filter',
  'FG801200': 'Air Filter',
  'FG802600': 'Air Filter',
  'FG802700': 'Air Filter',
  'FG803100': 'Air Filter',
  'FG803500': 'Air Filter',
  'FG803600': 'Air Filter',
  'FG803700': 'Air Filter',
  'FG803800': 'Air Filter',
  'FG803900': 'Air Filter',
  'K4031700': 'Air Filter',
  'P0Z00440': 'Air Filter',
  'P0Z01550': 'Air Filter',
  'P0Z01607': 'Air Filter',
  'P0Z01747': 'Air Filter',
  'P0Z02196': 'Air Filter',
  'P0Z02234': 'Air Filter',
  'P0Z04854': 'Air Filter',
  'P0Z06210': 'Air Filter',
  'P0Z06389': 'Air Filter',
  'P1001739': 'Air Filter',
  'P1007339': 'Air Filter',
  'P1300739': 'Air Filter',
  'P1405539': 'Air Filter',
  'P2603840': 'Air Filter',
  'P5000240': 'Air Filter',
  'P5600739': 'Air Filter',
  'P5900140LP': 'Air Filter',
  'P7A00110': 'Air Filter',
  'P7A00119': 'Air Filter',
  'P7A00120': 'Air Filter',
  'P7B00004': 'Air Filter',
  'P7B00005': 'Air Filter',
  'P7B00006': 'Air Filter',
  'P7B00010': 'Air Filter',
  'P7B00017': 'Air Filter',
  'P7B00049': 'Air Filter',
  'P7B00050': 'Air Filter',
  'P7B00051': 'Air Filter',
  'P7B00052': 'Air Filter',
  'P7B00053': 'Air Filter',
  'P7B00054': 'Air Filter',
  'P7B00055': 'Air Filter',
  'P7B00056': 'Air Filter',
  'P7B00057': 'Air Filter',
  'P7B00058': 'Air Filter',
  'P7B00063': 'Air Filter',
  'P7B00064': 'Air Filter',
  'P8910539': 'Air Filter',
  'P8911139': 'Air Filter',
  'P9000340': 'Air Filter',
  'P9000940': 'Air Filter',
  'P9003639': 'Air Filter',
  'X3939400': 'Air Filter',
  'X3962700': 'Air Filter',
  'X3962800': 'Air Filter',
  'X7424600': 'Air Filter',
  'X8800114': 'Air Filter',
  'X8800214': 'Air Filter',
  'X8806400': 'Air Filter',
  'X8806500': 'Air Filter',
  'B2M01101': 'Air Filter Assy',
  'F7A03100': 'Air Filter Assy',
  'F7A03800': 'Air Filter Assy',
  'F7A04400': 'Air Filter Assy',
  'F8210000': 'Air Filter Assy',
  'MB442002': 'Air Filter Assy',
  'B4826601': 'Air Filter Kit',
  'F7A00610': 'Air Filter Kit',
  'P0996151': 'Air Filter Kit',
  'P0996251': 'Air Filter Kit',
  'P2604251': 'Air Filter Kit',
  'P2604351': 'Air Filter Kit',
  'P5104005': 'Air Filter Kit',
  'P5104006': 'Air Filter Kit',
  'P5104007': 'Air Filter Kit',
  'P5104008': 'Air Filter Kit',
  'P5104009': 'Air Filter Kit',
  'P5104014': 'Air Filter Kit',
  'P5104015': 'Air Filter Kit',
  'P5104016': 'Air Filter Kit',
  'P5104335': 'Air Filter Kit',
  'P5104689': 'Air Filter Kit',
  'P5104890': 'Air Filter Kit',
  'P5105384': 'Air Filter Kit',
  'P5105385': 'Air Filter Kit',
  'P5105386': 'Air Filter Kit',
  'P5105667': 'Air Filter Kit',
  'P5105688': 'Air Filter Kit',
  'P5105689': 'Air Filter Kit',
  'P5106486': 'Air Filter Kit',
  'P7A00078': 'Air Filter Kit',
  'PD601424': 'Air Filter Kit',
  'PD601425': 'Air Filter Kit',
  'PD601426': 'Air Filter Kit',
  'PD601427': 'Air Filter Kit',
  'P1800240': 'APDA Filter',
  'PD600968': 'APDA Filter',
  'PD601147': 'APDA Filter',
  'F1E02100': 'APDA Filter (Assy)',
  'F1E02200': 'APDA Filter (Assy)',
  'F1E02300': 'APDA Filter (Assy)',
  'F1E02400': 'APDA Filter (Assy)',
  'F1E02500': 'APDA Filter (Assy)',
  'GB699991': 'Axle Oil',
  'R9999998': 'Axle Oil',
  'B4H04501': 'Big Sump',
  'FS0500': 'Body Building Checkup',
  'FL100290': 'Cluster Meter',
  'FL100390': 'Cluster Meter',
  'CFD99991': 'Clutch Oil',
  'CLA99994': 'Clutch Oil',
  'U9999995': 'Clutch Oil',
  'U9999999': 'Clutch Oil',
  'C9999991': 'Coolant',
  'C9999993': 'Coolant',
  'C9999996': 'Coolant',
  'C9999998': 'Coolant',
  'COA99994': 'Coolant',
  'COD99991': 'Coolant',
  'COD99994': 'Coolant',
  'MB404069': 'DEF Filter air',
  'XFM00200': 'DEF Filter Air',
  'XFM00300': 'DEF Filter Air',
  'XFM00500': 'DEF Filter Air',
  'XFZ00900': 'DEF Filter Breather',
  'P5105669': 'DEF Filter Kit',
  'P5105776': 'DEF Filter Kit',
  'P5106222': 'DEF Filter Kit',
  'XFZ00100': 'DEF Filter Nack',
  'PET00001': 'DEF Filter Suction',
  'XFZ00200': 'DEF Filter Suction',
  'XFZ01000': 'DEF Filter Suction',
  'XFZ02900': 'DEF Filter Suction',
  'XFM00800': 'DEF Inline Filter',
  'E9999998': 'Engine Oil',
  'EN699991': 'Engine Oil',
  'EN699992': 'Engine Oil',
  'EN6A9991': 'Engine Oil',
  'EN6A9992': 'Engine Oil',
  'F7A01500': 'Engine Oil Filter',
  'ENB99998': 'Engine Oil',
  'F7A05000': 'Engine Oil Filter',
  'FPA00300': 'Engine Oil Filter',
  'P7A00029': 'Engine Oil Filter',
  'X4000300': 'Engine Oil Filter',
  'X4001000': 'Engine Oil Filter',
  'B3J02801': 'Fuel Filter',
  'F4000700': 'Fuel Filter',
  'F4000800': 'Fuel Filter',
  'F4003400': 'Fuel Filter',
  'FHJ00400': 'Fuel Filter',
  'FHJ00600': 'Fuel Filter',
  'FHJ00700': 'Fuel Filter',
  'FHJ00900': 'Fuel Filter',
  'FHJ01000': 'Fuel Filter',
  'FHJ01400': 'Fuel Filter',
  'FHJ01600': 'Fuel Filter',
  'FHJ01700': 'Fuel Filter',
  'FHJ01800': 'Fuel Filter',
  'FHJ01900': 'Fuel Filter',
  'FHJ02000': 'Fuel Filter',
  'FHJ02100': 'Fuel Filter',
  'FHJ02200': 'Fuel Filter',
  'FHJ02300': 'Fuel Filter',
  'FHJ02400': 'Fuel Filter',
  'FHJ02500': 'Fuel Filter',
  'FHJ02600': 'Fuel Filter',
  'FHN00100': 'Fuel Filter',
  'FHN00300': 'Fuel Filter',
  'FHN00400': 'Fuel Filter',
  'FHN00700': 'Fuel Filter',
  'FHN00800': 'Fuel Filter',
  'FHN00900': 'Fuel Filter',
  'FHN01100': 'Fuel Filter',
  'FHN01300': 'Fuel Filter',
  'K3909300': 'Fuel Filter',
  'K3909500': 'Fuel Filter',
  'K4031200': 'Fuel Filter',
  'K4032000': 'Fuel Filter',
  'K4032200': 'Fuel Filter',
  'P0967551': 'Fuel Filter',
  'P0967651': 'Fuel Filter',
  'P0979351': 'Fuel Filter',
  'P0984651': 'Fuel Filter',
  'P0Z00439': 'Fuel Filter',
  'P0Z01745': 'Fuel Filter',
  'P0Z01746': 'Fuel Filter',
  'P0Z01829': 'Fuel Filter',
  'P0Z02195': 'Fuel Filter',
  'P0Z02668': 'Fuel Filter',
  'P0Z02669': 'Fuel Filter',
  'P0Z06209': 'Fuel Filter',
  'P1300439': 'Fuel Filter',
  'P1301640': 'Fuel Filter',
  'P1303639': 'Fuel Filter',
  'P2602640': 'Fuel Filter',
  'P2800440': 'Fuel Filter',
  'P4100140': 'Fuel Filter',
  'P5000639': 'Fuel Filter',
  'P5104332': 'Fuel Filter',
  'P5104480': 'Fuel Filter',
  'P5104481': 'Fuel Filter',
  'X8820800': 'Fuel Filter',
  'P7A00031': 'Fuel Filter',
  'P7A00090': 'Fuel Filter',
  'P7B00002': 'Fuel Filter',
  'P7B00003': 'Fuel Filter',
  'P7B00009': 'Fuel Filter',
  'P7B00031': 'Fuel Filter',
  'P7B00047': 'Fuel Filter',
  'P7B00048': 'Fuel Filter',
  'P7B00066': 'Fuel Filter',
  'P7B00071': 'Fuel Filter',
  'P8100940': 'Fuel Filter',
  'P8101040': 'Fuel Filter',
  'P8900340': 'Fuel Filter',
  'P8900440': 'Fuel Filter',
  'P8905039': 'Fuel Filter',
  'P9000840': 'Fuel Filter',
  'P9001539': 'Fuel Filter',
  'PHJ00001': 'Fuel Filter',
  'PHJ00002': 'Fuel Filter',
  'PHJ00003': 'Fuel Filter',
  'PHJ00004': 'Fuel Filter',
  'PHJ00005': 'Fuel Filter',
  'PHJ00006': 'Fuel Filter',
  'PHJ00009': 'Fuel Filter',
  'PHJ00010': 'Fuel Filter',
  'PHJ00011': 'Fuel Filter',
  'PHJ00012': 'Fuel Filter',
  'PHJ00014': 'Fuel Filter',
  'PHJ00015': 'Fuel Filter',
  'PHJ00017': 'Fuel Filter',
  'PHJ00018': 'Fuel Filter',
  'PHJ00019': 'Fuel Filter',
  'PHJ00020': 'Fuel Filter',
  'X7423500': 'Fuel Filter',
  'X7459800': 'Fuel Filter',
  'P5104716': 'Fuel Filter & Engine Oil Filter Kit',
  'P5105607': 'Fuel Filter & Engine Oil Filter Kit',
  'P5105608': 'Fuel Filter & Engine Oil Filter Kit',
  'P5105701': 'Fuel Filter & Engine Oil Filter Kit',
  'P5105702': 'Fuel Filter & Engine Oil Filter Kit',
  'P5106461': 'Fuel Filter & Engine Oil Filter Kit',
  'P0Z01606': 'Fuel Filter Kit',
  'P5104010': 'Fuel Filter Kit',
  'P5104012': 'Fuel Filter Kit',
  'P5104719': 'Fuel Filter Kit',
  'P5104722': 'Fuel Filter Kit',
  'P5104723': 'Fuel Filter Kit',
  'P5104724': 'Fuel Filter Kit',
  'P5104725': 'Fuel Filter Kit',
  'P5104726': 'Fuel Filter Kit',
  'P5104727': 'Fuel Filter Kit',
  'P5104728': 'Fuel Filter Kit',
  'P5104729': 'Fuel Filter Kit',
  'P5104730': 'Fuel Filter Kit',
  'P5104731': 'Fuel Filter Kit',
  'P5104732': 'Fuel Filter Kit',
  'P5104733': 'Fuel Filter Kit',
  'P5104734': 'Fuel Filter Kit',
  'P5104735': 'Fuel Filter Kit',
  'P5104736': 'Fuel Filter Kit',
  'P5104737': 'Fuel Filter Kit',
  'P5105606': 'Fuel Filter Kit',
  'P5105609': 'Fuel Filter Kit',
  'P5104720': 'Fuel Filter Kit',
  'P5105703': 'Fuel Filter Kit',
  'P7A00042': 'Fuel Filter Kit',
  'G9999994': 'Gear Oil',
  'G9999995': 'Gear Oil',
  'G9999998': 'Gear Oil',
  'G9999997': 'Hub Grease',
  'S9999997': 'Hub Grease',
  'S9999999': 'Hub Grease',
  'FS0H1D': 'Hub grease 10 Hub',
  'FS0H1A': 'Hub grease 4 Hub',
  'FS0H1B': 'Hub grease 6 Hub',
  'FS0H1C': 'Hub grease 8 Hub',
  'P5104178': 'Hub Grease Kit',
  'P5104179': 'Hub Grease Kit',
  'P5104180': 'Hub Grease Kit',
  'P5104181': 'Hub Grease Kit',
  'P5104182': 'Hub Grease Kit',
  'P5104183': 'Hub Grease Kit',
  'P5104184': 'Hub Grease Kit',
  'P5104185': 'Hub Grease Kit',
  'P5104186': 'Hub Grease Kit',
  'P5104738': 'Hub Grease Kit',
  'P5104739': 'Hub Grease Kit',
  'P5104740': 'Hub Grease Kit',
  'P5104741': 'Hub Grease Kit',
  'P5104742': 'Hub Grease Kit',
  'P5104743': 'Hub Grease Kit',
  'P5104744': 'Hub Grease Kit',
  'P5104745': 'Hub Grease Kit',
  'P5104746': 'Hub Grease Kit',
  'P5104758': 'Hub Grease Kit',
  'P5104759': 'Hub Grease Kit',
  'P5104760': 'Hub Grease Kit',
  'P5105052': 'Hub Grease Kit',
  'P5105053': 'Hub Grease Kit',
  'P5105306': 'Hub Grease Kit',
  'P5106144': 'Hub Grease Kit',
  'MCB850Z': 'GHCV Replaced',
  'FS0001': 'PDI Service',
  'P9999999': 'Steering Oil',
  'PSB99994': 'Steering Oil',
  'W9999998': 'Steering Oil',
  'P4200340': 'Steering Oil Filter',
  'PD600391': 'Steering Oil Filter',
  'B4C00401': 'Sump Suction pipe',
  'WHL110': 'Wheel Alignment - 2',
  'WHL115': 'Wheel Alignment - 3',
  'WHL130': 'Wheel Alignment - 3',
  'WHL135': 'Wheel Alignment - 3',
  'WHL120': 'Wheel Alignment - 4',
  'WHL125': 'Wheel Alignment - 5',
  'FS0W00': 'Wheel Alignment 1st',
  'FS0W01': 'Wheel Alignment 2nd',
  'FS0W02': 'Wheel Alignment 3rd',
  'FS0W03': 'Wheel Alignment 4th',
};

// ============================================================
// DMS HEADER-BASED IMPORT
// IMPORTANT: Never depend on Excel column position.
// Every field is resolved from its actual DMS header name.
// Duplicate headers are handled by occurrence number where required.
// ============================================================

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ");
}

function headerIndex(headers, exactNames = [], startsWithNames = [], occurrence = 0) {
  const actual = headers.map(normalizeHeader);
  const exact = exactNames.map(normalizeHeader);
  const prefixes = startsWithNames.map(normalizeHeader);

  // Exact header name has highest priority.
  let matches = [];
  for (const wanted of exact) {
    matches = actual.reduce((out, h, i) => {
      if (h === wanted) out.push(i);
      return out;
    }, []);
    if (matches.length) return matches[occurrence] ?? -1;
  }

  // Used only for DMS headers that are intentionally truncated, e.g.
  // "Vehicle Identification Number (Vehicle I...".
  for (const prefix of prefixes) {
    matches = actual.reduce((out, h, i) => {
      if (h.startsWith(prefix)) out.push(i);
      return out;
    }, []);
    if (matches.length) return matches[occurrence] ?? -1;
  }

  return -1;
}

function customerNameIndex(headers, dataLines, delimiter) {
  const normalized = headers.map(normalizeHeader);
  const candidates = normalized
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header === "name" || (header.includes("customer") && header.includes("name")));

  if (!candidates.length) return -1;

  // Some DMS exports contain more than one Name-like column.  Inspect a small
  // sample: a genuine customer name contains letters, whereas a customer ID is
  // entirely numeric.  Explicit Customer Name headers retain a small priority.
  const sampleRows = dataLines.slice(0, 40).map((line) => {
    let cells = splitDelimitedLine(line, delimiter);
    if (delimiter === "|") cells = cells.filter((value, index) => !(index === 0 && !value) && !(index === cells.length - 1 && !value));
    return cells;
  });

  return candidates
    .map(({ header, index }) => {
      const values = sampleRows.map((row) => String(row[index] ?? "").trim()).filter(Boolean);
      const textValues = values.filter((value) => /[A-Za-z]/.test(value)).length;
      const numericValues = values.filter((value) => /^\d+(?:\.\d+)?$/.test(value)).length;
      return { index, score: (header.includes("customer") ? 25 : 0) + textValues * 10 - numericValues * 20 };
    })
    .sort((left, right) => right.score - left.score)[0].index;
}

function customerNameFromRow(headers, cells, preferredIndex) {
  const candidates = headers
    .map((header, index) => ({ header: normalizeHeader(header), index }))
    .filter(({ header }) => header === "name" || (header.includes("customer") && header.includes("name")));

  // Use the row's own textual value, not only a file-level column choice.
  // This protects imports with duplicate or inconsistently ordered Name fields.
  const textual = candidates
    .map(({ index }) => String(cells[index] ?? "").trim())
    .find(isUsableCustomerName);

  return textual || String(cells[preferredIndex] ?? "").trim();
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }

  const m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNumber(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return 0;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function formatDate(date) {
  if (!date) return "-";
  return date.toLocaleDateString("en-GB");
}

function formatDateShort(date) {
  if (!date) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function formatVehicleAge(saleDate, asOfDate = new Date()) {
  if (!saleDate) return "";
  const start = new Date(saleDate);
  const end = new Date(asOfDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "0 Years, 0 Months, 0 Days";

  let years = end.getFullYear() - start.getFullYear();
  let anniversary = new Date(start);
  anniversary.setFullYear(start.getFullYear() + years);

  if (anniversary > end) {
    years -= 1;
    anniversary = new Date(start);
    anniversary.setFullYear(start.getFullYear() + years);
  }

  let months = end.getMonth() - anniversary.getMonth();
  if (end.getDate() < anniversary.getDate()) months -= 1;
  if (months < 0) months += 12;

  const monthAnchor = new Date(anniversary);
  monthAnchor.setMonth(monthAnchor.getMonth() + months);
  const days = Math.max(0, Math.floor((end - monthAnchor) / 86400000));

  return `${years} Year${years === 1 ? "" : "s"}, ${months} Month${months === 1 ? "" : "s"}, ${days} Day${days === 1 ? "" : "s"}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function isUsableCustomerName(value) {
  const name = String(value ?? "").trim();
  // DMS customer IDs are numeric. Never present such an ID as a person's or
  // company's name, even when an export has put it in a Name-like column.
  return !!name && /[A-Za-z]/.test(name);
}

function isUsableCustomerNumber(value) {
  return /^\d{3,}$/.test(String(value ?? "").trim());
}

function normalizePartCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\(L\)/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function standardizePart(code, description) {
  const key = normalizePartCode(code);
  if (key && PART_STANDARDIZATION[key]) return PART_STANDARDIZATION[key];
  return String(description ?? "").trim();
}


// ============================================================
// EXCEL FILE UPLOAD + MULTI-FILE MERGE
// - Supports one or multiple .xlsx/.xls/.csv files.
// - Every row is still parsed through the same header-based parser.
// - Duplicate DMS history rows are removed BEFORE analysis.
// - VIN is the vehicle identity.
// - Same VIN + same service-history identity = duplicate -> keep once.
// - Same VIN + different genuine history row = retain.
// ============================================================

function makeHistoryRowKey(record) {
  const date = record?.date ? formatDate(record.date) : "";
  const vin = normalizePartCode(record?.vin);
  const jobCard = String(record?.jobCard ?? "").trim().toUpperCase();
  const reading = String(Number(record?.reading || 0));
  const secondaryReading = String(Number(record?.secondaryReading || 0));
  const partCode = normalizePartCode(record?.partCode);
  const qty = String(Number(record?.qty || 0));
  const itemNumber = String(record?.itemNumber ?? "").trim().toUpperCase();

  // Item number is included where available because two different DMS line
  // items can otherwise look identical. For repeated exports of the same
  // history, the identity remains the same and the row is kept only once.
  return [
    vin,
    date,
    jobCard,
    reading,
    secondaryReading,
    partCode,
    qty,
    itemNumber
  ].join("||");
}

function deduplicateAcrossFiles(fileRecordSets) {
  // IMPORTANT:
  // Duplicate protection is ONLY across different uploaded files.
  // If the same file itself contains duplicate rows, ALL of those rows
  // are retained because the user may intentionally have duplicate DMS lines.
  //
  // Example:
  // File-1: same row appears twice -> keep both
  // File-2: same row already existed in File-1 -> ignore File-2 copy
  const seenFromEarlierFiles = new Set();
  const unique = [];
  let duplicateCount = 0;

  for (const fileRecords of fileRecordSets) {
    const currentFileKeys = new Set();

    // First pass: preserve EVERY row from the current file unless the same
    // history row was already present in an EARLIER uploaded file.
    for (const record of fileRecords) {
      const key = makeHistoryRowKey(record);

      // Rows without a usable identity are always retained.
      if (!record?.vin || !key || key.startsWith("||||")) {
        unique.push(record);
        continue;
      }

      if (seenFromEarlierFiles.has(key)) {
        duplicateCount++;
        continue;
      }

      // Do NOT check currentFileKeys here.
      // Therefore duplicate rows within the same file are intentionally kept.
      unique.push(record);
      currentFileKeys.add(key);
    }

    // Only after the complete current file has been processed, add its keys
    // to the cross-file duplicate set.
    for (const key of currentFileKeys) {
      seenFromEarlierFiles.add(key);
    }
  }

  return { records: unique, duplicateCount };
}

async function parseExcelFiles(files) {
  if (!files?.length) {
    throw new Error("Kam se kam 1 Excel file select karein.");
  }

  const fileRecordSets = [];
  const fileNames = [];
  const failedFiles = [];

  for (const file of files) {
    let fileRecords = [];
    let fileFailed = false;
    let fileError = "";

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        raw: false
      });

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
          defval: "",
          blankrows: false
        });

        if (!rows.length) continue;

        const cellToText = (value) => {
          if (value instanceof Date && !Number.isNaN(value.getTime())) {
            const dd = String(value.getDate()).padStart(2, "0");
            const mm = String(value.getMonth() + 1).padStart(2, "0");
            const yyyy = value.getFullYear();
            return `${dd}-${mm}-${yyyy}`;
          }
          return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
        };

        const tsv = rows
          .map(row => row.map(cellToText).join("\t"))
          .join("\n");

        if (!tsv.trim()) continue;

        try {
          const parsed = parseExcelPaste(tsv);
          fileRecords.push(...parsed.records);
        } catch (err) {
          const rowCount = tsv.trim().split(/\r?\n/).length;

          // A sheet with only a header/one row can be an empty or irrelevant
          // worksheet, so keep the existing ignore behavior for that case.
          if (rowCount > 1) {
            fileFailed = true;
            fileError = err?.message || "Required headers nahi mile.";
            break;
          }
        }
      }
    } catch (err) {
      fileFailed = true;
      fileError = err?.message || "Excel file read nahi ho payi.";
    }

    // If any real data sheet in this file has invalid/missing required
    // headers, ignore the COMPLETE file rather than silently using partial data.
    if (fileFailed) {
      failedFiles.push({
        name: file.name,
        reason: fileError
      });
      continue;
    }

    if (fileRecords.length) {
      fileRecordSets.push(fileRecords);
      fileNames.push(file.name);
    } else {
      failedFiles.push({
        name: file.name,
        reason: "Valid DMS service-history data ya required headers not found."
      });
    }
  }

  // Do not abort the whole upload when every file is invalid.
  // Return the failed-file details so the UI can clearly tell the user which
  // file was ignored and which required headers were missing.
  const allRecords = fileRecordSets.flat();
  const deduped = deduplicateAcrossFiles(fileRecordSets);

  return {
    records: deduped.records,
    files: fileNames,
    failedFiles,
    totalRowsBeforeDedup: allRecords.length,
    duplicateRowsIgnored: deduped.duplicateCount
  };
}

function parseExcelPaste(text) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    throw new Error("Excel data me header aur kam se kam 1 data row hona chahiye.");
  }

  // Excel copy/paste normally uses TAB. CSV and pipe-delimited/markdown
  // representations are also supported. Header names, not column positions,
  // determine every field.
  const firstLine = lines[0].trim();
  let delimiter = "\t";
  if (!firstLine.includes("\t")) {
    if (firstLine.includes("|") && (firstLine.match(/\|/g) || []).length >= 2) delimiter = "|";
    else delimiter = ",";
  }
  let headers = splitDelimitedLine(lines[0], delimiter).map((x) => x.trim());
  // If the input is a markdown table, remove the outer pipe/empty cells.
  if (delimiter === "|") headers = headers.filter((h, i) => !(i === 0 && !h) && !(i === headers.length - 1 && !h));

  // Resolve EVERY functional field from its header, never from a fixed column number.
  // The DMS export contains two "Fleet counter unit" headers. First = primary,
  // second = cumulative-counter unit. This is the only duplicate-header rule needed.
  const col = {
    jobCard: headerIndex(headers,
      ["job card number"], ["job card number"]),

    date: headerIndex(headers,
      ["document date (date received/sent)", "document date"], ["document date"]),

    reading: headerIndex(headers,
      ["km/hr reading"], ["km/hr reading", "km / hr reading"]),

    unit: headerIndex(headers,
      ["fleet counter unit"], ["fleet counter unit"], 0),

    cumulative: headerIndex(headers,
      ["cumulative counter reading"], ["cumulative counter reading"]),

    cumulativeUnit: headerIndex(headers,
      ["fleet counter unit"], ["fleet counter unit"], 1),

    serviceType: headerIndex(headers,
      ["service type"], ["service type"]),

    itemCategory: headerIndex(headers,
      ["item category"], ["item category"]),

    partCode: headerIndex(headers,
      ["labour value/part code"], ["labour value/part code"]),

    part: headerIndex(headers,
      ["labour value/part description"], ["labour value/part description"]),

    qty: headerIndex(headers,
      ["quantity"], ["quantity"]),

    // DMS Net Value is the total line value before tax.
    // Store only the derived per-unit rate in DB: Net Value / Quantity.
    netValue: headerIndex(headers,
      ["net value"]),

    inward: headerIndex(headers,
      ["inward date"], ["inward date"]),

    reg: headerIndex(headers,
      ["registration number"], ["registration number"]),

    lineOfBusiness: headerIndex(headers,
      ["line of business"], ["line of business"]),

    engine: headerIndex(headers,
      ["engine code"], ["engine code"]),

    sale: headerIndex(headers,
      ["sale date"], ["sale date"]),

    model: headerIndex(headers,
      ["model line"], ["model line"]),

    repairTypeLine: headerIndex(headers,
      ["repaire type line", "repair type line"], ["repaire type line", "repair type line"]),

    checkInDate: headerIndex(headers,
      ["check-in date"], ["check-in date"]),

    vin: headerIndex(headers,
      ["vehicle identification number (vehicle identification number)", "vehicle identification number"],
      ["vehicle identification number"]),

    customerNumber: headerIndex(headers,
      ["customer number"], ["customer number"]),

    customerName: customerNameIndex(headers, lines.slice(1), delimiter),

    customerVoice: headerIndex(headers,
      ["customer voice"], ["customer voice"]),

    driverName: headerIndex(headers,
      ["driver name"], ["driver name"]),

    driverPhone: headerIndex(headers,
      ["driver phone number"], ["driver phone number"]),

    serviceContactName: headerIndex(headers,
      ["service contact person name"], ["service contact person name"]),

    serviceContactPhone: headerIndex(headers,
      ["service contact person phone number"], ["service contact person phone number"]),

    serviceQuote: headerIndex(headers,
      ["service quote number"], ["service quote number"]),

    itemNumber: headerIndex(headers,
      ["item number of the sd document"], ["item number of the sd document"]),

    salesOrgName: headerIndex(headers,
      ["sales organization name"], ["sales organization name"]),

    plantName: headerIndex(headers,
      ["plant name", "plant", "service center name", "workshop name", "dealer name"],
      ["plant name", "plant", "service center name", "workshop name", "dealer name"]),

    secondaryReading: headerIndex(headers,
      ["secondary counter reading"], ["secondary counter reading"]),

    secondaryUnit: headerIndex(headers,
      ["secondary counter unit"], ["secondary counter unit"]),

    secondaryCumulativeReading: headerIndex(headers,
      ["secondary cumulative reading"], ["secondary cumulative reading"]),

    secondaryCumulativeUnit: headerIndex(headers,
      ["secondary cumulative unit"], ["secondary cumulative unit"]),

    faultCode: headerIndex(headers,
      ["fault code"], ["fault code"]),

    repairType: headerIndex(headers,
      ["repair type"], ["repair type"]),

    billingDocument: headerIndex(headers,
      ["billing document number"], ["billing document number"]),

    mechanic: headerIndex(headers,
      ["mechanic"], ["mechanic"]),

    startDate: headerIndex(headers,
      ["start date"], ["start date"]),

    endDate: headerIndex(headers,
      ["end date"], ["end date"]),

    withinWarranty: headerIndex(headers,
      ["within warranty"], ["within warranty"]),

    amcContract: headerIndex(headers,
      ["amc contract no"], ["amc contract no"]),

    amcPeriod: headerIndex(headers,
      ["amc period range"], ["amc period range"]),

    amcKm: headerIndex(headers,
      ["amc km range"], ["amc km range"]),

    dateLastAttended: headerIndex(headers,
      ["date last attended"], ["date last attended"]),

    needsAttention: headerIndex(headers,
      ["needs attention"], ["needs attention"]),

    source: headerIndex(headers,
      ["source"], ["source"]),

    odometerChanged: headerIndex(headers,
      ["odometer/is speedometer changed", "odometer/is speedometer changed"],
      ["odometer/is speedometer changed"]),

    secondaryOdometerChanged: headerIndex(headers,
      ["secondary odometer change"], ["secondary odometer change"]),
  };

  const missing = [
    ["Document Date", col.date],
    ["KM/HR Reading", col.reading],
    ["Labour Value/Part Description", col.part],
    ["Registration number", col.reg],
    ["Engine Code", col.engine],
    ["Sale Date", col.sale],
    ["Model Line", col.model],
    ["Vehicle Identification Number", col.vin],
  ].filter(([, index]) => index < 0);

  if (missing.length) {
    throw new Error(`Below are required headers in file: ${missing.map(([name]) => name).join(", ")}`);
  }

  const records = lines.slice(1).map((line, rowIndex) => {
    let cells = splitDelimitedLine(line, delimiter);
    if (delimiter === "|") {
      cells = cells.filter((v, i) => !(i === 0 && !v) && !(i === cells.length - 1 && !v));
    }
    const cell = (index) => index >= 0 ? (cells[index] ?? "") : "";

    // Preserve ALL imported columns by header name as well.
    // This makes future modules able to use any DMS field without changing the parser.
    const rawFields = {};
    headers.forEach((header, index) => {
      const key = normalizeHeader(header) || `column_${index + 1}`;
      const uniqueKey = Object.prototype.hasOwnProperty.call(rawFields, key)
        ? `${key}__${index + 1}`
        : key;
      rawFields[uniqueKey] = cell(index);
    });

    return {
      rowNumber: rowIndex + 2,
      rawFields,

      jobCard: cell(col.jobCard),
      date: parseDate(cell(col.date)),
      reading: parseNumber(cell(col.reading)),
      unit: cell(col.unit),
      cumulative: parseNumber(cell(col.cumulative)),
      cumulativeUnit: cell(col.cumulativeUnit),

      secondaryReading: parseNumber(cell(col.secondaryReading)),
      secondaryUnit: cell(col.secondaryUnit),
      secondaryCumulativeReading: parseNumber(cell(col.secondaryCumulativeReading)),
      secondaryCumulativeUnit: cell(col.secondaryCumulativeUnit),

      serviceType: cell(col.serviceType),
      itemCategory: cell(col.itemCategory),
      partCode: cell(col.partCode),
      part: cell(col.part),
      standardizedPart: standardizePart(cell(col.partCode), cell(col.part)),
      qty: parseNumber(cell(col.qty)),
      // Net Value is retained only for rate calculation before DB storage.
      netValue: col.netValue >= 0 ? parseNumber(cell(col.netValue)) : null,
      inward: parseDate(cell(col.inward)),

      reg: cell(col.reg),
      customerNumber: cell(col.customerNumber),
      customerName: customerNameFromRow(headers, cells, col.customerName),
      customerVoice: cell(col.customerVoice),
      lineOfBusiness: cell(col.lineOfBusiness),
      engine: cell(col.engine),
      sale: parseDate(cell(col.sale)),
      model: cell(col.model),
      repairTypeLine: cell(col.repairTypeLine),
      checkInDate: parseDate(cell(col.checkInDate)),
      vin: cell(col.vin),

      driverName: cell(col.driverName),
      driverPhone: cell(col.driverPhone),
      serviceContactName: cell(col.serviceContactName),
      serviceContactPhone: cell(col.serviceContactPhone),
      serviceQuote: cell(col.serviceQuote),
      itemNumber: cell(col.itemNumber),
      salesOrgName: cell(col.salesOrgName),
      plantName: cell(col.plantName),
      faultCode: cell(col.faultCode),
      repairType: cell(col.repairType),
      billingDocument: cell(col.billingDocument),
      mechanic: cell(col.mechanic),
      startDate: parseDate(cell(col.startDate)),
      endDate: parseDate(cell(col.endDate)),
      withinWarranty: cell(col.withinWarranty),
      amcContract: cell(col.amcContract),
      amcPeriod: cell(col.amcPeriod),
      amcKm: cell(col.amcKm),
      dateLastAttended: parseDate(cell(col.dateLastAttended)),
      needsAttention: cell(col.needsAttention),
      source: cell(col.source),
      odometerChanged: cell(col.odometerChanged),
      secondaryOdometerChanged: cell(col.secondaryOdometerChanged),
    };
  });

  const valid = records.filter((r) => r.date || r.part || r.jobCard);
  if (!valid.length) throw new Error("Valid service records nahi mile.");

  return { headers, records: valid, headerMap: col };
}

function deriveVehicle(records) {
  const firstNonEmpty = (key) => records.find((r) => String(r[key] ?? "").trim())?.[key] || "";
  const firstCustomerName = records.find((r) => isUsableCustomerName(r.customerName))?.customerName || "";
  const saleDates = records.map((r) => r.sale).filter(Boolean).sort((a, b) => a - b);
  return {
    reg: firstNonEmpty("reg"),
    customerNumber: records.find((r) => isUsableCustomerNumber(r.customerNumber))?.customerNumber || "",
    customerName: firstCustomerName,
    engine: firstNonEmpty("engine"),
    model: firstNonEmpty("model"),
    vin: firstNonEmpty("vin"),
    sale: saleDates[0] || null,
  };
}

function isHoursUnit(unit) {
  const u = String(unit ?? "").toUpperCase().replace(/\s+/g, "");
  return u === "HRS" || u === "HR" || u.includes("HOUR");
}

function isKmUnit(unit) {
  const u = String(unit ?? "").toUpperCase().replace(/\s+/g, "");
  return u === "KM" || u.includes("KM");
}

// Decision reading must come from CUMULATIVE counters, not the ordinary
// KM/HR Reading or Secondary Counter Reading columns.
// Tipper/RMC -> cumulative HRS.
// Other vehicles -> cumulative KM.
// The corresponding cumulative unit decides which counter is usable.
function getRelevantReading(record, vehicle) {
  const targetIsHrs = isTipperModel(vehicle?.model);

  if (targetIsHrs) {
    if (isHoursUnit(record.cumulativeUnit) && (record.cumulative || 0) > 0) {
      return record.cumulative;
    }
    if (isHoursUnit(record.secondaryCumulativeUnit) && (record.secondaryCumulativeReading || 0) > 0) {
      return record.secondaryCumulativeReading;
    }
    return 0;
  }

  if (isKmUnit(record.cumulativeUnit) && (record.cumulative || 0) > 0) {
    return record.cumulative;
  }
  if (isKmUnit(record.secondaryCumulativeUnit) && (record.secondaryCumulativeReading || 0) > 0) {
    return record.secondaryCumulativeReading;
  }
  return 0;
}

function getTargetUnit(vehicle) {
  return isTipperModel(vehicle?.model) ? "HRS" : "KM";
}

function deriveRunningReading(records, vehicle) {
  const targetUnit = getTargetUnit(vehicle);
  const dated = records
    .filter(r => r.date && getRelevantReading(r, vehicle) > 0)
    .sort((a, b) => a.date - b.date);

  if (!dated.length) {
    return { current: 0, last: null, mode: `No ${targetUnit} reading`, unit: targetUnit };
  }

  const last = dated[dated.length - 1];
  const recorded = getRelevantReading(last, vehicle);
  const saleDate = vehicle.sale;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!saleDate || today <= last.date) {
    return { current: recorded, last, mode: "Last recorded reading", unit: targetUnit };
  }

  const runningDays = Math.floor((last.date - saleDate) / 86400000);
  const daysAfterLast = Math.floor((today - last.date) / 86400000);

  if (runningDays <= 0) {
    return { current: recorded, last, mode: "Last recorded reading", unit: targetUnit };
  }

  // Never switch to Date-only mode. Reading and time must both remain
  // available to the final service decision.
  const elapsed = Math.floor((today - saleDate) / 86400000);
  return {
    current: Math.round(recorded * (elapsed / runningDays)),
    last,
    mode: "Running average",
    unit: targetUnit,
  };
}

function aggregateHistory(records) {
  // SERVICE SUMMARY: keep the complete imported history, including unrelated
  // DMS lines that are not present in the service-decision master list.
  const groups = new Map();

  for (const r of records) {
    const dateKey = r.date ? formatDate(r.date) : '';
    const jc = String(r.jobCard ?? '').trim();
    const key = jc ? `JC:${jc}|DATE:${dateKey}` : `DATE:${dateKey}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  return [...groups.values()]
    .map(rows => rows.sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0)))
    .sort((a, b) => {
      const da = getVisitDate(a)?.getTime() || 0;
      const db = getVisitDate(b)?.getTime() || 0;
      return db - da;
    });
}

function isMappedServiceLine(record) {
  const code = normalizePartCode(record?.partCode);
  return !!code && Object.prototype.hasOwnProperty.call(PART_STANDARDIZATION, code);
}

function getVisitDate(visit) {
  const d = visit.find(r => r.date)?.date;
  if (d) return d;
  for (const r of visit) {
    const raw = getRawHeaderValue(r, ['document date (date received/sent)', 'document date']);
    const parsed = parseDate(raw);
    if (parsed) return parsed;
  }
  return null;
}

function getVisitJobCard(visit) {
  return visit
    .map(r => String(r.jobCard ?? '').trim() || getRawHeaderValue(r, ['job card number']))
    .find(Boolean) || '-';
}

function getVisitReading(visit, vehicle) {
  // Reading comes from the complete visit, not only the mapped service rows.
  const candidates = visit
    .map(r => ({ record: r, reading: getRelevantReading(r, vehicle) }))
    .filter(x => x.reading > 0);
  if (!candidates.length) return 0;
  return candidates[0].reading;
}

function getRawHeaderValue(record, names) {
  const wanted = names.map(normalizeHeader);
  const raw = record?.rawFields || {};
  for (const name of wanted) {
    if (Object.prototype.hasOwnProperty.call(raw, name) && String(raw[name] ?? '').trim()) {
      return String(raw[name]).trim();
    }
  }
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.some(w => key.startsWith(w)) && String(value ?? '').trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function formatQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return String(value ?? '');
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
}

function recordDisplayText(record) {
  const code = normalizePartCode(record?.partCode);
  const mappedName = code ? PART_STANDARDIZATION[code] : "";
  const name = mappedName || String(record?.standardizedPart || record?.partDescription || record?.part || "").trim();
  const qty = formatQty(record?.qty);
  const codePrefix = code ? `${code}-` : "";
  return name ? `${codePrefix}${name}-${qty}` : "";
}

function isCalculationEligibleLine(record, visit, vehicle, decision) {
  const text = String(record?.standardizedPart || record?.partDescription || record?.part || "").toUpperCase();
  const qty = Number(record?.qty || 0);
  const jobCard = String(record?.jobCard || "").trim();
  const sameJob = visit.filter(r => !jobCard || String(r?.jobCard || "").trim() === jobCard);
  const sameDate = visit;

  // A recognized free-service history line is a service-calculation
  // record in its own right. Highlight the recorded free service regardless
  // of whether that same free service is currently due.
  const code = normalizePartCode(record?.partCode);
  if (
    code === "FS0501" ||
    code === "FS0502" ||
    code === "FS0503" ||
    code === "FS0H1A" ||
    code === "FS0H1B" ||
    code === "FS0H1C" ||
    code === "FS0H1D" ||
    text.includes("1ST FREE SERVICE") ||
    text.includes("2ND FREE SERVICE") ||
    text.includes("3RD FREE SERVICE")
  ) {
    return true;
  }

  // These are service items in the vehicle history and must always be
  // highlighted when they are present, irrespective of current due status.
  if (
    text.includes("WHEEL ALIGNMENT") ||
    text.includes("BODY BUILDING CHECK") ||
    text.includes("PDI SERVICE")
  ) {
    return true;
  }

  if (text.includes("ENGINE OIL") && !text.includes("FILTER")) {
    return qty >= 12 && sameJob.some(r => String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase().includes("ENGINE OIL FILTER"));
  }
  if (text.includes("ENGINE OIL FILTER")) {
    // Engine Oil Filter is a service-history item and must be highlighted
    // whenever it is present in the history.
    return true;
  }

  if (text.includes("STEERING OIL") && !text.includes("FILTER")) {
    return qty >= 1 && sameJob.some(r => String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase().includes("STEERING OIL FILTER"));
  }
  if (text.includes("STEERING OIL FILTER")) {
    return sameJob.some(r => {
      const t = String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase();
      return t.includes("STEERING OIL") && !t.includes("FILTER") && Number(r?.qty || 0) >= 1;
    });
  }

  if (text.includes("COOLANT")) return qty >= 15;
  if (text.includes("GEAR OIL")) return qty >= 6;
  if (text.includes("HUB GREASE")) return qty >= 3;
  if (text.includes("AXLE OIL")) return qty >= 12;
  if (text.includes("CLUTCH OIL")) return qty >= 0.5;
  if (text.includes("APDA FILTER")) return qty >= 1;
  if (text.includes("DEF INLINE FILTER")) return qty >= 1;

  if (text.includes("AIR FILTER")) {
    if (text.includes("KIT")) return qty >= 1;
    return sameDate.filter(r => {
      const t = String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase();
      return t.includes("AIR FILTER") && !t.includes("KIT");
    }).reduce((sum, r) => sum + Number(r?.qty || 0), 0) >= 2;
  }

  if (text.includes("FUEL FILTER")) {
    if (text.includes("KIT")) return qty >= 1;
    return sameJob.filter(r => {
      const t = String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase();
      return t.includes("FUEL FILTER") && !t.includes("KIT");
    }).reduce((sum, r) => sum + Number(r?.qty || 0), 0) >= 2;
  }

  if (text.includes("DEF FILTER")) {
    if (text.includes("KIT")) return qty >= 1;
    return sameDate.some(r => String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase().includes("DEF FILTER SUCTION"))
      && sameDate.some(r => String(r?.standardizedPart || r?.partDescription || r?.part || "").toUpperCase().includes("DEF FILTER AIR"));
  }

  return false;
}

function getVisitParts(visit, vehicle, decision) {
  // History summary: if the same part appears multiple times in the same
  // Job Card, show it once and total its quantity.
  const grouped = new Map();

  for (const record of visit) {
    const code = normalizePartCode(record?.partCode);
    const mappedName = code ? PART_STANDARDIZATION[code] : "";
    const name = mappedName || String(record?.standardizedPart || record?.partDescription || record?.part || "").trim();
    if (!name) continue;

    const key = code
      ? `CODE:${code}`
      : `NAME:${name.toUpperCase()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...record,
        partCode: code || record?.partCode || "",
        standardizedPart: mappedName || record?.standardizedPart || name,
        qty: Number(record?.qty || 0),
      });
    } else {
      const existing = grouped.get(key);
      existing.qty = Number(existing.qty || 0) + Number(record?.qty || 0);
    }
  }

  return [...grouped.values()].map(record => {
    const text = recordDisplayText(record);
    if (!text) return null;
    return {
      text,
      eligible: isCalculationEligibleLine(record, visit, vehicle, decision),
    };
  }).filter(Boolean);
}

function getLastMatching(records, keywords) {
  const matches = records
    .filter((r) => {
      const text = String(r.standardizedPart || r.part || "").toUpperCase();
      return keywords.some((k) => text.includes(k));
    })
    .sort((a, b) => (b.date || 0) - (a.date || 0));
  return matches[0] || null;
}

const DECISION_RULES = {
  coolant: [320000,36,15], gearOil:[160000,18,6], hubGrease:[80000,12,3],
  axleOil:[200000,24,12], clutchOil:[80000,18,0.5], steeringOil:[160000,24,1],
  airFilter:[80000,12,0], fuelFilter:[80000,12,0], defFilter:[120000,18,0],
  apdaFilter:[200000,24,1], defInline:[80000,12,1]
};
const TIP_RULES = {
  coolant:[5000,36], gearOil:[2000,18], hubGrease:[1500,12], axleOil:[2000,24],
  clutchOil:[2000,12], steeringOil:[4000,24], airFilter:[1000,12], fuelFilter:[1000,12],
  defFilter:[1500,18], apdaFilter:[2000,24], defInline:[1500,12]
};
const SERVICE_SCHEDULE_ROWS = [
  ['Engine Oil', '40,000 / 80,000 / 120,000 KM by model and valid oil quantity; 4,000 KM early buffer', '18 months', '1,000 or 1,500 Hrs by tipper model; 60 Hrs early buffer', '18 months'],
  ['Coolant', '320,000 KM', '36 months', '5,000 Hrs', '36 months'],
  ['Gear Oil', '160,000 KM', '18 months', '2,000 Hrs', '18 months'],
  ['Hub Grease', '80,000 KM', '12 months', '1,500 Hrs', '12 months'],
  ['Axle Oil', '200,000 KM', '24 months', '2,000 Hrs', '24 months'],
  ['Fuel Filter', '80,000 KM', '12 months', '1,000 Hrs', '12 months'],
  ['Steering Oil', '160,000 KM', '24 months', '4,000 Hrs', '24 months'],
  ['Air Filter', '80,000 KM', '12 months', '1,000 Hrs', '12 months'],
  ['Clutch Oil', '80,000 KM', '18 months', '2,000 Hrs', '12 months'],
  ['DEF Filter', '120,000 KM (BS-VI only)', '18 months', '1,500 Hrs (BS-VI only)', '18 months'],
  ['DEF Inline Filter', '80,000 KM (applicable vehicles)', '12 months', '1,500 Hrs (applicable vehicles)', '12 months'],
  ['APDA Filter', '200,000 KM (BS-VI only)', '24 months', '2,000 Hrs (BS-VI only)', '24 months']
];
function monthsAfter(date, months){ const d=new Date(date); d.setMonth(d.getMonth()+months); return d; }
function daysBetween(a,b){ return Math.floor((b-a)/86400000); }
function isTipperModel(model){ const t=String(model||'').toUpperCase(); return t.includes('TIP') || t.includes('RMC'); }
function isH4Model(model){ return ["1015","1115","1215","1315","1415","1615","1815","1915"].some(x=>String(model||'').toUpperCase().includes(x)); }
function isA4Model(model){ return /\d{4}N/.test(String(model||'').toUpperCase()); }
function isH6Model(model){
  const t=String(model||'').toUpperCase();
  for(let i=0;i<t.length-3;i++){
    const x=t.slice(i,i+4); if(/^\d{4}$/.test(x) && Number(x.slice(2))>=25 && t[i+4] !== 'N') return true;
  }
  return false;
}
function matchesServicePart(value, serviceName) {
  const text = String(value || '').toUpperCase();
  // Steering Oil Filter is a required companion part, never the Steering Oil
  // replacement itself.
  if (serviceName === 'STEERING OIL') return text.includes(serviceName) && !text.includes('FILTER');
  return text === serviceName || text.includes(serviceName);
}
function serviceBase(records, names, minQty = 0, requireOilFilter = false, vehicle = null, requiredFilterName = 'OIL FILTER', filterMustMatchJobCard = false) {
  const sorted = [...records].sort((a, b) => (b.date || 0) - (a.date || 0));
  for (const r of sorted) {
    const name = String(r.standardizedPart || '').toUpperCase();
    if (!names.some(n => matchesServicePart(name, n))) continue;
    if ((r.qty || 0) <= 0 && minQty > 0) continue;

    const key = formatDate(r.date);
    const jobCard = String(r.jobCard || '').trim();
    // When a Job Card exists, quantity and companion-part checks are scoped
    // to that Job Card. This makes duplicate lines within the same Job Card
    // total correctly without mixing separate Job Cards from the same date.
    const same = jobCard
      ? records.filter(x => String(x.jobCard || '').trim() === jobCard)
      : records.filter(x => formatDate(x.date) === key);
    const qty = same
      .filter(x => names.some(n => matchesServicePart(x.standardizedPart, n)))
      .reduce((a, x) => a + (x.qty || 0), 0);

    if (qty < minQty) continue;
    const companions = same;
    if (requireOilFilter && !companions.some(x => String(x.standardizedPart || '').toUpperCase().includes(requiredFilterName))) continue;

    return { ...r, serviceQty: qty, relevantReading: vehicle ? getRelevantReading(r, vehicle) : (r.reading || 0) };
  }
  return null;
}
function latestFilter(records, filterName, kitName, vehicle = null) {
  const sorted = [...records].sort((a, b) => (b.date || 0) - (a.date || 0));
  for (const r of sorted) {
    const p = String(r.standardizedPart || '').toUpperCase();
    if (p === kitName.toUpperCase() || (p.includes(filterName) && p.includes('KIT'))) {
      if ((r.qty || 0) >= 1) return { ...r, relevantReading: vehicle ? getRelevantReading(r, vehicle) : (r.reading || 0) };
    }
    if (p.includes(filterName) && !p.includes('KIT')) {
      const key = formatDate(r.date);
      const qty = records
        .filter(x => formatDate(x.date) === key && String(x.standardizedPart || '').toUpperCase().includes(filterName))
        .filter(x => !String(x.standardizedPart || '').toUpperCase().includes('KIT'))
        .reduce((a, x) => a + (x.qty || 0), 0);
      if (qty >= 2) return { ...r, relevantReading: vehicle ? getRelevantReading(r, vehicle) : (r.reading || 0) };
    }
  }
  return null;
}

function latestFuelFilter(records, vehicle = null) {
  // Fuel Filter has two physical filters.
  // Rule:
  // 1) A Fuel Filter Kit qty >= 1 = complete replacement.
  // 2) Individual Fuel Filter qty >= 2 within the SAME job card = complete pair.
  // 3) If the two filters are recorded in SEPARATE job cards, use the OLDER
  //    filter as the service base.
  // 4) If only one individual filter record exists, use that record as the base.
  // Same-file duplicate rows are NOT removed by this function.

  const upper = (value) => String(value || '').trim().toUpperCase();
  const isKit = (record) => {
    const p = upper(record?.standardizedPart);
    return p === 'FUEL FILTER KIT' || (p.includes('FUEL FILTER') && p.includes('KIT'));
  };
  const isIndividual = (record) => {
    const p = upper(record?.standardizedPart);
    return p.includes('FUEL FILTER') && !p.includes('KIT');
  };

  const usable = records.filter(r =>
    r?.date &&
    Number(r?.qty || 0) > 0
  );

  // A kit and a same-job-card pair are both complete replacements. Select the
  // latest of either type; an older kit must never override a newer pair.
  const kits = usable
    .filter(isKit)
    .sort((a, b) => b.date - a.date);
  const individual = usable.filter(isIndividual);

  // Priority 2: two or more individual filters in the SAME job card.
  const byJobCard = new Map();

  for (const r of individual) {
    const jc = upper(r.jobCard);

    // Missing job card cannot be safely combined with another row.
    if (!jc) continue;

    if (!byJobCard.has(jc)) byJobCard.set(jc, []);
    byJobCard.get(jc).push(r);
  }

  const completePairs = [...byJobCard.entries()]
    .map(([jobCard, rows]) => ({
      jobCard,
      rows,
      qty: rows.reduce((sum, r) => sum + Number(r.qty || 0), 0),
      latestDate: Math.max(...rows.map(r => r.date?.getTime?.() || 0))
    }))
    .filter(group => group.qty >= 2)
    .sort((a, b) => b.latestDate - a.latestDate);

  const latestKit = kits[0] || null;
  const latestPair = completePairs[0] || null;

  if (latestKit || latestPair) {
    const pairIsLatest = latestPair && (!latestKit || latestPair.latestDate > latestKit.date.getTime());
    const r = pairIsLatest
      ? [...latestPair.rows].sort((a, b) => b.date - a.date)[0]
      : latestKit;

    return {
      ...r,
      serviceQty: pairIsLatest ? latestPair.qty : Number(r.qty || 1),
      relevantReading: vehicle
        ? getRelevantReading(r, vehicle)
        : (r.reading || 0)
    };
  }

  if (!individual.length) return null;

  // Priority 3: individual filters in separate job cards.
  // The OLDER filter is deliberately used as the service base.
  const separateJobRows = [...byJobCard.values()]
    .flat()
    .sort((a, b) => a.date - b.date);

  if (separateJobRows.length) {
    const older = separateJobRows[0];

    return {
      ...older,
      serviceQty: Number(older.qty || 1),
      relevantReading: vehicle
        ? getRelevantReading(older, vehicle)
        : (older.reading || 0)
    };
  }

  // Priority 4: no job-card information available.
  // Do not manufacture a pair; use the oldest individual filter record.
  const noJobCardRows = individual
    .filter(r => !upper(r.jobCard))
    .sort((a, b) => a.date - b.date);

  if (noJobCardRows.length) {
    const older = noJobCardRows[0];

    return {
      ...older,
      serviceQty: Number(older.qty || 1),
      relevantReading: vehicle
        ? getRelevantReading(older, vehicle)
        : (older.reading || 0)
    };
  }

  return null;
}
function dueNormalWithSale(current, base, interval, months, analysisDate, sale, mode, vehicle) {
  const baseKm = base ? (base.relevantReading ?? getRelevantReading(base, vehicle)) : 0;
  const baseDate = base ? base.date : sale;
  const kmDue = current >= baseKm + interval - 4000;
  return kmDue || analysisDate >= monthsAfter(baseDate, months - 1);
}

function dueByHours(current, base, interval, months, analysisDate, saleDate, vehicle) {
  const baseH = base ? (base.relevantReading ?? getRelevantReading(base, vehicle)) : 0;
  const baseDate = base ? base.date : saleDate;
  return current >= baseH + interval - 60 || analysisDate >= monthsAfter(baseDate, months - 1);
}

function isBSVIApplicable(vehicle){
  // DEF Filter and APDA Filter are applicable only for BS-VI vehicles.
  // Explicit BS-IV/BS4 model identification always overrides date-based fallback.
  const model = String(vehicle?.model || "").toUpperCase().replace(/[-\/_]/g, " ");
  if (/\bBS\s*IV\b|\bBS\s*4\b/.test(model)) return false;
  if (/\bBS\s*VI\b|\bBS\s*6\b/.test(model)) return true;

  // Existing VBA applicability boundary: sale date after 31-Mar-2020.
  // This acts as the fallback when the model text does not contain the emission norm.
  const sale = vehicle?.sale;
  return !!(sale && sale > new Date(2020, 2, 31));
}
const CLUTCH_OIL_DECISION_PART_CODES = new Set([
  "CFD99991",
  "CLA99994",
  "U9999995",
  "U9999999",
]);

function latestValidClutchOilPart(records, vehicle) {
  const valid = (records || [])
    .filter(record => {
      const code = normalizePartCode(record?.partCode);
      const qty = Number(record?.qty || 0);
      return CLUTCH_OIL_DECISION_PART_CODES.has(code) && qty >= 0.5;
    })
    .sort((a, b) => (b.date || 0) - (a.date || 0));
  if (!valid.length) return null;
  const selected = valid[0];
  return {
    ...selected,
    serviceQty: Number(selected.qty || 0),
    relevantReading: vehicle ? getRelevantReading(selected, vehicle) : (selected.reading || 0),
  };
}

function decideAggregate(records, vehicle, running, key, analysisDate){
  // DEF Filter and APDA Filter are BS-VI-only. Do not run their due logic for BS-IV.
  if ((key === 'defFilter' || key === 'apdaFilter') && !isBSVIApplicable(vehicle)) return false;

  const tip=isTipperModel(vehicle.model);
  const sale=vehicle.sale;
  if(key==='engineOil'){
    const base=serviceBase(records,['ENGINE OIL'],12,true,vehicle,'ENGINE OIL FILTER',true);
    let interval=120000;
    if(isH4Model(vehicle.model)) interval=40000;
    else if(isA4Model(vehicle.model)) interval=base && base.serviceQty>=19 ? 80000 : 40000;
    else if(isH6Model(vehicle.model)) interval=80000;
    if(tip){ let hrs=1500; if(isA4Model(vehicle.model)||isH4Model(vehicle.model)||isH6Model(vehicle.model)) hrs=1000; return dueByHours(running.current,base,hrs,18,analysisDate,sale,vehicle); }
    return dueNormalWithSale(running.current,base,interval,18,analysisDate,sale,running.mode,vehicle);
  }
  if(key==='steeringOil'){
    // Steering Oil is a valid replacement only when its dedicated filter is
    // recorded on the same job card. Entries from separate job cards must not
    // be paired together.
    const base=serviceBase(records,['STEERING OIL'],1,true,vehicle,'STEERING OIL FILTER',true);
    return tip ? dueByHours(running.current,base,4000,24,analysisDate,sale) : dueNormalWithSale(running.current,base,160000,24,analysisDate,sale,running.mode,vehicle);
  }
  const cfg=DECISION_RULES[key]; if(!cfg) return false;
  let base=null;
  if (key === 'clutchOil') {
    base = latestValidClutchOilPart(records, vehicle);
    if(tip){
      const tr=TIP_RULES[key];
      return tr ? dueByHours(running.current,base,tr[0],tr[1],analysisDate,sale,vehicle) : false;
    }
    return dueNormalWithSale(running.current,base,cfg[0],cfg[1],analysisDate,sale,running.mode,vehicle);
  }
  if(key==='airFilter') base=latestFilter(records,'AIR FILTER','AIR FILTER KIT',vehicle);
  else if(key==='fuelFilter') base=latestFuelFilter(records,vehicle);
  else if(key==='defFilter') base=latestDefFilter(records,vehicle);
  else if(key==='clutchOil') base=latestClutchOilPart(records,vehicle);
  else base=serviceBase(records,[keyToPart(key)],cfg[2],false,vehicle);
  if(tip){ const tr=TIP_RULES[key]; return tr ? dueByHours(running.current,base,tr[0],tr[1],analysisDate,sale,vehicle) : false; }
  return dueNormalWithSale(running.current,base,cfg[0],cfg[1],analysisDate,sale,running.mode,vehicle);
}
function latestClutchOilPart(records, vehicle = null) {
  // Clutch Oil decision is based ONLY on these approved clutch-oil PART codes.
  // Labour codes/descriptions such as CLH125 must never create or reset the
  // Clutch Oil service base.
  const allowedCodes = new Set(['CFD99991', 'CLA99994', 'U9999995', 'U9999999']);

  const matches = records
    .filter(r => {
      const code = normalizePartCode(r?.partCode);
      return allowedCodes.has(code) && Number(r?.qty || 0) >= 0.5 && r?.date;
    })
    .sort((a, b) => b.date - a.date);

  const latest = matches[0] || null;
  return latest
    ? {
        ...latest,
        serviceQty: Number(latest.qty || 0),
        relevantReading: vehicle ? getRelevantReading(latest, vehicle) : (latest.reading || 0)
      }
    : null;
}
function keyToPart(key){ return ({coolant:'COOLANT',gearOil:'GEAR OIL',hubGrease:'HUB GREASE',axleOil:'AXLE OIL',clutchOil:'CLUTCH OIL',apdaFilter:'APDA FILTER',defInline:'DEF INLINE FILTER'})[key]||''; }
function latestDefFilter(records, vehicle){
  // Match the Excel/VBA DEF Filter rule exactly:
  // 1) Latest valid DEF Filter Kit (qty >= 1).
  // 2) DEF Filter Suction + DEF Filter Air: if both are on the same service
  //    date, use the suction record; otherwise use the older of the two.
  // 3) Compare the Kit and the Suction/Air pair and use whichever is more recent.
  const datedDesc = (arr) => [...arr].filter(r => r.date).sort((a,b) => b.date - a.date);

  const kits = datedDesc(records.filter(r =>
    String(r.standardizedPart || '').toUpperCase() === 'DEF FILTER KIT' &&
    (r.qty || 0) >= 1
  ));

  const suctions = datedDesc(records.filter(r =>
    String(r.standardizedPart || '').toUpperCase() === 'DEF FILTER SUCTION' &&
    (r.qty || 0) > 0
  ));

  const airs = datedDesc(records.filter(r =>
    String(r.standardizedPart || '').toUpperCase() === 'DEF FILTER AIR' &&
    (r.qty || 0) > 0
  ));

  const latestSuction = suctions[0] || null;
  const latestAir = airs[0] || null;
  let pair = null;

  if (latestSuction && latestAir) {
    if (formatDate(latestSuction.date) === formatDate(latestAir.date)) {
      pair = latestSuction;
    } else {
      // VBA OlderServiceIndex: older of the two service records.
      pair = latestSuction.date <= latestAir.date ? latestSuction : latestAir;
    }
  }

  const kit = kits[0] || null;
  let selected = null;

  if (kit && pair) {
    selected = kit.date >= pair.date ? kit : pair;
  } else {
    selected = kit || pair;
  }

  return selected
    ? { ...selected, relevantReading: getRelevantReading(selected, vehicle) }
    : null;
}
function defInlineDecision(records,vehicle,running,analysisDate){
  // Exact VBA applicability rule:
  // DEF Inline Filter is applicable only when either:
  // 1) DEF INLINE FILTER already exists in history, OR
  // 2) vehicle sale date is on/after 01-May-2025.
  const startDate = new Date(2025, 4, 1);
  const hasHistory = records.some(r =>
    String(r.standardizedPart || "").toUpperCase().includes("DEF INLINE FILTER")
  );
  const sale = vehicle.sale;
  const applicable = hasHistory || (sale && sale >= startDate);

  if(!applicable) return false;

  const base = serviceBase(records, ["DEF INLINE FILTER"], 1, false, vehicle);

  if(isTipperModel(vehicle.model)){
    return dueByHours(running.current, base, 1500, 12, analysisDate, sale, vehicle);
  }

  return dueNormalWithSale(
    running.current,
    base,
    80000,
    12,
    analysisDate,
    sale,
    running.mode,
    vehicle
  );
}
function freeService(records,vehicle,running,analysisDate){
  const tip=isTipperModel(vehicle.model);

  // Normal vehicles retain the existing KM/time windows.
  if(!tip){
    const checks=[
      ['1ST FREE SERVICE',37000,43000,5,7,'1st free service'],
      ['2ND FREE SERVICE',77000,83000,11,13,'2nd free service'],
      ['3RD FREE SERVICE',117000,123000,17,19,'3rd free service']
    ];
    for(const [name,min,max,mn,mx,label] of checks){
      if(records.some(r=>String(r.standardizedPart||'').toUpperCase().includes(name))) continue;
      const ageMax=monthsAfter(vehicle.sale,mx), ageMin=monthsAfter(vehicle.sale,mn);
      if(running.current>max || analysisDate>ageMax) continue;
      if(running.current>=min || analysisDate>=ageMin) return label;
    }
    return '';
  }

  // Tipper/RMC free-service validation uses HRS + time windows.
  const isRmc=String(vehicle.model||'').toUpperCase().includes('RMC');
  const checks=isRmc
    ? [
        ['1ST FREE SERVICE',440,560,2,4,'1st free service'],
        ['2ND FREE SERVICE',940,1060,5,7,'2nd free service'],
        ['3RD FREE SERVICE',1440,1560,8,10,'3rd free service']
      ]
    : [
        ['1ST FREE SERVICE',440,560,2,4,'1st free service'],
        ['2ND FREE SERVICE',940,1060,5,7,'2nd free service'],
        ['3RD FREE SERVICE',1940,2060,8,10,'3rd free service']
      ];

  for(const [name,min,max,mn,mx,label] of checks){
    if(records.some(r=>String(r.standardizedPart||'').toUpperCase().includes(name))) continue;
    const ageMax=monthsAfter(vehicle.sale,mx), ageMin=monthsAfter(vehicle.sale,mn);
    if(running.current>max || analysisDate>ageMax) continue;
    if(running.current>=min || analysisDate>=ageMin) return label;
  }
  return '';
}

function serviceTextForRecord(record){
  return String(record?.standardizedPart || record?.part || record?.partDescription || '').toUpperCase();
}

function hasFreeServiceHistory(records, serviceName){
  const target=String(serviceName||'').toUpperCase();
  return records.some(r => serviceTextForRecord(r).includes(target));
}

function additionalServiceEligibility(records, vehicle, running, analysisDate){
  const services=[];

  // Wheel Alignment: preserve the existing 4-digit model eligibility list.
  // Tipper models are now included; the old non-tipper exclusion is removed.
  const modelText=String(vehicle.model||'').toUpperCase().trim();
  const wheelModels=['3520','4220','4225','4825','4925','4828','3525'];
  const isWheelModel=wheelModels.some(code => {
    for(let i=0;i<=modelText.length-4;i++){
      if(/^\d{4}$/.test(modelText.slice(i,i+4)) && modelText.slice(i,i+4)===code) return true;
    }
    return false;
  });

  if(isWheelModel){
    const tip=isTipperModel(vehicle.model);
    const isRmc=String(vehicle.model||'').toUpperCase().includes('RMC');
    let wheelService='';

    if(tip && !isRmc){
      const hrs=Number(running.current||0);
      if(hrs>=0 && hrs<=750 && analysisDate<=monthsAfter(vehicle.sale,4)) wheelService='Wheel Alignment Service-1';
      else if(hrs>=751 && hrs<=1250 && analysisDate<=monthsAfter(vehicle.sale,5)) wheelService='Wheel Alignment Service-2';
      else if(hrs>=1251 && hrs<=1750 && analysisDate<=monthsAfter(vehicle.sale,6)) wheelService='Wheel Alignment Service-3';
      else if(hrs>=1751 && hrs<=2060 && analysisDate<=monthsAfter(vehicle.sale,7)) wheelService='Wheel Alignment Service-4';
    } else {
      const km=Number(running.current||0);
      if(km>=7000 && km<=15000 && analysisDate<=monthsAfter(vehicle.sale,4)) wheelService='Wheel Alignment Service-1';
      else if(km>=15001 && km<=25000 && analysisDate<=monthsAfter(vehicle.sale,5)) wheelService='Wheel Alignment Service-2';
      else if(km>=25001 && km<=35000 && analysisDate<=monthsAfter(vehicle.sale,6)) wheelService='Wheel Alignment Service-3';
      else if(km>=35001 && km<=45000 && analysisDate<=monthsAfter(vehicle.sale,7)) wheelService='Wheel Alignment Service-4';
    }

    if(wheelService){
      const serviceNo=wheelService.slice(-1);
      const historyDone=records.some(r=>{
        const t=serviceTextForRecord(r);
        return t.includes(wheelService.toUpperCase()) ||
          (serviceNo==='1' && (t.includes('WHEEL ALIGNMENT 1ST') || t.includes('WHEEL ALIGNMENT - 1'))) ||
          (serviceNo==='2' && (t.includes('WHEEL ALIGNMENT 2ND') || t.includes('WHEEL ALIGNMENT - 2'))) ||
          (serviceNo==='3' && (t.includes('WHEEL ALIGNMENT 3RD') || t.includes('WHEEL ALIGNMENT - 3'))) ||
          (serviceNo==='4' && (t.includes('WHEEL ALIGNMENT 4TH') || t.includes('WHEEL ALIGNMENT - 4')));
      });
      if(!historyDone) services.push(wheelService);
    }
  }

  // Body Building Check Up: existing model list and KM/time window preserved.
  const bodyModels=['GM4225/66 H CO','GP4925/68 H CO','NH4120/60 H CC','NP4825/66 H CC','UG3520/57 H CC','UP4825/66 H CC','UP4825/66 PL CC'];
  const isBodyModel=bodyModels.some(code=>modelText.includes(code));
  if(isBodyModel){
    const km=Number(running.current||0);
    if(km>=1 && km<=5000 && analysisDate<=monthsAfter(vehicle.sale,4)){
      const historyDone=records.some(r=>{
        const t=serviceTextForRecord(r);
        return t.includes('BODY BUILDING CHECK UP') || t.includes('BODY BUILDING CHECKUP');
      });
      if(!historyDone) services.push('Body Building Check Up');
    }
  }

  return services;
}

function calculateDecisions(records,vehicle,running){
  const analysisDate=new Date(); analysisDate.setHours(0,0,0,0);
  const keys=['engineOil','coolant','gearOil','hubGrease','axleOil','fuelFilter','steeringOil','airFilter','clutchOil','defFilter','apdaFilter'];
  const result={};
  for(const k of keys) result[k]=decideAggregate(records,vehicle,running,k,analysisDate);
  result.defInline=defInlineDecision(records,vehicle,running,analysisDate);
  const free=freeService(records,vehicle,running,analysisDate);
  const additional=additionalServiceEligibility(records,vehicle,running,analysisDate);
  return {result, freeService:free, additionalServices:additional};
}

const BULK_SERVICE_LABELS = [
  ["Engine Oil", "engineOil"], ["Coolant", "coolant"], ["Gear Oil", "gearOil"],
  ["Hub Grease", "hubGrease"], ["Axle Oil", "axleOil"], ["Fuel Filter", "fuelFilter"],
  ["Steering Oil", "steeringOil"], ["Air Filter", "airFilter"], ["Clutch Oil", "clutchOil"],
  ["DEF Filter", "defFilter"], ["DEF Inline Filter", "defInline"], ["APDA Filter", "apdaFilter"]
];

function getDueServiceNames(decision) {
  const aggregateNames=BULK_SERVICE_LABELS.filter(([, key]) => decision?.result?.[key]).map(([name]) => name);
  const names=[...aggregateNames];
  // Free Service is shown to the customer only when at least one aggregate
  // service is also due. If there is no aggregate service, do not show the
  // free-service label by itself in Customer Output / Bulk Customer Output.
  if(decision?.freeService && aggregateNames.length){
    names.push(decision.freeService.replace(/^1st free service$/i,'1st Free Service').replace(/^2nd free service$/i,'2nd Free Service').replace(/^3rd free service$/i,'3rd Free Service'));
  }
  if(Array.isArray(decision?.additionalServices)) names.push(...decision.additionalServices);
  return names;
}

function buildBulkAnalysis(records) {
  // A later/earlier export may contain a valid textual name for the same
  // customer number. Build that lookup before separating records by VIN.
  const customerNameByNumber = new Map();
  for (const record of records) {
    const number = isUsableCustomerNumber(record.customerNumber) ? String(record.customerNumber).trim() : "";
    if (number && isUsableCustomerName(record.customerName) && !customerNameByNumber.has(number)) {
      customerNameByNumber.set(number, String(record.customerName).trim());
    }
  }

  const groups = new Map();
  for (const record of records) {
    const vin = String(record.vin || "").trim();
    if (!vin) continue;
    const key = vin.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  if (!groups.size) {
    throw new Error("Bulk analysis ke liye VIN number required hai. Kisi bhi valid row me VIN nahi mila.");
  }

  const results = [];
  for (const [vinKey, vehicleRecords] of groups) {
    const vehicle = deriveVehicle(vehicleRecords);
    if (!vehicle.customerName && vehicle.customerNumber) {
      vehicle.customerName = customerNameByNumber.get(String(vehicle.customerNumber).trim()) || "";
    }
    const running = deriveRunningReading(vehicleRecords, vehicle);
    const decision = calculateDecisions(vehicleRecords, vehicle, running);
    const services = getDueServiceNames(decision);
    results.push({
      vin: vehicle.vin || vinKey,
      vehicle,
      running,
      decision,
      services,
      dueCount: services.length,
      records: vehicleRecords,
    });
  }

  results.sort((a, b) => b.dueCount - a.dueCount || String(a.vehicle.customerName || a.vehicle.customerNumber || "").localeCompare(String(b.vehicle.customerName || b.vehicle.customerNumber || "")));
  return results;
}


function buildCustomerGroups(results, dealerName = "") {
  const cleanDealerName = String(dealerName || "").trim();
  const map = new Map();
  for (const item of results) {
    const customerNumber = String(item.vehicle.customerNumber || '').trim();
    const actualName = isUsableCustomerName(item.vehicle.customerName) ? String(item.vehicle.customerName).trim() : '';
    const name = actualName || (customerNumber ? `Customer Name Unavailable (ID: ${customerNumber})` : 'Customer Name Unavailable');
    // The customer-facing bulk view follows the Excel workflow: all vehicles
    // with the same displayed customer name belong in one customer group.
    // Customer number remains on each parsed vehicle for traceability.
    const key = `NAME:${name.toUpperCase()}`;
    if (!map.has(key)) map.set(key, { id:key, name, customerKeys:[key], vehicles:[], dealerName:cleanDealerName });
    map.get(key).vehicles.push(item);
  }
  return Array.from(map.values());
}

function mergeCustomerGroups(groups, selectedIds, mergedName) {
  const selected = new Set(selectedIds);
  if (selected.size < 2) return groups;
  const selectedGroups = groups.filter(g => selected.has(g.id));
  const others = groups.filter(g => !selected.has(g.id));
  const cleanName = String(mergedName || '').trim();
  const visibleNames = [...new Set(selectedGroups.map(group => String(group.name || '').trim()).filter(Boolean))];
  const resolvedName = cleanName || visibleNames.join(", ");
  const merged = {
    id: selectedGroups.map(g => g.id).sort().join('||'),
    name: resolvedName,
    customerKeys: selectedGroups.flatMap(g => g.customerKeys),
    vehicles: selectedGroups.flatMap(g => g.vehicles),
    dealerName: String(selectedGroups.find(g => String(g?.dealerName || "").trim())?.dealerName || "").trim()
  };
  return [...others, merged].sort((a,b) => a.name.localeCompare(b.name));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function buildCustomerWhatsAppText(group, preferences = {}) {
  const dueVehicles = (group?.vehicles || []).filter(v => Array.isArray(v.services) && v.services.length > 0);
  const count = dueVehicles.length;
  const lines = dueVehicles.map((v, i) => {
    const reg = String(v.vehicle?.reg || v.vin || v.vehicle?.vin || '-').trim();
    return `${i + 1}. ${reg} - ${v.services.join(', ')}`;
  });

  const dealerName = String(group?.dealerName || "").trim();
  const workshopName = dealerName
    ? (dealerName.toLowerCase().includes("workshop") ? dealerName : `${dealerName} Workshop`)
    : "your workshop";
  const booking1 = String(preferences?.booking1 || "").trim();
  const booking2 = String(preferences?.booking2 || "").trim();
  const bookingNumbers = [booking1, booking2].filter(Boolean).join(" & ");
  const bookingLine = bookingNumbers ? `\n\nFor advance booking, kindly call to mobile no ${bookingNumbers}` : "";
  const openingLine = String(preferences?.whatsappOpeningLine || "").trim();
  const openingLineText = openingLine ? `\n\n${openingLine}` : "";
  const intro = `Dear Sir, ${count} vehicles have service due. Kindly send below the due vehicles to ${workshopName} for the required service.${openingLineText}${bookingLine}`;
  return `${intro}\n\n${lines.join('\\n')}`.replace(/\\n/g, '\n');
}

async function copyCustomerSummary(group, dealerName = "", preferences = {}) {
  try {
    const effectiveGroup = group?.dealerName ? group : { ...group, dealerName: String(dealerName || "").trim() };
    const text = buildCustomerWhatsAppText(effectiveGroup, preferences);
    if (!text.trim()) throw new Error('Copy karne ke liye summary available nahi hai.');

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('Browser ne clipboard copy allow nahi kiya.');
    }

    window.alert('WhatsApp summary copied successfully. Ab WhatsApp me Ctrl+V karein.');
  } catch (err) {
    console.error('WhatsApp copy error:', err);
    window.alert(`WhatsApp summary copy nahi ho saki:\n\n${err?.message || err}`);
  }
}

async function printCustomerReport(group, detailed=false) {
  if (!group || !group.vehicles?.length) {
    window.alert('Customer group me koi vehicle available nahi hai.');
    return;
  }

  try {
    const dueVehicles = group.vehicles.filter(v => Array.isArray(v.services) && v.services.length > 0);
    const filenameBase = String(group.name || 'Customer')
      .replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g,'').slice(0,80) || 'Customer';

    // Summary PDF is no longer part of the customer workflow.
    if (!detailed) return;

    // IMPORTANT: Do not render the whole HTML history through html2canvas.
    // jsPDF + AutoTable keeps the PDF as real text, avoids blank-page/canvas
    // memory problems, and gives deterministic page breaks.
    const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait', compress:true });
    const pageW = 210;
    const margin = 10;
    const usableW = pageW - margin * 2;
    let firstVehicle = true;

    for (const v of group.vehicles) {
      const vehicle = v.vehicle || {};
      const visits = aggregateHistory(Array.isArray(v.records) ? v.records : []);

      if (!firstVehicle) pdf.addPage();
      firstVehicle = false;

      let y = 12;
      pdf.setFont('helvetica','bold');
      pdf.setFontSize(15);
      pdf.text('DETAILED SERVICE HISTORY', margin, y);
      y += 7;

      pdf.setFont('helvetica','normal');
      pdf.setFontSize(9);
      pdf.setDrawColor(150,150,150);
      pdf.rect(margin, y, usableW, 8);
      pdf.setFont('helvetica','bold');
      pdf.text('Customer:', margin + 2, y + 5);
      pdf.setFont('helvetica','normal');
      pdf.text(String(vehicle.customerName || group.name || '-').slice(0, 145), margin + 22, y + 5);
      y += 11;

      const regNo = String(vehicle.reg || v.vin || vehicle.vin || '-');
      const vin = String(vehicle.vin || v.vin || '-');
      const engine = String(vehicle.engine || '-');
      const model = String(vehicle.model || '-');
      const saleDate = formatDate(vehicle.sale);
      const currentReading = v.running?.current ? `${formatNumber(v.running.current)} ${v.running.unit || getTargetUnit(vehicle)}` : '-';

      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        tableWidth: usableW,
        theme: 'grid',
        styles: { font:'helvetica', fontSize:8.5, cellPadding:3, textColor:[20,20,20], lineColor:[150,150,150], lineWidth:0.2, overflow:'linebreak' },
        bodyStyles: { fontStyle:'bold' },
        columnStyles: { 0:{cellWidth:63}, 1:{cellWidth:63}, 2:{cellWidth:64} },
        body: [
          [
            `REG. NO.\n${regNo}`,
            `VIN\n${vin}`,
            `ENGINE NO.\n${engine}`
          ],
          [
            `MODEL\n${model}`,
            `SALE DATE\n${saleDate}`,
            `CURRENT APPROX. READING\n${currentReading}`
          ]
        ]
      });
      y = (pdf.lastAutoTable?.finalY || y + 25) + 4;

      const dueText = v.services?.length ? v.services.join(', ') : 'No service due';
      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        tableWidth: usableW,
        theme: 'grid',
        styles: { font:'helvetica', fontSize:8.5, cellPadding:3, textColor:[20,20,20], lineColor:[150,150,150], lineWidth:0.2, overflow:'linebreak' },
        body: [[{ content:`Service To Be Completed: ${dueText}`, styles:{fontStyle:'bold'} }]],
        columnStyles: { 0:{cellWidth:usableW} }
      });
      y = (pdf.lastAutoTable?.finalY || y + 10) + 4;

      const historyBody = visits.map(visit => {
        const date = getVisitDate(visit);
        const jc = getVisitJobCard(visit);
        const reading = getVisitReading(visit, vehicle);
        const parts = getVisitParts(visit.filter(isMappedServiceLine), vehicle, v.decision)
          .map(part => part.text)
          .filter(Boolean)
          .join(', ');
        if (!parts) return null;
        return [
          formatDateShort(date),
          jc || '-',
          reading ? `${formatNumber(reading)} ${getTargetUnit(vehicle)}` : '-',
          parts
        ];
      }).filter(Boolean);

      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        tableWidth: usableW,
        theme: 'grid',
        head: [['Date','Job Card','Reading','Service / Part No. / Qty']],
        body: historyBody.length ? historyBody : [['-','-','-','No mapped service history available.']],
        styles: { font:'helvetica', fontSize:7.5, cellPadding:2.5, textColor:[20,20,20], lineColor:[150,150,150], lineWidth:0.2, overflow:'linebreak', valign:'top' },
        headStyles: { fontStyle:'bold', fillColor:[238,238,238], textColor:[20,20,20] },
        columnStyles: { 0:{cellWidth:27}, 1:{cellWidth:33}, 2:{cellWidth:30}, 3:{cellWidth:100} },
        rowPageBreak: 'avoid',
        pageBreak: 'auto'
      });
    }

    pdf.save(`${filenameBase}_Detailed_Service_History.pdf`);
  } catch (err) {
    console.error('PDF generation error:', err);
    window.alert(`PDF download me error aa raha hai:\n\n${err?.message || err}`);
  }
}


function ExcelFilterDropdown({
  label,
  values,
  selectedValues,
  anchorRect,
  sortDirection,
  onApply,
  onCancel,
  onClear,
  onSort,
}) {
  const allValues = useMemo(() => {
    const unique = [...new Set((values || []).map(value => String(value ?? "")))];
    return unique.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [values]);

  const [search, setSearch] = useState("");
  const [draftSelected, setDraftSelected] = useState(() => new Set(selectedValues || []));

  useEffect(() => {
    setDraftSelected(new Set(selectedValues || []));
    setSearch("");
  }, [label, selectedValues]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    const handlePointerDown = (event) => {
      const popup = document.getElementById("excel-filter-popup");
      if (popup && !popup.contains(event.target)) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onCancel]);

  const filteredValues = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return allValues;
    return allValues.filter(value => value.toUpperCase().includes(q));
  }, [allValues, search]);

  const selectedCount = draftSelected.size;
  const hasFilter = selectedValues?.length > 0;
  const allVisibleSelected =
    filteredValues.length > 0 &&
    filteredValues.every(value => draftSelected.has(value));

  const toggleValue = (value) => {
    setDraftSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setDraftSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredValues.forEach(value => next.delete(value));
      } else {
        filteredValues.forEach(value => next.add(value));
      }
      return next;
    });
  };

  const clearDraft = () => setDraftSelected(new Set());

  const popupWidth = 310;
  const popupHeight = 430;
  const left = Math.max(
    8,
    Math.min(
      (anchorRect?.left || 0),
      window.innerWidth - popupWidth - 8
    )
  );
  const preferredTop = (anchorRect?.bottom || 0) + 4;
  const top = preferredTop + popupHeight > window.innerHeight
    ? Math.max(8, (anchorRect?.top || 8) - popupHeight - 4)
    : preferredTop;

  return createPortal(
    <div
      id="excel-filter-popup"
      className="excel-filter-popup"
      style={{ left, top, width: popupWidth }}
      role="dialog"
      aria-label={`${label} filter`}
    >
      <div className="excel-filter-popup-title">
        <strong>Filter by {label}</strong>
        <button type="button" className="excel-filter-close" onClick={onCancel} aria-label="Close filter">×</button>
      </div>

      <div className="excel-filter-sort-row">
        <button
          type="button"
          className="excel-filter-menu-btn"
          onClick={() => { onSort("asc"); onCancel(); }}
        >
          Sort A to Z
        </button>
        <button
          type="button"
          className="excel-filter-menu-btn"
          onClick={() => { onSort("desc"); onCancel(); }}
        >
          Sort Z to A
        </button>
        <span className="excel-filter-current-sort">
          {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : ""}
        </span>
      </div>

      <div className="excel-filter-search-wrap">
        <span className="excel-filter-search-icon">⌕</span>
        <input
          autoFocus
          className="excel-filter-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search..."
          aria-label={`Search ${label} values`}
        />
        {search && (
          <button type="button" className="excel-filter-search-clear" onClick={() => setSearch("")}>×</button>
        )}
      </div>

      <div className="excel-filter-selection-bar">
        <label className="excel-filter-select-all">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
          />
          <span>Select All</span>
        </label>
        <span className="excel-filter-count">
          {selectedCount ? `${selectedCount} selected` : `${allValues.length} values`}
        </span>
      </div>

      <div className="excel-filter-values">
        {filteredValues.length ? (
          filteredValues.map(value => (
            <label className="excel-filter-value" key={value}>
              <input
                type="checkbox"
                checked={draftSelected.has(value)}
                onChange={() => toggleValue(value)}
              />
              <span title={value}>{value || "(Blanks)"}</span>
            </label>
          ))
        ) : (
          <div className="excel-filter-no-match">No matching values</div>
        )}
      </div>

      <div className="excel-filter-footer">
        <button
          type="button"
          className="excel-filter-clear"
          onClick={() => { clearDraft(); onClear(); }}
        >
          Clear Filter
        </button>
        <div className="excel-filter-footer-right">
          <button type="button" className="excel-filter-cancel" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="excel-filter-ok"
            onClick={() => onApply([...draftSelected])}
          >
            OK
          </button>
        </div>
      </div>

      {hasFilter && (
        <div className="excel-filter-active-note">
          Active filter: {selectedValues.length} value{selectedValues.length === 1 ? "" : "s"}
        </div>
      )}
    </div>,
    document.body
  );
}

// Estimate source-of-truth mapping.
// Parts are selected from the standardised DMS part family first. Historical
// vehicle data is then used only to identify the applicable part and its
// quantity/rate. Quantities from different job cards are NEVER added together.
const ESTIMATE_STANDARD_PARTS = {
  engineOil: ["ENGINE OIL", "ENGINE OIL FILTER", "FUEL FILTER & ENGINE OIL FILTER KIT"],
  coolant: ["COOLANT"],
  gearOil: ["GEAR OIL"],
  hubGrease: ["HUB GREASE"],
  axleOil: ["AXLE OIL"],
  fuelFilter: ["FUEL FILTER"],
  steeringOil: ["STEERING OIL"],
  airFilter: ["AIR FILTER"],
  clutchOil: ["CLUTCH OIL"],
  defFilter: ["DEF FILTER"],
  defInline: ["DEF INLINE FILTER"],
  apdaFilter: ["APDA FILTER"],
};

const ESTIMATE_REFERENCE_PARTS = {
  engineOil: ["EN699991", "F7A01500"],
  gearOil: ["G9999994"],
  axleOil: ["GB699991"],
  steeringOil: ["PSB99994", "PD600391"],
  clutchOil: ["CFD99991"],
  defInline: ["XFM00800"],
  coolant: ["C9999993"],
  hubGrease: ["S9999997", "FJ607400", "F1721500", "F1771990", "H5001220"],
  fuelFilter: ["P5105609"],
  airFilter: ["P5105688"],
  defFilter: ["XFM00500", "PET00001"],
  apdaFilter: ["PD600968"],
};

const HUB_GREASE_STANDARD_CODES = new Set([
  "S9999997",
  "FJ607400",
  "F1721500",
  "F1771990",
  "H5001220",
]);

const ESTIMATE_LABOUR_REFERENCE = {
  airFilter: [{ code:"AIS110", description:"R and R Air Filter And Replace Element" }],
  defFilter: [{ code:"ATS455Z", description:"R & R DEF tank suction filter" }],
  coolant: [{ code:"CLG125", description:"Drain and Refill Coolant" }],
  clutchOil: [{ code:"CLH125", description:"Drain and Refill Clutch Oil and Bleed Sy" }],
  engineOil: [{ code:"ELS105", description:"Drain and Refill Engine Oil and Filter" }],
  fuelFilter: [{ code:"FUL110", description:"R and R Fuel Filter / Pre Filter" }],
  gearOil: [{ code:"GBX130", description:"Drain oil in Gearbox and Refill" }],
  axleOil: [{ code:"RAX145", description:"Drain and Refill oil in Rear Axle" }],
  steeringOil: [{ code:"STH110", description:"Drain and Refill Steering Box oil" }],
  apdaFilter: [{ code:"AIR165Z", description:"R & R APDA Desiccant Cartridges" }],
  hubGrease: [
    { code:"WHL165A", description:"Hub Greasing - Front Axle - 2 Hubs" },
    { code:"WHL165C", description:"Hub Greasing - Front Axle - 4 Hubs" },
    { code:"WHL170A", description:"Hub Greasing - Rear Axle - 2 Hubs" },
    { code:"WHL170C", description:"Hub Greasing - Rear Axle - 4 Hubs" },
    { code:"WHL175A", description:"Hub Greasing - STLA - 2 Hubs" },
    { code:"WHL180A", description:"Hub Greasing - DTLA - 2 Hubs" },
  ],
};

const ESTIMATE_LABOUR_RULES = [
  { key:"engineOil", test:t => t.includes("ENGINE OIL") && (t.includes("FILTER") || t.includes("REFILL") || t.includes("DRAIN") || t.includes("DRAI")) },
  { key:"gearOil", test:t => (t.includes("GEARBOX") || t.includes("GEAR BOX") || t.includes("GEAR OIL")) },
  { key:"axleOil", test:t => (t.includes("REAR AXLE") || t.includes("REAR AXEL") || t.includes("AXLE OIL")) },
  { key:"steeringOil", test:t => t.includes("STEERING") && (t.includes("OIL") || t.includes("BOX") || t.includes("FLUID") || t.includes("FILTER")) },
  { key:"clutchOil", test:t => t.includes("CLUTCH") && (t.includes("OIL") || t.includes("BLEED") || t.includes("REFILL") || t.includes("DRAIN")) },
  { key:"coolant", test:t => t.includes("COOLANT") },
  { key:"fuelFilter", test:t => t.includes("FUEL") && t.includes("FILTER") },
  { key:"hubGrease", test:t => t.includes("HUB") && t.includes("GREAS") },
  { key:"airFilter", test:t => t.includes("AIR") && t.includes("FILTER") && (t.includes("ELEMENT") || t.includes("R AND R") || t.includes("R R") || t.includes("REPLACE")) },
  { key:"defFilter", test:t => t.includes("DEF") && (t.includes("SUCTION") || (t.includes("FILTER") && t.includes("AIR"))) },
  { key:"defInline", test:t => t.includes("DEF") && t.includes("INLINE") && t.includes("FILTER") },
  { key:"apdaFilter", test:t => t.includes("APDA") || (t.includes("DESICCANT") && t.includes("CARTRIDGE")) || (t.includes("APDA") && t.includes("CARTRIDGE")) },
]

function estimateCategory(row = {}) {
  const category = String(row?.item_category || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  // DMS source-of-truth categories:
  // P001 = Labour Value, P002 = Part.
  // Accept the category code even when the DMS export appends a description.
  if (/(^|[^A-Z0-9])P001([^A-Z0-9]|$)/.test(category)) return "labour";
  if (/(^|[^A-Z0-9])P002([^A-Z0-9]|$)/.test(category)) return "part";
  return "";
}

function estimateStandardPartName(row = {}) {
  const code = normalizePartCode(row.part_code);
  if (code && PART_STANDARDIZATION[code]) {
    return String(PART_STANDARDIZATION[code]).trim().toUpperCase();
  }
  return String(row.standardized_part || row.part_description || "").trim().toUpperCase();
}

function estimateLabourText(row = {}) {
  return [
    row.part_description,
    row.standardized_part,
    row.repair_line_item_type,
    row.repair_type,
    row.part_code,
    row.complaint_code,
  ].join(" ").toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function estimatePartMatchesService(row = {}, serviceKey = "") {
  if (estimateCategory(row) !== "part") return false;

  const code = normalizePartCode(row.part_code);
  const referenceCodes = (ESTIMATE_REFERENCE_PARTS[serviceKey] || []).map(normalizePartCode);

  // User-provided reference part numbers are authoritative identifiers for
  // the estimate. If the exact reference exists in DB, it is always included.
  if (code && referenceCodes.includes(code)) return true;

  if (serviceKey === "hubGrease") {
    if (HUB_GREASE_STANDARD_CODES.has(code)) return true;
    return estimateStandardPartName(row).includes("HUB GREASE");
  }

  const name = estimateStandardPartName(row);
  const families = ESTIMATE_STANDARD_PARTS[serviceKey] || [];
  return families.some(family => {
    if (serviceKey === "defFilter" && name.includes("INLINE")) return false;
    return name.includes(family);
  });
}

function estimatePreferredReferenceCode(serviceKey = "", standardName = "", candidates = []) {
  const references = ESTIMATE_REFERENCE_PARTS[serviceKey] || [];
  if (!references.length) return "";

  const candidateCodes = new Set(
    candidates.map(row => normalizePartCode(row?.part_code)).filter(Boolean)
  );
  const matchingReference = references.find(code => candidateCodes.has(normalizePartCode(code)));
  if (matchingReference) return matchingReference;

  const name = String(standardName || "").toUpperCase();
  if (serviceKey === "engineOil") {
    return name.includes("FILTER") ? "F7A01500" : "EN699991";
  }
  if (serviceKey === "steeringOil") {
    return name.includes("FILTER") ? "PD600391" : "PSB99994";
  }
  if (serviceKey === "defFilter") {
    if (name.includes("SUCTION")) return "PET00001";
    return "XFM00500";
  }
  return references[0];
}

function estimateLabourMatchesService(row = {}, serviceKey = "") {
  if (estimateCategory(row) !== "labour") return false;

  const text = estimateLabourText(row);
  const referenceRows = ESTIMATE_LABOUR_REFERENCE[serviceKey] || [];

  // Prefer an exact historical labour operation code when the DMS provides it.
  if (referenceRows.some(reference =>
    reference.code && text.includes(normalizePartCode(reference.code))
  )) {
    return true;
  }

  // Hub greasing remains model/axle/hub-count specific.
  if (serviceKey === "hubGrease") {
    return referenceRows.some(reference => {
      if (reference.code && text.includes(normalizePartCode(reference.code))) return true;
      if (reference.code === "WHL165A") return text.includes("FRONT") && text.includes("2") && text.includes("HUB");
      if (reference.code === "WHL165C") return text.includes("FRONT") && text.includes("4") && text.includes("HUB");
      if (reference.code === "WHL170A") return text.includes("REAR") && text.includes("2") && text.includes("HUB");
      if (reference.code === "WHL170C") return text.includes("REAR") && text.includes("4") && text.includes("HUB");
      if (reference.code === "WHL175A") return text.includes("STLA") && text.includes("2") && text.includes("HUB");
      if (reference.code === "WHL180A") return text.includes("DTLA") && text.includes("2") && text.includes("HUB");
      return false;
    });
  }

  // Match the historical DMS operation text independently of the exact
  // spelling used in the master labour description. This is intentionally
  // based only on P001 rows; P002 parts can never become labour.
  const rule = ESTIMATE_LABOUR_RULES.find(item => item.key === serviceKey);
  if (rule?.test(text)) return true;

  // Final explicit checks for known DMS wording variations.
  switch (serviceKey) {
    case "coolant":
      return text.includes("COOLANT");
    case "axleOil":
      return text.includes("REAR AXLE") || text.includes("REAR AXEL");
    case "clutchOil":
      return text.includes("CLUTCH");
    case "defFilter":
      return text.includes("DEF") && (text.includes("SUCTION") || text.includes("DEF FILTER"));
    case "defInline":
      return text.includes("DEF") && text.includes("INLINE") && text.includes("FILTER");
    case "apdaFilter":
      return text.includes("APDA") || (text.includes("DESICCANT") && text.includes("CARTRIDGE"));
    default:
      return false;
  }
}

function estimateServiceKeyFromText(value = "") {
  const t = String(value).toUpperCase();
  for (const [serviceKey, families] of Object.entries(ESTIMATE_STANDARD_PARTS)) {
    if (families.some(family => t.includes(family))) return serviceKey;
  }
  return "";
}

function estimateIsLabour(row = {}) {
  return estimateCategory(row) === "labour";
}

function estimateRowRank(row = {}, index = 0) {
  const time = row?.job_date ? new Date(row.job_date).getTime() : NaN;
  return Number.isFinite(time) ? time : -index;
}

function estimateChooseBestQuantity(rows = []) {
  const candidates = rows
    .map((row, index) => ({
      row,
      index,
      qty: Number(row?.quantity),
      rank: estimateRowRank(row, index),
    }))
    .filter(item => Number.isFinite(item.qty) && item.qty > 0);

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.rank - a.rank);
  return {
    qty: candidates[0].qty,
    count: 1,
    latestRank: candidates[0].rank,
    latestRow: candidates[0].row,
  };
}

function estimateChooseBestRate(rows = []) {
  const valid = rows
    .map((row, index) => ({
      row,
      rate: Number(row?.rate),
      rank: estimateRowRank(row, index),
    }))
    .filter(item => Number.isFinite(item.rate) && item.rate > 0);

  if (!valid.length) return 0;
  valid.sort((a, b) => b.rank - a.rank);
  return valid[0].rate;
}

function estimateBuildHistoricalItem(type, serviceKey, rows, code = "") {
  if (!rows.length) return null;

  const qtyChoice = estimateChooseBestQuantity(rows);
  // Labour operations are normally one job operation. Some DMS exports do not
  // carry a usable quantity on P001 rows, so do not hide a valid historical
  // labour operation just because quantity is blank/zero.
  const effectiveQtyChoice = qtyChoice || {
    qty: type === "labour" ? 1 : 0,
    count: 1,
    latestRank: -1,
    latestRow: rows[0],
  };
  if (effectiveQtyChoice.qty <= 0) return null;

  const rate = estimateChooseBestRate(rows);
  const sourceRow = rows
    .slice()
    .sort((a, b) => estimateRowRank(b, 0) - estimateRowRank(a, 0))[0];

  const partNo = String(code || sourceRow.part_code || "").trim();
  const description = String(
    sourceRow.part_description || sourceRow.standardized_part || ""
  ).trim();

  const customerRate = Number.isFinite(rate) && rate > 0
    ? Number((rate * 1.18).toFixed(2))
    : 0;

  return {
    id: type + "-" + serviceKey + "-" + partNo + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    type,
    serviceKey,
    partNo,
    description,
    qty: effectiveQtyChoice.qty,
    rate: customerRate,
    baseRate: rate,
    source: "Historical DB (18% GST added)",
    latestRow: sourceRow,
  };
}

function estimateJobCardKey(row = {}) {
  const jc = String(row?.job_card || row?.job_card_no || "").trim();
  return jc ? "JC|" + jc.toUpperCase() : "DATE|" + String(row?.job_date || "").slice(0, 10);
}

function estimateRowsForJobCard(rows = [], key = "") {
  return rows.filter(row => estimateJobCardKey(row) === key);
}

function estimatePartRows(rows = [], serviceKey = "") {
  return rows.filter(row =>
    estimateCategory(row) === "part" &&
    estimatePartMatchesService(row, serviceKey) &&
    Number(row?.quantity || 0) > 0
  );
}

function estimateHasPart(rows = [], standardNames = [], minQty = 1) {
  const matches = rows.filter(row => {
    if (estimateCategory(row) !== "part") return false;
    const name = estimateStandardPartName(row).toUpperCase();
    return standardNames.some(item => name === item || name.includes(item));
  });
  return matches.reduce((sum, row) => sum + Math.max(0, Number(row?.quantity || 0)), 0) >= minQty;
}

// These rules are used only to prefer a complete replacement history row when
// available. They must NEVER make a selected aggregate disappear from the
// estimate. If no qualifying job card exists, the estimate falls back to all
// matching vehicle-history rows.
function estimateEligibleJobCards(rows = [], serviceKey = "") {
  const keys = [...new Set(rows.map(estimateJobCardKey))];
  const eligible = new Set();

  for (const key of keys) {
    const jcRows = estimateRowsForJobCard(rows, key);
    const parts = estimatePartRows(jcRows, serviceKey);
    if (!parts.length) continue;

    if (serviceKey === "axleOil") {
      if (parts.some(row => Number(row?.quantity || 0) >= 12)) eligible.add(key);
      continue;
    }

    if (serviceKey === "steeringOil") {
      const steeringQty = estimatePartRows(jcRows, "steeringOil")
        .reduce((sum, row) => sum + Math.max(0, Number(row?.quantity || 0)), 0);
      const filterQty = estimateHasPart(jcRows, ["STEERING OIL FILTER"], 1);
      if (steeringQty >= 1 && filterQty) eligible.add(key);
      continue;
    }

    if (serviceKey === "engineOil") {
      const engineQty = estimatePartRows(jcRows, "engineOil")
        .filter(row => !estimateStandardPartName(row).includes("FILTER"))
        .reduce((sum, row) => sum + Math.max(0, Number(row?.quantity || 0)), 0);
      const oilFilter = estimateHasPart(jcRows, ["ENGINE OIL FILTER"], 1);
      const fuelFilterPair = estimateHasPart(jcRows, ["FUEL FILTER"], 2);
      const fuelFilterKit = estimateHasPart(
        jcRows,
        ["FUEL FILTER KIT", "FUEL FILTER & ENGINE OIL FILTER KIT"],
        1
      );
      if (engineQty >= 12 && oilFilter && (fuelFilterPair || fuelFilterKit)) eligible.add(key);
      continue;
    }

    if (serviceKey === "defFilter") {
      const defKit = estimateHasPart(jcRows, ["DEF FILTER KIT"], 1);
      const defAir = estimateHasPart(jcRows, ["DEF FILTER AIR"], 1);
      const defSuction = estimateHasPart(jcRows, ["DEF FILTER SUCTION"], 1);
      if (defKit || (defAir && defSuction)) eligible.add(key);
      continue;
    }

    if (parts.some(row => Number(row?.quantity || 0) > 0)) eligible.add(key);
  }

  return eligible;
}

function estimateRowsForCompleteService(rows = [], serviceKey = "") {
  const allRows = estimatePartRows(rows, serviceKey);
  const eligibleKeys = estimateEligibleJobCards(rows, serviceKey);

  // First preference: the same service part from a job card that looks like a
  // complete replacement. Second preference: any matching historical part for
  // this VIN. This prevents a missing/misnamed line on one job card from
  // making a selected aggregate disappear.
  const preferredRows = eligibleKeys.size
    ? allRows.filter(row => eligibleKeys.has(estimateJobCardKey(row)))
    : [];
  if (preferredRows.length) return preferredRows;
  if (allRows.length) return allRows;

  // Final fallback: when the DMS history contains the labour operation for the
  // selected service but the part line has an unknown/mismatched description,
  // use P002 rows from the same job card as the historical quantity/rate source.
  // The displayed part number will then come from the user-provided reference
  // list. This is deliberately a fallback only; unrelated vehicle-history
  // parts from other job cards are never used.
  const labourJobKeys = new Set(
    rows
      .filter(row =>
        estimateLabourMatchesService(row, serviceKey) &&
        Number(row?.quantity || 0) > 0
      )
      .map(row => estimateJobCardKey(row))
  );

  return rows.filter(row =>
    labourJobKeys.has(estimateJobCardKey(row)) &&
    estimateCategory(row) === "part" &&
    Number(row?.quantity || 0) > 0
  );
}

function estimateHistoryToItems(vehicleRows = [], selectedKeys = [], modelRows = [], globalPartRates = []) {
  const vehicle = Array.isArray(vehicleRows) ? vehicleRows : [];
  const modelHistory = Array.isArray(modelRows) ? modelRows : [];
  const allModelRates = Array.isArray(globalPartRates) ? globalPartRates : [];

  function latestGlobalPartRate(partCode) {
    const code = normalizePartCode(partCode);
    if (!code) return 0;
    const row = allModelRates.find(item =>
      normalizePartCode(item?.part_code) === code &&
      Number(item?.rate) > 0
    );
    return Number(row?.rate || 0);
  }

  function applyGlobalPartRate(item) {
    if (!item || item.type !== "part") return item;
    const globalRate = latestGlobalPartRate(item.partNo);
    if (!(globalRate > 0)) return item;
    item.baseRate = globalRate;
    item.rate = Number((globalRate * 1.18).toFixed(2));
    item.source = "Historical DB (Qty from same-model history; Rate from matching part history, 18% GST added)";
    return item;
  }

  // Per-line source selection: vehicle history always wins for the same
  // reference part/labour operation. Same-model DB history is only used when
  // that line is not available for this VIN.
  function rowsByReferenceOrService(sourceRows, serviceKey) {
    return sourceRows.filter(row =>
      estimateCategory(row) === "part" &&
      estimatePartMatchesService(row, serviceKey) &&
      Number(row?.quantity || 0) > 0
    );
  }

  function modelFallbackPartRows(serviceKey) {
    const direct = rowsByReferenceOrService(modelHistory, serviceKey);
    if (direct.length) return direct;

    // If the exact reference part code is not present in the model history,
    // use the same model's matching service family as the quantity/rate source.
    return modelHistory.filter(row =>
      estimateCategory(row) === "part" &&
      estimatePartMatchesService(row, serviceKey) &&
      Number(row?.quantity || 0) > 0
    );
  }

  function buildPartItemsForService(serviceKey) {
    const references = ESTIMATE_REFERENCE_PARTS[serviceKey] || [];

    // For services with explicit reference part numbers, process every
    // reference independently. Missing VIN lines fall back independently to
    // same-model history.
    if (references.length) {
      const result = [];

      for (const reference of references) {
        const referenceCode = normalizePartCode(reference);
        const vinExact = vehicle.filter(row =>
          estimateCategory(row) === "part" &&
          normalizePartCode(row?.part_code) === referenceCode &&
          Number(row?.quantity || 0) > 0
        );

        const modelExact = modelHistory.filter(row =>
          estimateCategory(row) === "part" &&
          normalizePartCode(row?.part_code) === referenceCode &&
          Number(row?.quantity || 0) > 0
        );

        let candidates = vinExact.length ? vinExact : modelExact;

        // If exact reference code is absent even in same-model history, use
        // the service family from the same model as the historical qty/rate
        // source, while displaying the user's reference part number.
        if (!candidates.length) {
          candidates = modelFallbackPartRows(serviceKey);
        }

        if (!candidates.length) continue;

        // Engine Oil / Axle Oil: prefer a full replacement quantity when
        // available, but never combine quantities from different job cards.
        if (serviceKey === "engineOil" && referenceCode === "EN699991") {
          const full = candidates.filter(row =>
            !estimateStandardPartName(row).includes("FILTER") &&
            Number(row?.quantity || 0) >= 12
          );
          if (full.length) candidates = full;
        }
        if (serviceKey === "axleOil") {
          const full = candidates.filter(row => Number(row?.quantity || 0) >= 12);
          if (full.length) candidates = full;
        }

        const standard = estimateStandardPartName(candidates[0]);
        const item = estimateBuildHistoricalItem(
          "part",
          serviceKey,
          candidates,
          referenceCode
        );
        if (item) {
          // Part number is authoritative. Quantity comes from same-model
          // history, while rate is allowed to come from any vehicle/model
          // carrying the exact same part number.
          item.partNo = referenceCode;
          if (!item.description) item.description = standard;
          result.push(applyGlobalPartRate(item));
        }
      }

      return result;
    }

    const candidates = rowsByReferenceOrService(vehicle, serviceKey).length
      ? rowsByReferenceOrService(vehicle, serviceKey)
      : modelFallbackPartRows(serviceKey);

    if (!candidates.length) return [];

    const byStandard = new Map();
    for (const row of candidates) {
      const standard = estimateStandardPartName(row) || normalizePartCode(row.part_code);
      if (!standard) continue;
      if (!byStandard.has(standard)) byStandard.set(standard, []);
      byStandard.get(standard).push(row);
    }

    const result = [];
    for (const [standard, standardRows] of byStandard) {
      const winner = standardRows.slice().sort((a,b) =>
        estimateRowRank(b,0) - estimateRowRank(a,0)
      )[0];
      const item = estimateBuildHistoricalItem(
        "part",
        serviceKey,
        standardRows,
        estimatePreferredReferenceCode(serviceKey, standard, standardRows) || winner?.part_code || ""
      );
      if (item) result.push(applyGlobalPartRate(item));
    }
    return result;
  }

  const items = [];

  for (const serviceKey of selectedKeys) {
    // Parts are resolved independently; one VIN line cannot block other
    // required reference parts.
    items.push(...buildPartItemsForService(serviceKey));

    // Labour follows the same source priority: exact VIN labour first,
    // then same-model labour when the VIN has no matching operation.
    const vehicleLabour = vehicle.filter(row =>
      estimateLabourMatchesService(row, serviceKey)
    );
    const modelLabour = modelHistory.filter(row =>
      estimateLabourMatchesService(row, serviceKey)
    );
    const labourRows = vehicleLabour.length ? vehicleLabour : modelLabour;

    if (serviceKey === "hubGrease") {
      const referenceRows = ESTIMATE_LABOUR_REFERENCE.hubGrease || [];

      // Hub configuration is position-specific. For a 4-hub vehicle the
      // applicable operations are Front Axle - 2 Hubs + Rear Axle - 2 Hubs.
      // Front/Rear - 4 Hubs must NOT be added as extra operations.
      const selectedHubReferences = referenceRows.filter(reference => {
        if (reference.code === "WHL165C" || reference.code === "WHL170C") return false;
        return true;
      });

      const seenHubPositions = new Set();
      for (const reference of selectedHubReferences) {
        const matches = labourRows.filter(row => {
          const text = estimateLabourText(row);
          if (text.includes(normalizePartCode(reference.code))) return true;
          if (reference.code === "WHL165A") return text.includes("FRONT") && text.includes("2") && text.includes("HUB");
          if (reference.code === "WHL170A") return text.includes("REAR") && text.includes("2") && text.includes("HUB");
          if (reference.code === "WHL175A") return text.includes("STLA") && text.includes("2") && text.includes("HUB");
          if (reference.code === "WHL180A") return text.includes("DTLA") && text.includes("2") && text.includes("HUB");
          return false;
        });

        if (!matches.length) continue;

        const positionKey =
          reference.code === "WHL165A" ? "FRONT" :
          reference.code === "WHL170A" ? "REAR" :
          reference.code === "WHL175A" ? "STLA" :
          reference.code === "WHL180A" ? "DTLA" :
          reference.code;

        if (seenHubPositions.has(positionKey)) continue;
        seenHubPositions.add(positionKey);

        const labourItem = estimateBuildHistoricalItem(
          "labour",
          serviceKey,
          matches,
          reference.code
        );
        if (labourItem) {
          labourItem.description = reference.description;
          labourItem.partNo = reference.code;
          items.push(labourItem);
        }
      }
    } else {
      const labourItem = estimateBuildHistoricalItem(
        "labour",
        serviceKey,
        labourRows,
        ESTIMATE_LABOUR_REFERENCE[serviceKey]?.[0]?.code || ""
      );

      if (labourItem) {
        const reference = ESTIMATE_LABOUR_REFERENCE[serviceKey]?.[0];
        if (reference) labourItem.description = reference.description;
        items.push(labourItem);
      }
    }
  }

  // Keep one estimate line per final reference part number within each
  // aggregate. If the same reference was sourced from VIN history, it remains
  // preferred over a model fallback.
  const uniqueParts = new Map();
  const finalItems = [];

  for (const item of items) {
    if (item.type !== "part") {
      finalItems.push(item);
      continue;
    }

    const key = item.serviceKey + "|" + normalizePartCode(item.partNo);
    if (!normalizePartCode(item.partNo)) {
      finalItems.push(item);
      continue;
    }

    if (!uniqueParts.has(key)) {
      uniqueParts.set(key, item);
      finalItems.push(item);
    } else {
      const previous = uniqueParts.get(key);
      const previousRank = estimateRowRank(previous.latestRow || {}, 0);
      const currentRank = estimateRowRank(item.latestRow || {}, 0);
      if (currentRank > previousRank) {
        const index = finalItems.indexOf(previous);
        if (index >= 0) finalItems[index] = item;
        uniqueParts.set(key, item);
      }
    }
  }

  return finalItems;
}
function emptyEstimateItem(type = "part") {
  return { id: type + "-" + Date.now() + "-" + Math.random().toString(36).slice(2,8), type, partNo:"", description:"", qty:"", rate:0, source:"Manual" };
}
function PortalHome({ user, onNavigate, onUpload, hasAnalysis, bulkResults }) {
  const dueVehicles = (bulkResults || []).filter(item => Array.isArray(item?.services) && item.services.length > 0).length;
  const totalVehicles = (bulkResults || []).length;
  const cards = [
    { key:"single", icon:"🚚", title:"Single Vehicle", text:"Check one vehicle service decision, history and due services." },
    { key:"bulk", icon:"📊", title:"Bulk Vehicle", text:"Analyse multiple vehicles and prepare customer-wise due summaries." },
    { key:"schedule", icon:"📅", title:"Service Schedule", text:"View service intervals and additional service windows." },
  ];
  return (
    <div className="portal-home">
      <div className="portal-home-hero"><div><div className="portal-home-kicker">SERVICE DECISION WEB PORTAL</div><h1>Welcome{user?.personName ? ", " + user.personName : ""}</h1><p>Your main workflow starts with Excel upload. Upload the DMS file first, then analyse vehicles or prepare the due summary.</p></div><button className="excel-button green portal-upload-button" onClick={onUpload}>Upload Excel &amp; Start</button></div>
      <div className="portal-kpi-grid"><div className="portal-kpi"><span>Vehicles in Current Upload</span><strong>{totalVehicles}</strong><small>Current session only</small></div><div className="portal-kpi"><span>Due Vehicles in Current Upload</span><strong>{dueVehicles}</strong><small>Current session only</small></div><div className="portal-kpi"><span>Portal Mode</span><strong>Beta</strong><small>Testing &amp; feedback</small></div></div>
      <div className="portal-section-title">What would you like to do?</div>
      <div className="portal-action-grid">{cards.map(card => <button key={card.key} className="portal-action-card" onClick={() => onNavigate(card.key)}><span className="portal-action-icon">{card.icon}</span><span className="portal-action-title">{card.title}</span><span className="portal-action-text">{card.text}</span><span className="portal-action-link">Open →</span></button>)}
        <button className="portal-action-card" onClick={() => onNavigate("estimate")}><span className="portal-action-icon">🧾</span><span className="portal-action-title">Prepare Estimate</span><span className="portal-action-text">Prepare an estimate directly from Home. Enter Vehicle No. first; DB details and parts can be loaded automatically or entered manually.</span><span className="portal-action-link">Open Estimate →</span></button>
      </div>
      <div className="home-estimate-preview" onClick={() => onNavigate("estimate")} role="button" tabIndex={0} onKeyDown={event => { if(event.key==="Enter" || event.key===" ") onNavigate("estimate"); }}>
        <div className="home-estimate-preview-head">
          <div><strong>SERVICE ESTIMATE</strong><span>Same estimate format • Click to open</span></div>
          <button type="button" className="excel-button green no-print" onClick={event => { event.stopPropagation(); onNavigate("estimate"); }}>Open Estimate</button>
        </div>
        <div className="home-estimate-preview-grid">
          <div><b>Vehicle No.</b><span>Vehicle number → DB lookup</span></div>
          <div><b>Vehicle Details</b><span>Customer, Model, Engine, Chassis / VIN</span></div>
          <div><b>Parts</b><span>Part No. → Description + MRP / Rate</span></div>
          <div><b>Qty / Rate / Amount</b><span>Editable estimate lines and totals</span></div>
        </div>
      </div>
      <div className="portal-workflow"><div><b>Recommended workflow</b><span>Upload Excel → Analyse → Review Service Decision → Prepare Estimate / Share Due Summary</span></div><div><b>Personalise</b><span>Theme, columns, custom names and table widths are saved in Profile &amp; Settings.</span></div></div>
    </div>
  );
}
function ServiceDecisionApp({ user }) {
  const [excelData, setExcelData] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [overrideReading, setOverrideReading] = useState("");
  const [appliedOverride, setAppliedOverride] = useState(null);
  const [mode, setMode] = useState("home");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkMeta, setBulkMeta] = useState(null);
  const [customerGroups, setCustomerGroups] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [mergedCustomerName, setMergedCustomerName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMeta, setUploadMeta] = useState(null);
  const [uploadParsedRecords, setUploadParsedRecords] = useState([]);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateStage, setEstimateStage] = useState("select");
  const [estimateHistory, setEstimateHistory] = useState([]);
  const [estimateVehicle, setEstimateVehicle] = useState({ customerName:"", reg:"", vin:"", engine:"", model:"", sale:null });
  const [estimateVehicleNo, setEstimateVehicleNo] = useState("");
  const [estimateVehicleLookupBusy, setEstimateVehicleLookupBusy] = useState(false);
  const [estimateVehicleLookupMessage, setEstimateVehicleLookupMessage] = useState("");
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateSelectedServices, setEstimateSelectedServices] = useState([]);
  const [estimateParts, setEstimateParts] = useState([]);
  const [estimateLabour, setEstimateLabour] = useState([]);
  const [estimateNotice, setEstimateNotice] = useState("");
  const [estimateNumber, setEstimateNumber] = useState("");
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkQuickFilter, setBulkQuickFilter] = useState("all");
  const [manualPartLookupBusy, setManualPartLookupBusy] = useState({});
  const defaultSingleColumns = ["date","jobCard","reading","plant","parts"];
  const defaultBulkColumns = ["customerName","vin","reg","saleDate","model","currentReading","services"];
  const defaultSingleLabels = { date:"Date", jobCard:"Job Card", reading:"Reading", plant:"Plant", parts:"Part No. / Service / Qty" };
  const defaultBulkLabels = { customerName:"Customer Name", vin:"VIN", reg:"Reg. No.", saleDate:"Sale Date", model:"Model", currentReading:"Current Reading", services:"Service To Be Completed" };
  const defaultSingleWidths = { date:8, jobCard:10, reading:10, plant:12, parts:60 };
  const defaultBulkWidths = { serial:7, customerName:16, vin:13, reg:12, saleDate:11, model:13, currentReading:13, services:22 };
  const normalizeDashboardPrefs = (preferences = {}) => ({
    ...preferences,
    singleColumns: Array.isArray(preferences.singleColumns) && preferences.singleColumns.length ? preferences.singleColumns : defaultSingleColumns,
    bulkColumns: Array.isArray(preferences.bulkColumns) && preferences.bulkColumns.length ? preferences.bulkColumns : defaultBulkColumns,
    singleColumnLabels: { ...defaultSingleLabels, ...(preferences.singleColumnLabels || {}) },
    bulkColumnLabels: { ...defaultBulkLabels, ...(preferences.bulkColumnLabels || {}) },
    singleColumnWidths: { ...defaultSingleWidths, ...(preferences.singleColumnWidths || {}) },
    bulkColumnWidths: { ...defaultBulkWidths, ...(preferences.bulkColumnWidths || {}) },
  });
  const [dashboardPrefs, setDashboardPrefs] = useState(() => normalizeDashboardPrefs(user?.preferences || {}));
  useEffect(() => { setDashboardPrefs(normalizeDashboardPrefs(user?.preferences || {})); }, [user?.id, user?.preferences]);
  const singleTableColumns = dashboardPrefs.singleColumns;
  const bulkTableColumns = dashboardPrefs.bulkColumns;
  const singleColumnLabels = dashboardPrefs.singleColumnLabels;
  const bulkColumnLabels = dashboardPrefs.bulkColumnLabels;
  const singleColumnWidths = dashboardPrefs.singleColumnWidths;
  const bulkColumnWidths = dashboardPrefs.bulkColumnWidths;
  const isSingleColumnVisible = key => singleTableColumns.includes(key);
  const isBulkColumnVisible = key => bulkTableColumns.includes(key);
  const persistDashboardPrefs = async (nextPrefs) => {
    setDashboardPrefs(nextPrefs);
    const token = localStorage.getItem("serviceDecisionAuthToken");
    if (!token) return;
    try {
      const response = await fetch("/api/auth", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body:JSON.stringify({ action:"update-profile", personName:user?.personName || "", dealerName:user?.dealerName || "", mobile:user?.mobile || "", preferences:nextPrefs }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || "Unable to save table preferences.");
    } catch (error) { console.error("Dashboard preference save failed:", error); }
  };
  const resizeTableColumn = (tableType, key, event) => {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.parentElement;
    const table = th?.closest("table");
    if (!th || !table) return;

    const visibleKeys = tableType === "single"
      ? singleTableColumns.filter(isSingleColumnVisible)
      : ["serial", ...bulkTableColumns.filter(isBulkColumnVisible)];
    const lastKey = visibleKeys[visibleKeys.length - 1];
    if (!lastKey || key === lastKey) return;

    const startX = event.clientX;
    const tableWidth = Math.max(1, table.getBoundingClientRect().width);
    const sourceKey = tableType === "single" ? "singleColumnWidths" : "bulkColumnWidths";
    let latestWidths = tableType === "single" ? { ...singleColumnWidths } : { ...bulkColumnWidths };
    const startSourcePct = Number(latestWidths[key] || 10);
    const startLastPct = Number(latestWidths[lastKey] || 10);
    const minPct = 3;

    const onMove = (moveEvent) => {
      const deltaPct = ((moveEvent.clientX - startX) / tableWidth) * 100;
      const sourcePct = Math.max(minPct, Math.min(90, startSourcePct + deltaPct));
      const actualDelta = sourcePct - startSourcePct;
      const lastPct = Math.max(minPct, startLastPct - actualDelta);
      latestWidths = {
        ...latestWidths,
        [key]: Number(sourcePct.toFixed(2)),
        [lastKey]: Number(lastPct.toFixed(2)),
      };
      setDashboardPrefs(prev => ({ ...prev, [sourceKey]: latestWidths }));
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      void persistDashboardPrefs({ ...dashboardPrefs, [sourceKey]: latestWidths });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };
  const tableColumnStyle = (tableType, key) => ({ width:`${Number((tableType === "single" ? singleColumnWidths[key] : bulkColumnWidths[key]) || 10)}%` });

  const [bulkTableSort, setBulkTableSort] = useState({ key: "dueCount", direction: "desc" });
  const [bulkTableFilters, setBulkTableFilters] = useState({
    customerName: "",
    vin: "",
    reg: "",
    saleDate: "",
    model: "",
    currentReading: "",
    services: "",
  });
  const [bulkFilterSelections, setBulkFilterSelections] = useState({
    customerName: [],
    vin: [],
    reg: [],
    saleDate: [],
    model: [],
    currentReading: [],
    services: [],
  });
  const [openBulkFilter, setOpenBulkFilter] = useState(null);

  const logUsage = (activityType, payload = {}) => {
    const token = localStorage.getItem("serviceDecisionAuthToken");
    if (!token) return;
    void fetch("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action:"log-activity", activityType, ...payload }),
    }).catch(() => {});
  };

  const previewRows = useMemo(() => {
    if (!excelData.trim()) return [];
    return excelData.trim().split(/\r?\n/).slice(0, 6);
  }, [excelData]);
  const todayDisplay = (() => {
    const d = new Date();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(d.getDate()).padStart(2,"0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
  })();



  // ============================================================
  // BACKGROUND DATABASE SYNC
  // Excel parsing/decision calculation must NOT wait for DB.
  // Localhost uses the existing Express backend.
  // Production uses the same-origin Vercel /api/save-history function.
  // ============================================================
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3001"
      : "");

  async function saveHistoryToBackend({ records, vehicle }) {
    const response = await fetch(`${API_BASE_URL}/api/save-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records,
        vehicle: {
          ...vehicle,
          sale: vehicle?.sale instanceof Date
            ? vehicle.sale.toISOString()
            : vehicle?.sale || null,
        },
      }),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `History save failed (${response.status})`);
    }
    return payload;
  }

  async function saveHistoryInBackground(records) {
    const groups = new Map();
    for (const record of records || []) {
      const vin = String(record?.vin || "").trim().toUpperCase();
      if (!vin) continue;
      if (!groups.has(vin)) groups.set(vin, []);
      groups.get(vin).push(record);
    }

    const jobs = [...groups.entries()];
    if (!jobs.length) return;

    const concurrency = Math.min(4, jobs.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < jobs.length) {
        const index = nextIndex++;
        const [, vehicleRecords] = jobs[index];
        try {
          const vehicle = deriveVehicle(vehicleRecords);
          await saveHistoryToBackend({ records: vehicleRecords, vehicle });
        } catch (error) {
          console.error("Background history save failed:", error);
        }
      }
    }

    await Promise.all(
      Array.from({ length: concurrency }, () => worker())
    );
  }

  const handleExcelUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setError("");
    setUploadBusy(true);

    try {
      const result = await parseExcelFiles(files);
      const parsedRows = result.records || [];

      setExcelData("");
      const acceptedFiles = files.filter(file => result.files.includes(file.name));
      setUploadedFiles(acceptedFiles);
      setUploadMeta({
        files: result.files,
        failedFiles: result.failedFiles || [],
        rowsBefore: result.totalRowsBeforeDedup,
        duplicates: result.duplicateRowsIgnored,
        rowsAfter: parsedRows.length,
      });

      setAnalysis(null);
      setBulkResults([]);
      setBulkMeta(null);
      setCustomerGroups([]);
      setSelectedCustomers([]);
      setUploadParsedRecords(parsedRows);
      if (parsedRows.length) {
        const uploadedVins = new Set(
          parsedRows.map(r => String(r?.vin || "").trim().toUpperCase()).filter(Boolean)
        );
        setMode(uploadedVins.size > 1 ? "bulk" : "single");
      }
      if (parsedRows.length) {
        logUsage("Excel Upload", {
          fileCount: acceptedFiles.length,
          vehicleCount: new Set(parsedRows.map(r=>String(r.vin||"").trim().toUpperCase()).filter(Boolean)).size,
          details: { rows: parsedRows.length, files: acceptedFiles.map(f=>f.name) }
        });
      }

      if (!parsedRows.length && result.failedFiles?.length) {
        setError(
          result.failedFiles
            .map(item => `${item.name} — This file was ignored because required header was not found. ${item.reason}`)
            .join(" | ")
        );
      } else {
        // Do not await DB persistence. Analysis remains immediately available.
        if (parsedRows.length) void saveHistoryInBackground(parsedRows);
      }
    } catch (err) {
      setUploadMeta(null);
      setUploadedFiles([]);
      setUploadParsedRecords([]);
      setError(err?.message || "Excel file read nahi ho payi.");
    } finally {
      setUploadBusy(false);
      event.target.value = "";
    }
  };

  const getAnalysisRecords = () => {
    if (uploadParsedRecords.length) {
      return {
        headers: [],
        records: uploadParsedRecords,
        headerMap: {}
      };
    }
    return parseExcelPaste(excelData);
  };

  const analyze = () => {
    setError("");
    try {
      const parsed = getAnalysisRecords();
      const uniqueVins = [...new Set(
        parsed.records
          .map(r => String(r.vin || '').trim().toUpperCase())
          .filter(Boolean)
      )];

      // Single Vehicle button automatically switches to Bulk when the input
      // contains more than one VIN. No second upload/paste is required.
      if(uniqueVins.length > 1){
        const results = buildBulkAnalysis(parsed.records);
        const groups = buildCustomerGroups(results, user?.dealerName);
        setAnalysis(null);
        setOverrideReading("");
        setAppliedOverride(null);
        setBulkResults(results);
        setCustomerGroups(groups);
        setSelectedCustomers([]);
        setBulkTableSort({ key: "dueCount", direction: "desc" });
        setBulkTableFilters({
          customerName: "",
          vin: "",
          reg: "",
          saleDate: "",
          model: "",
          currentReading: "",
          services: "",
        });
        setBulkFilterSelections({
          customerName: [],
          vin: [],
          reg: [],
          saleDate: [],
          model: [],
          currentReading: [],
          services: [],
        });
        setOpenBulkFilter(null);
        setBulkMeta({ records: parsed.records.length, vehicles: results.length, customers: groups.length });
        setMode("bulk");
        logUsage("Bulk Vehicle Analysis", {
          mode:"bulk",
          vehicleCount:results.length,
          fileCount:uploadedFiles.length,
          details:{ rows:parsed.records.length, customers:groups.length, automatic:true }
        });
        setError(`Multiple Vehicle Detected: ${uniqueVins.length} unique VINs found. Automatically switched to Bulk Service.`);
        return;
      }

      const vehicle = deriveVehicle(parsed.records);
      const running = deriveRunningReading(parsed.records, vehicle);
      const visits = aggregateHistory(parsed.records);
      const decision = calculateDecisions(parsed.records, vehicle, running);
      setOverrideReading("");
      setAppliedOverride(null);
      setAnalysis({ ...parsed, vehicle, running, visits, decision });
      logUsage("Single Vehicle Analysis", {
        mode:"single",
        vehicleCount:1,
        fileCount:uploadedFiles.length,
        vin:String(vehicle?.vin || parsed.records?.[0]?.vin || "").trim().toUpperCase(),
        details:{ serviceCount:(decision?.services || []).length }
      });
    } catch (e) {
      setAnalysis(null);
      setError(e.message || "Excel data read nahi ho paya.");
    }
  };

  const analyzeBulk = () => {
    setError("");
    try {
      const parsed = getAnalysisRecords();
      const results = buildBulkAnalysis(parsed.records);
      setBulkResults(results);
      const groups = buildCustomerGroups(results, user?.dealerName);
      setCustomerGroups(groups);
      setSelectedCustomers([]);
      setBulkTableSort({ key: "dueCount", direction: "desc" });
      setBulkTableFilters({
        customerName: "",
        vin: "",
        reg: "",
        saleDate: "",
        model: "",
        currentReading: "",
        services: "",
      });
      setBulkFilterSelections({
        customerName: [],
        vin: [],
        reg: [],
        saleDate: [],
        model: [],
        currentReading: [],
        services: [],
      });
      setOpenBulkFilter(null);
      setBulkMeta({ records: parsed.records.length, vehicles: results.length, customers: groups.length });
      logUsage("Bulk Vehicle Analysis", {
        mode:"bulk",
        vehicleCount:results.length,
        fileCount:uploadedFiles.length,
        details:{ rows:parsed.records.length, customers:groups.length }
      });
    } catch (e) {
      setBulkResults([]);
      setBulkMeta(null);
      setError(e.message || "Bulk data read nahi ho paya.");
    }
  };

  const recalculateWithOverride = () => {
    if (!analysis) return;
    logUsage("Reading Override", {
      mode:"single",
      vehicleCount:1,
      vin:String(analysis?.vehicle?.vin || "").trim().toUpperCase(),
      details:{ value:overrideReading || "", unit:analysis?.running?.unit || "KM" }
    });

    const raw = String(overrideReading || "").replace(/,/g, "").trim();

    // Blank input = restore the original DMS-calculated reading.
    if (!raw) {
      const vehicle = analysis.vehicle;
      const originalRunning = deriveRunningReading(analysis.records, vehicle);
      const decision = calculateDecisions(analysis.records, vehicle, originalRunning);
      setAppliedOverride(null);
      setAnalysis(prev => ({ ...prev, running: originalRunning, decision }));
      return;
    }

    const value = Number(raw);
    const unit = analysis.running.unit || (isTipperModel(analysis.vehicle.model) ? "HRS" : "KM");
    if (!Number.isFinite(value) || value <= 0) {
      const msg = `Please enter a valid ${unit} value.`;
      setError(msg);
      window.alert(msg);
      return;
    }

    // A vehicle meter reading must not go backwards.
    // Validate the user override against the highest valid historical reading
    // so a lower value cannot be used to generate a false service decision.
    const historicalReadings = analysis.records
      .map(r => getRelevantReading(r, analysis.vehicle))
      .filter(v => Number.isFinite(v) && v > 0);
    const highestRecorded = historicalReadings.length ? Math.max(...historicalReadings) : 0;

    if (highestRecorded > 0 && value < highestRecorded) {
      setAppliedOverride(null);
      const msg = `Invalid ${unit} reading!\n\nEntered: ${formatNumber(value)} ${unit}\nPrevious recorded reading: ${formatNumber(highestRecorded)} ${unit}\n\nPlease enter a reading equal to or higher than the previous recorded reading.`;
      setError(msg.replace(/\n/g, " "));
      window.alert(msg);
      return;
    }

    setError("");
    const overriddenRunning = {
      ...analysis.running,
      current: value,
      mode: "User override",
      unit: analysis.running.unit || (isTipperModel(analysis.vehicle.model) ? "HRS" : "KM")
    };
    const decision = calculateDecisions(analysis.records, analysis.vehicle, overriddenRunning);
    setAppliedOverride(value);
    setAnalysis(prev => ({ ...prev, running: overriddenRunning, decision }));
  };

  const getBulkSortValue = (item, key) => {
    const vehicle = item?.vehicle || {};
    switch (key) {
      case "customerName": return String(vehicle.customerName || "").toUpperCase();
      case "vin": return String(item?.vin || vehicle.vin || "").toUpperCase();
      case "reg": return String(vehicle.reg || "").toUpperCase();
      case "saleDate": return vehicle.sale ? vehicle.sale.getTime() : 0;
      case "model": return String(vehicle.model || "").toUpperCase();
      case "currentReading": return Number(item?.running?.current || 0);
      case "services": return String(item?.services?.join(", ") || "").toUpperCase();
      case "dueCount": return Number(item?.dueCount || item?.services?.length || 0);
      default: return "";
    }
  };

  const getBulkDisplayValues = (item) => {
    const vehicle = item?.vehicle || {};
    return {
      customerName: String(vehicle.customerName || "-"),
      vin: String(item?.vin || vehicle.vin || "-"),
      reg: String(vehicle.reg || "-"),
      saleDate: vehicle.sale ? formatDateShort(vehicle.sale) : "-",
      model: String(vehicle.model || "-"),
      currentReading: item.running?.current
        ? `${formatNumber(item.running.current)} ${item.running.unit || getTargetUnit(vehicle)}`
        : "-",
      services: String(item.services?.join(", ") || "-"),
    };
  };

  const bulkFilterValueLists = useMemo(() => {
    const sourceRows = bulkResults.filter(item =>
      Array.isArray(item.services) && item.services.length > 0
    );
    const lists = {};
    const keys = ["customerName", "vin", "reg", "saleDate", "model", "currentReading", "services"];

    for (const key of keys) {
      lists[key] = [...new Set(
        sourceRows.map(item => getBulkDisplayValues(item)[key])
      )].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base"
        })
      );
    }

    return lists;
  }, [bulkResults]);

  const bulkSummaryRows = useMemo(() => {
    const search = bulkSearch.trim().toLowerCase();
    const rows = bulkResults
      .filter(item => Array.isArray(item.services) && item.services.length > 0)
      .filter(item => bulkQuickFilter === "all" || bulkQuickFilter === "due")
      .filter(item => {
        if (!search) return true;
        const values = getBulkDisplayValues(item);
        return Object.values(values).some(value => String(value ?? "").toLowerCase().includes(search));
      })
      .filter(item => {
        const values = getBulkDisplayValues(item);

        return Object.entries(bulkFilterSelections).every(([key, selected]) => {
          if (!Array.isArray(selected) || selected.length === 0) return true;
          return selected.includes(values[key]);
        });
      });

    const sorted = [...rows].sort((a, b) => {
      const av = getBulkSortValue(a, bulkTableSort.key);
      const bv = getBulkSortValue(b, bulkTableSort.key);

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * (bulkTableSort.direction === "asc" ? 1 : -1);
      }

      return String(av).localeCompare(
        String(bv),
        undefined,
        { numeric: true, sensitivity: "base" }
      ) * (bulkTableSort.direction === "asc" ? 1 : -1);
    });

    return sorted;
  }, [bulkResults, bulkFilterSelections, bulkTableSort, bulkSearch, bulkQuickFilter]);

  const openBulkFilterMenu = (key, event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    setOpenBulkFilter({
      key,
      label: {
        customerName: "Customer Name",
        vin: "VIN",
        reg: "Reg. No.",
        saleDate: "Sale Date",
        model: "Model",
        currentReading: "Current Reading",
        services: "Service To Be Completed",
      }[key],
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    });
  };

  const applyBulkFilter = (key, selectedValues) => {
    setBulkFilterSelections(prev => ({
      ...prev,
      [key]: selectedValues,
    }));
    setOpenBulkFilter(null);
  };

  const clearBulkFilter = (key) => {
    setBulkFilterSelections(prev => ({
      ...prev,
      [key]: [],
    }));
    setOpenBulkFilter(null);
  };

  const downloadBulkCsv = () => {
    const exportColumns = [
      ["serial", "S.No."],
      ["customerName", bulkColumnLabels.customerName || "Customer Name"],
      ["vin", bulkColumnLabels.vin || "VIN"],
      ["reg", bulkColumnLabels.reg || "Reg. No."],
      ["saleDate", bulkColumnLabels.saleDate || "Sale Date"],
      ["model", bulkColumnLabels.model || "Model"],
      ["currentReading", bulkColumnLabels.currentReading || "Current Reading"],
      ["services", bulkColumnLabels.services || "Service To Be Completed"],
    ].filter(([key]) => key === "serial" || isBulkColumnVisible(key));

    const rows = bulkSummaryRows.map((item, index) => {
      const values = getBulkDisplayValues(item);
      return Object.fromEntries(
        exportColumns.map(([key, label]) => [
          label,
          key === "serial" ? index + 1 : (values[key] === "-" ? "" : values[key]),
        ])
      );
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Due Summary");
    XLSX.writeFile(book, "Service_Due_Summary.xlsx");
  };

  const clearAllBulkFilters = () => {
    setBulkFilterSelections({
      customerName: [],
      vin: [],
      reg: [],
      saleDate: [],
      model: [],
      currentReading: [],
      services: [],
    });
    setBulkTableSort({ key: "dueCount", direction: "desc" });
    setBulkSearch("");
    setBulkQuickFilter("all");
    setOpenBulkFilter(null);
  };

  const sortBulkByColumn = (key, direction) => {
    setBulkTableSort({ key, direction });
  };

  const clear = () => {
    if ((analysis || bulkResults.length || uploadedFiles.length) && !window.confirm("Clear the current vehicle data and analysis?")) return;
    logUsage("Clear", { mode, details:{ hadAnalysis:Boolean(analysis), uploadedFiles:uploadedFiles.length } });
    setExcelData("");
    setAnalysis(null);
    setError("");
    setOverrideReading("");
    setAppliedOverride(null);
    setBulkResults([]);
    setBulkMeta(null);
    setCustomerGroups([]);
    setSelectedCustomers([]);
    setMergedCustomerName("");
    setUploadedFiles([]);
    setUploadBusy(false);
    setUploadMeta(null);
    setUploadParsedRecords([]);
    setBulkTableSort({ key: "dueCount", direction: "desc" });
    setBulkSearch("");
    setBulkQuickFilter("all");
    setBulkTableFilters({
      customerName: "",
      vin: "",
      reg: "",
      saleDate: "",
      model: "",
      currentReading: "",
      services: "",
    });
    setBulkFilterSelections({
      customerName: [],
      vin: [],
      reg: [],
      saleDate: [],
      model: [],
      currentReading: [],
      services: [],
    });
    setOpenBulkFilter(null);
  };

  // App-style Escape navigation:
  // 1. Close an open Excel filter first.
  // 2. From Service Schedule / Bulk Vehicle, go back to Single Vehicle.
  // 3. From a loaded Single Vehicle screen, perform the same action as Clear.
  // 4. On the empty Single Vehicle home screen, Escape safely behaves like Clear.
  useEffect(() => {
    const handleEscapeNavigation = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();

      if (openBulkFilter) {
        setOpenBulkFilter(null);
        return;
      }

      if (mode === "schedule") {
        setMode("single");
        setError("");
        return;
      }

      if (mode === "bulk") {
        setMode("single");
        setError("");
        return;
      }

      clear();
    };

    window.addEventListener("keydown", handleEscapeNavigation, true);
    return () => window.removeEventListener("keydown", handleEscapeNavigation, true);
  }, [mode, openBulkFilter, analysis, uploadParsedRecords.length]);

  async function loadEstimateHistoryByVin(vin) {
    const response = await fetch("/api/save-history?vin=" + encodeURIComponent(vin));
    const data = await response.json();
    return { vehicleRows:Array.isArray(data?.rows)?data.rows:[], modelRows:Array.isArray(data?.modelRows)?data.modelRows:[], globalPartRates:Array.isArray(data?.globalPartRates)?data.globalPartRates:[] };
  }

  async function openEstimate() {
    if (!analysis?.vehicle?.vin) return;
    const dueKeys = BULK_SERVICE_LABELS.filter(([, key]) => analysis?.decision?.result?.[key]).map(([, key]) => key);
    setEstimateVehicle({ customerName:analysis?.vehicle?.customerName||"", reg:analysis?.vehicle?.reg||"", vin:analysis?.vehicle?.vin||"", engine:analysis?.vehicle?.engine||"", model:analysis?.vehicle?.model||"", sale:analysis?.vehicle?.sale||null });
    setEstimateVehicleNo(analysis?.vehicle?.reg||"");
    setEstimateSelectedServices(dueKeys);
    setEstimateNumber("EST-" + new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,"0") + String(new Date().getDate()).padStart(2,"0") + "-" + String(Date.now()).slice(-5));
    setEstimateParts([]); setEstimateLabour([]); setEstimateNotice(""); setEstimateVehicleLookupMessage("");
    setEstimateStage("select"); setEstimateOpen(true); setEstimateLoading(true);
    try {
      const history=await loadEstimateHistoryByVin(analysis.vehicle.vin);
      setEstimateHistory(history);
      setEstimateNotice(history.vehicleRows.length||history.modelRows.length ? "Vehicle history loaded. Missing items will be sourced from the same model history in DB." : "No historical service data found. Estimate items can be entered manually.");
    } catch {
      setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
      setEstimateNotice("Historical data could not be loaded. Manual estimate entry is available.");
    } finally { setEstimateLoading(false); }
  }

  function openStandaloneEstimate() {
    setEstimateVehicle({customerName:"",reg:"",vin:"",engine:"",model:"",sale:null});
    setEstimateVehicleNo("");
    setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
    setEstimateSelectedServices([]); setEstimateParts([]); setEstimateLabour([]);
    setEstimateNotice(""); setEstimateVehicleLookupMessage("");
    setEstimateNumber("EST-" + new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,"0") + String(new Date().getDate()).padStart(2,"0") + "-" + String(Date.now()).slice(-5));
    setEstimateStage("vehicle"); setEstimateOpen(true);
  }

  async function lookupEstimateVehicle() {
    const registration=String(estimateVehicleNo||"").replace(/\s+/g,"").trim().toUpperCase();
    setEstimateVehicleNo(registration);
    if(!registration){ setEstimateVehicleLookupMessage("Please enter Vehicle No."); return; }
    setEstimateVehicleLookupBusy(true); setEstimateVehicleLookupMessage("");
    try {
      const response=await fetch("/api/save-history?registration="+encodeURIComponent(registration));
      const data=await response.json().catch(()=>({}));
      const rows=Array.isArray(data?.rows)?data.rows:[];
      const dbVehicle=data?.vehicle || rows[0] || null;
      if(dbVehicle){
        setEstimateVehicle({
          customerName:dbVehicle?.customer_name||"",
          reg:String(dbVehicle?.registration||registration).replace(/\s+/g,"").toUpperCase(),
          vin:String(dbVehicle?.vin||"").trim().toUpperCase(),
          engine:dbVehicle?.engine||"",
          model:dbVehicle?.model||"",
          sale:dbVehicle?.sale_date?new Date(dbVehicle.sale_date):null
        });
        setEstimateHistory({vehicleRows:rows,modelRows:Array.isArray(data?.modelRows)?data.modelRows:[],globalPartRates:Array.isArray(data?.globalPartRates)?data.globalPartRates:[]});
        setEstimateVehicleLookupMessage(rows.length
          ? "Vehicle found in DB. Details loaded automatically."
          : "Vehicle found in DB. No service history is available; enter estimate lines manually.");

      } else {
        setEstimateVehicle(prev=>({...prev,reg:registration,vin:""}));
        setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
        setEstimateVehicleLookupMessage("Vehicle not found in DB. Enter the vehicle/customer details manually below.");
      }
    } catch {
      setEstimateVehicle(prev=>({...prev,reg:registration,vin:""}));
      setEstimateHistory({vehicleRows:[],modelRows:[],globalPartRates:[]});
      setEstimateVehicleLookupMessage("DB lookup failed. You can continue with manual vehicle details.");
    } finally {
      setEstimateVehicleLookupBusy(false);
      setEstimateStage("estimate");
    }
  }

  function prepareEstimate() {
    const history = Array.isArray(estimateHistory)
      ? { vehicleRows: estimateHistory, modelRows: [] }
      : (estimateHistory || { vehicleRows: [], modelRows: [] });
    const items = estimateHistoryToItems(
      history.vehicleRows || [],
      estimateSelectedServices,
      history.modelRows || [],
      history.globalPartRates || []
    );
    setEstimateParts(items.filter(item => item.type === "part"));
    setEstimateLabour(items.filter(item => item.type === "labour"));
    setEstimateNotice(
      (history.vehicleRows?.length || history.modelRows?.length)
        ? "Estimate prepared from vehicle history and same-model DB fallback. You can edit every line or add missing items manually."
        : "No historical estimate items found. Please add the required items manually."
    );
    setEstimateStage("estimate");
  }
  function reviseEstimateServices() { setEstimateStage("select"); }
  function updateEstimateItem(type, id, field, value) {
    const setter = type === "labour" ? setEstimateLabour : setEstimateParts;
    setter(prev => prev.map(item => item.id === id ? { ...item, [field]: value, source:"Manual" } : item));
  }

  function normalizeEstimateQuantities() {
    setEstimateParts(prev => prev.map(item => ({ ...item, qty:String(item.qty ?? "").trim()==="" ? 1 : Number(item.qty) || 0 })));
    setEstimateLabour(prev => prev.map(item => ({ ...item, qty:String(item.qty ?? "").trim()==="" ? 1 : Number(item.qty) || 0 })));
  }
  async function lookupManualEstimatePart(id, partNo) {
    const code = String(partNo || "").replace(/\s+/g,"").trim().toUpperCase();
    if (!code) return;
    setManualPartLookupBusy(prev => ({...prev,[id]:true}));
    try {
      const response = await fetch("/api/save-history?partNo=" + encodeURIComponent(code));
      const data = await response.json().catch(() => ({}));
      if (data.part) setEstimateParts(prev => prev.map(item => item.id === id ? {...item,partNo:data.part.partNo||code,description:data.part.description||item.description,rate:Number(data.part.rateInclGst||0),baseRate:Number(data.part.rate||0),source:"Historical DB - exact Part No."} : item));
    } catch (err) { console.warn("Manual estimate part lookup:",err); }
    finally { setManualPartLookupBusy(prev => ({...prev,[id]:false})); }
  }
  function addEstimateItem(type) { (type === "labour" ? setEstimateLabour : setEstimateParts)(prev => [...prev, emptyEstimateItem(type)]); }
  function removeEstimateItem(type, id) {
    if (!window.confirm("Remove this estimate line?")) return;
    (type === "labour" ? setEstimateLabour : setEstimateParts)(prev => prev.filter(item => item.id !== id));
  }
  const estimatePartsTotal = estimateParts.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.rate||0),0);
  const estimateLabourBase = estimateLabour.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.rate||0),0);
  const estimateLabourGst = estimateLabourBase*0.18;
  const estimateLabourTotal = estimateLabourBase+estimateLabourGst;
  const estimateGrandTotal = estimatePartsTotal+estimateLabourTotal;
  function buildEstimatePdf(autoPrint = false) {
    const pdf = new jsPDF({ unit:"mm", format:"a4", orientation:"portrait", compress:true });
    const margin = 10;
    const width = 190;
    const vehicle = estimateVehicle || analysis?.vehicle || {};
    const workshop = String(user?.dealerName || "Workshop").trim();

    // jsPDF's built-in Helvetica does not render the ₹ glyph reliably.
    // Use plain ASCII "INR" in the PDF so Adobe/Edge do not show broken
    // characters or artificial digit spacing.
    const money = value => {
      const n = Number(value || 0);
      return "INR " + n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    pdf.setFont("helvetica","bold");
    pdf.setFontSize(17);
    pdf.text("SERVICE ESTIMATE",105,14,{align:"center"});
    pdf.setFontSize(10);
    pdf.text(workshop,105,21,{align:"center"});
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8.5);
    pdf.text("Estimate only - subject to actual inspection and applicable rates.",105,25,{align:"center"});
    pdf.setFontSize(8);
    pdf.text("Estimate No. (Session): " + (estimateNumber || "-"),margin,30);
    pdf.text("Prepared: " + formatDate(new Date()),width + margin,30,{align:"right"});

    autoTable(pdf,{
      startY:35,
      margin:{left:margin,right:margin},
      tableWidth:width,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8.5,
        cellPadding:3,
        lineColor:[150,150,150],
        lineWidth:0.2
      },
      body:[
        ["Customer\n"+(vehicle.customerName||"-"),"Reg. No.\n"+(vehicle.reg||"-"),"VIN\n"+(vehicle.vin||"-")],
        ["Model\n"+(vehicle.model||"-"),"Current Reading\n"+(analysis?.running?.current ? formatNumber(analysis.running.current)+" "+(analysis.running.unit||getTargetUnit(vehicle)) : "-"),"Date\n"+formatDate(new Date())]
      ]
    });

    let y=(pdf.lastAutoTable?.finalY||58)+7;
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(10);
    pdf.text("Selected Aggregate Services",margin,y);
    y+=4;

    const selectedNames=BULK_SERVICE_LABELS
      .filter(([,key])=>estimateSelectedServices.includes(key))
      .map(([name])=>name);

    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8.5);
    pdf.text(
      selectedNames.length ? selectedNames.join(", ") : "No aggregate service selected",
      margin,
      y+3,
      {maxWidth:width}
    );
    y+=selectedNames.length?9:7;

    autoTable(pdf,{
      startY:y,
      margin:{left:margin,right:margin},
      tableWidth:width,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8,
        cellPadding:2.5,
        lineColor:[150,150,150],
        lineWidth:0.2,
        overflow:"linebreak"
      },
      head:[["Part No.","Description","Qty","Rate (Incl. GST)","Amount"]],
      body:estimateParts.length
        ? estimateParts.map(item=>[
            item.partNo||"-",
            item.description||"-",
            formatQty(item.qty),
            money(item.rate),
            money(Number(item.qty||0)*Number(item.rate||0))
          ])
        : [["-","No parts added","-","-",money(0)]],
      columnStyles:{
        0:{cellWidth:28},
        1:{cellWidth:82},
        2:{cellWidth:18},
        3:{cellWidth:27},
        4:{cellWidth:35}
      }
    });

    y=(pdf.lastAutoTable?.finalY||y+20)+7;
    pdf.setFont("helvetica","bold");
    pdf.text("Labour",margin,y);
    y+=4;

    autoTable(pdf,{
      startY:y,
      margin:{left:margin,right:margin},
      tableWidth:width,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8,
        cellPadding:2.5,
        lineColor:[150,150,150],
        lineWidth:0.2,
        overflow:"linebreak"
      },
      head:[["Description","Qty","Rate","Amount"]],
      body:estimateLabour.length
        ? estimateLabour.map(item=>[
            item.description||"-",
            formatQty(item.qty),
            money(item.rate),
            money(Number(item.qty||0)*Number(item.rate||0))
          ])
        : [["No labour added","-","-",money(0)]],
      columnStyles:{
        0:{cellWidth:110},
        1:{cellWidth:20},
        2:{cellWidth:25},
        3:{cellWidth:35}
      }
    });

    y=(pdf.lastAutoTable?.finalY||y+20)+7;

    autoTable(pdf,{
      startY:y,
      margin:{left:120,right:margin},
      tableWidth:80,
      theme:"grid",
      styles:{
        font:"helvetica",
        fontSize:8.5,
        cellPadding:3,
        lineColor:[150,150,150],
        lineWidth:0.2
      },
      body:[
        ["Parts Total (GST Incl.)",money(estimatePartsTotal)],
        ["Labour Subtotal",money(estimateLabourBase)],
        ["GST on Labour (18%)",money(estimateLabourGst)],
        ["Grand Total",money(estimateGrandTotal)]
      ],
      columnStyles:{
        0:{cellWidth:45,fontStyle:"bold"},
        1:{cellWidth:35,halign:"right"}
      }
    });

    y=(pdf.lastAutoTable?.finalY||y+25)+12;
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8);
    pdf.line(140,y-2,190,y-2);
    pdf.text("Authorized Signatory",165,y,{align:"center"});

    if(autoPrint){
      pdf.autoPrint();
      window.open(pdf.output("bloburl"),"_blank");
    } else {
      const fileName=("Service_Estimate_"+(vehicle.reg||vehicle.vin||"Vehicle")+".pdf")
        .replace(/[^a-z0-9_.-]+/gi,"_");
      pdf.save(fileName);
    }
  }
  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #d9e2f3; font-family: Calibri, Arial, sans-serif; color: #1f1f1f; }
        .excel-app { min-height: 100vh; background: #d9e2f3; }
        .table-width-compact { min-width:560px !important; }.table-width-normal { min-width:760px !important; }.table-width-wide { min-width:100% !important;}
        .theme-green .excel-titlebar,.theme-green .section-title {background:#217346 !important}.theme-navy .excel-titlebar,.theme-navy .section-title {background:#17365d !important}.theme-teal .excel-titlebar,.theme-teal .section-title {background:#0f766e !important}.theme-purple .excel-titlebar,.theme-purple .section-title {background:#6b46c1 !important}
        .theme-green .decision-table th,.theme-green .history-table th {background:#217346 !important}.theme-navy .decision-table th,.theme-navy .history-table th {background:#17365d !important}.theme-teal .decision-table th,.theme-teal .history-table th {background:#0f766e !important}.theme-purple .decision-table th,.theme-purple .history-table th {background:#6b46c1 !important}

        .estimate-meta { margin-left:auto; font-size:11px; color:#666; }
        .portal-home { padding:18px 8px 28px; }
        .portal-home-hero { display:flex; justify-content:space-between; gap:20px; align-items:center; padding:24px; border:1px solid #b7b7b7; background:linear-gradient(135deg,#f7fbff,#eef5fb); border-radius:6px; }
        .portal-home-kicker { color:#1f4e78; font-size:11px; font-weight:800; letter-spacing:1px; }
        .portal-home-hero h1 { margin:5px 0 4px; font-size:27px; color:#1f1f1f; }
        .portal-home-hero p { margin:0; color:#5f6b75; font-size:13px; }
        .portal-upload-button { white-space:nowrap; min-height:38px; }
        .portal-kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:12px 0; }
        .portal-kpi,.bulk-overview-card { border:1px solid #c7d1da; background:#fff; padding:13px; border-radius:5px; }
        .portal-kpi span,.bulk-overview-card span { display:block; color:#66737d; font-size:11px; }
        .portal-kpi strong,.bulk-overview-card strong { display:block; font-size:24px; color:#1f4e78; margin-top:4px; }
        .portal-kpi small { color:#8a969f; }
        .portal-section-title { background:#4472c4; color:#fff; padding:8px 10px; font-weight:700; font-size:14px; margin-top:16px; }
        .portal-action-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:10px; }
         .home-estimate-preview { margin-top:14px; border:2px solid #5b9bd5; background:#fff; color:#1f2937; border-radius:8px; padding:12px; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,.08); }
         .home-estimate-preview:hover { box-shadow:0 3px 10px rgba(0,0,0,.12); }
         .home-estimate-preview-head { display:flex; align-items:center; gap:12px; border-bottom:1px solid #d5d5d5; padding-bottom:9px; }
         .home-estimate-preview-head strong { display:block; font-size:17px; }
         .home-estimate-preview-head span { display:block; font-size:11px; color:#666; margin-top:2px; }
         .home-estimate-preview-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:10px; }
         .home-estimate-preview-grid > div { border:1px solid #d5d5d5; padding:9px; border-radius:6px; min-height:58px; }
         .home-estimate-preview-grid b { display:block; font-size:12px; }
         .home-estimate-preview-grid span { display:block; font-size:11px; color:#666; margin-top:5px; }
        .portal-action-card { text-align:left; border:1px solid #c7d1da; background:#fff; padding:16px; min-height:155px; display:flex; flex-direction:column; align-items:flex-start; gap:7px; border-radius:5px; }
        .portal-action-card:hover:not(:disabled) { border-color:#70ad47; box-shadow:0 2px 8px rgba(0,0,0,.08); }
        .portal-action-card.disabled { opacity:.5; cursor:not-allowed; }
        .portal-action-icon { font-size:25px; }
        .portal-action-title { font-weight:800; font-size:15px; color:#1f4e78; }
        .portal-action-text { color:#66737d; font-size:12px; line-height:1.45; }
        .portal-action-link { margin-top:auto; color:#217346; font-size:12px; font-weight:800; }
        .portal-workflow { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
        .portal-workflow div { border:1px solid #d7dee4; background:#f8fafc; padding:11px 13px; font-size:12px; }
        .portal-workflow b { display:block; color:#1f4e78; margin-bottom:4px; }
        .portal-workflow span { color:#66737d; }
        .professional-section-title { margin-top:12px; }
        .decision-status-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; margin-top:7px; }
        .decision-status-card { border:1px solid #b7b7b7; padding:9px; background:#f7f7f7; min-height:56px; }
        .decision-status-card span { display:block; font-size:11px; color:#58646d; line-height:1.2; }
        .decision-status-card strong { display:inline-block; margin-top:5px; font-size:12px; }
        .decision-status-card.is-due { background:#e2f0d9; border-color:#70ad47; }
        .decision-status-card.is-due strong { color:#006100; }
        .decision-status-card.is-not-due strong { color:#666; }
        .decision-basis { margin-top:8px; border:1px solid #c7d1da; background:#f8fafc; }
        .decision-basis summary { cursor:pointer; padding:8px 10px; font-weight:700; color:#1f4e78; }
        .decision-basis-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:0 10px 8px; }
        .decision-basis-grid div { background:#fff; border:1px solid #dfe5e9; padding:8px; }
        .decision-basis-grid b { display:block; font-size:10px; color:#74808b; }
        .decision-basis-grid span { display:block; margin-top:4px; font-size:12px; font-weight:700; }
        .bulk-overview-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; }
        .bulk-overview-card.due { background:#e2f0d9; border-color:#70ad47; }
        .bulk-overview-card.due strong { color:#006100; }
        .bulk-search-input { max-width:360px; min-height:31px; }
        @media (max-width:900px) { .portal-action-grid{grid-template-columns:repeat(2,1fr)} .decision-status-grid{grid-template-columns:repeat(2,1fr)} .decision-basis-grid{grid-template-columns:repeat(2,1fr)} .bulk-overview-grid{grid-template-columns:repeat(2,1fr)} }
        @media (max-width:600px) { .portal-home-hero{flex-direction:column;align-items:flex-start}.portal-kpi-grid,.portal-workflow{grid-template-columns:1fr}.portal-action-grid{grid-template-columns:1fr}.decision-basis-grid{grid-template-columns:1fr}.bulk-overview-grid{grid-template-columns:1fr}.bulk-search-input{max-width:none;width:100%} }
        .excel-window { width: min(1500px, 100%); margin: 0 auto; background: #fff; min-height: 100vh; box-shadow: 0 0 0 1px #9e9e9e; }
        .excel-titlebar { height: 34px; background: #217346; color: #fff; display:flex; align-items:center; justify-content:center; padding:0 12px; font-size:14px; }
        .excel-title { font-weight:700; text-align:center; flex:1; }
        .excel-title-right { display:none; }
        .excel-ribbon { background:#f3f3f3; border-bottom:1px solid #b7b7b7; }
        .excel-tabs { height:36px; display:flex; align-items:flex-end; gap:2px; padding:0 10px; border-bottom:1px solid #c8c8c8; }
        .excel-tab { padding:8px 15px 7px; font-size:13px; cursor:pointer; border:1px solid transparent; border-bottom:0; }
        .excel-tab.active { background:#fff; border-color:#c8c8c8; font-weight:700; color:#217346; }
        .excel-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px 10px; background:#fff; }
        .excel-button { border:1px solid #a6a6a6; background:linear-gradient(#fff,#e7e6e6); min-height:30px; padding:5px 12px; border-radius:2px; cursor:pointer; font-family:Calibri,Arial,sans-serif; font-size:13px; }
        .excel-button:hover:not(:disabled) { background:#e2f0d9; }
        .excel-button.green { background:#217346; color:#fff; border-color:#185c37; font-weight:700; }
        .excel-button.green:hover:not(:disabled) { background:#185c37; }
        .excel-button:disabled { opacity:.5; cursor:not-allowed; }
        .excel-sheet { padding:10px; background:#fff; }
        .sheet-heading { background:#1f4e78; color:#fff; border:1px solid #17365d; font-size:18px; font-weight:700; padding:9px 12px; text-align:center; }
        .sheet-subheading { background:#d9eaf7; border:1px solid #9fbad0; border-top:0; padding:5px 10px; font-size:12px; color:#404040; }
        .sheet-grid { display:grid; grid-template-columns: 125px minmax(110px,1fr) 95px minmax(110px,1fr) 95px minmax(110px,1fr); border-left:1px solid #b7b7b7; border-top:1px solid #b7b7b7; }
        .compact-override-control { display:flex; align-items:center; gap:5px; }
        .compact-override-input { width:88px; min-width:88px; height:30px; padding:5px 7px; }
        .compact-recalculate-button { min-height:30px; height:30px; padding:4px 8px; font-size:11px; }

        .vehicle-output-layout { display:grid; grid-template-columns:minmax(0, 1fr) minmax(300px, 360px); gap:10px; align-items:stretch; }
        .vehicle-profile-panel, .customer-output-panel {
          min-width:0;
          border:1px solid #8aa8c4;
          background:#1c2738;
          box-shadow:0 1px 3px rgba(0,0,0,.22);
          overflow:hidden;
        }
        .vehicle-profile-panel .section-title, .customer-output-panel .section-title {
          margin:0;
          border-left:0;
          border-right:0;
          border-top:0;
        }
        .vehicle-profile-panel .sheet-grid {
          margin-top:0 !important;
          border-left:0;
          border-top:0;
        }
        .customer-output-panel .due-box {
          height:calc(100% - 34px);
          min-height:90px;
          display:flex;
          align-content:flex-start;
          align-items:flex-start;
          flex-wrap:wrap;
          margin:0;
          border:0;
        }
        .cell {
          min-height:31px;
          height:auto;
          border-right:1px solid #b7b7b7;
          border-bottom:1px solid #b7b7b7;
          padding:7px 8px;
          font-size:13px;
          background:#fff;
          overflow-wrap:anywhere;
          word-break:break-word;
          white-space:normal;
          line-height:1.25;
        }
        .cell.label {
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:break-word;
        }
        .cell.value {
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:break-word;
        }
        .cell.label { background:#d9e2f3; font-weight:700; }
        .cell.value { font-weight:600; }
        .cell.section { background:#4472c4; color:#fff; font-weight:700; text-align:center; }
        .cell.center { text-align:center; }
        .cell.yes { background:#e2f0d9; color:#006100; font-weight:700; text-align:center; }
        .cell.no { background:#f2f2f2; color:#666; font-weight:700; text-align:center; }
        .decision-table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .decision-table th { background:#4472c4; color:#fff; border:1px solid #b7b7b7; padding:6px 7px; font-size:12px; text-align:center; }
        .decision-table td { border:1px solid #b7b7b7; padding:6px 7px; font-size:12px; vertical-align:top; }
        .decision-table tr:nth-child(even) td { background:#f8fbff; }
        .decision-table td.service-name { font-weight:700; }
        .status-yes { background:#e2f0d9 !important; color:#006100; font-weight:700; text-align:center; }
        .status-no { background:#f2f2f2 !important; color:#666; text-align:center; font-weight:700; }
        .section-title { margin-top:12px; background:#5b9bd5; color:#fff; border:1px solid #2f75b5; padding:6px 9px; font-weight:700; font-size:13px; }
        .history-wrap { overflow:auto; max-height:520px; border:1px solid #b7b7b7; }
        .history-table { width:100%; border-collapse:collapse; min-width:760px; }
        .history-table th { position:sticky; top:0; z-index:2; background:#4472c4; color:#fff; border:1px solid #b7b7b7; padding:5px 7px; font-size:12px; }
        .history-table td { border:1px solid #d0d0d0; padding:5px 7px; font-size:12px; }
        .history-table tr:nth-child(even) td { background:#fafafa; }
        .bulk-service-table { min-width: 1120px; }
        .bulk-service-table th { padding:0; vertical-align:top; }
        .bulk-th { display:flex; flex-direction:column; gap:3px; padding:5px 6px; min-height:58px; }
        .bulk-th-filtered { background:rgba(255,255,255,.08); }
        .bulk-th-top { display:flex; align-items:center; justify-content:center; gap:4px; min-height:22px; }
        .bulk-column-title { line-height:1.15; }
        .bulk-sort-indicator { font-size:9px; min-width:9px; }
        .bulk-filter-arrow {
          width:20px;
          height:20px;
          padding:0;
          margin-left:2px;
          border:1px solid rgba(255,255,255,.5);
          border-radius:2px;
          background:rgba(255,255,255,.08);
          color:#fff;
          cursor:pointer;
          font-size:10px;
          line-height:18px;
          flex:0 0 20px;
        }
        .bulk-filter-arrow:hover,
        .bulk-filter-arrow.active {
          background:#fff;
          color:#1f4e78;
          border-color:#fff;
        }
        .bulk-sort-btn {
          border:0;
          background:transparent !important;
          color:inherit;
          cursor:pointer;
          font:inherit;
          font-weight:700;
          padding:1px 3px;
          border-radius:0;
          appearance:none;
          -webkit-appearance:none;
          box-shadow:none;
        }
        .bulk-sort-btn:hover,
        .bulk-sort-btn:focus,
        .bulk-sort-btn:active {
          border:0;
          background:transparent !important;
          color:inherit;
          box-shadow:none;
          outline:none;
        }
        .bulk-filter-status {
          min-height:16px;
          padding:2px 0;
          border:0;
          background:transparent !important;
          color:#d9e5f5;
          font-size:10px;
          font-weight:400;
          text-align:left;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .bulk-filter-status.active {
          background:transparent !important;
          color:#fff;
          border:0;
          font-weight:700;
        }

        .excel-filter-popup {
          position:fixed;
          z-index:2147483647;
          background:#fff;
          color:#1f1f1f;
          border:1px solid #9a9a9a;
          box-shadow:0 6px 22px rgba(0,0,0,.28);
          border-radius:3px;
          overflow:hidden;
          font-family:Calibri,Arial,sans-serif;
        }
        .excel-filter-popup-title {
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:9px 10px;
          background:#f3f3f3;
          border-bottom:1px solid #d0d0d0;
          font-size:13px;
        }
        .excel-filter-close {
          border:0;
          background:transparent;
          color:#666;
          width:24px;
          height:24px;
          padding:0;
          cursor:pointer;
          font-size:20px;
          line-height:20px;
        }
        .excel-filter-close:hover { background:#e5e5e5; color:#111; }
        .excel-filter-sort-row {
          display:flex;
          align-items:center;
          gap:4px;
          padding:7px 8px;
          border-bottom:1px solid #e3e3e3;
        }
        .excel-filter-menu-btn {
          flex:1;
          border:1px solid #c7c7c7;
          background:#fff;
          color:#333;
          padding:6px 5px;
          border-radius:2px;
          cursor:pointer;
          font-size:11px;
          font-weight:600;
        }
        .excel-filter-menu-btn:hover { background:#e2f0d9; border-color:#70ad47; }
        .excel-filter-current-sort { min-width:10px; font-size:10px; }
        .excel-filter-search-wrap {
          display:flex;
          align-items:center;
          gap:5px;
          margin:8px;
          border:1px solid #a6a6a6;
          height:30px;
          background:#fff;
        }
        .excel-filter-search-wrap:focus-within {
          outline:2px solid #70ad47;
          outline-offset:-2px;
        }
        .excel-filter-search-icon { padding-left:7px; color:#666; font-size:17px; }
        .excel-filter-search {
          flex:1;
          min-width:0;
          border:0;
          outline:0;
          height:28px;
          padding:4px 2px;
          font-family:Calibri,Arial,sans-serif;
          font-size:12px;
          background:#fff;
          color:#1f1f1f;
        }
        .excel-filter-search-clear {
          border:0;
          background:transparent;
          color:#777;
          width:24px;
          height:24px;
          padding:0;
          cursor:pointer;
          font-size:16px;
        }
        .excel-filter-selection-bar {
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:6px 9px;
          border-top:1px solid #e3e3e3;
          border-bottom:1px solid #e3e3e3;
          background:#fafafa;
          font-size:11px;
        }
        .excel-filter-select-all {
          display:flex;
          align-items:center;
          gap:7px;
          cursor:pointer;
          font-weight:700;
        }
        .excel-filter-select-all input,
        .excel-filter-value input {
          width:14px;
          height:14px;
          margin:0;
          accent-color:#217346;
        }
        .excel-filter-count { color:#666; }
        .excel-filter-values {
          height:235px;
          overflow-y:auto;
          padding:4px 0;
          background:#fff;
        }
        .excel-filter-value {
          display:flex;
          align-items:center;
          gap:8px;
          min-height:27px;
          padding:4px 10px;
          cursor:pointer;
          font-size:12px;
        }
        .excel-filter-value:hover { background:#eaf4fc; }
        .excel-filter-value span {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .excel-filter-no-match {
          padding:20px 10px;
          text-align:center;
          color:#777;
          font-size:12px;
        }
        .excel-filter-footer {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          padding:8px;
          border-top:1px solid #d0d0d0;
          background:#f3f3f3;
        }
        .excel-filter-footer-right { display:flex; gap:6px; }
        .excel-filter-clear,
        .excel-filter-cancel,
        .excel-filter-ok {
          border-radius:2px;
          padding:6px 11px;
          cursor:pointer;
          font-family:Calibri,Arial,sans-serif;
          font-size:11px;
          font-weight:700;
        }
        .excel-filter-clear {
          border:1px solid #c7c7c7;
          background:#fff;
          color:#a33a3a;
        }
        .excel-filter-cancel {
          border:1px solid #c7c7c7;
          background:#fff;
          color:#444;
        }
        .excel-filter-ok {
          border:1px solid #185c37;
          background:#217346;
          color:#fff;
          min-width:58px;
        }
        .excel-filter-clear:hover,
        .excel-filter-cancel:hover { background:#e9e9e9; }
        .excel-filter-ok:hover { background:#185c37; }
        .excel-filter-active-note {
          padding:5px 9px;
          border-top:1px solid #d0d0d0;
          background:#e2f0d9;
          color:#006100;
          font-size:10px;
          font-weight:700;
        }
        .single-service-summary { min-width:760px; width:100%; table-layout:fixed; }
        .single-service-summary th:nth-child(1), .single-service-summary td:nth-child(1) { width:7% !important; min-width:0; white-space:normal; overflow-wrap:anywhere; }
        .single-service-summary th:nth-child(2), .single-service-summary td:nth-child(2) { width:8% !important; min-width:0; white-space:normal; overflow-wrap:anywhere; }
        .single-service-summary th:nth-child(3), .single-service-summary td:nth-child(3) { width:6% !important; min-width:0; white-space:normal; overflow-wrap:anywhere; }
        .single-service-summary th:nth-child(4), .single-service-summary td:nth-child(4) { width:10% !important; min-width:0; white-space:normal; overflow-wrap:anywhere; }
        .single-service-summary th:nth-child(5), .single-service-summary td:nth-child(5) { width:69% !important; min-width:0; }
        .service-summary-note { padding:5px 8px; margin-top:4px; }
        .service-summary-title {
          background:#2f75b5;
          color:#fff;
          border-color:#255e91;
          margin-top:10px;
          box-shadow:0 1px 2px rgba(0,0,0,.18);
          letter-spacing:.1px;
        }

        .history-part { display:inline-block; margin:2px 4px 2px 0; padding:3px 6px; border:1px solid transparent; }
        .history-part.eligible { background:#e2f0d9; color:#006100; border-color:#70ad47; font-weight:700; border-radius:2px; }
        .pre-analysis-empty { min-height:420px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; border:1px dashed #9fbad0; background:#eef4fa; color:#5b6770; padding:30px 20px; }
        .pre-analysis-title { font-size:20px; font-weight:700; color:#1f4e78; margin-bottom:8px; }
        .pre-analysis-text { max-width:560px; font-size:13px; line-height:1.5; }
        .excel-input { width:100%; border:1px solid #a6a6a6; min-height:29px; padding:5px 7px; font-family:Calibri,Arial,sans-serif; font-size:13px; }
        .excel-input:focus { outline:2px solid #70ad47; outline-offset:-2px; }
        .upload-area { border:1px dashed #70ad47; background:#f4fbef; padding:10px; }
        .upload-area input { font-family:Calibri,Arial,sans-serif; font-size:13px; }
        .status-line { margin-top:8px; padding:6px 8px; border:1px solid #a9d18e; background:#e2f0d9; color:#006100; font-size:12px; }
        .error-line { margin-top:8px; padding:6px 8px; border:1px solid #c00000; background:#fce4d6; color:#9c0006; font-size:12px; white-space:pre-wrap; }
        .due-box { border:1px solid #b7b7b7; background:#fff2cc; padding:8px; }
        .due-chip { display:inline-block; margin:3px; padding:5px 9px; border:1px solid #c9b458; background:#fff2cc; font-weight:700; font-size:12px; }
        .no-due { background:#f2f2f2; border:1px solid #b7b7b7; padding:8px; color:#666; font-size:12px; }
        .bulk-card { border:1px solid #b7b7b7; margin-top:10px; }
        .bulk-card-head { background:#d9e2f3; border-bottom:1px solid #b7b7b7; padding:6px 9px; font-weight:700; font-size:13px; }
        .bulk-card-body { padding:8px; }
        .small-note { color:#666; font-size:11px; }
        .status-pill { display:inline-block; padding:3px 7px; border:1px solid #b7b7b7; font-size:11px; font-weight:700; }
        .status-pill.green { background:#e2f0d9; color:#006100; border-color:#a9d18e; }
        .status-pill.blue { background:#d9eaf7; color:#1f4e78; border-color:#9fbad0; }
        .action-row { display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
        .spacer { flex:1; }
        @media (max-width: 1050px) {
          .vehicle-output-layout { grid-template-columns: 1fr; }
          .customer-output-panel .section-title { margin-top:10px; }
          .customer-output-panel .due-box { height:auto; min-height:90px; }
        }
        @media (max-width: 900px) {
          .sheet-grid { grid-template-columns: 105px minmax(100px,1fr) 105px minmax(100px,1fr); }
          .wide-hide { display:none; }
        }
        @media (max-width: 600px) {
          .excel-tabs { overflow-x:auto; justify-content:flex-start; align-items:stretch; padding:0 4px; scrollbar-width:none; }
          .excel-tabs::-webkit-scrollbar { display:none; }
          .excel-tab { flex:0 0 auto; white-space:nowrap; padding:9px 13px 8px; font-size:12px; }
          .excel-toolbar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; align-items:stretch; }
          .excel-toolbar .excel-button { width:100%; min-width:0; min-height:40px; padding:6px 8px; line-height:1.15; }
          .excel-toolbar .status-pill { width:100%; text-align:center; min-width:0; }
          .excel-toolbar .status-pill:first-of-type { grid-column:1 / -1; }
          .reading-override-grid { grid-template-columns:100px minmax(0,1fr); }
          .reading-override-grid .cell:nth-child(3),
          .reading-override-grid .cell:nth-child(4) { grid-column:2; }
          .reading-override-grid .cell:nth-child(5),
          .reading-override-grid .cell:nth-child(6) { grid-column:1 / -1; }
          .recalculate-button { width:100%; min-width:0; }
          .sheet-heading { font-size:15px; line-height:1.25; }
          .vehicle-profile-panel .sheet-grid { grid-template-columns:110px minmax(0,1fr); }
        }
        @media (prefers-color-scheme: dark) {
          body, .excel-app { background:#111827; color:#e5e7eb; color-scheme:dark; }
          .excel-window, .excel-sheet { background:#1f2937; box-shadow:0 0 0 1px #64748b; }
          .excel-ribbon, .excel-toolbar { background:#263445; border-color:#64748b; }
          .excel-tabs { border-color:#64748b; }
          .excel-tab { color:#dbeafe; }
          .excel-tab.active { background:#1f2937; border-color:#64748b; color:#86efac; }
          .cell { background:#1f2937; border-color:#64748b; color:#e5e7eb; }
          .cell.label, .bulk-card-head { background:#334155; color:#f8fafc; }
          .sheet-subheading { background:#253b53; border-color:#4b7aa7; color:#dbeafe; }
          .decision-table td, .history-table td { background:#1f2937; border-color:#526278; color:#e5e7eb; }
          .decision-table tr:nth-child(even) td, .history-table tr:nth-child(even) td { background:#253143; }
          .history-wrap, .bulk-card { border-color:#64748b; }
          .upload-area { background:#20352a; border-color:#86c77a; }
          .excel-input { background:#182230; border-color:#718096; color:#f8fafc; }
          .excel-input::placeholder { color:#aab7c8; }
          .due-box { background:#4a3d17; border-color:#a7893b; }
          .due-chip { background:#5a4918; border-color:#c3a84c; color:#fff7cf; }
          .no-due { background:#334155; border-color:#64748b; color:#d1d5db; }
          .small-note { color:#cbd5e1; }
          .status-line { background:#1f432e; border-color:#6da878; color:#d1fae5; }
          .error-line { background:#4a2424; border-color:#ee7777; color:#ffd2d2; }
          .excel-button { background:linear-gradient(#3c4a5f,#283548); border-color:#8391a7; color:#f8fafc; }
          .excel-button:hover:not(:disabled) { background:#405a47; }
          .excel-button.green { background:#217346; border-color:#75bd91; color:#fff; }
          .status-yes { background:#285b35 !important; border-color:#70ad47; color:#f0fff2 !important; }
          .status-no { background:#3a4555 !important; border-color:#8291a8; color:#ffffff !important; }
        }
        @media print {
          body, .excel-app, .excel-window { background:#fff !important; }
          .excel-titlebar, .excel-ribbon, .no-print { display:none !important; }
          .excel-window { width:100%; box-shadow:none; }
          .excel-sheet { padding:0; }
          .history-wrap { max-height:none; overflow:visible; }
          .history-table th { position:static; }
        }
      `}</style>

      <div className={`excel-app theme-${dashboardPrefs.theme || "blue"}`}>
        <div className="excel-window">
          <div className="excel-titlebar">
            <div className="excel-title">Vehicle Service Decision &amp; Maintenance Dashboard</div>
            <div className="excel-title-right" style={{display:"flex",alignItems:"center",gap:10}}>
              <span>Excel Web Version</span>
              <span style={{fontSize:11,fontWeight:700,opacity:.9}}>Beta Commit: {import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || "Local"}</span>
            </div>
          </div>

          <div className="excel-ribbon no-print">
            <div className="excel-tabs">
              <div className={"excel-tab " + (mode === "home" ? "active" : "")} onClick={() => setMode("home")}>Home</div>
              <div className={"excel-tab " + (mode === "single" ? "active" : "")} onClick={() => { setMode("single"); setError(""); setBulkResults([]); setBulkMeta(null); }}>Single Vehicle</div>
              <div className={`excel-tab ${mode === "bulk" ? "active" : ""}`} onClick={() => { setMode("bulk"); setError(""); setAnalysis(null); }}>Bulk Vehicle</div>
              <div className={`excel-tab ${mode === "schedule" ? "active" : ""}`} onClick={() => { setMode("schedule"); setError(""); logUsage("Service Schedule Viewed", { mode:"schedule" }); }}>Service Schedule Chart</div>
            </div>
            <div className="excel-toolbar">
              {mode !== "schedule" && mode !== "home" && <>
                <button className="excel-button green" onClick={() => document.getElementById("excel-file-input")?.click()} disabled={uploadBusy}>Upload Excel</button>
                <button className="excel-button" onClick={clear}>Clear</button>
                <button className="excel-button green" onClick={mode === "bulk" ? analyzeBulk : analyze} disabled={uploadBusy || (!excelData.trim() && !uploadParsedRecords.length)}>{mode === "bulk" ? "Analyze All Vehicles" : "Analyze Vehicle"}</button>

              </>}
              {mode === "bulk" && bulkMeta && <span className="status-pill green">{bulkMeta.vehicles} Vehicles · {bulkMeta.records} Rows</span>}
              {uploadedFiles.length > 0 && <span className="status-pill blue">{uploadedFiles.length} Excel file{uploadedFiles.length > 1 ? "s" : ""}</span>}
              {mode === "single" && analysis && (
                <div className="compact-override-control no-print">
                  <input
                    className="excel-input compact-override-input"
                    type="number"
                    min="1"
                    step="1"
                    value={overrideReading}
                    onChange={(e)=>{setOverrideReading(e.target.value);setError("")}}
                    placeholder={analysis?.running?.unit || "KM"}
                    aria-label={`Enter ${analysis?.running?.unit || "KM"}`}
                  />
                  <button
                    className="excel-button green compact-recalculate-button"
                    onClick={recalculateWithOverride}
                  >
                    Recalculate
                  </button>
                </div>
              )}
              {uploadMeta?.failedFiles?.length > 0 && (
                <div className="upload-warning no-print" style={{color:"#ff4d4f",fontWeight:700,marginTop:6}}>
                  {uploadMeta.failedFiles.map((item,index) => (
                    <div key={index}>
                      ⚠ {item.name} — This file was ignored because required header was not found. Below are required headers in file: {item.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <input id="excel-file-input" className="no-print" type="file" accept=".xlsx,.xls,.xlsm,.csv" multiple style={{display:"none"}} onChange={handleExcelUpload} disabled={uploadBusy} />

          <main className="excel-sheet">
            {mode === "home" ? (
              <PortalHome user={user} hasAnalysis={Boolean(analysis)} bulkResults={bulkResults}
                onNavigate={(nextMode) => { if (nextMode === "estimate") { if (analysis) void openEstimate(); else openStandaloneEstimate(); } else setMode(nextMode); }}
                onUpload={() => document.getElementById("excel-file-input")?.click()}
              />
            ) : mode === "single" ? (analysis ? (
              <>
                <div className="sheet-heading" style={{marginTop:10}}>VEHICLE SCHEDULE SERVICE HISTORY FROM LAST 3 YEARS AS ON DATE - {todayDisplay}</div>

                <div className="vehicle-output-layout" style={{marginTop:10}}>
                  <div className="vehicle-profile-panel">
                    <div className="section-title">Customer / Vehicle Profile</div>
                    <div className="sheet-grid">
                      <div className="cell label">Customer Name</div><div className="cell value">{analysis?.vehicle?.customerName || ""}</div>
                      <div className="cell label">Reg No</div><div className="cell value">{analysis?.vehicle?.reg || ""}</div>
                      <div className="cell label">Engine No</div><div className="cell value">{analysis?.vehicle?.engine || ""}</div>
                      <div className="cell label">Sale Date</div><div className="cell value">{analysis ? formatDate(analysis.vehicle.sale) : ""}</div>
                      <div className="cell label">Vehicle Age</div><div className="cell value">{analysis?.vehicle?.sale ? formatVehicleAge(analysis.vehicle.sale) : ""}</div>
                      <div className="cell label">Model</div><div className="cell value">{analysis?.vehicle?.model || ""}</div>
                      <div className="cell label">Last Odometer recorded/date</div><div className="cell value">{analysis?.running?.last ? `${formatNumber(getRelevantReading(analysis.running.last, analysis.vehicle))} / ${formatDate(analysis.running.last.date)}` : ""}</div>
                      <div className="cell label">Current Reading</div><div className="cell value">{analysis?.running?.current ? `${formatNumber(analysis.running.current)} ${analysis.running.unit || "KM"}${appliedOverride === null ? " (Approx.)" : ""}` : ""}</div>
                      <div className="cell label">VIN</div><div className="cell value">{analysis?.vehicle?.vin || ""}</div>
                    </div>
                  </div>

                  <div className="customer-output-panel">
                    <div className="section-title" style={{display:"flex",alignItems:"center",gap:10}}><span>Customer Output — Service To Be Completed</span><button className="excel-button no-print" style={{marginLeft:"auto"}} onClick={openEstimate}>Generate Estimate</button></div>
                    <div className="due-box">
                      {analysis ? (() => {
                        const aggregateNames = BULK_SERVICE_LABELS
                          .filter(([,key]) => analysis.decision.result[key])
                          .map(([name]) => name);
                        const names = [
                          ...aggregateNames,
                          ...(analysis.decision.freeService && aggregateNames.length
                            ? [analysis.decision.freeService.replace(/^1st free service$/i,'1st Free Service').replace(/^2nd free service$/i,'2nd Free Service').replace(/^3rd free service$/i,'3rd Free Service')]
                            : []),
                          ...(analysis.decision.additionalServices || []).filter(name => !String(name).toLowerCase().includes('free service'))
                        ];
                        return names.length ? names.map(name => <span className="due-chip" key={name}>{name}</span>) : <div className="no-due">No service to be completed at the current reading.</div>;
                      })() : <div className="single-empty-state"><b>No vehicle analysis yet</b><span>Upload the DMS Excel file to start the service decision.</span><button className="excel-button green no-print" onClick={() => document.getElementById("excel-file-input")?.click()}>Upload Excel &amp; Start</button></div>}
                    </div>
                  </div>
                </div>


                {error && <div className="error-line no-print">{error}</div>}

                <div className="section-title service-summary-title">Service Summary — Complete Vehicle History</div>
                <div className="history-wrap">
                  <table className="history-table single-service-summary dashboard-resizable-table"><thead><tr>
{singleTableColumns.map((key,index) => (
  <th key={key} style={tableColumnStyle("single",key)}>
    <span className="dashboard-th-content">{singleColumnLabels[key] || key}</span>
    {index < singleTableColumns.length - 1 && <span className="column-resizer" onPointerDown={e=>resizeTableColumn("single",key,e)} />}
  </th>
))}</tr></thead><tbody>
{analysis?.visits?.length ? analysis.visits.map((visit,i)=>{const visitDate=getVisitDate(visit),jobCard=getVisitJobCard(visit),visitReading=getVisitReading(visit,analysis.vehicle),parts=getVisitParts(visit,analysis.vehicle,analysis.decision);return <tr key={i}>
{isSingleColumnVisible("date")&&<td style={tableColumnStyle("single","date")}>{formatDateShort(visitDate)}</td>}
{isSingleColumnVisible("jobCard")&&<td style={tableColumnStyle("single","jobCard")}>{jobCard}</td>}
{isSingleColumnVisible("reading")&&<td style={tableColumnStyle("single","reading")}>{visitReading?`${formatNumber(visitReading)} ${getTargetUnit(analysis.vehicle)}`:"-"}</td>}
{isSingleColumnVisible("plant")&&<td style={tableColumnStyle("single","plant")}>{[...new Set(visit.map(r=>String(r?.plantName||r?.salesOrgName||"").trim()).filter(Boolean))].join(", ")||"-"}</td>}
{isSingleColumnVisible("parts")&&<td style={tableColumnStyle("single","parts")}>{parts.length?parts.map((part,index)=><span key={index} className={part.eligible?"history-part eligible":"history-part"} title={part.eligible?"Eligible service-calculation record":"History record"}>{part.text}</span>):"-"}</td>}
</tr>}) : <tr><td colSpan={Math.max(1,singleTableColumns.length)} className="small-note">No service history loaded.</td></tr>}
</tbody></table>
                </div>
              </>
            ) : (
              <div className="pre-analysis-empty">
                <div className="pre-analysis-title">Upload Excel to start</div>
                <div className="pre-analysis-text">Vehicle analysis, profile and service history will appear here after the Excel file is uploaded and analysed.</div>
              </div>
            ) ) : mode === "bulk" ? (
              <>
                <div className="sheet-heading">BULK VEHICLE SERVICE DECISION</div>
                <div className="sheet-subheading">Multiple Excel files supported · Vehicle separation by VIN · Cross-file duplicate protection only.</div>
                {bulkMeta && <>
                  <div className="section-title">Customer Grouping</div>
                  <div className="bulk-card"><div className="bulk-card-head">Customer groups — {customerGroups.length}</div><div className="bulk-card-body">
                    <table className="history-table" style={{minWidth:500}}><thead><tr><th><label style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer"}}><input type="checkbox" checked={customerGroups.length>0 && selectedCustomers.length===customerGroups.length} onChange={(event)=>setSelectedCustomers(event.target.checked ? customerGroups.map(group=>group.id) : [])}/> <span>Select All</span></label></th><th>Customer Group</th><th>Vehicles</th></tr></thead><tbody>
                      {customerGroups.map(group=><tr key={group.id}><td><input type="checkbox" checked={selectedCustomers.includes(group.id)} onChange={()=>setSelectedCustomers(prev=>prev.includes(group.id)?prev.filter(x=>x!==group.id):[...prev,group.id])}/></td><td><strong>{group.name}</strong>{group.customerKeys.length>1&&<div className="small-note">Merged group</div>}</td><td>{group.vehicles.length}</td></tr>)}
                    </tbody></table>
                    <div className="action-row" style={{marginTop:8}}><input className="excel-input" style={{maxWidth:280}} value={mergedCustomerName} onChange={(event)=>setMergedCustomerName(event.target.value)} placeholder="Optional merged customer name" /><button className="excel-button" disabled={selectedCustomers.length<2} onClick={()=>{setCustomerGroups(prev=>mergeCustomerGroups(prev,selectedCustomers,mergedCustomerName));setSelectedCustomers([]);setMergedCustomerName("")}}>Merge Selected Customers</button><button className="excel-button" onClick={()=>{const fresh=buildCustomerGroups(bulkResults,user?.dealerName);setCustomerGroups(fresh);setSelectedCustomers([]);setMergedCustomerName("")}}>Reset Grouping</button></div>
                  </div></div>

                  <div className="section-title">Customer-wise Output</div>
                  {customerGroups.map(group=>{const dueVehicles=group.vehicles.filter(v=>v.services.length>0);return <div className="bulk-card" key={group.id}><div className="bulk-card-head"><div className="action-row"><strong>{group.name}</strong><span className="small-note">{group.vehicles.length} vehicles · {dueVehicles.length} due</span><span className="spacer"/><button className="excel-button no-print" onClick={()=>copyCustomerSummary(group, user?.dealerName, user?.preferences || {})}>Copy WhatsApp Summary</button><button className="excel-button no-print" onClick={()=>printCustomerReport(group,true)}>Print Detailed PDF</button></div></div></div>})}

                  <div className="bulk-overview-grid">
                    <button type="button" className={"bulk-overview-card bulk-overview-card-button " + (bulkQuickFilter === "all" ? "active" : "")} onClick={() => setBulkQuickFilter("all")}><span>Total Vehicles</span><strong>{bulkResults.length}</strong><small>Show all due vehicles</small></button>
                    <button type="button" className={"bulk-overview-card bulk-overview-card-button " + (bulkQuickFilter === "due" ? "active" : "")} onClick={() => setBulkQuickFilter("due")}><span>Service Due</span><strong>{bulkResults.filter(item => item.services?.length > 0).length}</strong><small>Show due vehicles</small></button>
                    <div className="bulk-overview-card"><span>Due Services</span><strong>{bulkResults.reduce((sum,item)=>sum + (item.services?.length || 0),0)}</strong><small>Total due service items</small></div>
                    <div className="bulk-overview-card"><span>Currently Shown</span><strong>{bulkSummaryRows.length}</strong><small>After search / Excel filters</small></div>
                  </div>
                  <div className="section-title">Service Summary</div>
                  <div className="bulk-control-labels no-print"><span>Search</span><span>Excel Filter / Sort</span><span>Export</span></div>
                  <div className="action-row no-print" style={{margin:"6px 0"}}>
                    <input className="excel-input bulk-search-input" value={bulkSearch} onChange={e=>setBulkSearch(e.target.value)} placeholder="Search VIN, Reg. No., Customer, Model or Service..." aria-label="Search bulk vehicle summary" />
                    <span className="small-note">
                      {bulkSummaryRows.length} vehicle{bulkSummaryRows.length === 1 ? "" : "s"} shown
                      {bulkResults.filter(item=>item.services.length>0).length !== bulkSummaryRows.length
                        ? ` · ${bulkResults.filter(item=>item.services.length>0).length - bulkSummaryRows.length} hidden by filter`
                        : ""}
                    </span>
                    <span className="spacer"/>
                    <button className="excel-button" onClick={clearAllBulkFilters}>Reset Sort / Filter</button>
                    <button className="excel-button" onClick={downloadBulkCsv}>Download Excel</button>
                  </div>
                  <div className="history-wrap">
                    <table className="history-table bulk-service-table dashboard-resizable-table"><thead><tr>
<th style={tableColumnStyle("bulk","serial")}><div className="bulk-th"><div className="bulk-th-top"><button className="bulk-sort-btn" onClick={()=>setBulkSort("dueCount")} title="Sort by number of due services">{dashboardPrefs.bulkColumnLabels?.serial||"S.No. / Due"}</button><span className="bulk-sort-indicator">{bulkTableSort.key==="dueCount"?(bulkTableSort.direction==="asc"?"▲":"▼"):""}</span></div></div><span className="column-resizer" onPointerDown={e=>resizeTableColumn("bulk","serial",e)}/></th>
                          {[
                            [bulkColumnLabels.customerName||"Customer Name","customerName"],
                            [bulkColumnLabels.vin||"VIN","vin"],
                            [bulkColumnLabels.reg||"Reg. No.","reg"],
                            [bulkColumnLabels.saleDate||"Sale Date","saleDate"],
                            [bulkColumnLabels.model||"Model","model"],
                            [bulkColumnLabels.currentReading||"Current Reading","currentReading"],
                            [bulkColumnLabels.services||"Service To Be Completed","services"],
                          ].filter(([,key]) => isBulkColumnVisible(key)).map(([label,key]) => {
                            const active = bulkFilterSelections[key]?.length > 0;
                            const sortActive = bulkTableSort.key === key;
                            return (
                              <th key={key} style={tableColumnStyle("bulk",key)}>
                                <div className={`bulk-th ${active ? "bulk-th-filtered" : ""}`}>
                                  <div className="bulk-th-top">
                                    <span className="bulk-column-title">{label}</span>
                                    {sortActive && (
                                      <span className="bulk-sort-indicator">
                                        {bulkTableSort.direction === "asc" ? "▲" : "▼"}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className={`bulk-filter-arrow ${active ? "active" : ""}`}
                                      onClick={(event) => openBulkFilterMenu(key, event)}
                                      title={`Filter ${label}`}
                                      aria-label={`Open ${label} filter`}
                                      aria-expanded={openBulkFilter?.key === key}
                                    >
                                      ▼
                                    </button>
                                  </div>
                                  <div className={`bulk-filter-status ${active ? "active" : ""}`}>
                                    {active
                                      ? `${bulkFilterSelections[key].length} selected`
                                      : "Filter"}
                                  </div>
                                </div><span className="column-resizer" onPointerDown={e=>resizeTableColumn("bulk",key,e)}/></th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkSummaryRows.map((item,index) => (
                          <tr key={item.vin || index}>
                            <td style={tableColumnStyle("bulk","serial")}>{index + 1}</td>
                            {isBulkColumnVisible("customerName") && <td style={tableColumnStyle("bulk","customerName")}>{item.vehicle.customerName || "-"}</td>}{isBulkColumnVisible("vin") && <td style={tableColumnStyle("bulk","vin")}>{item.vin || item.vehicle.vin || "-"}</td>}{isBulkColumnVisible("reg") && <td style={tableColumnStyle("bulk","reg")}>{item.vehicle.reg || "-"}</td>}{isBulkColumnVisible("saleDate") && <td style={tableColumnStyle("bulk","saleDate")}>{item.vehicle.sale ? formatDateShort(item.vehicle.sale) : "-"}</td>}{isBulkColumnVisible("model") && <td style={tableColumnStyle("bulk","model")}>{item.vehicle.model || "-"}</td>}{isBulkColumnVisible("currentReading") && <td style={tableColumnStyle("bulk","currentReading")}>{item.running?.current ? `${formatNumber(item.running.current)} ${item.running.unit || getTargetUnit(item.vehicle)}` : "-"}</td>}{isBulkColumnVisible("services") && <td style={tableColumnStyle("bulk","services")}>{item.services.join(", ")}</td>}
                          </tr>
                        ))}
                        {!bulkSummaryRows.length && (
                          <tr><td colSpan="8" className="small-note">No vehicles match the selected filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {openBulkFilter && (
                    <ExcelFilterDropdown
                      label={openBulkFilter.label}
                      values={bulkFilterValueLists[openBulkFilter.key] || []}
                      selectedValues={bulkFilterSelections[openBulkFilter.key] || []}
                      anchorRect={openBulkFilter.rect}
                      sortDirection={
                        bulkTableSort.key === openBulkFilter.key
                          ? bulkTableSort.direction
                          : null
                      }
                      onApply={(selectedValues) =>
                        applyBulkFilter(openBulkFilter.key, selectedValues)
                      }
                      onCancel={() => setOpenBulkFilter(null)}
                      onClear={() => clearBulkFilter(openBulkFilter.key)}
                      onSort={(direction) =>
                        sortBulkByColumn(openBulkFilter.key, direction)
                      }
                    />
                  )}
                </>}
              </>
            ) : (
              <>
                <div className="sheet-heading">SERVICE SCHEDULE CHART</div>
                <div className="sheet-subheading">Reference intervals used by Service Decision. The dashboard applies the relevant model, BS norm, service history, reading and date conditions.</div>
                <div className="section-title">Scheduled Service Intervals</div>
                <div className="history-wrap" style={{maxHeight:"none"}}>
                  <table className="history-table">
                    <thead><tr><th>Service</th><th>Normal Vehicle — Reading</th><th>Normal Vehicle — Time</th><th>Tipper / RMC — Reading</th><th>Tipper / RMC — Time</th></tr></thead>
                    <tbody>{SERVICE_SCHEDULE_ROWS.map(([service, normalReading, normalTime, tipperReading, tipperTime]) => <tr key={service}><td className="service-name">{service}</td><td>{normalReading}</td><td>{normalTime}</td><td>{tipperReading}</td><td>{tipperTime}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="section-title">Free and Additional Service Windows</div>
                <table className="decision-table"><thead><tr><th>Service</th><th>Eligibility Window</th><th>Notes</th></tr></thead><tbody>
                  <tr><td className="service-name">1st Free Service — Normal</td><td>37,000–43,000 KM or 5–7 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">2nd Free Service — Normal</td><td>77,000–83,000 KM or 11–13 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">3rd Free Service — Normal</td><td>117,000–123,000 KM or 17–19 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">Tipper Free Service</td><td>1st: 440–560 HRS / 2–4 months; 2nd: 940–1060 HRS / 5–7 months; 3rd: 1940–2060 HRS / 8–10 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">RMC Free Service</td><td>1st: 440–560 HRS / 2–4 months; 2nd: 940–1060 HRS / 5–7 months; 3rd: 1440–1560 HRS / 8–10 months</td><td>Not repeated once recorded in history.</td></tr>
                  <tr><td className="service-name">Wheel Alignment</td><td>Normal: 7,000–45,000 KM; Tipper: 0–2,060 HRS in four service windows</td><td>Existing 4-digit model list; Tipper included, RMC excluded.</td></tr>
                  <tr><td className="service-name">Body Building Check Up</td><td>1–5,000 KM and up to 4 months</td><td>Specified models only.</td></tr>
                </tbody></table>
              </>
            )}
          </main>

        {estimateOpen && (
          <div className="no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#fff",color:"#111",width:"min(1100px,96vw)",maxHeight:"94vh",overflow:"auto",borderRadius:10,padding:18}}>
              {estimateStage === "vehicle" ? (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <div style={{fontSize:22,fontWeight:800}}>SERVICE ESTIMATE</div>
                    <div className="estimate-meta">Estimate No. (Session): <b>{estimateNumber || "-"}</b> · Date: <b>{formatDate(new Date())}</b></div>
                    <button className="excel-button" style={{marginLeft:"auto"}} onClick={()=>setEstimateOpen(false)}>Cancel</button>
                  </div>
                  <div style={{border:"1px solid #d5d5d5",borderRadius:8,padding:14}}>
                    <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>1. Vehicle Details</div>
                    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"end"}}>
                      <div>
                        <label style={{fontWeight:700}}>Vehicle No.</label>
                        <input className="excel-input" value={estimateVehicleNo} onChange={e=>setEstimateVehicleNo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") void lookupEstimateVehicle();}} placeholder="e.g. GJ12BZ7541" autoFocus />
                      </div>
                      <button className="excel-button green" disabled={estimateVehicleLookupBusy} onClick={()=>void lookupEstimateVehicle()}>{estimateVehicleLookupBusy ? "Checking DB..." : "Next"}</button>
                    </div>
                    <div className="small-note" style={{marginTop:8}}>Spaces are removed automatically before DB lookup.</div>
                  </div>
                </>
              ) : estimateStage === "select" ? (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <div style={{fontSize:22,fontWeight:800}}>SELECT AGGREGATE SERVICES</div><div className="estimate-meta">Estimate No. (Session): <b>{estimateNumber || "-"}</b> · Date: <b>{formatDate(new Date())}</b></div>
                    <span style={{fontSize:12,color:"#666"}}>Single Vehicle Estimate</span>
                    <button className="excel-button" style={{marginLeft:"auto"}} onClick={()=>setEstimateOpen(false)}>Cancel</button>
                  </div>
                  <div style={{border:"1px solid #d5d5d5",borderRadius:8,padding:14}}>
                    <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>Which services should be included in the estimate?</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
                      {BULK_SERVICE_LABELS.map(([label,key])=>{
                        const due=!!analysis?.decision?.result?.[key], checked=estimateSelectedServices.includes(key);
                        return <label key={key} style={{display:"flex",alignItems:"center",gap:9,border:"1px solid #ddd",padding:"10px 12px",borderRadius:7,cursor:"pointer",fontSize:15}}>
                          <input type="checkbox" checked={checked} onChange={e=>setEstimateSelectedServices(e.target.checked?[...estimateSelectedServices,key]:estimateSelectedServices.filter(x=>x!==key))}/>
                          <span>{label}</span><small style={{marginLeft:"auto",color:due?"#217346":"#777"}}>{due?"Due":"Not Due"}</small>
                        </label>;
                      })}
                    </div>
                  </div>
                  {estimateLoading && <div style={{marginTop:12,padding:10,textAlign:"center",background:"#f5f5f5",borderRadius:7}}>Loading vehicle history...</div>}
                  {!estimateLoading && estimateNotice && <div style={{marginTop:12,padding:10,background:"#f5f5f5",borderRadius:7}}>{estimateNotice}</div>}
                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
                    <button className="excel-button" onClick={()=>setEstimateOpen(false)}>Cancel</button>
                    <button className="excel-button green" disabled={estimateLoading} onClick={prepareEstimate}>OK / Prepare Estimate</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,borderBottom:"1px solid #ddd",paddingBottom:10}}>
                    <div style={{fontSize:22,fontWeight:800}}>SERVICE ESTIMATE</div><div className="estimate-meta">Estimate No. (Session): <b>{estimateNumber || "-"}</b> · Date: <b>{formatDate(new Date())}</b></div>
                    <span style={{fontSize:12,color:"#666"}}>Single Vehicle Only</span>
                    <span style={{marginLeft:"auto",fontWeight:700}}>{user?.dealerName || "Workshop"}</span>
                    <button className="excel-button no-print" onClick={()=>setEstimateOpen(false)}>Close</button>
                  </div>
                   <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8,marginBottom:12}}>
                     {[["Customer","customerName"],["Reg. No.","reg"],["Chassis / VIN","vin"],["Engine No.","engine"],["Model","model"]].map(([label,key]) => (
                       <div key={key}><b>{label}</b><input className="excel-input" value={estimateVehicle?.[key] || ""} onChange={e=>setEstimateVehicle(prev=>({...prev,[key]:e.target.value}))} /></div>
                     ))}
                   </div>
                  <div style={{fontWeight:800,margin:"10px 0 6px"}}>Selected Aggregate Services</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{BULK_SERVICE_LABELS.filter(([,key])=>estimateSelectedServices.includes(key)).map(([label])=><span key={label} style={{border:"1px solid #bbb",padding:"5px 8px",borderRadius:5,fontSize:12,background:"#f7f7f7"}}>{label}</span>)}</div>
                  <div style={{fontWeight:800,margin:"10px 0 6px"}}>Parts</div>
                  <table className="history-table"><thead><tr><th>Part No.</th><th>Description</th><th>Qty</th><th>Rate (Incl. GST)</th><th>Amount</th><th></th></tr></thead><tbody>{estimateParts.map(item=><tr key={item.id}><td><input value={item.partNo} onChange={e=>updateEstimateItem("part",item.id,"partNo",e.target.value)} onBlur={e=>lookupManualEstimatePart(item.id,e.target.value)} title="Enter Part No. and leave the field to auto-fill description and rate"/></td><td><input value={item.description} onChange={e=>updateEstimateItem("part",item.id,"description",e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={item.qty ?? ""} onChange={e=>updateEstimateItem("part",item.id,"qty",e.target.value)} onBlur={normalizeEstimateQuantities} onKeyDown={e=>{if(e.key==="Enter") normalizeEstimateQuantities();}} style={{width:80}}/></td><td><input type="number" min="0" step="0.01" value={item.rate} onChange={e=>updateEstimateItem("part",item.id,"rate",e.target.value)} style={{width:110}}/></td><td>{formatNumber(item.qty*item.rate)}</td><td><button className="excel-button no-print" onClick={()=>removeEstimateItem("part",item.id)}>Delete</button></td></tr>)}{!estimateParts.length&&<tr><td colSpan="6">No historical part found. Add manually.</td></tr>}</tbody></table>
                  <div style={{margin:"8px 0"}}><button className="excel-button no-print" onClick={()=>addEstimateItem("part")}>+ Add Part</button></div>
                  <div style={{fontWeight:800,margin:"14px 0 6px"}}>Labour</div>
                  <table className="history-table"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead><tbody>{estimateLabour.map(item=><tr key={item.id}><td><input value={item.description} onChange={e=>updateEstimateItem("labour",item.id,"description",e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={item.qty ?? ""} onChange={e=>updateEstimateItem("labour",item.id,"qty",e.target.value)} onBlur={normalizeEstimateQuantities} onKeyDown={e=>{if(e.key==="Enter") normalizeEstimateQuantities();}} style={{width:80}}/></td><td><input type="number" min="0" step="0.01" value={item.rate} onChange={e=>updateEstimateItem("labour",item.id,"rate",e.target.value)} style={{width:110}}/></td><td>{formatNumber(item.qty*item.rate)}</td><td><button className="excel-button no-print" onClick={()=>removeEstimateItem("labour",item.id)}>Delete</button></td></tr>)}{!estimateLabour.length&&<tr><td colSpan="5">No historical labour found. Add manually.</td></tr>}</tbody></table>
                  <div style={{margin:"8px 0"}}><button className="excel-button no-print" onClick={()=>addEstimateItem("labour")}>+ Add Labour</button></div>
                  <div style={{marginTop:16,marginLeft:"auto",maxWidth:380,borderTop:"2px solid #222",paddingTop:10}}><div style={{display:"flex",justifyContent:"space-between"}}><span>Parts Total</span><b>₹ {formatNumber(estimatePartsTotal)}</b></div><div style={{display:"flex",justifyContent:"space-between"}}><span>Labour Subtotal</span><b>₹ {formatNumber(estimateLabourBase)}</b></div><div style={{display:"flex",justifyContent:"space-between"}}><span>GST on Labour (18%)</span><b>₹ {formatNumber(estimateLabourGst)}</b></div><div style={{display:"flex",justifyContent:"space-between",fontSize:18,marginTop:6}}><span>Grand Total</span><b>₹ {formatNumber(estimateGrandTotal)}</b></div></div>
                  <div className="no-print" style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:8,marginTop:18,paddingTop:12,borderTop:"1px solid #ddd"}}><button className="excel-button" onClick={reviseEstimateServices}>Revise Aggregate Service</button><button className="excel-button" onClick={()=>buildEstimatePdf(true)}>Print A4</button><button className="excel-button green" onClick={()=>buildEstimatePdf(false)}>Download PDF</button></div>
                  <div style={{marginTop:8,fontSize:12,color:"#666"}}>Estimate only. Historical DB rates are without GST; 18% GST is added to historical part rates shown above. Missing items/rates can be entered manually using GST-inclusive rates.</div>
                </>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

function Info({ label, value }) {
  return <div className="info-box"><span>{label}</span><strong>{value}</strong></div>;
}


function App() {
  return <AuthGate><ServiceDecisionApp /></AuthGate>;
}

export default App;