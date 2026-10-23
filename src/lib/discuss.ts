import { buildDashboard } from "./dashboard";
import { isCompleteMonths, MONTH_SECTION_NOTE } from "./dates";
import { discussScope } from "./discuss-scopes";
import type { DashboardData, Store } from "./types";

const CELERANT_KPIS = ["revenue", "sqft", "asp", "to-budget", "to-ly", "budget", "last-year", "transactions", "rpt", "units"];
const ROUNDUP_KPIS = ["roundup", "roundup-pct", "roundup-count"];
const ADP_KPIS = ["payroll", "labor", "overtime"];
const UPRIGHT_KPIS = ["ecommerce"];
const FINANCIAL_KPIS = ["expense", "net"];

export function buildDiscussPack(store: Store, scopeId: string, from?: string | null, to?: string | null) {
  const scope = discussScope(scopeId);
  if (!scope) return null;
  const dashboard = buildDashboard(store, { from, to, keepAllDepartments: true });
  return {
    scope: scopeId,
    kind: scope.kind,
    label: scope.label,
    instruction:
      scope.kind === "chart"
        ? `The user opened the ${scope.label} chart. Lead with that chart. The pack also includes the rest of this section, and you should use those figures when the question needs them.`
        : `The user is discussing the ${scope.label} section. The pack includes every subsection in that section. Use them. Do not say a subsection is unavailable when its figures are in the pack.`,
    store: { name: store.name, code: store.code },
    period: dashboard.rangeLabel,
    comparisonNote: dashboard.comparisonNote,
    data: packFor(scopeId, dashboard),
  };
}

export function discussSystemPrompt(instruction: string) {
  return [
    "You are talking with a store manager about one part of a Goodwill store dashboard.",
    instruction,
    "Reply as a conversation, not a report or a slide.",
    "Use only numbers in the JSON pack. Do not invent figures, dates, causes, or comparisons.",
    "If a metric is absent from the pack, say it was not in the imported file. Do not treat a related field, such as receipt lines, as missing transaction data.",
    "A zero means the calculation was zero. Omit a metric rather than calling the chart empty when another field in the same chart has values.",
    "Keep the reply short: usually 2 to 5 sentences, or up to 4 short bullets when a list is clearer.",
    "You may use markdown: **bold** for key figures and a short bullet list when it helps. Do not use headings.",
    "Every number you mention must come from the pack, with the metric and the period.",
    "The period value is the exact date range selected on the dashboard. Use that range whenever you mention dates. Do not widen it to a month, a file date, or any other span.",
    "If a subsection has a disclaimer that its data is broken down by month, not day, give the user that disclaimer and do not discuss figures for that subsection.",
    "You may end with one follow-up question.",
    "Do not write a summary header, action-step list, findings section, or a long presentation.",
    "Ecommerce revenue is not store revenue.",
    "Receipt lines come from Number of Receipts on each department row. Adding them by hour counts a receipt once per department on that receipt, not once per customer.",
    "Answer from this section. A chart chat may use the other charts in the same section.",
    "Lists in the pack are complete for the selected period. Do not describe them as a sample, a top few, or only the rows you were shown.",
    "Do not combine rows into an Other group or any other summary. Each department, employee, day, and hour in the pack is already the full list.",
    "When you mention a time of day, use a 12-hour clock with minutes, such as 9:00am or 9:00pm. Never use a 24-hour time such as 21:00 or 21:00pm.",
  ].join(" ");
}

