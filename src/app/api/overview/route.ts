import { getOverview } from "@/lib/dashboard";
import { fail, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ stores: await getOverview() });
  } catch (error) {
    console.error(error);
    return fail(error instanceof Error ? error.message : "Could not load overview.", 500);
  }
}
