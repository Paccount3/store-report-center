import { categoryName, PRESETS, type CategoryId, type PresetId } from "./catalog";
import { buildDashboard } from "./dashboard";
import { formatCurrency, formatMetric, formatNumber, formatSignedPercent } from "./format";
import type { AnalysisResult, DashboardData, Store } from "./types";

const SECTION_KPIS: Record<CategoryId, string[]> = {
  celerant: ["revenue", "sqft", "asp", "to-budget", "to-ly", "budget", "last-year", "transactions", "rpt", "units", "receipts", "roundup", "roundup-pct", "roundup-count", "employee-receipts"],
  adp: ["payroll", "labor", "overtime"],
  upright: ["ecommerce"],
  workplace: [],
  financial: ["expense", "net"],
  other: ["donors", "rpd"],
};

export function buildAnalysisContext(store: Store, sections: CategoryId[]) {
  const dashboard = buildDashboard(store);
  const selected = new Set(sections);
  const calculated = calculatedLines(dashboard, sections);
  const pack = {
    store: {
      name: store.name,
      code: store.code,
      city: store.city,
      region: store.region,
    },
    period: dashboard.rangeLabel,
    includeOnly: sections.map((id) => categoryName(id)),
    calculated,
    ...(selected.has("celerant")
      ? {
          celerant: {
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
            hourlyRevenue: dashboard.hours.map((item) => ({ hour: item.hour, revenue: round(item.revenue), units: round(item.units), receipts: round(item.receipts) })),
            months: dashboard.monthsTable.map((month, index, list) => {
              const previous = list[index - 1]?.revenue;
              const change = month.revenue != null && previous ? ((month.revenue - previous) / Math.abs(previous)) * 100 : null;
              return {
                month: month.label,
                revenue: month.revenue == null ? null : round(month.revenue),
                units: month.units == null ? null : round(month.units),
                revenuePerSqFt: month.revenuePerSqFt == null ? null : round(month.revenuePerSqFt),
                roundup: month.roundup == null ? null : round(month.roundup),
                revenueChangeVersusPriorMonthPct: change == null ? null : round(change, 1),
              };
            }),
            roundupByEmployee: dashboard.employees.map((item) => ({
              name: item.name,
              receipts: round(item.receipts),
              roundupCount: round(item.roundupCount),
              roundup: round(item.roundup),
              roundupLastYear: item.roundupLastYear == null ? null : round(item.roundupLastYear),
            })),
            checks: dashboard.attention.filter((item) => /revenue|budget|last year/i.test(item.title) && !/labor|ecommerce/i.test(item.title)),
          },
        }
      : {}),
    ...(selected.has("adp")
      ? {
          adp: {
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
            months: dashboard.monthsTable
              .filter((month) => month.payroll != null || month.laborPercent != null)
              .map((month) => ({
                month: month.label,
                payroll: month.payroll == null ? null : round(month.payroll),
                laborPercent: month.laborPercent == null ? null : round(month.laborPercent, 1),
              })),
            checks: dashboard.attention.filter((item) => /labor/i.test(item.title)),
            note: "Labor % uses store revenue as the divisor. Cite that figure only as part of the labor comparison.",
          },
        }
      : {}),
    ...(selected.has("upright")
      ? {
          upright: {
            ecommerceByWeek: dashboard.ecommerce.map((item) => ({
              weekOf: item.period,
              itemsSent: round(item.sent),
              itemsSold: round(item.sold),
              revenue: round(item.revenue),
              goal: item.goal == null ? null : round(item.goal),
            })),
            ecommerceSales: dashboard.ecommRows.map((row) => ({
              month: row.month,
              supplierName: row.supplierName,
              totalItemsSold: round(row.totalItemsSold),
              totalItemRevenue: round(row.totalItemRevenue),
              avgItemValue: round(row.avgItemValue),
              maxItemValue: round(row.maxItemValue),
              minItemValue: round(row.minItemValue),
            })),
            note: "Ecommerce revenue is not store revenue.",
            checks: dashboard.attention.filter((item) => /ecommerce/i.test(item.title)),
          },
        }
      : {}),
    ...(selected.has("workplace")
      ? {
          workplace: {
            productionByWeek: dashboard.production.map((item) => ({
              weekOf: item.period,
              racks: round(item.racks),
              totes: round(item.totes),
              units: round(item.units),
            })),
          },
        }
      : {}),
    ...(selected.has("financial")
      ? {
          financial: {
            financialByMonth: dashboard.financial.map((item) => ({
              month: item.period,
              revenue: item.revenue == null ? null : round(item.revenue),
              expense: item.expense == null ? null : round(item.expense),
              net: item.net == null ? null : round(item.net),
            })),
            note: "Financial revenue is the P&L figure. It is not added on top of Celerant store revenue.",
            checks: dashboard.attention.filter((item) => /net income/i.test(item.title)),
          },
        }
      : {}),
    ...(selected.has("other")
      ? {
          other: {
            metrics: dashboard.otherMetrics.map((item) => ({
              label: item.label,
              value: round(item.value, 2),
            })),
            donors: dashboard.donorRows.map((row) => ({
              date: row.date,
              store: row.store,
              donors: row.donors,
            })),
          },
        }
      : {}),
    sectionsWithNoImportedData: sections.filter((id) => sectionIsEmpty(id, dashboard)).map((id) => categoryName(id)),
  };

  const reportsUsed = sections.map((id) => ({
    id,
    name: categoryName(id),
    category: categoryName(id),
    period: dashboard.rangeLabel,
  }));

  return { dashboard, pack, calculated, reportsUsed, hasNumbers: sections.some((id) => !sectionIsEmpty(id, dashboard)) };
}

