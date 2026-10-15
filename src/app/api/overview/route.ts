import { getOverview } from "@/lib/dashboard";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return json({ stores: getOverview() });
}
