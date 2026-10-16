import { categoryName, PRESETS, type PresetId } from "./catalog";
import { buildDashboard } from "./dashboard";
import { formatRange } from "./dates";
import { formatCurrency, formatMetric, formatSignedPercent } from "./format";
import type { AnalysisResult, DashboardData, Store } from "./types";
import { uploadsForAnalysis } from "./uploads";

export function buildAnalysisContext(store: Store, uploadIds: string[]) {
  const reports = uploadsForAnalysis(store.id, uploadIds);
  const dashboard = buildDashboard(store, { uploadIds });
  const calculated = calculatedLines(dashboard);
  const missing = dashboard.coverage.filter((item) => item.imported === 0).map((item) => categoryName(item.category));
  const pack = {
    store: {
      name: store.name,
      code: store.code,
      city: store.city,
      region: store.region,
    },
    period: dashboard.rangeLabel,
    reports: reports.map((report) => ({
      name: report.originalName,
      category: categoryName(report.category),
      period: report.periodStart && report.periodEnd ? formatRange(report.periodStart, report.periodEnd) : "Undated",
      rows: report.rowCount,
    })),
    calculated,
    revenueSeries: dashboard.revenueSeries.map((point) => ({
      date: point.date,
      revenue: round(point.revenue),
      budget: point.budget == null ? null : round(point.budget),
      lastYear: point.lastYear == null ? null : round(point.lastYear),
    })),
    departments: dashboard.departments.map((item) => ({
      name: item.name,
      revenue: round(item.revenue),
      units: round(item.units),
      topDescriptions: item.descriptions.slice(0, 8).map((line) => ({
        name: line.name,
        revenue: round(line.revenue),
        units: round(line.units),
      })),
    })),
    hourlyRevenue: dashboard.hours.map((item) => ({ hour: item.hour, revenue: round(item.revenue) })),
    laborByWeek: dashboard.labor.map((item) => ({
      weekOf: item.period,
      payroll: round(item.payroll),
      hours: round(item.hours),
      revenue: item.revenue == null ? null : round(item.revenue),
      laborPercent: item.laborPercent == null ? null : round(item.laborPercent, 1),
    })),
    laborByDepartment: dashboard.laborDepartments.map((item) => ({
      name: item.name,
      payroll: round(item.payroll),
      hours: round(item.hours),
    })),
    ecommerceByWeek: dashboard.ecommerce.map((item) => ({
      weekOf: item.period,
      itemsSent: round(item.sent),
      itemsSold: round(item.sold),
      revenue: round(item.revenue),
      goal: item.goal == null ? null : round(item.goal),
    })),
    productionByWeek: dashboard.production.map((item) => ({
      weekOf: item.period,
      racks: round(item.racks),
      totes: round(item.totes),
      units: round(item.units),
    })),
    financialByMonth: dashboard.financial.map((item) => ({
      month: item.period,
      revenue: item.revenue == null ? null : round(item.revenue),
      expense: item.expense == null ? null : round(item.expense),
      net: item.net == null ? null : round(item.net),
    })),
    monthChanges: dashboard.monthsTable.map((month, index, list) => {
      const previous = list[index - 1]?.revenue;
      const change = month.revenue != null && previous ? ((month.revenue - previous) / Math.abs(previous)) * 100 : null;
      return {
        month: month.label,
        revenue: month.revenue == null ? null : round(month.revenue),
        payroll: month.payroll == null ? null : round(month.payroll),
        laborPercent: month.laborPercent == null ? null : round(month.laborPercent, 1),
        expense: month.expense == null ? null : round(month.expense),
        net: month.net == null ? null : round(month.net),
        revenueChangeVersusPriorMonthPct: change == null ? null : round(change, 1),
      };
    }),
    otherMetrics: dashboard.otherMetrics.map((item) => ({
      label: item.label,
      value: round(item.value, 2),
    })),
    notices: dashboard.notices,
    checks: dashboard.attention,
    categoriesWithNoSelectedData: missing,
  };

  const reportsUsed = reports.map((report) => ({
    id: report.id,
    name: report.originalName,
    category: categoryName(report.category),
    period: report.periodStart && report.periodEnd ? formatRange(report.periodStart, report.periodEnd) : "Undated",
  }));

  return { dashboard, pack, calculated, reportsUsed, hasNumbers: calculated.length > 0 };
}

