import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { CategoryId } from "../catalog";
import { dataDir, getStore } from "../db";
import type { PublicUpload, WorkbookMapping } from "../types";
import { deleteUpload, findImportedDuplicate, findPendingDuplicate, getUpload, insertUpload, updateUpload } from "../uploads";
import { writeObservations } from "./commit";
import { suggestSheet } from "./mapping";
import { cleanHeader } from "./mapping";
import { parseNumber } from "../numbers";
import { parseWorkbook, type ParsedSheet } from "./parse";

export type InboundReport = {
  filename: string;
  bytes: Buffer;
  mime?: string | null;
  category: CategoryId;
  source: "manual" | "automated";
  isDemo?: boolean;
  forceReview?: boolean;
};

export type IngestResult = {
  upload: PublicUpload | null;
  imported: boolean;
  duplicateOf?: string;
  warnings: string[];
  error?: string;
};

const AUTO_CONFIDENCE = 0.75;

/**
 * Manual uploads and future automated connectors both enter here.
 * Charts read normalized observations, so a new connector does not need dashboard changes.
 */
export async function ingestInbound(storeId: string, report: InboundReport): Promise<IngestResult> {
  const store = getStore(storeId);
  if (!store) return { upload: null, imported: false, warnings: [], error: "Store not found." };

  const hash = crypto.createHash("sha256").update(report.bytes).digest("hex");
  const duplicate = findImportedDuplicate(storeId, hash);
  if (duplicate) {
    return {
      upload: null,
      imported: false,
      duplicateOf: duplicate.original_name,
      warnings: [],
      error: `This file was already imported as “${duplicate.original_name}”. It was not counted again.`,
    };
  }
  const pending = findPendingDuplicate(storeId, hash);
  if (pending) {
    return {
      upload: pending,
      imported: false,
      warnings: ["This file is already waiting for a mapping review."],
    };
  }

  let sheets: ParsedSheet[];
  try {
    sheets = await parseWorkbook(report.bytes, report.filename);
  } catch (error) {
    return {
      upload: await retainFailure(storeId, report, hash, error instanceof Error ? error.message : "Could not read the file."),
      imported: false,
      warnings: [],
      error: error instanceof Error ? error.message : "Could not read the file.",
    };
  }

  if (!sheets.length) {
    const message = "No recognizable table was found. Check that the file has a header row and at least one numeric column.";
    return {
      upload: await retainFailure(storeId, report, hash, message),
      imported: false,
      warnings: [],
      error: message,
    };
  }

  sheets = sheets.map((sheet) => reshapeOther(sheet, report.category));
  const mapping: WorkbookMapping = {
    sheets: sheets.map((sheet) => suggestSheet(sheet.name, sheet.headers, sheet.records, report.category, sheet.headerRow)),
  };
  const warnings = mapping.sheets.flatMap((sheet) => sheet.notes.map((note) => `${sheet.name}: ${note}`));
  const confident = mapping.sheets.some((sheet) => sheet.include && sheet.confidence >= AUTO_CONFIDENCE);
  const uploadId = crypto.randomUUID();
  const storedPath = saveFile(storeId, uploadId, report.filename, report.bytes);
  const preview = previewOf(sheets);

  if (report.forceReview || !confident) {
    insertUpload({
      id: uploadId,
      storeId,
      category: report.category,
      originalName: report.filename,
      storedPath,
      mime: report.mime ?? null,
      sizeBytes: report.bytes.length,
      sha256: hash,
      status: "pending_review",
      isDemo: Boolean(report.isDemo),
      source: report.source,
      warnings,
      mapping,
      preview,
      sheetCount: sheets.length,
    });
    return {
      upload: getUpload(uploadId)!.public,
      imported: false,
      warnings,
    };
  }

  insertUpload({
    id: uploadId,
    storeId,
    category: report.category,
    originalName: report.filename,
    storedPath,
    mime: report.mime ?? null,
    sizeBytes: report.bytes.length,
    sha256: hash,
    status: "pending_review",
    isDemo: Boolean(report.isDemo),
    source: report.source,
    warnings,
    mapping,
    preview,
    sheetCount: sheets.length,
  });

  return finalize(uploadId, sheets, mapping, warnings);
}

