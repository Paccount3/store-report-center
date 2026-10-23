export const CATEGORIES = [
  {
    id: "celerant",
    name: "Celerant Reporting",
    blurb: "Sales, budgets, transactions, departments, and hourly performance.",
    examples: [
      "Daily, monthly, and yearly revenue",
      "Revenue compared with budget and last year",
      "Transactions and round-up donations",
      "Department sales, units, and hourly activity",
    ],
  },
  {
    id: "adp",
    name: "ADP Reporting",
    blurb: "Payroll hours, payroll dollars, and labor performance.",
    examples: ["Payroll hours and overtime", "Payroll dollars", "Labor compared with budget"],
  },
  {
    id: "upright",
    name: "Upright Labs Reporting",
    blurb: "Ecommerce items sent, items sold, revenue, and goals.",
    examples: ["Items sent and sold", "Ecommerce revenue by month", "Performance against goals"],
  },
  {
    id: "workplace",
    name: "GW Work Place Reporting",
    blurb: "Production, racks, totes, and back-of-house throughput.",
    examples: ["Racks and totes processed", "Production units", "Other production counts"],
  },
  {
    id: "financial",
    name: "Financial / P&L Reporting",
    blurb: "Revenue, expenses, net performance, and financial comparisons.",
    examples: ["Revenue and expenses", "Net income", "Budget and last-year comparisons"],
  },
  {
    id: "other",
    name: "Other / Manual Reporting",
    blurb: "Assessments, staffing, donors, trash, and other operational sheets.",
    examples: [
      "Store and district assessments",
      "Staffing and cross-training",
      "Donor tracking and trash removal",
    ],
  },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function isCategory(value: string): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

export function categoryName(id: string) {
  return CATEGORIES.find((category) => category.id === id)?.name ?? id;
}

export const METRICS: Record<string, { label: string; format: "currency" | "number" | "score" }> = {
  revenue: { label: "Revenue", format: "currency" },
  units: { label: "Units sold", format: "number" },
  receipt_lines: { label: "Receipt lines", format: "number" },
  transactions: { label: "Transactions", format: "number" },
  employee_receipts: { label: "Employee receipts", format: "number" },
  donors: { label: "Donors", format: "number" },
  roundup_count: { label: "Round-up donations", format: "number" },
  roundup: { label: "Round-up amount", format: "currency" },
  payroll_hours: { label: "Payroll hours", format: "number" },
  overtime_hours: { label: "Overtime hours", format: "number" },
  payroll_dollars: { label: "Payroll dollars", format: "currency" },
  items_sent: { label: "Ecommerce items sent", format: "number" },
  items_sold: { label: "Ecommerce items sold", format: "number" },
  ecommerce_revenue: { label: "Ecommerce revenue", format: "currency" },
  racks: { label: "Racks processed", format: "number" },
  totes: { label: "Totes processed", format: "number" },
  production_units: { label: "Production units", format: "number" },
  expense: { label: "Expenses", format: "currency" },
  net_income: { label: "Net income", format: "currency" },
};

export const COMPARISONS = ["actual", "budget", "last_year", "goal"] as const;
export type Comparison = (typeof COMPARISONS)[number];

export function isComparison(value: string): value is Comparison {
  return (COMPARISONS as readonly string[]).includes(value);
}

export function metricLabel(metric: string) {
  if (metric.startsWith("custom:")) {
    return metric
      .slice(7)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return METRICS[metric]?.label ?? metric;
}

export function comparisonLabel(comparison: Comparison) {
  if (comparison === "actual") return "Actual";
  if (comparison === "budget") return "Budget";
  if (comparison === "last_year") return "Last year";
  return "Goal";
}

export const PRESETS = [
  {
    id: "notable_changes",
    label: "Identify Notable Changes",
    instruction:
      "Identify the largest changes in the calculated figures. Rank them by magnitude and say which report and period each one comes from.",
  },
  {
    id: "unusual_trends",
    label: "Find Unusual Trends",
    instruction:
      "Look for unusual trends, spikes, dips, or relationships in the calculated series. Explain why each one stands out from the rest of the provided figures.",
  },
  {
    id: "compare_budget",
    label: "Compare Against Budget",
    instruction:
      "Compare actual results with budget using only the budget figures present in the calculated pack. If budget is missing for a metric, say so.",
  },
  {
    id: "compare_last_year",
    label: "Compare Against Last Year",
    instruction:
      "Compare actual results with last year using only the last-year figures present in the calculated pack. If last year is missing, say so.",
  },
  {
    id: "operational_concerns",
    label: "Identify Operational Concerns",
    instruction:
      "Identify operational concerns supported by the calculated figures, such as labor share, missed goals, declining departments, or falling revenue. Separate evidence from possible causes.",
  },
  {
    id: "positive_performance",
    label: "Highlight Positive Performance",
    instruction:
      "Highlight positive performance that is supported by the calculated figures. Do not praise results that the numbers do not show.",
  },
  {
    id: "labor_efficiency",
    label: "Analyze Labor Efficiency",
    instruction:
      "Analyze labor efficiency from payroll hours, payroll dollars, and revenue. Discuss labor as a share of revenue only when both payroll and revenue are present for the period.",
  },
  {
    id: "summarize",
    label: "Summarize Store Performance",
    instruction:
      "Summarize store performance for the selected reports. Lead with the period, the main results, and the comparisons that are actually available.",
  },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export function isPreset(value: string): value is PresetId {
  return PRESETS.some((preset) => preset.id === value);
}
