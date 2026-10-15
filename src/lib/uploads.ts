import fs from "fs";
import path from "path";
import type { CategoryId } from "./catalog";
import { isCategory } from "./catalog";
import { dataDir, sqlAll, sqlGet, sqlRun, usesRemoteDb } from "./sql";
import type { PublicUpload, SheetPreview, UploadStatus, WorkbookMapping } from "./types";

const BLOB_PREFIX = "blob:";

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

export async function listUploads(storeId: string, category?: string) {
  const rows = category
    ? await sqlAll<UploadRow>(
        "SELECT * FROM uploads WHERE store_id = ? AND category = ? AND is_demo = 0 ORDER BY uploaded_at DESC",
        storeId,
        category,
      )
    : await sqlAll<UploadRow>(
        "SELECT * FROM uploads WHERE store_id = ? AND is_demo = 0 ORDER BY uploaded_at DESC",
        storeId,
      );
  return rows.map(toPublic);
}

export async function getUpload(id: string) {
  const row = await sqlGet<UploadRow>("SELECT * FROM uploads WHERE id = ?", id);
  return row ? { public: toPublic(row), row } : null;
}

export async function findImportedDuplicate(storeId: string, sha256: string) {
  return sqlGet<{ id: string; original_name: string }>(
    "SELECT id, original_name FROM uploads WHERE store_id = ? AND sha256 = ? AND status = 'imported'",
    storeId,
    sha256,
  );
}

export async function findPendingDuplicate(storeId: string, sha256: string) {
  const row = await sqlGet<UploadRow>(
    "SELECT * FROM uploads WHERE store_id = ? AND sha256 = ? AND status = 'pending_review' ORDER BY uploaded_at DESC",
    storeId,
    sha256,
  );
  return row ? toPublic(row) : null;
}

export async function insertUpload(input: {
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
  await sqlRun(
    `INSERT INTO uploads (
      id, store_id, category, original_name, stored_path, mime, size_bytes, sha256, status,
      period_start, period_end, row_count, sheet_count, mapping_json, preview_json, warnings_json,
      is_demo, source, uploaded_at, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export async function updateUpload(
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
  await sqlRun(
    `UPDATE uploads
     SET status = ?, warnings_json = ?, mapping_json = ?, row_count = ?, sheet_count = ?,
         period_start = ?, period_end = ?, imported_at = ?
     WHERE id = ?`,
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

export async function deleteUpload(id: string) {
  const found = await getUpload(id);
  if (!found) return false;
  await sqlRun("DELETE FROM uploads WHERE id = ?", id);
  await removeStoredFile(found.row.stored_path);
  return true;
}

export async function uploadsForAnalysis(storeId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await sqlAll<UploadRow>(
    `SELECT * FROM uploads WHERE store_id = ? AND status = 'imported' AND is_demo = 0 AND id IN (${ids.map(() => "?").join(",")})`,
    storeId,
    ...ids,
  );
  return rows.map(toPublic);
}

export async function saveUploadBytes(storeId: string, uploadId: string, filename: string, bytes: Buffer) {
  if (usesRemoteDb()) {
    await sqlRun("INSERT OR REPLACE INTO upload_files (upload_id, bytes) VALUES (?, ?)", uploadId, bytes);
    return `${BLOB_PREFIX}${uploadId}`;
  }
  const safe = path.basename(filename).replace(/[^\w.\- ()#]+/g, "_");
  const dir = path.join(dataDir(), "uploads", storeId);
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${uploadId}-${safe || "upload"}`);
  fs.writeFileSync(stored, bytes);
  return stored;
}

export async function readUploadBytes(storedPath: string) {
  if (storedPath.startsWith(BLOB_PREFIX)) {
    const row = await sqlGet<{ bytes: ArrayBuffer | Uint8Array | Buffer }>(
      "SELECT bytes FROM upload_files WHERE upload_id = ?",
      storedPath.slice(BLOB_PREFIX.length),
    );
    if (!row?.bytes) throw new Error("Uploaded file bytes were not found.");
    return Buffer.from(row.bytes as ArrayBuffer);
  }
  return fs.readFileSync(storedPath);
}

async function removeStoredFile(storedPath: string) {
  if (storedPath.startsWith(BLOB_PREFIX)) {
    await sqlRun("DELETE FROM upload_files WHERE upload_id = ?", storedPath.slice(BLOB_PREFIX.length));
    return;
  }
  fs.rmSync(storedPath, { force: true });
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
