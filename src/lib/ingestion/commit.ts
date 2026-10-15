import { monthEnd, parseSheetPeriod, toIsoDate } from "../dates";
import { codesEqual, isTotalLabel, normCode, parseNumber } from "../numbers";
import type { CategoryId } from "../catalog";
import type { SheetMapping } from "../types";
import type { ParsedSheet } from "./parse";
import type { Store } from "../types";
import { sqlBatch, sqlRun } from "../sql";

export type CommitStats = {
  observations: number;
  rowsImported: number;
  rowsSkipped: number;
  otherCodes: string[];
  periodStart: string | null;
  periodEnd: string | null;
  warnings: string[];
};

export async function writeObservations(
  store: Store,
  uploadId: string,
  category: CategoryId,
  sheets: ParsedSheet[],
  mappings: SheetMapping[],
) {
  const stats: CommitStats = {
    observations: 0,
    rowsImported: 0,
    rowsSkipped: 0,
    otherCodes: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
  };
  const other = new Set<string>();
  let sawStoreColumn = false;
  const rows: unknown[][] = [];

  await sqlRun("DELETE FROM observations WHERE upload_id = ?", uploadId);

  for (const sheet of sheets) {
    const mapping = mappings.find((item) => item.name === sheet.name);
    if (!mapping?.include) continue;
    const headerSet = new Set(sheet.headers);
    const metrics = mapping.metrics.filter((item) => headerSet.has(item.header));
    if (!metrics.length) {
      stats.warnings.push(`${sheet.name} was skipped because no metric columns remained.`);
      continue;
    }
    const dateHeader = mapping.fields.date && headerSet.has(mapping.fields.date) ? mapping.fields.date : undefined;
    const hourHeader = mapping.fields.hour && headerSet.has(mapping.fields.hour) ? mapping.fields.hour : undefined;
    const storeHeader =
      mapping.fields.storeCode && headerSet.has(mapping.fields.storeCode) ? mapping.fields.storeCode : undefined;
    const departmentHeader =
      mapping.fields.department && headerSet.has(mapping.fields.department) ? mapping.fields.department : undefined;
    const descriptionHeader =
      mapping.fields.description && headerSet.has(mapping.fields.description) ? mapping.fields.description : undefined;
    const employeeHeader =
      mapping.fields.employee && headerSet.has(mapping.fields.employee) ? mapping.fields.employee : undefined;
    const employeeIdHeader =
      mapping.fields.employeeId && headerSet.has(mapping.fields.employeeId) ? mapping.fields.employeeId : undefined;
    if (storeHeader) sawStoreColumn = true;
    const monthGrain = Boolean(dateHeader && /month/i.test(dateHeader));
    const weekGrain = Boolean(dateHeader && /week/i.test(dateHeader));
    const sheetPeriod = dateHeader ? null : parseSheetPeriod(sheet.name);

    for (const record of sheet.records) {
      if (Object.values(record).some((value) => isTotalLabel(value))) continue;
      if (storeHeader) {
        const code = normCode(record[storeHeader]);
        if (!code || !codesEqual(code, store.code)) {
          stats.rowsSkipped += 1;
          if (code) other.add(code);
          continue;
        }
      }

      const parsedDate = dateHeader ? toIsoDate(record[dateHeader]) : sheetPeriod;
      const hour = hourHeader ? parseHour(record[hourHeader]) : null;
      const department = departmentHeader ? clip(record[departmentHeader], 120) : "";
      const description = descriptionHeader ? clip(record[descriptionHeader], 160) : "";
      const employee = employeeHeader ? clip(record[employeeHeader], 120) : "";
      const employeeId = employeeIdHeader ? clip(record[employeeIdHeader], 80) : "";
      const dim1 = department || employee;
      const dim2 = description || employeeId || (department ? employee : "");
      let wrote = false;
      for (const metric of metrics) {
        const value = parseNumber(record[metric.header]);
        if (value == null) continue;
        const grain = monthGrain || parsedDate?.hint === "month"
          ? "month"
          : weekGrain
            ? "week"
            : department || description
              ? "detail"
              : hour != null
                ? "hour"
                : parsedDate
                  ? "day"
                  : "period";
        rows.push([
          store.id,
          uploadId,
          category,
          sheet.name,
          metric.metric,
          parsedDate?.iso ?? null,
          hour,
          grain,
          dim1,
          dim2,
          value,
          metric.comparison,
        ]);
        stats.observations += 1;
        wrote = true;
        if (parsedDate) {
          const end = grain === "month" ? monthEnd(parsedDate.iso) : parsedDate.iso;
          if (!stats.periodStart || parsedDate.iso < stats.periodStart) stats.periodStart = parsedDate.iso;
          if (!stats.periodEnd || end > stats.periodEnd) stats.periodEnd = end;
        }
      }
      if (wrote) stats.rowsImported += 1;
    }
  }

  const insertSql = `INSERT INTO observations (
    store_id, upload_id, category, sheet, metric, period_date, hour, grain, dim1, dim2, value, comparison
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await sqlBatch(chunk.map((args) => ({ sql: insertSql, args })));
  }

  stats.otherCodes = [...other];
  if (!sawStoreColumn) {
    stats.warnings.push(`No store column was found. Every row was assigned to ${store.name}.`);
  } else if (stats.rowsSkipped) {
    const codes = stats.otherCodes.length ? ` (${stats.otherCodes.join(", ")})` : "";
    stats.warnings.push(`Skipped ${stats.rowsSkipped.toLocaleString()} rows for other store codes${codes}.`);
  }
  return stats;
}

function parseHour(value: unknown) {
  const number = parseNumber(value);
  if (number == null) return null;
  const hour = Math.trunc(number);
  if (hour < 0 || hour > 23) return null;
  return hour;
}

function clip(value: unknown, length: number) {
  return String(value ?? "").trim().slice(0, length);
}
