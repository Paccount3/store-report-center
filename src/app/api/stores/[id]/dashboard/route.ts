import { buildDashboard } from "@/lib/dashboard";
import { getStore } from "@/lib/db";
import { fail, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const store = await getStore(id);
    if (!store) return fail("Store not found.", 404);
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return json(await buildDashboard(store, { from, to }));
  } catch (error) {
    console.error(error);
    return fail(error instanceof Error ? error.message : "Could not load the dashboard.", 500);
  }
}
