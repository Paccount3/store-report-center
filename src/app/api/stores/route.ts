import { createStore, listStores } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return json({ stores: listStores() });
  } catch (error) {
    console.error("GET /api/stores", error);
    return fail(error instanceof Error ? error.message : "Could not load stores.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const name = stringField(body, "name");
    const code = stringField(body, "code");
    if (!name || !code) return fail("Store name and code are required.");
    if (name.length > 80 || code.length > 20) return fail("Store name or code is too long.");
    const store = createStore({
      name,
      code,
      city: stringField(body, "city"),
      region: stringField(body, "region"),
      squareFeet: numberField(body),
    });
    return json({ store }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the store.";
    const status = /UNIQUE/i.test(message) ? 409 : /read-only demo/i.test(message) ? 403 : 400;
    return fail(status === 409 ? "A store with that code already exists." : message, status);
  }
}

function stringField(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberField(body: unknown) {
  if (!body || typeof body !== "object" || !("squareFeet" in body)) return null;
  const value = (body as Record<string, unknown>).squareFeet;
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Square feet must be a positive number.");
  return number;
}
