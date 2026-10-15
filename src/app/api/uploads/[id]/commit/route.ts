import { commitUpload } from "@/lib/ingestion/ingest";
import { sanitizeMapping } from "@/lib/ingestion/mapping";
import { fail, json, readJson } from "@/lib/http";
import { getUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const found = getUpload(id);
    if (!found) return fail("Upload not found.", 404);
    const body = await readJson(request);
    const available = found.public.preview?.sheets.map((sheet) => ({ name: sheet.name, headers: sheet.headers })) ?? [];
    const mapping = { sheets: sanitizeMapping((body as { mapping?: unknown }).mapping, available) };
    const result = await commitUpload(id, mapping);
    if (result.error && !result.imported) return fail(result.error, 422, { upload: result.upload, warnings: result.warnings });
    return json(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not import this mapping.", 400);
  }
}