function packFor(scopeId: string, dashboard: DashboardData) {
  switch (scopeId) {
    case "scorecard":
      return { scorecard: scorecard(dashboard) };
    case "celerant":
      return celerantSection(dashboard);
    case "celerant-revenue":
      return { focus: "Revenue", ...celerantSection(dashboard) };
    case "celerant-departments":
      return { focus: "Departments", ...celerantSection(dashboard) };
    case "celerant-hour":
      return { focus: "Hour of day", ...celerantSection(dashboard) };
    case "celerant-months":
      return { focus: "By month", ...celerantSection(dashboard) };
    case "celerant-roundup":
      return { focus: "Round-up", ...celerantSection(dashboard) };
    case "adp":
    case "adp-labor":
      return {
        focus: scopeId === "adp-labor" ? "Labor" : undefined,
        kpis: kpis(dashboard, ADP_KPIS),
        labor: labor(dashboard),
        laborDepartments: laborDepartments(dashboard),
      };
    case "upright":
    case "upright-chart":
    case "upright-ecomm":
      return {
        focus: scopeId === "upright-chart" ? "Ecommerce" : scopeId === "upright-ecomm" ? "Ecommerce sales" : undefined,
        kpis: kpis(dashboard, UPRIGHT_KPIS),
        ecommerce: dashboard.ecommerce.map((item) => ({
          weekOf: item.period,
          itemsSent: round(item.sent),
          itemsSold: round(item.sold),
          revenue: round(item.revenue),
          goal: item.goal == null ? null : round(item.goal),
        })),
        ecommerceSales: isCompleteMonths(dashboard.filter.from, dashboard.filter.to)
          ? dashboard.ecommRows
          : { disclaimer: MONTH_SECTION_NOTE },
      };
    case "workplace":
    case "workplace-chart":
      return {
        focus: scopeId === "workplace-chart" ? "Production" : undefined,
        production: dashboard.production.map((item) => ({
          weekOf: item.period,
          racks: round(item.racks),
          totes: round(item.totes),
          units: round(item.units),
        })),
      };
    case "financial":
    case "financial-pl":
      return isCompleteMonths(dashboard.filter.from, dashboard.filter.to)
        ? {
            focus: scopeId === "financial-pl" ? "P&L by month" : undefined,
            kpis: kpis(dashboard, FINANCIAL_KPIS),
            months: financial(dashboard),
          }
        : { disclaimer: MONTH_SECTION_NOTE };
    case "other":
    case "other-donors":
      return {
        focus: scopeId === "other-donors" ? "Donors" : undefined,
        kpis: kpis(dashboard, ["donors", "rpd"]),
        metrics: dashboard.otherMetrics.map((item) => ({ label: item.label, value: round(item.value, 2) })),
        donors: dashboard.donorRows,
      };
    default:
      return {};
  }
}

function celerantSection(dashboard: DashboardData) {
  const monthly = isCompleteMonths(dashboard.filter.from, dashboard.filter.to);
  return {
    kpis: kpis(dashboard, [...CELERANT_KPIS, "receipts"]),
    revenue: revenueSeries(dashboard),
    departments: departments(dashboard),
    hourOfDay: hourSeries(dashboard),
    months: monthly ? months(dashboard) : { disclaimer: MONTH_SECTION_NOTE },
    roundup: monthly ? roundup(dashboard) : { disclaimer: MONTH_SECTION_NOTE },
    notices: dashboard.notices,
  };
}

function hourSeries(dashboard: DashboardData) {
  const hasTransactions = dashboard.hours.some((item) => item.transactions > 0);
  const hasReceipts = dashboard.hours.some((item) => item.receipts > 0);
  return {
    note: hasTransactions
      ? "Transactions are a separate imported column."
      : hasReceipts
        ? "This file has Number of Receipts on each department row, not a unique transaction count. receiptLines is that column summed by hour, so a receipt with several departments is counted once per department."
        : "No transaction or receipt-count column was imported for these hours.",
    hours: dashboard.hours.map((item) => ({
      time: clockLabel(item.hour),
      revenue: round(item.revenue),
      units: round(item.units),
      ...(hasTransactions ? { transactions: round(item.transactions) } : {}),
      ...(hasReceipts ? { receiptLines: round(item.receipts) } : {}),
    })),
  };
}

