import { fail, json } from "@/lib/http";
import { deleteUpload, getUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = getUpload(id);
  if (!found) return fail("Upload not found.", 404);
  return json({ upload: found.public });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!deleteUpload(id)) return fail("Upload not found.", 404);
  return json({ ok: true });
}
