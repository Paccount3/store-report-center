import { buildDashboard } from "@/lib/dashboard";
import { getStore } from "@/lib/db";
import { fail, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const store = getStore(id);
  if (!store) return fail("Store not found.", 404);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return json(buildDashboard(store, { from, to }));
}
