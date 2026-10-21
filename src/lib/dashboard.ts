import { CATEGORIES, categoryName, metricLabel } from "./catalog";
import { formatMonth, formatRange, isCompleteMonths, monthEnd, monthKey, shiftDays, shiftYears, weekStart } from "./dates";
import { listStores } from "./db";
import { waterburyDonors, waterburyEcomm } from "./waterbury-reports";
import { demoDescriptions, demoGrouped } from "./demo/snapshot";
import { formatCurrency, formatNumber, formatPercent, formatSignedPercent } from "./format";
import type { Attention, Coverage, DashboardData, Kpi, OverviewCard, Store } from "./types";
import { listUploads } from "./uploads";

export type GroupRow = {
  category: string;
  metric: string;
  comparison: string;
  period_date: string | null;
  hour: number | null;
  dim1: string;
  grain: string;
  value: number;
  is_demo: number;
};

type Options = {
  from?: string | null;
  to?: string | null;
  uploadIds?: string[];
  keepAllDepartments?: boolean;
};

const GRAIN_RANK: Record<string, number> = {
  detail: 1,
  hour: 2,
  day: 3,
  week: 4,
  month: 5,
  period: 6,
};

export function buildDashboard(store: Store, options: Options = {}): DashboardData {
  const uploads = listUploads(store.id).filter((upload) => !upload.isDemo && (!options.uploadIds || options.uploadIds.includes(upload.id)));
  const imported = uploads.filter((upload) => upload.status === "imported");
  const allRows = loadGrouped(store.id, options.uploadIds);
  const months = [...new Set(allRows.map((row) => (row.period_date ? monthKey(row.period_date) : "")).filter(Boolean))].sort();
  const filtered = applyFinest(allRows.filter((row) => inRange(row, options.from, options.to)));
  const prior = priorYear(allRows, options.from, options.to);
  const notices = overlapNotices(imported);
  const kpis: Kpi[] = [];

  const revenueRows = pick(filtered, "revenue", "actual", ["celerant", "financial", "other"]);
  const budgetRows = pick(filtered, "revenue", "budget", ["celerant", "financial", "other"]);
  const lastYearRows = pick(filtered, "revenue", "last_year", ["celerant", "financial", "other"]);
  const priorRevenueRows = pick(prior.rows, "revenue", "actual", ["celerant", "financial", "other"]);
  const revenue = revenueRows.length ? sum(revenueRows) : null;
  const budget = budgetRows.length ? sum(budgetRows) : null;
  const lastYear = lastYearRows.length ? sum(lastYearRows) : priorRevenueRows.length ? sum(priorRevenueRows) : null;
  const revenueDemo = demo(revenueRows);

  if (revenueRows.some((row) => row.category === "celerant") && filtered.some((row) => row.category === "financial" && row.metric === "revenue" && row.comparison === "actual")) {
    notices.push("Store revenue comes from Celerant. Financial revenue is kept on the P&L and is not added again.");
  }
  if (filtered.some((row) => row.metric === "ecommerce_revenue")) {
    notices.push("Ecommerce revenue is tracked separately and is not included in store revenue.");
  }

  const alignedPriorRevenue = priorRevenueRows.map((row) => ({
    ...row,
    period_date: row.period_date ? shiftYears(row.period_date, 1) : null,
  }));
  const revenueSeries = buildRevenueSeries(revenueRows, budgetRows, lastYearRows.length ? lastYearRows : alignedPriorRevenue);
  const descriptionRows = demoDescriptions(store.id, options.uploadIds).filter((row) =>
    inRange(
      {
        category: "celerant",
        metric: row.metric,
        comparison: row.comparison,
        period_date: row.period_date,
        hour: null,
        dim1: row.dim1,
        grain: "detail",
        value: row.value,
        is_demo: 0,
      },
      options.from,
      options.to,
    ),
  );
  const departmentList = buildDepartments(filtered, revenueRows[0]?.category, descriptionRows);
  const departments = options.keepAllDepartments ? departmentList : collapseDepartments(departmentList);
  const labor = buildLabor(filtered, revenueRows);
  const payrollRows = pick(filtered, "payroll_dollars", "actual", ["adp", "financial", "other"]);
  const hourRows = pick(filtered, "payroll_hours", "actual", ["adp", "other"]);
  const overtimeRows = pick(filtered, "overtime_hours", "actual", ["adp", "other"]);
  const payroll = payrollRows.length ? sum(payrollRows) : null;
  const payrollHours = hourRows.length ? sum(hourRows) : null;
  const laborPercent = payroll != null && revenue ? (payroll / revenue) * 100 : null;

  if (payrollRows.length && revenueRows.length) {
    const payrollSpan = span(payrollRows);
    const revenueSpan = span(revenueRows);
    if (payrollSpan && revenueSpan && (payrollSpan[0] !== revenueSpan[0] || payrollSpan[1] !== revenueSpan[1])) {
      notices.push(
        `Payroll covers ${formatRange(payrollSpan[0], payrollSpan[1])} and store revenue covers ${formatRange(revenueSpan[0], revenueSpan[1])}. Labor % uses both totals for the selected period.`,
      );
    } else {
      notices.push("Labor % is ADP payroll dollars divided by store revenue for the selected period.");
    }
  }

  kpis.push({
    id: "revenue",
    label: "Revenue",
    value: revenue,
    format: "currency",
    detail: revenueRows[0] ? categoryName(revenueRows[0].category) : "No revenue file imported",
    demo: revenueDemo,
    delta: budget != null && revenue != null && budget !== 0
      ? {
          label: "vs budget",
          pct: ((revenue - budget) / Math.abs(budget)) * 100,
          amount: revenue - budget,
          sentiment: "up-good",
        }
      : lastYear != null && revenue != null && lastYear !== 0
        ? {
            label: "vs last year",
            pct: ((revenue - lastYear) / Math.abs(lastYear)) * 100,
            amount: revenue - lastYear,
            sentiment: "up-good",
          }
        : undefined,
  });

  if (budget != null && revenue != null && budget !== 0) {
    kpis.push({
      id: "to-budget",
      label: "Revenue to budget",
      value: (revenue / Math.abs(budget)) * 100,
      format: "percent",
      detail: `${formatCurrency(revenue)} ÷ ${formatCurrency(budget)} budget`,
      demo: demo(budgetRows) || revenueDemo,
    });
  }

  if (budget != null && revenue != null) {
    kpis.push({
      id: "budget",
      label: "Versus budget",
      value: revenue - budget,
      format: "currency",
      detail: `${formatCurrency(budget)} budget`,
      demo: demo(budgetRows) || revenueDemo,
      delta: budget !== 0
        ? { label: "variance", pct: ((revenue - budget) / Math.abs(budget)) * 100, sentiment: "up-good" }
        : undefined,
    });
  }

  if (lastYear != null && revenue != null && lastYear !== 0) {
    kpis.push({
      id: "to-ly",
      label: "Revenue to last year",
      value: (revenue / Math.abs(lastYear)) * 100,
      format: "percent",
      detail: `${formatCurrency(revenue)} ÷ ${formatCurrency(lastYear)} last year`,
      demo: demo(lastYearRows) || revenueDemo,
    });
  }

  if (lastYear != null && revenue != null) {
    kpis.push({
      id: "last-year",
      label: "Versus last year",
      value: revenue - lastYear,
      format: "currency",
      detail: `${formatCurrency(lastYear)} last year`,
      demo: demo(lastYearRows) || revenueDemo,
      delta: lastYear !== 0
        ? { label: "change", pct: ((revenue - lastYear) / Math.abs(lastYear)) * 100, sentiment: "up-good" }
        : undefined,
    });
  }

  const unitRows = pick(filtered, "units", "actual", ["celerant", "other"]);
  const units = unitRows.length ? sum(unitRows) : null;
  if (units != null) {
    kpis.push({
      id: "units",
      label: "Units sold",
      value: units,
      format: "number",
      demo: demo(unitRows),
    });
  }
  if (revenue != null && units) {
    kpis.push({
      id: "asp",
      label: "Avg selling price",
      value: revenue / units,
      format: "currency",
      detail: "Revenue divided by units",
      demo: revenueDemo || demo(unitRows),
    });
  }

  const transactionRows = pick(filtered, "transactions", "actual", ["celerant", "other"]);
  const transactionTotal = transactionRows.length ? sum(transactionRows) : null;
  if (transactionTotal != null) {
    kpis.push({
      id: "transactions",
      label: "Transactions",
      value: transactionTotal,
      format: "number",
      demo: demo(transactionRows),
    });
  }
  const receiptRows = pick(filtered, "receipt_lines", "actual", ["celerant", "other"]);
  if (receiptRows.length) {
    kpis.push({
      id: "receipts",
      label: "Receipt lines",
      value: sum(receiptRows),
      format: "number",
      demo: demo(receiptRows),
      caution: "Counted on department rows. This is not a unique transaction or customer total.",
    });
  }

  const donorRows = pick(filtered, "donors", "actual", ["celerant", "other"]);
  const donors = donorRows.length ? sum(donorRows) : null;
  if (donors != null) {
    kpis.push({ id: "donors", label: "Donors", value: donors, format: "number", demo: demo(donorRows) });
  }
  if (revenue != null && transactionTotal) {
    kpis.push({
      id: "rpt",
      label: "Revenue per transaction",
      value: revenue / transactionTotal,
      format: "currency",
      detail: "Revenue ÷ transactions. Same figure as revenue per customer.",
      demo: revenueDemo || demo(transactionRows),
    });
  }
  if (revenue != null && donors) {
    kpis.push({
      id: "rpd",
      label: "Revenue per donor",
      value: revenue / donors,
      format: "currency",
      detail: "Revenue ÷ donors",
      demo: revenueDemo || demo(donorRows),
    });
  }
  const roundupRows = pick(filtered, "roundup", "actual", ["celerant", "other"]);
  const priorRoundupRows = pick(prior.rows, "roundup", "actual", ["celerant", "other"]);
  const roundupAmount = roundupRows.length ? sum(roundupRows) : null;
  const priorRoundup = priorRoundupRows.length ? sum(priorRoundupRows) : null;
  if (roundupAmount != null) {
    kpis.push({
      id: "roundup",
      label: "Round-up amount",
      value: roundupAmount,
      format: "currency",
      detail: priorRoundup != null && prior.label ? `${formatCurrency(priorRoundup)} in ${prior.label}` : "Dollar amount of round-up donations",
      demo: demo(roundupRows),
      delta: versusLastYear(roundupAmount, priorRoundup, prior.label),
    });
  }
  const roundupCountRows = pick(filtered, "roundup_count", "actual", ["celerant", "other"]);
  const priorRoundupCountRows = pick(prior.rows, "roundup_count", "actual", ["celerant", "other"]);
  const roundupCount = roundupCountRows.length ? sum(roundupCountRows) : null;
  const priorRoundupCount = priorRoundupCountRows.length ? sum(priorRoundupCountRows) : null;
  if (roundupCount != null) {
    kpis.push({
      id: "roundup-count",
      label: "Round-up donations",
      value: roundupCount,
      format: "number",
      detail: priorRoundupCount != null && prior.label ? `${formatNumber(priorRoundupCount)} in ${prior.label}` : "How many round-up donations were made",
      demo: demo(roundupCountRows),
      delta: versusLastYear(roundupCount, priorRoundupCount, prior.label),
    });
  }
  const employeeReceiptRows = pick(filtered, "employee_receipts", "actual", ["celerant", "other"]);
  const priorReceiptRows = pick(prior.rows, "employee_receipts", "actual", ["celerant", "other"]);
  const employeeReceipts = employeeReceiptRows.length ? sum(employeeReceiptRows) : null;
  const priorReceipts = priorReceiptRows.length ? sum(priorReceiptRows) : null;
  const roundupPercent = roundupCount != null && employeeReceipts ? (roundupCount / employeeReceipts) * 100 : null;
  const priorRoundupPercent = priorRoundupCount != null && priorReceipts ? (priorRoundupCount / priorReceipts) * 100 : null;
  if (roundupPercent != null) {
    kpis.push({
      id: "roundup-pct",
      label: "Round-up %",
      value: roundupPercent,
      format: "percent",
      detail: priorRoundupPercent != null && prior.label
        ? `${formatPercent(priorRoundupPercent)} in ${prior.label}. Donations ÷ employee receipts.`
        : "Round-up donations ÷ employee receipts. Not an average of the percent column.",
      demo: demo(roundupCountRows) || demo(employeeReceiptRows),
      delta: versusLastYear(roundupPercent, priorRoundupPercent, prior.label),
    });
  }
  if (employeeReceipts != null) {
    kpis.push({
      id: "employee-receipts",
      label: "Employee receipts",
      value: employeeReceipts,
      format: "number",
      detail: "From the employee report. Not added to department receipt lines.",
      demo: demo(employeeReceiptRows),
    });
  }

  if (payroll != null) {
    kpis.push({
      id: "payroll",
      label: "Payroll",
      value: payroll,
      format: "currency",
      detail: payrollHours != null ? `${formatNumber(payrollHours, 1)} hours` : categoryName(payrollRows[0].category),
      demo: demo(payrollRows),
    });
  }
  if (laborPercent != null) {
    kpis.push({
      id: "labor",
      label: "Labor %",
      value: laborPercent,
      format: "percent",
      detail: "Payroll dollars ÷ store revenue",
      demo: demo(payrollRows) || revenueDemo,
    });
  }
  if (overtimeRows.length && payrollHours) {
    const overtime = sum(overtimeRows);
    kpis.push({
      id: "overtime",
      label: "Overtime share",
      value: (overtime / (payrollHours + overtime)) * 100,
      format: "percent",
      detail: `${formatNumber(overtime, 1)} overtime hours`,
      demo: demo(overtimeRows),
    });
  }

  const ecomRows = pick(filtered, "ecommerce_revenue", "actual", ["upright", "other"]);
  const ecomGoalRows = pick(filtered, "ecommerce_revenue", "goal", ["upright", "other"]);
  const ecomBudgetRows = pick(filtered, "ecommerce_revenue", "budget", ["upright", "other"]);
  const sentRows = pick(filtered, "items_sent", "actual", ["upright", "other"]);
  const sentGoalRows = pick(filtered, "items_sent", "goal", ["upright", "other"]);
  const rackRows = pick(filtered, "racks", "actual", ["workplace", "other"]);
  const ecom = ecomRows.length ? sum(ecomRows) : null;
  const ecomGoal = ecomGoalRows.length ? sum(ecomGoalRows) : null;
  if (ecom != null) {
    kpis.push({
      id: "ecommerce",
      label: "Ecommerce revenue",
      value: ecom,
      format: "currency",
      detail: ecomGoal != null ? `${formatCurrency(ecomGoal)} goal` : "Not included in store revenue",
      demo: demo(ecomRows) || demo(ecomGoalRows),
      delta: ecomGoal
        ? { label: "vs goal", pct: ((ecom - ecomGoal) / Math.abs(ecomGoal)) * 100, sentiment: "up-good" }
        : undefined,
    });
  }

  const expenseRows = pick(filtered, "expense", "actual", ["financial", "other"]);
  const netRows = pick(filtered, "net_income", "actual", ["financial", "other"]);
  if (expenseRows.length) {
    kpis.push({
      id: "expense",
      label: "Expenses",
      value: sum(expenseRows),
      format: "currency",
      detail: "From financial reporting",
      demo: demo(expenseRows),
    });
  }
  if (netRows.length) {
    kpis.push({
      id: "net",
      label: "Net income",
      value: sum(netRows),
      format: "currency",
      detail: "From financial reporting",
      demo: demo(netRows),
    });
  }

  if (revenue != null && store.squareFeet) {
    kpis.push({
      id: "sqft",
      label: "Revenue / sq ft",
      value: revenue / store.squareFeet,
      format: "currency",
      detail: `${formatNumber(store.squareFeet)} sq ft. Revenue for this period ÷ selling area. Not a full-year rate.`,
      demo: revenueDemo,
    });
  }

  const dates = filtered.map((row) => row.period_date).filter((date): date is string => Boolean(date)).sort();
  const importedDates = allRows.map((row) => row.period_date).filter((date): date is string => Boolean(date)).sort();
  const rangeLabel =
    options.from && options.to ? formatRange(options.from, options.to) : dates.length ? formatRange(dates[0], dates[dates.length - 1]) : "No dated rows";
  const attention = buildAttention({
    revenue,
    budget,
    lastYear,
    laborPercent,
    payroll,
    series: revenueSeries,
    ecom,
    ecomGoal,
    net: netRows.length ? sum(netRows) : null,
  });

  const demoFlags = imported.map((upload) => upload.isDemo);
  const demoShare = demoFlags.length === 0 ? "none" : demoFlags.every(Boolean) ? "all" : demoFlags.some(Boolean) ? "partial" : "none";

  return {
    store,
    filter: { from: options.from ?? null, to: options.to ?? null },
    rangeLabel,
    months: months.map((id) => ({ id, label: formatMonth(id) })),
    freshness: {
      hasData: imported.length > 0,
      lastImportedAt: imported.reduce<string | null>((latest, upload) => {
        if (!upload.importedAt) return latest;
        if (!latest || upload.importedAt > latest) return upload.importedAt;
        return latest;
      }, null),
      periodStart: importedDates[0] ?? null,
      periodEnd: importedDates[importedDates.length - 1] ?? null,
      demoShare,
    },
    coverage: buildCoverage(uploads),
    kpis,
    notices,
    attention,
    revenueSeries: revenueSeries.points,
    revenueGrain: revenueSeries.grain,
    departments,
    hours: buildHours(revenueRows, unitRows, transactionRows, receiptRows),
    labor: labor.periods,
    laborDepartments: labor.departments,
    ecommerce: buildEcommerce(filtered),
    employees: buildEmployees(filtered, prior.rows),
    comparisonNote: prior.rows.length && prior.label
      ? priorRevenueRows.length
        ? `Compared with ${prior.label}.`
        : `Round-up is compared with ${prior.label}. Sales for that same period are not in the imported revenue file.`
      : null,
    scorecard: buildScorecard({
      roundupPercent,
      priorRoundupPercent,
      comparisonLabel: prior.label,
      revenueToLastYear: lastYear != null && revenue != null && lastYear !== 0 ? (revenue / Math.abs(lastYear)) * 100 : null,
      revenueToBudget: budget != null && revenue != null && budget !== 0 ? (revenue / Math.abs(budget)) * 100 : null,
      itemsSent: sentRows.length ? sum(sentRows) : null,
      itemsSentGoal: sentGoalRows.length ? sum(sentGoalRows) : null,
      ecommerceRevenue: ecom,
      ecommerceBudget: ecomBudgetRows.length ? sum(ecomBudgetRows) : ecomGoal,
      racks: rackRows.length ? sum(rackRows) : null,
      laborPercent,
      storeAssessment: assessmentValue(filtered, /store assessment/),
      dmAssessment: assessmentValue(filtered, /dm assessment|district assessment/),
    }),
    production: buildProduction(filtered),
    financial: buildFinancial(filtered),
    otherMetrics: buildOther(filtered),
    donorRows: waterburyDonors(store.code, options.from, options.to),
    ecommRows: waterburyEcomm(store.code, options.from, options.to),
    monthsTable: buildMonths(filtered, revenueRows, unitRows, roundupRows, roundupCountRows, employeeReceiptRows, priorRoundupRows, priorRoundupCountRows, priorReceiptRows, payrollRows, expenseRows, netRows, store.squareFeet),
  };
}