function sectionIsEmpty(id: CategoryId, dashboard: DashboardData) {
  if (id === "celerant") return dashboard.revenueSeries.length === 0 && dashboard.departments.length === 0 && dashboard.hours.length === 0;
  if (id === "adp") return dashboard.labor.length === 0;
  if (id === "upright") return dashboard.ecommerce.length === 0 && dashboard.ecommRows.length === 0;
  if (id === "workplace") return dashboard.production.length === 0;
  if (id === "financial") return dashboard.financial.length === 0;
  return dashboard.otherMetrics.length === 0 && dashboard.donorRows.length === 0;
}

export function calculatedLines(dashboard: DashboardData, sections: CategoryId[] = []) {
  const allowed = new Set(sections.flatMap((id) => SECTION_KPIS[id]));
  const lines = dashboard.kpis
    .filter((kpi) => kpi.value != null && (sections.length === 0 || allowed.has(kpi.id)))
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
  if (sections.includes("celerant")) {
    for (const department of dashboard.departments.slice(0, 6)) {
      lines.push({ label: `${department.name} revenue`, value: formatCurrency(department.revenue) });
    }
  }
  if (sections.includes("other") && dashboard.donorRows.length && !lines.some((line) => line.label === "Donors")) {
    const donors = dashboard.donorRows.reduce((sum, row) => sum + row.donors, 0);
    lines.push({ label: "Donors", value: formatNumber(donors) });
  }
  if (sections.includes("upright") && dashboard.ecommRows.length) {
    const items = dashboard.ecommRows.reduce((sum, row) => sum + row.totalItemsSold, 0);
    const revenue = dashboard.ecommRows.reduce((sum, row) => sum + row.totalItemRevenue, 0);
    lines.push({ label: "Ecommerce items sold", value: formatNumber(items) });
    lines.push({ label: "Ecommerce item revenue", value: formatCurrency(revenue, 2) });
  }
  if (sections.includes("workplace")) {
    const racks = dashboard.production.reduce((sum, row) => sum + row.racks, 0);
    if (racks) lines.push({ label: "Racks processed", value: formatNumber(racks) });
  }
  return lines;
}

export function insufficientAnalysis(reportsUsed: AnalysisResult["reportsUsed"], calculated: AnalysisResult["calculated"]): AnalysisResult {
  return {
    summary: "The selected sections do not contain enough imported metrics to support an analysis.",
    actionSteps: [],
    findings: [],
    gaps: ["Choose a section that has data on the dashboard, or import a report for that source."],
    reportsUsed,
    calculated,
    model: null,
  };
}

export function presetInstruction(preset: PresetId | null, question: string, sectionNames: string[] = []) {
  const selected = preset ? PRESETS.find((item) => item.id === preset) : null;
  return [
    sectionNames.length
      ? `Include only these sections: ${sectionNames.join(", ")}. Do not discuss, summarize, or suggest actions for any section that is not in that list.`
      : "No sections were selected.",
    selected ? `Preset: ${selected.label}. ${selected.instruction}` : "No preset was selected.",
    question ? `Custom question: ${question}` : "No custom question was asked.",
  ].join("\n");
}

export function systemPrompt() {
  return [
    "You are an analyst for a Goodwill retail store dashboard.",
    "You receive a JSON pack of figures that the application already calculated.",
    "The includeOnly list is the set of sections the user marked. Write the summary, action steps, and findings from those sections only. If a section is not in includeOnly, do not mention it.",
    "Use only numbers that appear in that JSON. Do not estimate, interpolate, or invent figures, dates, budgets, or causes.",
    "If a comparison is null or a category is listed as missing, say the data is not available.",
    "Separate facts from possible explanations. A fact must cite the metric, the period, and the value from the pack.",
    "Possible explanations must be labeled as interpretation and must not be stated as confirmed causes.",
    "Mention the section names from includeOnly when you rely on them. Do not mention a section that is not in that list.",
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
