import type { CategoryId, Comparison } from "../catalog";
import { isComparison } from "../catalog";
import { formatMonth, parseSheetPeriod } from "../dates";
import { parseNumber, slugMetric } from "../numbers";
import type { SheetMapping } from "../types";

export type HeaderMatch =
  | { kind: "field"; field: "date" | "hour" | "storeCode" | "department" | "description" | "employee" | "employeeId"; score: number }
  | { kind: "metric"; metric: string; comparison: Comparison; score: number }
  | { kind: "ignore"; reason: "ratio" | "unknown" };

const FIELD_RULES: { field: "date" | "hour" | "storeCode" | "department" | "description" | "employee" | "employeeId"; score: number; pattern: RegExp }[] = [
  { field: "date", score: 100, pattern: /^receipt date$/ },
  { field: "date", score: 90, pattern: /^(business|sale|transaction|trans) date$/ },
  { field: "date", score: 85, pattern: /^week (start|starting|of)$/ },
  { field: "date", score: 80, pattern: /^period start$/ },
  { field: "date", score: 70, pattern: /^date$/ },
  { field: "date", score: 65, pattern: /^month$/ },
  { field: "date", score: 55, pattern: /^week$/ },
  { field: "hour", score: 100, pattern: /^hour$/ },
  { field: "hour", score: 90, pattern: /^hour of day$/ },
  { field: "storeCode", score: 100, pattern: /^receipt store$/ },
  { field: "storeCode", score: 90, pattern: /^store (number|code|#|no)$/ },
  { field: "storeCode", score: 80, pattern: /^(store|location)$/ },
  { field: "department", score: 100, pattern: /^(department|dept|dept name)$/ },
  { field: "description", score: 100, pattern: /^description\d*$/ },
  { field: "description", score: 80, pattern: /^(item description|class|sub category|subcategory|sub department)$/ },
  { field: "employeeId", score: 100, pattern: /^(employee|cashier|associate) (login|id|number|#|no)$/ },
  { field: "employee", score: 100, pattern: /^(employee|cashier|associate)( (last\/first|first\/last|name|last name|first name))?$/ },
];

const METRIC_RULES: { metric: string; score: number; pattern: RegExp }[] = [
  { metric: "revenue", score: 100, pattern: /^net retail( sold)?$/ },
  { metric: "revenue", score: 90, pattern: /^(net sales|net revenue|total sales|total revenue|sales|revenue)$/ },
  { metric: "units", score: 100, pattern: /^net units sold$/ },
  { metric: "units", score: 80, pattern: /^(units sold|units|qty|quantity)$/ },
  { metric: "receipt_lines", score: 100, pattern: /^(number of )?receipts?$/ },
  { metric: "employee_receipts", score: 100, pattern: /^total receipts?$/ },
  { metric: "transactions", score: 90, pattern: /^(transactions?|trans count|transaction count|customer count|number of customers)$/ },
  { metric: "donors", score: 90, pattern: /^(donors?|donor count|number of donors)$/ },
  { metric: "roundup_count", score: 100, pattern: /^number of round[\s-]?up donations?$/ },
  { metric: "roundup_count", score: 100, pattern: /^round[\s-]?up donation (count|number)$/ },
  { metric: "roundup", score: 100, pattern: /^round[\s-]?up donation (amount|dollars|total)$/ },
  { metric: "roundup", score: 90, pattern: /^round[\s-]?up( donations?)?$/ },
  { metric: "overtime_hours", score: 100, pattern: /^(overtime|ot) hours$/ },
  { metric: "payroll_hours", score: 90, pattern: /^(regular hours|payroll hours|hours worked|labor hours|hours)$/ },
  { metric: "payroll_dollars", score: 90, pattern: /^(payroll dollars|payroll amount|gross pay|labor dollars|wages|payroll)$/ },
  { metric: "items_sent", score: 90, pattern: /^(items sent|ecom(merce)? items sent|sent to ecom(merce)?)$/ },
  { metric: "items_sold", score: 90, pattern: /^(items sold|ecom(merce)? items sold)$/ },
  { metric: "ecommerce_revenue", score: 100, pattern: /^ecom(merce)? (revenue|sales)$/ },
  { metric: "racks", score: 90, pattern: /^(racks( processed)?|racks processed)$/ },
  { metric: "totes", score: 90, pattern: /^(totes( processed)?|totes processed)$/ },
  { metric: "production_units", score: 90, pattern: /^(production units|units produced|pieces processed)$/ },
  { metric: "expense", score: 90, pattern: /^(expenses?|total expenses|operating expenses|cogs|cost of goods)$/ },
  { metric: "net_income", score: 90, pattern: /^(net income|net profit|net performance|net)$/ },
];

const RATIO_PATTERNS = [
  /average sale/,
  /avg sale/,
  /^asp$/,
  /avg units/,
  /average units/,
  /units per receipt/,
  /sell[\s-]?through/,
  /per square/,
  /per sq/,
  /labor %/,
  /labor percent/,
  /prcnt/,
  /percent/,
  /\bpct\b/,
  /%/,
];

export function cleanHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchHeader(header: string): HeaderMatch {
  const original = cleanHeader(header).toLowerCase();
  if (!original || /end$/.test(original)) {
    if (/date|period|week/.test(original) && /end$/.test(original)) return { kind: "ignore", reason: "unknown" };
  }
  if (RATIO_PATTERNS.some((pattern) => pattern.test(original))) {
    return { kind: "ignore", reason: "ratio" };
  }

  const comparison = detectComparison(original);
  const text = comparison.rest || original;

  let bestField: Extract<HeaderMatch, { kind: "field" }> | null = null;
  for (const rule of FIELD_RULES) {
    if (rule.pattern.test(text) && (!bestField || rule.score > bestField.score)) {
      bestField = { kind: "field", field: rule.field, score: rule.score };
    }
  }
  if (bestField && comparison.comparison === "actual") return bestField;

  let bestMetric: { metric: string; score: number } | null = null;
  for (const rule of METRIC_RULES) {
    if (rule.pattern.test(text) && (!bestMetric || rule.score > bestMetric.score)) {
      bestMetric = { metric: rule.metric, score: rule.score };
    }
  }
  if (bestMetric) {
    return {
      kind: "metric",
      metric: bestMetric.metric,
      comparison: comparison.comparison,
      score: bestMetric.score,
    };
  }

  return { kind: "ignore", reason: "unknown" };
}

function detectComparison(header: string): { comparison: Comparison; rest: string } {
  let comparison: Comparison = "actual";
  if (/\blast\s*year\b|\bprior\s*year\b|\bly\b|\bpy\b/.test(header)) comparison = "last_year";
  else if (/\bbudget\b|\bplan\b/.test(header)) comparison = "budget";
  else if (/\bgoal\b|\btarget\b/.test(header)) comparison = "goal";

  const rest = header
    .replace(/\blast\s*year\b|\bprior\s*year\b|\bly\b|\bpy\b/g, " ")
    .replace(/\bbudget\b|\bplan\b/g, " ")
    .replace(/\bgoal\b|\btarget\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { comparison, rest };
}

export function suggestSheet(
  name: string,
  headers: string[],
  records: Record<string, unknown>[],
  category: CategoryId,
  headerRow: number,
): SheetMapping {
  const fields: SheetMapping["fields"] = {};
  const fieldScore: Partial<Record<keyof SheetMapping["fields"], number>> = {};
  const metrics: SheetMapping["metrics"] = [];
  const ignored: SheetMapping["ignored"] = [];
  const notes: string[] = [];

  for (const header of headers) {
    const match = matchHeader(header);
    if (match.kind === "field") {
      const current = fieldScore[match.field] ?? -1;
      if (match.score > current) {
        fields[match.field] = header;
        fieldScore[match.field] = match.score;
      }
      continue;
    }
    if (match.kind === "metric") {
      let metric = match.metric;
      if (category === "upright" && metric === "revenue") metric = "ecommerce_revenue";
      metrics.push({ header, metric, comparison: match.comparison });
      continue;
    }
    if (match.reason === "ratio") {
      ignored.push({
        header,
        reason: /prcnt|percent|pct|%/.test(header.toLowerCase())
          ? "This is a percent, so it is not added across employees."
          : "This is a rate, so it is not added into a total.",
      });
      continue;
    }
    if (category === "other" && mostlyNumeric(records, header)) {
      metrics.push({ header, metric: slugMetric(header), comparison: "actual" });
      notes.push(`${header} was imported as a custom metric.`);
    }
  }

  if (!metrics.length && category !== "other") {
    notes.push("No known metric columns were detected. Map at least one column before importing.");
  }

  const sheetPeriod = parseSheetPeriod(name);
  if (!fields.date && sheetPeriod) {
    notes.push(`The tab name is used as ${formatMonth(sheetPeriod.iso.slice(0, 7))}.`);
  }
  const matchedExpected = meetsExpected(category, metrics.map((item) => item.metric));
  let confidence = 0;
  if (fields.date || sheetPeriod || (category === "other" && metrics.length > 0)) confidence += 0.45;
  if (metrics.length) confidence += 0.4;
  if (matchedExpected) confidence += 0.15;
  if (!matchedExpected) confidence = Math.min(confidence, 0.55);
  if (ignored.length) notes.push(`${ignored.map((item) => item.header).join(", ")} left out of the totals.`);

  const include = metrics.length > 0 && Boolean(fields.date || sheetPeriod);
  return {
    name,
    include,
    headerRow,
    confidence: Math.max(0, Math.min(1, confidence)),
    fields,
    metrics,
    ignored,
    notes,
  };
}

function meetsExpected(category: CategoryId, metrics: string[]) {
  const present = new Set(metrics);
  const any = (keys: string[]) => keys.some((key) => present.has(key));
  if (category === "celerant") {
    return any(["revenue", "units", "transactions", "receipt_lines", "employee_receipts", "donors", "roundup", "roundup_count"]);
  }
  if (category === "adp") return any(["payroll_dollars", "payroll_hours"]);
  if (category === "upright") return any(["ecommerce_revenue", "items_sent", "items_sold"]);
  if (category === "workplace") return any(["racks", "totes", "production_units"]);
  if (category === "financial") return any(["expense", "net_income", "revenue"]);
  return metrics.length > 0;
}

function mostlyNumeric(records: Record<string, unknown>[], header: string) {
  const values = records
    .slice(0, 25)
    .map((record) => record[header])
    .filter((value) => value != null && String(value).trim() !== "");
  if (!values.length) return false;
  const numeric = values.filter((value) => parseNumber(value) != null).length;
  return numeric / values.length >= 0.7;
}

export function headerScore(cells: unknown[]) {
  return cells.reduce<number>((score, cell) => {
    const header = cleanHeader(cell);
    if (!header) return score;
    return score + (matchHeader(header).kind === "ignore" ? 0 : 1);
  }, 0);
}

export function isMetricKey(metric: string) {
  if (/^custom:[a-z0-9_]{1,40}$/.test(metric)) return true;
  return [
    "revenue",
    "units",
    "receipt_lines",
    "transactions",
    "employee_receipts",
    "donors",
    "roundup_count",
    "roundup",
    "payroll_hours",
    "overtime_hours",
    "payroll_dollars",
    "items_sent",
    "items_sold",
    "ecommerce_revenue",
    "racks",
    "totes",
    "production_units",
    "expense",
    "net_income",
  ].includes(metric);
}

export function sanitizeMapping(input: unknown, available: { name: string; headers: string[] }[]): SheetMapping[] {
  if (!input || typeof input !== "object" || !("sheets" in input) || !Array.isArray((input as { sheets: unknown }).sheets)) {
    throw new Error("Mapping must include a sheets list.");
  }
  const sheets = (input as { sheets: unknown[] }).sheets.map((sheet) => {
    if (!sheet || typeof sheet !== "object") throw new Error("Each sheet mapping must be an object.");
    const raw = sheet as Partial<SheetMapping>;
    const known = available.find((item) => item.name === raw.name);
    if (!known) throw new Error(`Sheet ${String(raw.name)} is not in this file.`);
    const headers = new Set(known.headers);
    const fields: SheetMapping["fields"] = {};
    for (const key of ["date", "hour", "storeCode", "department", "description", "employee", "employeeId"] as const) {
      const header = raw.fields?.[key];
      if (header) {
        if (!headers.has(header)) throw new Error(`Column ${header} is not on sheet ${known.name}.`);
        fields[key] = header;
      }
    }
    const metrics = (raw.metrics ?? []).map((item) => {
      if (!item || !headers.has(item.header)) throw new Error(`Metric column ${item?.header} is not on sheet ${known.name}.`);
      if (!isMetricKey(item.metric) || !isComparison(item.comparison)) {
        throw new Error(`Unsupported metric mapping for ${item.header}.`);
      }
      return { header: item.header, metric: item.metric, comparison: item.comparison };
    });
    return {
      name: known.name,
      include: Boolean(raw.include),
      headerRow: Number(raw.headerRow ?? 0),
      confidence: Number(raw.confidence ?? 0),
      fields,
      metrics,
      ignored: [],
      notes: [],
    } satisfies SheetMapping;
  });
  if (!sheets.some((sheet) => sheet.include && sheet.metrics.length)) {
    throw new Error("Choose at least one sheet and one metric column.");
  }
  return sheets;
}