export function getOverview(): OverviewCard[] {
  return listStores().map((store) => {
    const dashboard = buildDashboard(store);
    const revenue = dashboard.kpis.find((kpi) => kpi.id === "revenue");
    return {
      store,
      revenue: revenue?.value ?? null,
      rangeLabel: dashboard.rangeLabel,
      lastImportedAt: dashboard.freshness.lastImportedAt,
      demoShare: dashboard.freshness.demoShare,
      hasData: dashboard.freshness.hasData,
      coverage: dashboard.coverage.map((item) => ({ category: item.category, ready: item.imported > 0 })),
      spark: dashboard.revenueSeries.slice(-36).map((point) => point.revenue),
    };
  });
}

function buildCoverage(uploads: ReturnType<typeof listUploads>): Coverage[] {
  return CATEGORIES.map((category) => {
    const rows = uploads.filter((upload) => upload.category === category.id);
    const imported = rows.filter((upload) => upload.status === "imported");
    const flags = imported.map((upload) => upload.isDemo);
    return {
      category: category.id,
      uploads: rows.length,
      imported: imported.length,
      pending: rows.filter((upload) => upload.status === "pending_review").length,
      failed: rows.filter((upload) => upload.status === "failed").length,
      lastImportedAt: imported.reduce<string | null>((latest, upload) => {
        if (!upload.importedAt) return latest;
        return !latest || upload.importedAt > latest ? upload.importedAt : latest;
      }, null),
      demo: flags.length === 0 ? "none" : flags.every(Boolean) ? "all" : flags.some(Boolean) ? "partial" : "none",
    };
  });
}

