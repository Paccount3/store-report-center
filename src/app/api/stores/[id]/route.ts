import { deleteStore, getStore, updateStore } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!(await getStore(id))) return fail("Store not found.", 404);
    const body = await readJson(request);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const squareFeet = "squareFeet" in record ? parseFeet(record.squareFeet) : undefined;
    const store = await updateStore(id, {
      name: typeof record.name === "string" ? record.name : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      city: typeof record.city === "string" ? record.city : undefined,
      region: typeof record.region === "string" ? record.region : undefined,
      squareFeet,
    });
    return json({ store });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the store.";
    const status = /UNIQUE/i.test(message) ? 409 : 400;
    return fail(status === 409 ? "A store with that code already exists." : message, status);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!(await getStore(id))) return fail("Store not found.", 404);
  await deleteStore(id);
  return json({ ok: true });
}

function parseFeet(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Square feet must be a positive number.");
  return number;
}
