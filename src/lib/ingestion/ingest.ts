import { DEMO_READONLY_MESSAGE } from "../demo/snapshot";
import type { CategoryId } from "../catalog";
import type { PublicUpload, WorkbookMapping } from "../types";

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

export async function ingestInbound(_storeId: string, _report: InboundReport): Promise<IngestResult> {
  return {
    upload: null,
    imported: false,
    warnings: [],
    error: DEMO_READONLY_MESSAGE,
  };
}

export async function commitUpload(_uploadId: string, _mapping: WorkbookMapping) {
  return {
    upload: null,
    imported: false,
    warnings: [] as string[],
    error: DEMO_READONLY_MESSAGE,
  };
}