function buildAttention(input: {
  revenue: number | null;
  budget: number | null;
  lastYear: number | null;
  laborPercent: number | null;
  payroll: number | null;
  series: { points: { revenue: number }[]; grain: "day" | "month" | "none" };
  ecom: number | null;
  ecomGoal: number | null;
  net: number | null;
}): Attention[] {
  const items: Attention[] = [];
  if (input.budget != null && input.revenue != null && input.budget !== 0) {
    const pct = ((input.revenue - input.budget) / Math.abs(input.budget)) * 100;
    items.push({
      tone: pct < -3 ? "warn" : pct > 3 ? "good" : "info",
      title: pct < -3 ? "Revenue is behind budget" : pct > 3 ? "Revenue is ahead of budget" : "Revenue is close to budget",
      detail: `${formatSignedPercent(pct)} (${formatCurrency(input.revenue - input.budget)}) for the selected period.`,
    });
  }
  if (input.lastYear != null && input.revenue != null && input.lastYear !== 0) {
    const pct = ((input.revenue - input.lastYear) / Math.abs(input.lastYear)) * 100;
    items.push({
      tone: pct < -3 ? "warn" : pct > 3 ? "good" : "info",
      title: pct < -3 ? "Revenue is behind last year" : pct > 3 ? "Revenue is ahead of last year" : "Revenue is close to last year",
      detail: `${formatSignedPercent(pct)} compared with ${formatCurrency(input.lastYear)}.`,
    });
  }
  if (input.laborPercent != null) {
    items.push({
      tone: input.laborPercent >= 35 ? "warn" : "good",
      title: input.laborPercent >= 35 ? "Labor share is elevated" : "Labor share is within the review line",
      detail: `Labor is ${formatPercent(input.laborPercent)} of revenue. Labor at or above 35% of revenue is flagged for review.`,
    });
  }
  if (input.ecom != null && input.ecomGoal) {
    const pct = ((input.ecom - input.ecomGoal) / Math.abs(input.ecomGoal)) * 100;
    items.push({
      tone: pct < -2 ? "warn" : "good",
      title: pct < -2 ? "Ecommerce is short of goal" : "Ecommerce is at or above goal",
      detail: `${formatCurrency(input.ecom)} versus a ${formatCurrency(input.ecomGoal)} goal.`,
    });
  }
  if (input.net != null && input.net < 0) {
    items.push({
      tone: "warn",
      title: "Net income is negative",
      detail: `${formatCurrency(input.net)} on the imported P&L for this period.`,
    });
  }
  if (input.series.grain === "day" && input.series.points.length >= 14) {
    const mid = Math.floor(input.series.points.length / 2);
    const first = input.series.points.slice(0, mid).reduce((total, point) => total + point.revenue, 0);
    const second = input.series.points.slice(mid).reduce((total, point) => total + point.revenue, 0);
    if (first > 0) {
      const change = ((second - first) / first) * 100;
      if (Math.abs(change) >= 8) {
        items.push({
          tone: change < 0 ? "warn" : "good",
          title: change < 0 ? "Revenue slowed in the second half" : "Revenue strengthened in the second half",
          detail: `The second half of this period is ${formatSignedPercent(change)} versus the first half.`,
        });
      }
    }
  }
  const order = { warn: 0, info: 1, good: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}

function buildRevenueSeries(actual: GroupRow[], budget: GroupRow[], lastYear: GroupRow[]) {
  const dailyActual = actual.filter((row) => row.grain === "detail" || row.grain === "hour" || row.grain === "day");
  const useDaily = dailyActual.length > 0;
  const grain = useDaily ? "day" : actual.some((row) => row.grain === "month") ? "month" : "none";
  const source = useDaily ? dailyActual : actual.filter((row) => row.grain === "month");
  const budgetSource = budget.filter((row) => (useDaily ? row.grain !== "month" && row.grain !== "period" : row.grain === "month"));
  const lySource = lastYear.filter((row) => (useDaily ? row.grain !== "month" && row.grain !== "period" : row.grain === "month"));
  const dates = [...new Set(source.map((row) => row.period_date).filter((date): date is string => Boolean(date)))].sort();
  const points = dates.map((date) => ({
    date,
    revenue: sum(source.filter((row) => row.period_date === date)),
    budget: budgetSource.some((row) => row.period_date === date) ? sum(budgetSource.filter((row) => row.period_date === date)) : null,
    lastYear: lySource.some((row) => row.period_date === date) ? sum(lySource.filter((row) => row.period_date === date)) : null,
  }));
  return { points, grain: grain as "day" | "month" | "none" };
}

function buildDepartments(
  rows: GroupRow[],
  category?: string,
  descriptionRows: { metric: string; dim1: string; dim2: string; value: number }[] = [],
) {
  const source = rows.filter(
    (row) => row.metric === "revenue" && row.comparison === "actual" && row.dim1 && (!category || row.category === category),
  );
  const units = rows.filter(
    (row) => row.metric === "units" && row.comparison === "actual" && row.dim1 && (!category || row.category === category),
  );
  const names = [...new Set(source.map((row) => row.dim1))];
  const ranked = names
    .map((name) => {
      const descriptions = buildDescriptionBreakdown(descriptionRows, name);
      return {
        name,
        revenue: sum(source.filter((row) => row.dim1 === name)),
        units: sum(units.filter((row) => row.dim1 === name)),
        descriptions,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  return ranked;
}

function collapseDepartments(ranked: ReturnType<typeof buildDepartments>) {
  if (ranked.length <= 8) return ranked;
  const top = ranked.slice(0, 8);
  const rest = ranked.slice(8);
  top.push({
    name: "Other departments",
    revenue: rest.reduce((total, item) => total + item.revenue, 0),
    units: rest.reduce((total, item) => total + item.units, 0),
    descriptions: rest.flatMap((item) =>
      item.descriptions.length
        ? item.descriptions.map((line) => ({ ...line, name: `${item.name} · ${line.name}` }))
        : [{ name: item.name, revenue: item.revenue, units: item.units }],
    ),
  });
  return top;
}

function buildDescriptionBreakdown(
  rows: { metric: string; dim1: string; dim2: string; value: number }[],
  department: string,
) {
  const revenue = rows.filter((row) => row.metric === "revenue" && row.dim1 === department && row.dim2);
  const units = rows.filter((row) => row.metric === "units" && row.dim1 === department && row.dim2);
  const names = [...new Set(revenue.map((row) => row.dim2))];
  return names
    .map((name) => ({
      name: shortenDescription(name, department),
      revenue: revenue.filter((row) => row.dim2 === name).reduce((total, row) => total + row.value, 0),
      units: units.filter((row) => row.dim2 === name).reduce((total, row) => total + row.value, 0),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Drop the repeated department prefix from Celerant description labels when present. */
function shortenDescription(description: string, department: string) {
  const trimmed = description.trim();
  const prefix = `${department} - `;
  if (trimmed.toUpperCase().startsWith(prefix.toUpperCase())) {
    return trimmed.slice(prefix.length).trim() || trimmed;
  }
  if (trimmed.toUpperCase() === department.toUpperCase()) return trimmed;
  return trimmed;
}

function buildHours(revenueRows: GroupRow[], unitRows: GroupRow[], transactionRows: GroupRow[], receiptRows: GroupRow[]) {
  const hours = [...new Set([...revenueRows, ...unitRows, ...transactionRows, ...receiptRows].map((row) => row.hour).filter((hour): hour is number => hour != null))].sort((a, b) => a - b);
  return hours.map((hour) => ({
    hour,
    revenue: sum(revenueRows.filter((row) => row.hour === hour)),
    units: sum(unitRows.filter((row) => row.hour === hour)),
    transactions: sum(transactionRows.filter((row) => row.hour === hour)),
    receipts: sum(receiptRows.filter((row) => row.hour === hour)),
  }));
}

function buildScorecard(input: {
  roundupPercent: number | null;
  priorRoundupPercent: number | null;
  comparisonLabel: string | null;
  revenueToLastYear: number | null;
  revenueToBudget: number | null;
  itemsSent: number | null;
  itemsSentGoal: number | null;
  ecommerceRevenue: number | null;
  ecommerceBudget: number | null;
  racks: number | null;
  laborPercent: number | null;
  storeAssessment: number | null;
  dmAssessment: number | null;
}) {
  const sentToGoal = input.itemsSent != null && input.itemsSentGoal ? (input.itemsSent / Math.abs(input.itemsSentGoal)) * 100 : null;
  const ecomToBudget = input.ecommerceRevenue != null && input.ecommerceBudget ? (input.ecommerceRevenue / Math.abs(input.ecommerceBudget)) * 100 : null;
  return [
    { id: "roundup-pct", label: "Round-up %", source: "Celerant", value: input.roundupPercent, format: "percent" as const, detail: input.priorRoundupPercent != null && input.comparisonLabel ? `${formatPercent(input.priorRoundupPercent)} in ${input.comparisonLabel}` : "Donations ÷ employee receipts" },
    { id: "to-ly", label: "Revenue to last year", source: "Celerant", value: input.revenueToLastYear, format: "percent" as const, detail: "Revenue ÷ last year" },
    { id: "to-budget", label: "Revenue to budget", source: "Celerant", value: input.revenueToBudget, format: "percent" as const, detail: "Revenue ÷ budget" },
    { id: "sent-goal", label: "Items sent to goal", source: "Upright Labs", value: sentToGoal, format: "percent" as const, detail: "Items sent ÷ goal" },
    { id: "ecom-budget", label: "Ecommerce to budget", source: "Upright Labs", value: ecomToBudget, format: "percent" as const, detail: "Ecommerce revenue ÷ budget" },
    { id: "racks", label: "Rack production", source: "GW Work Place", value: input.racks, format: "number" as const, detail: "Racks logged" },
    { id: "labor", label: "Labor %", source: "ADP", value: input.laborPercent, format: "percent" as const, detail: "Payroll dollars ÷ store revenue" },
    { id: "store-assessment", label: "Store assessment", source: "Assessment", value: input.storeAssessment, format: "score" as const, detail: "Score, not a dollar total" },
    { id: "dm-assessment", label: "DM assessment", source: "Assessment", value: input.dmAssessment, format: "score" as const, detail: "Score, not a dollar total" },
    { id: "staffing", label: "Staffing", source: "Staffing", value: null, format: "percent" as const, detail: "Filled ÷ target. The line to clear is 95%." },
    { id: "cross-training", label: "Cross training", source: "Staffing", value: null, format: "percent" as const, detail: "Share of staff cross-trained" },
  ];
}

function assessmentValue(rows: GroupRow[], pattern: RegExp) {
  const matched = rows.filter((row) => row.metric.startsWith("custom:") && row.comparison === "actual" && pattern.test(row.metric));
  if (!matched.length) return null;
  return sum(matched) / matched.length;
}

function buildLabor(rows: GroupRow[], revenueRows: GroupRow[]) {
  const payroll = pick(rows, "payroll_dollars", "actual", ["adp", "financial", "other"]);
  const hours = pick(rows, "payroll_hours", "actual", ["adp", "other"]);
  const departments = [...new Set(payroll.map((row) => row.dim1).filter(Boolean))].map((name) => ({
    name,
    payroll: sum(payroll.filter((row) => row.dim1 === name)),
    hours: sum(hours.filter((row) => row.dim1 === name)),
  }));

  const buckets = new Map<string, { payroll: number; hours: number; revenue: number }>();
  const add = (period: string, field: "payroll" | "hours" | "revenue", value: number) => {
    const bucket = buckets.get(period) ?? { payroll: 0, hours: 0, revenue: 0 };
    bucket[field] += value;
    buckets.set(period, bucket);
  };
  for (const row of payroll) {
    if (!row.period_date) continue;
    add(row.grain === "week" || row.grain === "month" ? row.period_date : weekStart(row.period_date), "payroll", row.value);
  }
  for (const row of hours) {
    if (!row.period_date) continue;
    add(row.grain === "week" || row.grain === "month" ? row.period_date : weekStart(row.period_date), "hours", row.value);
  }
  for (const row of revenueRows) {
    if (!row.period_date) continue;
    if (row.grain === "month") continue;
    add(weekStart(row.period_date), "revenue", row.value);
  }
  const periods = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, bucket]) => ({
      period,
      payroll: bucket.payroll,
      hours: bucket.hours,
      revenue: bucket.revenue || null,
      laborPercent: bucket.revenue ? (bucket.payroll / bucket.revenue) * 100 : null,
    }));
  return { periods, departments };
}

function buildEmployees(rows: GroupRow[], priorRows: GroupRow[]) {
  const receipts = rows.filter((row) => row.metric === "employee_receipts" && row.comparison === "actual" && row.dim1);
  const counts = rows.filter((row) => row.metric === "roundup_count" && row.comparison === "actual" && row.dim1);
  const amounts = rows.filter((row) => row.metric === "roundup" && row.comparison === "actual" && row.dim1);
  const priorAmounts = priorRows.filter((row) => row.metric === "roundup" && row.comparison === "actual" && row.dim1);
  const names = [...new Set([...receipts, ...counts, ...amounts].map((row) => row.dim1))];
  return names
    .map((name) => {
      const lastYear = priorAmounts.filter((row) => row.dim1 === name);
      return {
        name,
        receipts: sum(receipts.filter((row) => row.dim1 === name)),
        roundupCount: sum(counts.filter((row) => row.dim1 === name)),
        roundup: sum(amounts.filter((row) => row.dim1 === name)),
        roundupLastYear: lastYear.length ? sum(lastYear) : null,
      };
    })
    .sort((a, b) => b.roundup - a.roundup || b.roundupCount - a.roundupCount || a.name.localeCompare(b.name));
}

function buildEcommerce(rows: GroupRow[]) {
  const sent = pick(rows, "items_sent", "actual", ["upright", "other"]);
  const sold = pick(rows, "items_sold", "actual", ["upright", "other"]);
  const revenue = pick(rows, "ecommerce_revenue", "actual", ["upright", "other"]);
  const goal = pick(rows, "ecommerce_revenue", "goal", ["upright", "other"]);
  const dates = [...new Set([...sent, ...sold, ...revenue, ...goal].map((row) => row.period_date).filter((date): date is string => Boolean(date)))];
  const weekly = new Map<string, { sent: number; sold: number; revenue: number; goal: number; hasGoal: boolean }>();
  for (const date of dates) {
    const key = weekStart(date);
    const bucket = weekly.get(key) ?? { sent: 0, sold: 0, revenue: 0, goal: 0, hasGoal: false };
    bucket.sent += sum(sent.filter((row) => row.period_date === date));
    bucket.sold += sum(sold.filter((row) => row.period_date === date));
    bucket.revenue += sum(revenue.filter((row) => row.period_date === date));
    const goalRows = goal.filter((row) => row.period_date === date);
    if (goalRows.length) {
      bucket.goal += sum(goalRows);
      bucket.hasGoal = true;
    }
    weekly.set(key, bucket);
  }
  return [...weekly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, bucket]) => ({
      period,
      sent: bucket.sent,
      sold: bucket.sold,
      revenue: bucket.revenue,
      goal: bucket.hasGoal ? bucket.goal : null,
    }));
}

function buildProduction(rows: GroupRow[]) {
  const racks = pick(rows, "racks", "actual", ["workplace", "other"]);
  const totes = pick(rows, "totes", "actual", ["workplace", "other"]);
  const units = pick(rows, "production_units", "actual", ["workplace", "other"]);
  const dates = [...new Set([...racks, ...totes, ...units].map((row) => row.period_date).filter((date): date is string => Boolean(date)))];
  const weekly = new Map<string, { racks: number; totes: number; units: number }>();
  for (const date of dates) {
    const key = weekStart(date);
    const bucket = weekly.get(key) ?? { racks: 0, totes: 0, units: 0 };
    bucket.racks += sum(racks.filter((row) => row.period_date === date));
    bucket.totes += sum(totes.filter((row) => row.period_date === date));
    bucket.units += sum(units.filter((row) => row.period_date === date));
    weekly.set(key, bucket);
  }
  return [...weekly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, bucket]) => ({ period, ...bucket }));
}

function buildFinancial(rows: GroupRow[]) {
  const financial = rows.filter((row) => row.category === "financial");
  const months = [...new Set(financial.map((row) => (row.period_date ? monthKey(row.period_date) : "")).filter(Boolean))].sort();
  return months.map((month) => {
    const inMonth = (metric: string) =>
      financial.filter((row) => row.metric === metric && row.comparison === "actual" && row.period_date?.startsWith(month));
    const revenue = inMonth("revenue");
    const expense = inMonth("expense");
    const net = inMonth("net_income");
    return {
      period: month,
      revenue: revenue.length ? sum(revenue) : null,
      expense: expense.length ? sum(expense) : null,
      net: net.length ? sum(net) : null,
    };
  });
}

function buildOther(rows: GroupRow[]) {
  const custom = rows.filter((row) => row.metric.startsWith("custom:") && row.comparison === "actual");
  const metrics = [...new Set(custom.map((row) => row.metric))];
  return metrics.map((metric) => {
    const matched = custom.filter((row) => row.metric === metric);
    const average = /score|percent|pct|rate/.test(metric);
    const value = average ? sum(matched) / matched.length : sum(matched);
    return { metric, label: metricLabel(metric), value, demo: demo(matched) };
  });
}

function buildMonths(
  rows: GroupRow[],
  revenueRows: GroupRow[],
  unitRows: GroupRow[],
  roundupRows: GroupRow[],
  roundupCountRows: GroupRow[],
  employeeReceiptRows: GroupRow[],
  priorRoundupRows: GroupRow[],
  priorRoundupCountRows: GroupRow[],
  priorReceiptRows: GroupRow[],
  payrollRows: GroupRow[],
  expenseRows: GroupRow[],
  netRows: GroupRow[],
  squareFeet: number | null,
) {
  const months = [...new Set(rows.map((row) => (row.period_date ? monthKey(row.period_date) : "")).filter(Boolean))].sort();
  return months.map((month) => {
    const within = (list: GroupRow[]) => list.filter((row) => row.period_date?.startsWith(month));
    const revenue = within(revenueRows);
    const units = within(unitRows);
    const roundup = within(roundupRows);
    const roundupCount = within(roundupCountRows);
    const receipts = within(employeeReceiptRows);
    const payroll = within(payrollRows);
    const expense = within(expenseRows);
    const net = within(netRows);
    const revenueTotal = revenue.length ? sum(revenue) : null;
    const payrollTotal = payroll.length ? sum(payroll) : null;
    const count = roundupCount.length ? sum(roundupCount) : null;
    const receiptTotal = receipts.length ? sum(receipts) : null;
    const lastKey = shiftYears(`${month}-01`, -1).slice(0, 7);
    const priorRoundup = priorRoundupRows.filter((row) => row.period_date?.startsWith(lastKey));
    const priorCount = priorRoundupCountRows.filter((row) => row.period_date?.startsWith(lastKey));
    const priorReceipt = priorReceiptRows.filter((row) => row.period_date?.startsWith(lastKey));
    const priorCountTotal = priorCount.length ? sum(priorCount) : null;
    const priorReceiptTotal = priorReceipt.length ? sum(priorReceipt) : null;
    return {
      month,
      label: formatMonth(month),
      revenue: revenueTotal,
      units: units.length ? sum(units) : null,
      revenuePerSqFt: revenueTotal != null && squareFeet ? revenueTotal / squareFeet : null,
      roundup: roundup.length ? sum(roundup) : null,
      roundupLastYear: priorRoundup.length ? sum(priorRoundup) : null,
      roundupPercent: count != null && receiptTotal ? (count / receiptTotal) * 100 : null,
      roundupPercentLastYear: priorCountTotal != null && priorReceiptTotal ? (priorCountTotal / priorReceiptTotal) * 100 : null,
      payroll: payrollTotal,
      laborPercent: revenueTotal && payrollTotal ? (payrollTotal / revenueTotal) * 100 : null,
      expense: expense.length ? sum(expense) : null,
      net: net.length ? sum(net) : null,
    };
  });
}

function priorYear(rows: GroupRow[], from?: string | null, to?: string | null) {
  if (!from || !to) return { rows: [] as GroupRow[], label: null as string | null };
  const priorFrom = shiftYears(from, -1);
  const priorTo = shiftYears(to, -1);
  if (priorFrom <= to && priorTo >= from) return { rows: [] as GroupRow[], label: null as string | null };
  const matched = applyFinest(rows.filter((row) => inRange(row, priorFrom, priorTo)));
  const sameMonth = priorFrom.slice(0, 7) === priorTo.slice(0, 7) && priorFrom.endsWith("-01") && priorTo === monthEnd(priorFrom);
  const sameYear = priorFrom.endsWith("-01-01") && priorTo.endsWith("-12-31") && priorFrom.slice(0, 4) === priorTo.slice(0, 4);
  const label = sameMonth ? formatMonth(priorFrom.slice(0, 7)) : sameYear ? priorFrom.slice(0, 4) : formatRange(priorFrom, priorTo);
  return { rows: matched, label };
}

function versusLastYear(current: number, prior: number | null, label: string | null) {
  if (prior == null || prior === 0 || !label) return undefined;
  return {
    label: `vs ${label}`,
    pct: ((current - prior) / Math.abs(prior)) * 100,
    amount: current - prior,
    sentiment: "up-good" as const,
  };
}

function overlapNotices(uploads: ReturnType<typeof listUploads>) {
  const notices: string[] = [];
  const groups = new Map<string, typeof uploads>();
  for (const upload of uploads) {
    if (!upload.periodStart || !upload.periodEnd) continue;
    const list = groups.get(upload.category) ?? [];
    list.push(upload);
    groups.set(upload.category, list);
  }
  for (const [category, list] of groups) {
    let overlaps = false;
    for (let i = 0; i < list.length && !overlaps; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const samePeriod = a.periodStart! <= b.periodEnd! && b.periodStart! <= a.periodEnd!;
        if (samePeriod && sharesMetric(a, b)) overlaps = true;
      }
    }
    if (overlaps) {
      notices.push(
        `${categoryName(category)} has more than one file for the same metric and dates. Matching rows use the newest file. If a day also has line-level sales, those lines are used instead of a daily total so the day is not counted twice.`,
      );
    }
  }
  return notices;
}

