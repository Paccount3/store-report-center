import fs from "fs";
import path from "path";
import zlib from "zlib";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const db = new DatabaseSync(path.join(root, "data", "command-center.sqlite"), { readOnly: true });

const stores = db.prepare("SELECT * FROM stores").all();
const uploads = db.prepare("SELECT * FROM uploads WHERE status = 'imported' AND is_demo = 0").all();

// Keep upload_id so the analyzer can filter to selected reports.
const grouped = db.prepare(`
  WITH ranked AS (
    SELECT
      o.store_id, o.upload_id, o.category, o.metric, o.comparison, o.period_date, o.hour, o.dim1, o.dim2, o.grain, o.value,
      u.is_demo, u.imported_at,
      ROW_NUMBER() OVER (
        PARTITION BY o.upload_id, o.category, o.metric, o.comparison,
          IFNULL(o.period_date, ''), IFNULL(o.hour, -1), o.dim1, o.dim2, o.grain
        ORDER BY o.id DESC
      ) AS rn
    FROM observations o
    JOIN uploads u ON u.id = o.upload_id
    WHERE u.status = 'imported' AND u.is_demo = 0
  )
  SELECT store_id, upload_id, category, metric, comparison, period_date, hour, dim1, grain,
         SUM(value) AS value, MAX(is_demo) AS is_demo
  FROM ranked
  WHERE rn = 1
  GROUP BY store_id, upload_id, category, metric, comparison, period_date, hour, dim1, grain
`).all();

const slimUploads = uploads.map((u) => ({
  id: u.id,
  store_id: u.store_id,
  category: u.category,
  original_name: u.original_name,
  stored_path: u.stored_path,
  mime: u.mime,
  size_bytes: u.size_bytes,
  sha256: u.sha256,
  status: u.status,
  period_start: u.period_start,
  period_end: u.period_end,
  row_count: u.row_count,
  sheet_count: u.sheet_count,
  mapping_json: u.mapping_json,
  preview_json: null,
  warnings_json: u.warnings_json,
  is_demo: u.is_demo,
  source: u.source,
  uploaded_at: u.uploaded_at,
  imported_at: u.imported_at,
}));

const payload = { stores, uploads: slimUploads, grouped };
const json = JSON.stringify(payload);
const gz = zlib.gzipSync(Buffer.from(json), { level: 9 });

const outDir = path.join(root, "src", "lib", "demo");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "snapshot.json.gz");
fs.writeFileSync(outFile, gz);

const { spawnSync } = await import("child_process");
const embed = spawnSync(process.execPath, [path.join(root, "scripts", "embed-demo-snapshot.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (embed.status !== 0) process.exit(embed.status ?? 1);

console.log({
  stores: stores.length,
  uploads: slimUploads.length,
  grouped: grouped.length,
  jsonMB: Number((json.length / 1024 / 1024).toFixed(2)),
  gzipMB: Number((gz.length / 1024 / 1024).toFixed(2)),
  outFile,
});
