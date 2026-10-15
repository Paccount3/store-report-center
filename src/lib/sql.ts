import fs from "fs";
import path from "path";
import { createClient, type Client, type InArgs, type InValue } from "@libsql/client";

const globalForSql = globalThis as unknown as { __gwSql?: Client; __gwSqlReady?: Promise<void> };

export function dataDir() {
  const configured = process.env.DATA_DIR?.trim();
  const dir = configured ? path.resolve(configured) : path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function usesRemoteDb() {
  const url = process.env.TURSO_DATABASE_URL?.trim() || process.env.LIBSQL_URL?.trim();
  return Boolean(url && !url.startsWith("file:"));
}

function databaseUrl() {
  const remote = process.env.TURSO_DATABASE_URL?.trim() || process.env.LIBSQL_URL?.trim();
  if (remote) return remote;
  const file = path.join(dataDir(), "command-center.sqlite");
  const normalized = file.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export function getSql() {
  if (!globalForSql.__gwSql) {
    globalForSql.__gwSql = createClient({
      url: databaseUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN?.trim() || process.env.LIBSQL_AUTH_TOKEN?.trim() || undefined,
    });
  }
  return globalForSql.__gwSql;
}

export async function ensureDb() {
  if (!globalForSql.__gwSqlReady) {
    globalForSql.__gwSqlReady = migrate(getSql()).catch((error) => {
      globalForSql.__gwSqlReady = undefined;
      throw error;
    });
  }
  await globalForSql.__gwSqlReady;
}

async function migrate(client: Client) {
  await client.executeMultiple(`
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

    CREATE TABLE IF NOT EXISTS upload_files (
      upload_id TEXT PRIMARY KEY,
      bytes BLOB NOT NULL
    );
  `);

  const countResult = await client.execute("SELECT COUNT(*) AS count FROM stores");
  const count = Number(countResult.rows[0]?.[0] ?? 0);
  if (count > 0) return;
  const now = new Date().toISOString();
  for (const store of [
    { code: "20", name: "Norwalk" },
    { code: "210", name: "Waterbury" },
  ]) {
    await client.execute({
      sql: `INSERT INTO stores (id, name, code, city, region, square_feet, created_at, updated_at)
            VALUES (?, ?, ?, '', 'Retail', NULL, ?, ?)`,
      args: [crypto.randomUUID(), store.name, store.code, now, now],
    });
  }
}

function args(values: unknown[]): InArgs {
  return values.map((value) => value as InValue);
}

export async function sqlGet<T extends Record<string, unknown>>(query: string, ...values: unknown[]) {
  await ensureDb();
  const result = await getSql().execute({ sql: query, args: args(values) });
  const row = result.rows[0];
  return row ? (Object.fromEntries(result.columns.map((column, index) => [column, row[index]])) as T) : undefined;
}

export async function sqlAll<T extends Record<string, unknown>>(query: string, ...values: unknown[]) {
  await ensureDb();
  const result = await getSql().execute({ sql: query, args: args(values) });
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])) as T);
}

export async function sqlRun(query: string, ...values: unknown[]) {
  await ensureDb();
  const result = await getSql().execute({ sql: query, args: args(values) });
  return { changes: Number(result.rowsAffected ?? 0) };
}

export async function sqlBatch(statements: { sql: string; args?: unknown[] }[]) {
  await ensureDb();
  if (!statements.length) return;
  await getSql().batch(
    statements.map((statement) => ({ sql: statement.sql, args: args(statement.args ?? []) })),
    "write",
  );
}
