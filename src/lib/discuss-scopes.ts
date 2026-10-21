export type DiscussKind = "section" | "chart";

export const DISCUSS_SCOPES: Record<string, { kind: DiscussKind; label: string }> = {
  scorecard: { kind: "section", label: "Scorecard" },
  celerant: { kind: "section", label: "Celerant Reporting" },
  "celerant-revenue": { kind: "chart", label: "Revenue" },
  "celerant-departments": { kind: "chart", label: "Departments" },
  "celerant-hour": { kind: "chart", label: "Hour of day" },
  "celerant-months": { kind: "chart", label: "By month" },
  "celerant-roundup": { kind: "chart", label: "Round-up" },
  "celerant-donors": { kind: "chart", label: "Donors" },
  "celerant-ecomm": { kind: "chart", label: "Ecommerce sales" },
  adp: { kind: "section", label: "ADP Reporting" },
  "adp-labor": { kind: "chart", label: "Labor" },
  upright: { kind: "section", label: "Upright Labs Reporting" },
  "upright-chart": { kind: "chart", label: "Ecommerce" },
  workplace: { kind: "section", label: "GW Work Place Reporting" },
  "workplace-chart": { kind: "chart", label: "Production" },
  financial: { kind: "section", label: "Financial / P&L Reporting" },
  "financial-pl": { kind: "chart", label: "P&L by month" },
  other: { kind: "section", label: "Other / Manual Reporting" },
};

export function discussScope(id: string) {
  return DISCUSS_SCOPES[id] ?? null;
}