function roundup(dashboard: DashboardData) {
  return {
    note: "employee rows are every employee for this period. Amounts are unrounded cents. The dashboard displays the Round-up amount KPI rounded to the nearest dollar, and it also rounds each employee amount to the nearest dollar. Adding those displayed employee dollars will not match the displayed KPI.",
    kpis: kpis(dashboard, ROUNDUP_KPIS),
    employees: dashboard.employees.map((item) => ({
      name: item.name,
      receipts: round(item.receipts),
      roundupCount: round(item.roundupCount),
      roundup: round(item.roundup),
      roundupLastYear: item.roundupLastYear == null ? null : round(item.roundupLastYear),
    })),
    months: dashboard.monthsTable
      .filter((month) => month.roundup != null || month.roundupLastYear != null)
      .map((month) => ({
        month: month.label,
        roundup: month.roundup == null ? null : round(month.roundup),
        roundupLastYear: month.roundupLastYear == null ? null : round(month.roundupLastYear),
        roundupPercent: month.roundupPercent == null ? null : round(month.roundupPercent, 1),
      })),
  };
}

function kpis(dashboard: DashboardData, ids: string[]) {
  return dashboard.kpis
    .filter((kpi) => ids.includes(kpi.id) && kpi.value != null)
    .map((kpi) => ({
      label: kpi.label,
      value: round(kpi.value as number, kpi.format === "percent" ? 1 : 2),
      format: kpi.format,
      versus: kpi.delta?.pct == null ? null : { label: kpi.delta.label, pct: round(kpi.delta.pct, 1) },
    }));
}

function scorecard(dashboard: DashboardData) {
  return dashboard.scorecard.map((item) => ({
    label: item.label,
    source: item.source,
    value: item.value == null ? null : round(item.value, item.format === "percent" ? 1 : 2),
    format: item.format,
    detail: item.detail,
  }));
}

function departments(dashboard: DashboardData) {
  return dashboard.departments.map((item) => ({
    name: item.name,
    revenue: round(item.revenue),
    units: round(item.units),
    descriptions: item.descriptions.map((line) => ({
      name: line.name,
      revenue: round(line.revenue),
      units: round(line.units),
    })),
  }));
}

function months(dashboard: DashboardData) {
  return dashboard.monthsTable
    .filter((month) => month.revenue != null)
    .map((month) => ({
      month: month.label,
      revenue: month.revenue == null ? null : round(month.revenue),
      revenuePerSqFt: month.revenuePerSqFt == null ? null : round(month.revenuePerSqFt, 2),
      units: month.units == null ? null : round(month.units),
    }));
}

function revenueSeries(dashboard: DashboardData) {
  return {
    grain: dashboard.revenueGrain,
    points: dashboard.revenueSeries.map((point) => ({
      date: point.date,
      revenue: round(point.revenue),
      budget: point.budget == null ? null : round(point.budget),
      lastYear: point.lastYear == null ? null : round(point.lastYear),
    })),
  };
}

function labor(dashboard: DashboardData) {
  return dashboard.labor.map((item) => ({
    weekOf: item.period,
    payroll: round(item.payroll),
    hours: round(item.hours),
    revenue: item.revenue == null ? null : round(item.revenue),
    laborPercent: item.laborPercent == null ? null : round(item.laborPercent, 1),
  }));
}

function laborDepartments(dashboard: DashboardData) {
  return dashboard.laborDepartments.map((item) => ({
    name: item.name,
    payroll: round(item.payroll),
    hours: round(item.hours),
  }));
}

function financial(dashboard: DashboardData) {
  return dashboard.financial.map((item) => ({
    month: item.period,
    revenue: item.revenue == null ? null : round(item.revenue),
    expense: item.expense == null ? null : round(item.expense),
    net: item.net == null ? null : round(item.net),
  }));
}

function clockLabel(hour: number) {
  const suffix = hour >= 12 ? "pm" : "am";
  const clock = hour % 12 || 12;
  return `${clock}:00${suffix}`;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
