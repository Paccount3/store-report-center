import fs from "fs";
import type { CategoryId } from "./catalog";
import { isCategory } from "./catalog";
import { getDb } from "./db";
import type { PublicUpload, SheetPreview, UploadStatus, WorkbookMapping } from "./types";

type UploadRow = {
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

export function listUploads(storeId: string, category?: string) {
  const rows = (
    category
      ? getDb()
          .prepare("SELECT * FROM uploads WHERE store_id = ? AND category = ? AND is_demo = 0 ORDER BY uploaded_at DESC")
          .all(storeId, category)
      : getDb().prepare("SELECT * FROM uploads WHERE store_id = ? AND is_demo = 0 ORDER BY uploaded_at DESC").all(storeId)
  ) as UploadRow[];
  return rows.map(toPublic);
}

export function getUpload(id: string) {
  const row = getDb().prepare("SELECT * FROM uploads WHERE id = ?").get(id) as UploadRow | undefined;
  return row ? { public: toPublic(row), row } : null;
}

export function findImportedDuplicate(storeId: string, sha256: string) {
  return getDb()
    .prepare("SELECT id, original_name FROM uploads WHERE store_id = ? AND sha256 = ? AND status = 'imported'")
    .get(storeId, sha256) as { id: string; original_name: string } | undefined;
}

export function findPendingDuplicate(storeId: string, sha256: string) {
  const row = getDb()
    .prepare("SELECT * FROM uploads WHERE store_id = ? AND sha256 = ? AND status = 'pending_review' ORDER BY uploaded_at DESC")
    .get(storeId, sha256) as UploadRow | undefined;
  return row ? toPublic(row) : null;
}

export function insertUpload(input: {
  id: string;
  storeId: string;
  category: CategoryId;
  originalName: string;
  storedPath: string;
  mime: string | null;
  sizeBytes: number;
  sha256: string;
  status: UploadStatus;
  isDemo: boolean;
  source: "manual" | "automated";
  warnings: string[];
  mapping: WorkbookMapping | null;
  preview: { sheets: SheetPreview[] } | null;
  rowCount?: number;
  sheetCount?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  importedAt?: string | null;
}) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO uploads (
        id, store_id, category, original_name, stored_path, mime, size_bytes, sha256, status,
        period_start, period_end, row_count, sheet_count, mapping_json, preview_json, warnings_json,
        is_demo, source, uploaded_at, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.storeId,
      input.category,
      input.originalName,
      input.storedPath,
      input.mime,
      input.sizeBytes,
      input.sha256,
      input.status,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      input.rowCount ?? 0,
      input.sheetCount ?? 0,
      input.mapping ? JSON.stringify(input.mapping) : null,
      input.preview ? JSON.stringify(input.preview) : null,
      JSON.stringify(input.warnings),
      input.isDemo ? 1 : 0,
      input.source,
      now,
      input.importedAt ?? null,
    );
}

export function updateUpload(
  id: string,
  input: {
    status: UploadStatus;
    warnings: string[];
    mapping: WorkbookMapping | null;
    rowCount: number;
    sheetCount: number;
    periodStart: string | null;
    periodEnd: string | null;
    importedAt: string | null;
  },
) {
  getDb()
    .prepare(
      `UPDATE uploads
       SET status = ?, warnings_json = ?, mapping_json = ?, row_count = ?, sheet_count = ?,
           period_start = ?, period_end = ?, imported_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      JSON.stringify(input.warnings),
      input.mapping ? JSON.stringify(input.mapping) : null,
      input.rowCount,
      input.sheetCount,
      input.periodStart,
      input.periodEnd,
      input.importedAt,
      id,
    );
}

export function deleteUpload(id: string) {
  const found = getUpload(id);
  if (!found) return false;
  getDb().prepare("DELETE FROM uploads WHERE id = ?").run(id);
  fs.rmSync(found.row.stored_path, { force: true });
  return true;
}

export function uploadsForAnalysis(storeId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = getDb()
    .prepare(
      `SELECT * FROM uploads WHERE store_id = ? AND status = 'imported' AND is_demo = 0 AND id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(storeId, ...ids) as UploadRow[];
  return rows.map(toPublic);
}

function toPublic(row: UploadRow): PublicUpload {
  return {
    id: row.id,
    storeId: row.store_id,
    category: isCategory(row.category) ? row.category : "other",
    originalName: row.original_name,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowCount: row.row_count,
    sheetCount: row.sheet_count,
    warnings: parseJson<string[]>(row.warnings_json, []),
    isDemo: row.is_demo === 1,
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
