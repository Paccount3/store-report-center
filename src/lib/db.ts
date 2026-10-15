import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { Store } from "./types";

const globalForDb = globalThis as unknown as { __gwDb?: DatabaseSync };

const SEED = [
  { code: "20", name: "Norwalk" },
  { code: "210", name: "Waterbury" },
];

export function dataDir() {
  const configured = process.env.DATA_DIR?.trim();
  const dir = configured ? path.resolve(configured) : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDb() {
  if (!globalForDb.__gwDb) {
    const db = new DatabaseSync(path.join(dataDir(), "command-center.sqlite"));
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    ensureStores(db);
    globalForDb.__gwDb = db;
  }
  return globalForDb.__gwDb;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      city TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      square_feet REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime TEXT,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      row_count INTEGER NOT NULL DEFAULT 0,
      sheet_count INTEGER NOT NULL DEFAULT 0,
      mapping_json TEXT,
      preview_json TEXT,
      warnings_json TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      uploaded_at TEXT NOT NULL,
      imported_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_uploads_store ON uploads(store_id, category, uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_hash ON uploads(store_id, sha256, status);

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      sheet TEXT NOT NULL DEFAULT '',
      metric TEXT NOT NULL,
      period_date TEXT,
      hour INTEGER,
      grain TEXT NOT NULL,
      dim1 TEXT NOT NULL DEFAULT '',
      dim2 TEXT NOT NULL DEFAULT '',
      value REAL NOT NULL,
      comparison TEXT NOT NULL DEFAULT 'actual'
    );

    CREATE INDEX IF NOT EXISTS idx_obs_store ON observations(store_id, metric, period_date);
    CREATE INDEX IF NOT EXISTS idx_obs_upload ON observations(upload_id);
  `);
}

function ensureStores(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM stores").get() as { count: number };
  if (row.count > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO stores (id, name, code, city, region, square_feet, created_at, updated_at)
     VALUES (?, ?, ?, '', 'Retail', NULL, ?, ?)`,
  );
  for (const store of SEED) {
    insert.run(crypto.randomUUID(), store.name, store.code, now, now);
  }
}

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
    squareFeet: row.square_feet,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listStores() {
  const rows = getDb()
    .prepare("SELECT * FROM stores ORDER BY CAST(code AS INTEGER), name")
    .all() as StoreRow[];
  return rows.map(mapStore);
}

export function getStore(id: string) {
  const row = getDb().prepare("SELECT * FROM stores WHERE id = ?").get(id) as StoreRow | undefined;
  return row ? mapStore(row) : null;
}

export function createStore(input: {
  name: string;
  code: string;
  city?: string;
  region?: string;
  squareFeet?: number | null;
}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO stores (id, name, code, city, region, square_feet, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      input.code.trim(),
      input.city?.trim() ?? "",
      input.region?.trim() || "Retail",
      input.squareFeet ?? null,
      now,
      now,
    );
  return getStore(id)!;
}

export function updateStore(
  id: string,
  input: { name?: string; code?: string; city?: string; region?: string; squareFeet?: number | null },
) {
  const current = getStore(id);
  if (!current) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE stores
       SET name = ?, code = ?, city = ?, region = ?, square_feet = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
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

export function deleteStore(id: string) {
  const uploadDir = path.join(dataDir(), "uploads", id);
  getDb().prepare("DELETE FROM stores WHERE id = ?").run(id);
  fs.rmSync(uploadDir, { recursive: true, force: true });
}
