import { isCategory } from "@/lib/catalog";
import { getStore } from "@/lib/db";
import { ingestInbound } from "@/lib/ingestion/ingest";
import { fail, json } from "@/lib/http";
import { listUploads } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeRef = url.searchParams.get("storeId") ?? "";
  const store = getStore(storeRef);
  if (!store) return fail("Store not found.", 404);
  const category = url.searchParams.get("category") ?? undefined;
  if (category && !isCategory(category)) return fail("Unknown report category.");
  return json({ uploads: listUploads(store.id, category) });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Upload the file as multipart form data.");
  }
  const storeRef = String(form.get("storeId") ?? "");
  const category = String(form.get("category") ?? "");
  const forceReview = String(form.get("forceReview") ?? "") === "true";
  const file = form.get("file");
  const store = getStore(storeRef);
  if (!store) return fail("Store not found.", 404);
  if (!isCategory(category)) return fail("Choose a report category before uploading.");
  if (!(file instanceof File)) return fail("Choose a file to upload.");
  if (file.size > MAX_BYTES) return fail("Files need to be 25 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await ingestInbound(store.id, {
    filename: file.name,
    bytes,
    mime: file.type,
    category,
    source: "manual",
    forceReview,
  });
  if (result.error && !result.upload) return fail(result.error, result.duplicateOf ? 409 : 400);
  return json(result, result.imported ? 201 : result.error ? 422 : 200);
}
