import { getOverview } from "@/lib/dashboard";
import { fail, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET() {
  try {
    return json({ stores: getOverview() });
  } catch (error) {
    console.error("GET /api/overview", error);
    return fail(error instanceof Error ? error.message : "Could not load overview.", 500);
  }
}