export async function commitUpload(uploadId: string, mapping: WorkbookMapping) {
  const found = getUpload(uploadId);
  if (!found) return { upload: null, imported: false, warnings: [], error: "Upload not found." };
  if (found.public.status === "imported") {
    return { upload: found.public, imported: true, warnings: found.public.warnings, error: "This file is already imported." };
  }
  const store = getStore(found.public.storeId);
  if (!store) return { upload: null, imported: false, warnings: [], error: "Store not found." };
  const bytes = fs.readFileSync(found.row.stored_path);
  const sheets = (await parseWorkbook(bytes, found.public.originalName)).map((sheet) =>
    reshapeOther(sheet, found.public.category),
  );
  return finalize(uploadId, sheets, mapping, []);
}

function finalize(uploadId: string, sheets: ParsedSheet[], mapping: WorkbookMapping, warnings: string[]): IngestResult {
  const found = getUpload(uploadId);
  if (!found) return { upload: null, imported: false, warnings, error: "Upload not found." };
  const store = getStore(found.public.storeId);
  if (!store) return { upload: null, imported: false, warnings, error: "Store not found." };

  const stats = writeObservations(store, uploadId, found.public.category, sheets, mapping.sheets);
  const allWarnings = [...warnings, ...stats.warnings];
  if (!stats.observations) {
    updateUpload(uploadId, {
      status: "failed",
      warnings: [...allWarnings, "No rows were imported with this mapping."],
      mapping,
      rowCount: 0,
      sheetCount: mapping.sheets.filter((sheet) => sheet.include).length,
      periodStart: null,
      periodEnd: null,
      importedAt: null,
    });
    return {
      upload: getUpload(uploadId)!.public,
      imported: false,
      warnings: allWarnings,
      error: stats.rowsSkipped
        ? `None of the rows matched store code ${store.code}.`
        : "No usable metric values were found with this mapping.",
    };
  }

  const importedAt = new Date().toISOString();
  updateUpload(uploadId, {
    status: "imported",
    warnings: allWarnings,
    mapping,
    rowCount: stats.rowsImported,
    sheetCount: mapping.sheets.filter((sheet) => sheet.include).length,
    periodStart: stats.periodStart,
    periodEnd: stats.periodEnd,
    importedAt,
  });
  return { upload: getUpload(uploadId)!.public, imported: true, warnings: allWarnings };
}

async function retainFailure(storeId: string, report: InboundReport, hash: string, message: string) {
  const uploadId = crypto.randomUUID();
  const storedPath = saveFile(storeId, uploadId, report.filename, report.bytes);
  insertUpload({
    id: uploadId,
    storeId,
    category: report.category,
    originalName: report.filename,
    storedPath,
    mime: report.mime ?? null,
    sizeBytes: report.bytes.length,
    sha256: hash,
    status: "failed",
    isDemo: Boolean(report.isDemo),
    source: report.source,
    warnings: [message],
    mapping: null,
    preview: null,
  });
  return getUpload(uploadId)!.public;
}

function saveFile(storeId: string, uploadId: string, filename: string, bytes: Buffer) {
  const safe = path.basename(filename).replace(/[^\w.\- ()#]+/g, "_");
  const dir = path.join(dataDir(), "uploads", storeId);
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${uploadId}-${safe || "upload"}`);
  fs.writeFileSync(stored, bytes);
  return stored;
}

function previewOf(sheets: ParsedSheet[]) {
  return {
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      headers: sheet.headers,
      rowCount: sheet.records.length,
      sample: sheet.records.slice(0, 6).map((record) => {
        const sample: Record<string, string> = {};
        for (const header of sheet.headers) sample[header] = stringify(record[header]);
        return sample;
      }),
    })),
  };
}

function reshapeOther(sheet: ParsedSheet, category: CategoryId): ParsedSheet {
  if (category !== "other" || sheet.headers.length !== 2) return sheet;
  const [labelHeader, valueHeader] = sheet.headers;
  const numericLabels = sheet.records.filter((record) => parseNumber(record[labelHeader]) != null).length;
  const numericValues = sheet.records.filter((record) => parseNumber(record[valueHeader]) != null).length;
  if (numericLabels > sheet.records.length * 0.5) return sheet;
  if (numericValues < sheet.records.length * 0.6) return sheet;
  const record: Record<string, unknown> = {};
  const headers: string[] = [];
  for (const row of sheet.records) {
    const label = cleanHeader(row[labelHeader]);
    if (!label || headers.includes(label)) continue;
    headers.push(label);
    record[label] = row[valueHeader];
  }
  if (headers.length < 2) return sheet;
  return { name: sheet.name, headerRow: 1, headers, records: [record] };
}

function stringify(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value == null) return "";
  return String(value);
}

export function removeUpload(id: string) {
  return deleteUpload(id);
}
