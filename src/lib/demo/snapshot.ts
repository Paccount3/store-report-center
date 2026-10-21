import zlib from "zlib";
import { isCategory } from "../catalog";
import { SNAPSHOT_GZ_BASE64 } from "./snapshot-data";
import type { PublicUpload, SheetPreview, Store, UploadStatus, WorkbookMapping } from "../types";

export type DemoGroupRow = {
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

export type DemoUploadRow = {
  id: string;
  store_id: string;
  category: string;
  original_name: string;
  stored_path: string;
  mime: string | null;
  size_bytes: number;
  sha256: string;
  status: UploadStatus;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  sheet_count: number;
  mapping_json: string | null;
  preview_json: string | null;
  warnings_json: string | null;
  is_demo: number;
  source: "manual" | "automated";
  uploaded_at: string;
  imported_at: string | null;
};

type DemoStoreRow = {
  id: string;
  name: string;
  code: string;
  city: string;
  region: string;
  square_feet: number | null;
  created_at: string;
  updated_at: string;
};

type DemoGroupedRow = {
  store_id: string;
  upload_id: string;
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

export type DemoDescriptionRow = {
  store_id: string;
  upload_id: string;
  metric: string;
  comparison: string;
  period_date: string | null;
  dim1: string;
  dim2: string;
  value: number;
};

type Snapshot = {
  stores: DemoStoreRow[];
  uploads: DemoUploadRow[];
  grouped: DemoGroupedRow[];
  descriptions?: DemoDescriptionRow[];
};

const globalForDemo = globalThis as unknown as { __gwDemoSnapshot?: Snapshot };

function loadSnapshot(): Snapshot {
  if (globalForDemo.__gwDemoSnapshot) return globalForDemo.__gwDemoSnapshot;
  // Embedded base64 so Vercel serverless bundles always include the demo data
  // (adjacent .gz files are often omitted from the function filesystem).
  const gz = Buffer.from(SNAPSHOT_GZ_BASE64, "base64");
  const json = zlib.gunzipSync(gz).toString("utf8");
  const parsed = JSON.parse(json) as Snapshot;
  globalForDemo.__gwDemoSnapshot = parsed;
  return parsed;
}

const DEMO_STORE_CODE = "210";

export function demoStores(): Store[] {
  return loadSnapshot()
    .stores.filter((row) => String(row.code) === DEMO_STORE_CODE)
    .map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      city: row.city,
      region: row.region,
      squareFeet: row.square_feet == null ? null : Number(row.square_feet),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export function demoStore(id: string) {
  return demoStores().find((store) => store.id === id) ?? null;
}

export function demoUploads(storeId: string, category?: string) {
  return loadSnapshot()
    .uploads.filter((row) => row.store_id === storeId && (!category || row.category === category))
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .map(toPublicUpload);
}

export function demoUpload(id: string) {
  const row = loadSnapshot().uploads.find((item) => item.id === id);
  return row ? { public: toPublicUpload(row), row } : null;
}

export function demoUploadsForAnalysis(storeId: string, ids: string[]) {
  if (!ids.length) return [];
  const wanted = new Set(ids);
  return loadSnapshot()
    .uploads.filter((row) => row.store_id === storeId && row.status === "imported" && wanted.has(row.id))
    .map(toPublicUpload);
}

export function demoGrouped(storeId: string, uploadIds?: string[]): DemoGroupRow[] {
  if (uploadIds && uploadIds.length === 0) return [];
  const snapshot = loadSnapshot();
  const importedAt = new Map(snapshot.uploads.map((upload) => [upload.id, upload.imported_at ?? upload.uploaded_at]));
  const wanted = uploadIds?.length ? new Set(uploadIds) : null;

  const candidates = snapshot.grouped.filter(
    (row) => row.store_id === storeId && (!wanted || wanted.has(row.upload_id)),
  );

  // Newest imported upload wins for overlapping metric/date keys (same as the SQL dashboard query).
  const best = new Map<string, { importedAt: string; uploadId: string }>();
  for (const row of candidates) {
    const key = [
      row.category,
      row.metric,
      row.comparison,
      row.period_date ?? "",
      row.hour ?? -1,
      row.dim1,
      row.grain,
    ].join("|");
    const stamp = importedAt.get(row.upload_id) ?? "";
    const current = best.get(key);
    if (!current || stamp > current.importedAt) {
      best.set(key, { importedAt: stamp, uploadId: row.upload_id });
    }
  }

  const sums = new Map<string, DemoGroupRow>();
  for (const row of candidates) {
    const key = [
      row.category,
      row.metric,
      row.comparison,
      row.period_date ?? "",
      row.hour ?? -1,
      row.dim1,
      row.grain,
    ].join("|");
    if (best.get(key)?.uploadId !== row.upload_id) continue;
    const existing = sums.get(key);
    if (existing) {
      existing.value += Number(row.value);
      existing.is_demo = Math.max(existing.is_demo, Number(row.is_demo));
      continue;
    }
    sums.set(key, {
      category: String(row.category),
      metric: String(row.metric),
      comparison: String(row.comparison),
      period_date: row.period_date == null ? null : String(row.period_date),
      hour: row.hour == null ? null : Number(row.hour),
      dim1: String(row.dim1 ?? ""),
      grain: String(row.grain),
      value: Number(row.value),
      is_demo: Number(row.is_demo),
    });
  }

  return [...sums.values()];
}

/** Celerant department → description lines for drill-down. */
export function demoDescriptions(storeId: string, uploadIds?: string[]): DemoDescriptionRow[] {
  if (uploadIds && uploadIds.length === 0) return [];
  const snapshot = loadSnapshot();
  const importedAt = new Map(snapshot.uploads.map((upload) => [upload.id, upload.imported_at ?? upload.uploaded_at]));
  const wanted = uploadIds?.length ? new Set(uploadIds) : null;
  const candidates = (snapshot.descriptions ?? []).filter(
    (row) => row.store_id === storeId && (!wanted || wanted.has(row.upload_id)),
  );

  const best = new Map<string, { importedAt: string; uploadId: string }>();
  for (const row of candidates) {
    const key = [row.metric, row.comparison, row.period_date ?? "", row.dim1, row.dim2].join("|");
    const stamp = importedAt.get(row.upload_id) ?? "";
    const current = best.get(key);
    if (!current || stamp > current.importedAt) {
      best.set(key, { importedAt: stamp, uploadId: row.upload_id });
    }
  }

  const sums = new Map<string, DemoDescriptionRow>();
  for (const row of candidates) {
    const key = [row.metric, row.comparison, row.period_date ?? "", row.dim1, row.dim2].join("|");
    if (best.get(key)?.uploadId !== row.upload_id) continue;
    const existing = sums.get(key);
    if (existing) {
      existing.value += Number(row.value);
      continue;
    }
    sums.set(key, {
      store_id: row.store_id,
      upload_id: row.upload_id,
      metric: String(row.metric),
      comparison: String(row.comparison),
      period_date: row.period_date == null ? null : String(row.period_date),
      dim1: String(row.dim1 ?? ""),
      dim2: String(row.dim2 ?? ""),
      value: Number(row.value),
    });
  }
  return [...sums.values()];
}

export const DEMO_READONLY_MESSAGE =
  "This hosted build is a read-only demo. Stores and report metrics are baked in from the prototype files. A shared database will replace this later.";

function toPublicUpload(row: DemoUploadRow): PublicUpload {
  return {
    id: row.id,
    storeId: row.store_id,
    category: isCategory(row.category) ? row.category : "other",
    originalName: row.original_name,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowCount: Number(row.row_count),
    sheetCount: Number(row.sheet_count),
    warnings: parseJson<string[]>(row.warnings_json, []),
    isDemo: Number(row.is_demo) === 1,
    source: row.source,
    uploadedAt: row.uploaded_at,
    importedAt: row.imported_at,
    mapping: parseJson<WorkbookMapping | null>(row.mapping_json, null),
    preview: parseJson<{ sheets: SheetPreview[] } | null>(row.preview_json, null),
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
