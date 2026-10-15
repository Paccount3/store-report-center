import type { CategoryId, Comparison } from "./catalog";

export type Store = {
  id: string;
  name: string;
  code: string;
  city: string;
  region: string;
  squareFeet: number | null;
  createdAt: string;
  updatedAt: string;
};

export type UploadStatus = "pending_review" | "imported" | "failed";

export type SheetMapping = {
  name: string;
  include: boolean;
  headerRow: number;
  confidence: number;
  fields: {
    date?: string;
    hour?: string;
    storeCode?: string;
    department?: string;
    description?: string;
    employee?: string;
    employeeId?: string;
  };
  metrics: { header: string; metric: string; comparison: Comparison }[];
  ignored: { header: string; reason: string }[];
  notes: string[];
};

export type WorkbookMapping = {
  sheets: SheetMapping[];
};

export type SheetPreview = {
  name: string;
  headers: string[];
  rowCount: number;
  sample: Record<string, string>[];
};

export type PublicUpload = {
  id: string;
  storeId: string;
  category: CategoryId;
  originalName: string;
  status: UploadStatus;
  periodStart: string | null;
  periodEnd: string | null;
  rowCount: number;
  sheetCount: number;
  warnings: string[];
  isDemo: boolean;
  source: "manual" | "automated";
  uploadedAt: string;
  importedAt: string | null;
  mapping: WorkbookMapping | null;
  preview: { sheets: SheetPreview[] } | null;
};

export type Kpi = {
  id: string;
  label: string;
  value: number | null;
  format: "currency" | "number" | "percent" | "score";
  detail?: string;
  delta?: {
    label: string;
    pct: number | null;
    amount?: number | null;
    sentiment: "up-good" | "up-bad";
  };
  demo: boolean;
  caution?: string;
};

export type Attention = {
  tone: "good" | "warn" | "info";
  title: string;
  detail: string;
};

export type Coverage = {
  category: CategoryId;
  uploads: number;
  imported: number;
  pending: number;
  failed: number;
  lastImportedAt: string | null;
  demo: "none" | "partial" | "all";
};

export type DashboardData = {
  store: Store;
  filter: { from: string | null; to: string | null };
  rangeLabel: string;
  months: { id: string; label: string }[];
  freshness: {
    hasData: boolean;
    lastImportedAt: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    demoShare: "none" | "partial" | "all";
  };
  coverage: Coverage[];
  kpis: Kpi[];
  notices: string[];
  comparisonNote: string | null;
  attention: Attention[];
  revenueSeries: { date: string; revenue: number; budget: number | null; lastYear: number | null }[];
  revenueGrain: "day" | "month" | "none";
  departments: { name: string; revenue: number; units: number }[];
  hours: { hour: number; revenue: number; units: number; transactions: number }[];
  scorecard: {
    id: string;
    label: string;
    source: string;
    value: number | null;
    format: "currency" | "number" | "percent" | "score";
    detail: string;
  }[];
  labor: {
    period: string;
    payroll: number;
    hours: number;
    revenue: number | null;
    laborPercent: number | null;
  }[];
  laborDepartments: { name: string; payroll: number; hours: number }[];
  ecommerce: { period: string; sent: number; sold: number; revenue: number; goal: number | null }[];
  employees: { name: string; receipts: number; roundupCount: number; roundup: number; roundupLastYear: number | null }[];
  production: { period: string; racks: number; totes: number; units: number }[];
  financial: { period: string; revenue: number | null; expense: number | null; net: number | null }[];
  otherMetrics: { metric: string; label: string; value: number; demo: boolean }[];
  monthsTable: {
    month: string;
    label: string;
    revenue: number | null;
    units: number | null;
    revenuePerSqFt: number | null;
    roundup: number | null;
    roundupLastYear: number | null;
    roundupPercent: number | null;
    roundupPercentLastYear: number | null;
    payroll: number | null;
    laborPercent: number | null;
    expense: number | null;
    net: number | null;
  }[];
};

export type OverviewCard = {
  store: Store;
  revenue: number | null;
  rangeLabel: string;
  lastImportedAt: string | null;
  demoShare: "none" | "partial" | "all";
  hasData: boolean;
  coverage: { category: CategoryId; ready: boolean }[];
  spark: number[];
};

export type AnalysisFinding = {
  title: string;
  detail: string;
  evidence: string;
  basis: "fact" | "interpretation";
};

export type AnalysisResult = {
  summary: string;
  actionSteps: string[];
  findings: AnalysisFinding[];
  gaps: string[];
  reportsUsed: { id: string; name: string; category: string; period: string }[];
  calculated: { label: string; value: string }[];
  model: string | null;
  storeName?: string;
  storeCode?: string;
  period?: string;
};
