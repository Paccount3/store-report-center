import fs from "fs";
import path from "path";
import type { Store } from "./types";
import { dataDir, sqlAll, sqlGet, sqlRun, usesRemoteDb } from "./sql";

export { dataDir, usesRemoteDb } from "./sql";

type StoreRow = {
  id: string;
  name: string;
  code: string;
  city: string;
  region: string;
  square_feet: number | null;
  created_at: string;
  updated_at: string;
};

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    city: row.city,
    region: row.region,
    squareFeet: row.square_feet == null ? null : Number(row.square_feet),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStores() {
  const rows = await sqlAll<StoreRow>("SELECT * FROM stores ORDER BY CAST(code AS INTEGER), name");
  return rows.map(mapStore);
}

export async function getStore(id: string) {
  const row = await sqlGet<StoreRow>("SELECT * FROM stores WHERE id = ?", id);
  return row ? mapStore(row) : null;
}

export async function createStore(input: {
  name: string;
  code: string;
  city?: string;
  region?: string;
  squareFeet?: number | null;
}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await sqlRun(
    `INSERT INTO stores (id, name, code, city, region, square_feet, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim(),
    input.code.trim(),
    input.city?.trim() ?? "",
    input.region?.trim() || "Retail",
    input.squareFeet ?? null,
    now,
    now,
  );
  return (await getStore(id))!;
}

export async function updateStore(
  id: string,
  input: { name?: string; code?: string; city?: string; region?: string; squareFeet?: number | null },
) {
  const current = await getStore(id);
  if (!current) return null;
  const now = new Date().toISOString();
  await sqlRun(
    `UPDATE stores
     SET name = ?, code = ?, city = ?, region = ?, square_feet = ?, updated_at = ?
     WHERE id = ?`,
    input.name?.trim() || current.name,
    input.code?.trim() || current.code,
    input.city !== undefined ? input.city.trim() : current.city,
    input.region !== undefined ? input.region.trim() : current.region,
    input.squareFeet !== undefined ? input.squareFeet : current.squareFeet,
    now,
    id,
  );
  return getStore(id);
}

export async function deleteStore(id: string) {
  if (usesRemoteDb()) {
    await sqlRun(
      `DELETE FROM upload_files WHERE upload_id IN (SELECT id FROM uploads WHERE store_id = ?)`,
      id,
    );
  } else {
    const uploadDir = path.join(dataDir(), "uploads", id);
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
  await sqlRun("DELETE FROM stores WHERE id = ?", id);
}