export function calculatedLines(dashboard: DashboardData) {
  const lines = dashboard.kpis
    .filter((kpi) => kpi.value != null)
    .map((kpi) => {
      const digits = kpi.id === "asp" || kpi.id === "sqft" ? 2 : 0;
      const value =
        kpi.format === "currency"
          ? formatCurrency(kpi.value as number, digits)
          : formatMetric(kpi.value as number, kpi.format);
      const delta =
        kpi.delta?.pct != null ? ` (${formatSignedPercent(kpi.delta.pct)} ${kpi.delta.label})` : "";
      return { label: kpi.label, value: `${value}${delta}` };
    });
  for (const department of dashboard.departments.slice(0, 6)) {
    lines.push({ label: `${department.name} revenue`, value: formatCurrency(department.revenue) });
  }
  return lines;
}

export function insufficientAnalysis(reportsUsed: AnalysisResult["reportsUsed"], calculated: AnalysisResult["calculated"]): AnalysisResult {
  return {
    summary: "The selected reports do not contain enough imported metrics to support an analysis.",
    actionSteps: [],
    findings: [],
    gaps: ["Import a report with dated numeric columns, or choose reports that have already been added to the dashboard."],
    reportsUsed,
    calculated,
    model: null,
  };
}

export function presetInstruction(preset: PresetId | null, question: string) {
  const selected = preset ? PRESETS.find((item) => item.id === preset) : null;
  return [
    selected ? `Preset: ${selected.label}. ${selected.instruction}` : "No preset was selected.",
    question ? `Custom question: ${question}` : "No custom question was asked.",
  ].join("\n");
}

export function systemPrompt() {
  return [
    "You are an analyst for a Goodwill retail store dashboard.",
    "You receive a JSON pack of figures that the application already calculated from the reports the user selected.",
    "Use only numbers that appear in that JSON. Do not estimate, interpolate, or invent figures, dates, budgets, or causes.",
    "If a comparison is null or a category is listed as missing, say the data is not available.",
    "Separate facts from possible explanations. A fact must cite the metric, the period, and the value from the pack.",
    "Possible explanations must be labeled as interpretation and must not be stated as confirmed causes.",
    "Mention the report names the pack lists when you rely on them.",
    "Receipt lines are not unique transactions.",
    "Ecommerce revenue is not part of store revenue.",
    "actionSteps are for store managers and floor staff, not for the person reading the report.",
    "Write each action step as a clear store-level next step: what to investigate, adjust, coach, schedule, or check on the floor or with the team.",
    "Ground every step in a concrete figure from the pack (department, hour, month, round-up rate, labor, and so on).",
    "Good: \"TEXTILES revenue is the largest share at $176,085. Walk the textiles workflow this week and check whether sorting, pricing, and floor coverage are keeping up with demand.\"",
    "Good: \"September revenue is down versus August. Ask the manager to review September staffing and donation flow against the slower days.\"",
    "Bad: \"Check whether the September declines line up with the daily revenue pattern in the selected reports.\"",
    "Bad: \"Review whether the strongest departments are also the main drivers of total revenue in the selected period.\"",
    "Do not tell the reader to re-read charts, verify report totals, or re-analyze the pack. Tell the store what to look at operationally.",
    "Phrase steps as potential directions, not confirmed causes or hard orders.",
    "Return JSON with this shape: {\"summary\": string, \"actionSteps\": string[], \"findings\": [{\"title\": string, \"detail\": string, \"evidence\": string, \"basis\": \"fact\" | \"interpretation\"}], \"gaps\": string[] }.",
    "Keep the summary to 2 or 3 sentences. Return 3 to 5 actionSteps and 3 to 6 findings.",
  ].join(" ");
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
