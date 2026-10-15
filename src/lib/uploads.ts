import { DEMO_READONLY_MESSAGE, demoUpload, demoUploads, demoUploadsForAnalysis } from "./demo/snapshot";
import type { CategoryId } from "./catalog";
import type { PublicUpload, SheetPreview, UploadStatus, WorkbookMapping } from "./types";

export function listUploads(storeId: string, category?: string) {
  return demoUploads(storeId, category);
}

export function getUpload(id: string) {
  return demoUpload(id);
}

export function findImportedDuplicate(_storeId: string, _sha256: string) {
  return undefined;
}

export function findPendingDuplicate(_storeId: string, _sha256: string) {
  return null;
}

export function insertUpload(_input: {
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
}): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export function updateUpload(
  _id: string,
  _input: {
    status: UploadStatus;
    warnings: string[];
    mapping: WorkbookMapping | null;
    rowCount: number;
    sheetCount: number;
    periodStart: string | null;
    periodEnd: string | null;
    importedAt: string | null;
  },
): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export function deleteUpload(_id: string): boolean {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export function uploadsForAnalysis(storeId: string, ids: string[]) {
  return demoUploadsForAnalysis(storeId, ids);
}

export function saveUploadBytes(_storeId: string, _uploadId: string, _filename: string, _bytes: Buffer): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export function readUploadBytes(_storedPath: string): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export type { PublicUpload };
