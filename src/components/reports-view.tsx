"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORIES, COMPARISONS, METRICS, comparisonLabel, isCategory, metricLabel, type Comparison } from "@/lib/catalog";
import { formatMonth, formatRange, parseSheetPeriod } from "@/lib/dates";
import { formatWhen } from "@/lib/format";
import type { PublicUpload, SheetMapping, WorkbookMapping } from "@/lib/types";
import { api } from "./api";

const FIELD_OPTIONS = [
  ["field|storeCode", "Store code"],
  ["field|employee", "Employee name"],
  ["field|employeeId", "Employee login"],
  ["field|date", "Date"],
  ["field|hour", "Hour"],
  ["field|department", "Department"],
  ["field|description", "Description"],
] as const;

export function ReportsView() {
  const params = useParams<{ storeId: string }>();
  const search = useSearchParams();
  const requested = search.get("source");
  const [category, setCategory] = useState(requested && isCategory(requested) ? requested : "celerant");
  const [uploads, setUploads] = useState<PublicUpload[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forceReview, setForceReview] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (requested && isCategory(requested)) setCategory(requested);
  }, [requested]);

  async function load() {
    const data = await api<{ uploads: PublicUpload[] }>(`/api/uploads?storeId=${params.storeId}`);
    setUploads(data.uploads);
    const pending = data.uploads.find((upload) => upload.status === "pending_review");
    if (pending) setOpenId(pending.id);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load reports."));
  }, [params.storeId]);

  const visible = uploads.filter((upload) => upload.category === category);
  const selected = CATEGORIES.find((item) => item.id === category)!;

  async function uploadFiles(files: FileList | File[]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("storeId", params.storeId);
        form.set("category", category);
        form.set("forceReview", String(forceReview));
        form.set("file", file);
        try {
          const result = await api<{ imported: boolean; warnings: string[]; upload: PublicUpload | null }>("/api/uploads", {
            method: "POST",
            body: form,
          });
          setMessage(
            result.imported
              ? `${file.name} was imported${result.upload?.rowCount ? ` (${result.upload.rowCount.toLocaleString()} rows)` : ""}.`
              : `${file.name} needs a column review before it is added to the dashboard.`,
          );
          if (result.upload?.status === "pending_review") setOpenId(result.upload.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed.");
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue">Sources</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Report uploads</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Files stay attached to this store. Each source is kept separate on the dashboard. Overlapping reports use the newest matching rows.
        </p>
      </div>
      {message ? <p className="mt-4 rounded-md border border-line bg-white px-4 py-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-bad/20 bg-white px-4 py-3 text-sm text-bad">{error}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {CATEGORIES.map((item) => {
            const count = uploads.filter((upload) => upload.category === item.id && upload.status === "imported").length;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left ${category === item.id ? "border-blue bg-white" : "border-line bg-white/70"}`}
              >
                <span className="block font-semibold">{item.name}</span>
                <span className="text-xs text-muted">{count ? `${count} imported` : "Nothing imported"}</span>
              </button>
            );
          })}
        </div>
        <section className="rounded-xl border border-line bg-white p-4 md:p-5">
          <h2 className="text-xl font-semibold">{selected.name}</h2>
          <p className="mt-1 text-sm text-muted">{selected.blurb}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {selected.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue/40 bg-sky/50 px-4 py-8 text-center">
            <span className="font-semibold">Drop a CSV, Excel, or PDF file</span>
            <span className="mt-1 text-sm text-muted">or click to browse. Multi-sheet workbooks are read sheet by sheet.</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf"
              multiple
              className="mt-3 text-sm"
              disabled={busy}
              onChange={(event) => {
                if (event.target.files?.length) uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forceReview} onChange={(event) => setForceReview(event.target.checked)} />
            Review column mapping before adding data
          </label>
          <div className="mt-5 space-y-3">
            {visible.length === 0 ? <p className="text-sm text-muted">No files in this category yet.</p> : null}
            {visible.map((upload) => (
              <UploadCard
                key={upload.id}
                upload={upload}
                open={openId === upload.id}
                onToggle={() => setOpenId(openId === upload.id ? null : upload.id)}
                onChanged={async (text) => {
                  setMessage(text);
                  await load();
                }}
                onError={setError}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function UploadCard({
  upload,
  open,
  onToggle,
  onChanged,
  onError,
}: {
  upload: PublicUpload;
  open: boolean;
  onToggle: () => void;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  async function remove() {
    if (!window.confirm(`Remove ${upload.originalName}? Imported rows from this file will leave the dashboard.`)) return;
    try {
      await api(`/api/uploads/${upload.id}`, { method: "DELETE" });
      await onChanged(`${upload.originalName} was removed.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove the file.");
    }
  }

  const period = upload.periodStart && upload.periodEnd ? formatRange(upload.periodStart, upload.periodEnd) : "Period not detected";
  return (
    <article className="rounded-lg border border-line">
      <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-3">
        <button type="button" onClick={onToggle} className="text-left">
          <span className="block font-medium">{upload.originalName}</span>
          <span className="text-sm text-muted">
            {period}
            {upload.rowCount ? ` · ${upload.rowCount.toLocaleString()} rows` : ""} · {formatWhen(upload.importedAt ?? upload.uploadedAt)}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(upload.status)}`}>{statusLabel(upload.status)}</span>
          <button type="button" onClick={remove} className="text-sm text-bad">
            Remove
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-line px-3 py-3">
          {upload.warnings.length ? (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {upload.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {upload.status === "pending_review" && upload.mapping && upload.preview ? (
            <MappingReview upload={upload} onChanged={onChanged} onError={onError} />
          ) : upload.mapping ? (
            <MappingSummary mapping={upload.mapping} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MappingReview({
  upload,
  onChanged,
  onError,
}: {
  upload: PublicUpload;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [mapping, setMapping] = useState<WorkbookMapping>(upload.mapping as WorkbookMapping);
  const [saving, setSaving] = useState(false);
  const preview = upload.preview?.sheets ?? [];

  async function commit() {
    setSaving(true);
    try {
      await api(`/api/uploads/${upload.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      await onChanged(`${upload.originalName} was added to the dashboard.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not apply this mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        You are not linking one column to another. Each column is either a label, such as the employee name, or a number that gets added up. Percents stay out, because adding percents across employees is not a real total.
      </p>
      {mapping.sheets.map((sheet, index) => {
        const sample = preview.find((item) => item.name === sheet.name);
        return (
          <div key={sheet.name}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={sheet.include}
                onChange={(event) => updateSheet(index, { ...sheet, include: event.target.checked })}
              />
              {sheetTitle(sheet.name)} · {sample?.rowCount.toLocaleString() ?? 0} rows
            </label>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted">
                    <th className="py-1 pr-3">Column</th>
                    <th className="py-1">What this column is</th>
                  </tr>
                </thead>
                <tbody>
                  {(sample?.headers ?? []).map((header) => (
                    <tr key={header} className="border-t border-line">
                      <td className="py-1 pr-3">{header}</td>
                      <td className="py-1">
                        <select
                          className="w-full rounded-md border border-line px-2 py-1"
                          value={assignment(sheet, header)}
                          onChange={(event) => updateSheet(index, assign(sheet, header, event.target.value))}
                        >
                          <option value="ignore">Leave out of the totals</option>
                          <optgroup label="Labels, not added up">
                            {FIELD_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Numbers to add up">
                            {metricOptions(sheet, header).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {sheet.ignored.find((item) => item.header === header) ? (
                          <p className="mt-1 text-xs text-muted">{sheet.ignored.find((item) => item.header === header)?.reason}</p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sample?.sample.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      {sample.headers.map((header) => (
                        <th key={header} className="px-2 py-1 font-semibold text-muted">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.sample.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-line">
                        {sample.headers.map((header) => (
                          <td key={header} className="max-w-48 truncate px-2 py-1">{row[header]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
      <button type="button" disabled={saving} onClick={commit} className="rounded-md bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? "Adding to dashboard…" : "Add to dashboard"}
      </button>
    </div>
  );

  function updateSheet(index: number, sheet: SheetMapping) {
    setMapping({ sheets: mapping.sheets.map((item, itemIndex) => (itemIndex === index ? sheet : item)) });
  }
}

function MappingSummary({ mapping }: { mapping: WorkbookMapping }) {
  const sheets = mapping.sheets.filter((sheet) => sheet.include);
  if (!sheets.length) return null;
  const sample = sheets[0];
  const labels = Object.entries(sample.fields).map(([field, header]) => `${header} is ${fieldLabel(field)}.`);
  const numbers = sample.metrics.map((metric) => `${metric.header} is added up as ${metricLabel(metric.metric).toLowerCase()}.`);
  const skipped = sample.ignored.map((item) => `${item.header}: ${item.reason}`);
  return (
    <div className="space-y-2 text-sm text-muted">
      <ul className="list-disc space-y-1 pl-5">
        {[...labels, ...numbers, ...skipped].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>Tabs included: {sheets.map((sheet) => sheetTitle(sheet.name)).join(", ")}.</p>
    </div>
  );
}

function sheetTitle(name: string) {
  const period = parseSheetPeriod(name);
  return period ? formatMonth(period.iso.slice(0, 7)) : name;
}

function fieldLabel(field: string) {
  if (field === "employee") return "the employee name, kept on the row and not added up";
  if (field === "employeeId") return "the employee login, kept on the row and not added up";
  if (field === "storeCode") return "the store code";
  if (field === "date") return "the date";
  if (field === "hour") return "the hour";
  if (field === "department") return "the department";
  if (field === "description") return "the description";
  return field;
}

function assignment(sheet: SheetMapping, header: string) {
  for (const [field, value] of Object.entries(sheet.fields)) {
    if (value === header) return `field|${field}`;
  }
  const metric = sheet.metrics.find((item) => item.header === header);
  if (!metric) return "ignore";
  return `metric|${metric.metric}|${metric.comparison}`;
}

function assign(sheet: SheetMapping, header: string, value: string): SheetMapping {
  const fields = { ...sheet.fields };
  (Object.keys(fields) as (keyof SheetMapping["fields"])[]).forEach((key) => {
    if (fields[key] === header) delete fields[key];
  });
  const metrics = sheet.metrics.filter((item) => item.header !== header);
  if (value.startsWith("field|")) {
    const field = value.slice(6) as keyof SheetMapping["fields"];
    fields[field] = header;
  } else if (value.startsWith("metric|")) {
    const parts = value.split("|");
    const comparison = parts[parts.length - 1] as Comparison;
    const metric = parts.slice(1, -1).join("|");
    metrics.push({ header, metric, comparison });
  }
  return { ...sheet, fields, metrics };
}

function metricOptions(sheet: SheetMapping, header: string) {
  const current = sheet.metrics.find((item) => item.header === header);
  const keys = Object.keys(METRICS);
  if (current?.metric.startsWith("custom:") && !keys.includes(current.metric)) keys.push(current.metric);
  return keys.flatMap((metric) => {
    const comparisons: Comparison[] = ["revenue", "expense", "payroll_dollars", "ecommerce_revenue", "units"].includes(metric)
      ? [...COMPARISONS]
      : ["actual"];
    return comparisons.map((comparison) => ({
      value: `metric|${metric}|${comparison}`,
      label: comparison === "actual" ? metricLabel(metric) : `${metricLabel(metric)} (${comparisonLabel(comparison)})`,
    }));
  });
}

function statusLabel(status: PublicUpload["status"]) {
  if (status === "imported") return "Imported";
  if (status === "pending_review") return "Needs review";
  return "Not imported";
}

function statusClass(status: PublicUpload["status"]) {
  if (status === "imported") return "bg-emerald-50 text-good";
  if (status === "pending_review") return "bg-amber-100 text-warn";
  return "bg-red-50 text-bad";
}