function sharesMetric(a: ReturnType<typeof listUploads>[number], b: ReturnType<typeof listUploads>[number]) {
  const left = metricKeys(a);
  for (const key of metricKeys(b)) {
    if (left.has(key)) return true;
  }
  return false;
}

function metricKeys(upload: ReturnType<typeof listUploads>[number]) {
  const keys = new Set<string>();
  for (const sheet of upload.mapping?.sheets ?? []) {
    if (!sheet.include) continue;
    for (const metric of sheet.metrics) keys.add(`${metric.metric}|${metric.comparison}`);
  }
  return keys;
}

function loadGrouped(storeId: string, uploadIds?: string[]) {
  return demoGrouped(storeId, uploadIds) satisfies GroupRow[];
}

function applyFinest(rows: GroupRow[]) {
  const best = new Map<string, number>();
  for (const row of rows) {
    const key = [row.category, row.metric, row.comparison, row.period_date ?? ""].join("|");
    const rank = GRAIN_RANK[row.grain] ?? 9;
    const current = best.get(key);
    if (current == null || rank < current) best.set(key, rank);
  }
  return rows.filter((row) => {
    const key = [row.category, row.metric, row.comparison, row.period_date ?? ""].join("|");
    return (GRAIN_RANK[row.grain] ?? 9) === best.get(key);
  });
}

function inRange(row: GroupRow, from?: string | null, to?: string | null) {
  if (!from && !to) return true;
  if (!row.period_date) return false;
  if (row.grain === "month") {
    if (!isCompleteMonths(from, to)) return false;
    const start = `${monthKey(row.period_date)}-01`;
    const end = monthEnd(start);
    if (from && from > start) return false;
    if (to && to < end) return false;
    return true;
  }
  const start = row.period_date;
  const end = row.grain === "week" ? shiftDays(start, 6) : start;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

function pick(rows: GroupRow[], metric: string, comparison: string, preference: string[]) {
  const matched = rows.filter((row) => row.metric === metric && row.comparison === comparison);
  const present = new Set(matched.map((row) => row.category));
  const category = preference.find((item) => present.has(item)) ?? [...present][0];
  if (!category) return [];
  return matched.filter((row) => row.category === category);
}

function sum(rows: GroupRow[]) {
  return rows.reduce((total, row) => total + row.value, 0);
}

function demo(rows: GroupRow[]) {
  return rows.some((row) => row.is_demo === 1);
}

function span(rows: GroupRow[]) {
  const dates = rows.map((row) => row.period_date).filter((date): date is string => Boolean(date)).sort();
  if (!dates.length) return null;
  return [dates[0], dates[dates.length - 1]] as const;
}

