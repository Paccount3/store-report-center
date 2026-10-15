import * as XLSX from "xlsx";
import { cleanHeader, headerScore } from "./mapping";

export type ParsedSheet = {
  name: string;
  headerRow: number;
  headers: string[];
  records: Record<string, unknown>[];
};

const EXTENSIONS = new Set([".csv", ".tsv", ".txt", ".xlsx", ".xls", ".pdf"]);

export function extensionOf(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

export function assertSupported(filename: string) {
  const extension = extensionOf(filename);
  if (!EXTENSIONS.has(extension)) {
    throw new Error("Upload a CSV, TSV, Excel workbook (.xlsx or .xls), or PDF.");
  }
  return extension;
}

export async function parseWorkbook(buffer: Buffer, filename: string): Promise<ParsedSheet[]> {
  const extension = assertSupported(filename);
  if (extension === ".pdf") return parsePdf(buffer);
  if (extension === ".tsv") {
    const workbook = XLSX.read(buffer.toString("utf8"), { type: "string", FS: "\t", cellDates: true });
    return sheetsFromWorkbook(workbook);
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return sheetsFromWorkbook(workbook);
}

function sheetsFromWorkbook(workbook: XLSX.WorkBook): ParsedSheet[] {
  const sheets: ParsedSheet[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }) as unknown[][];
    const parsed = tableFromMatrix(name, matrix);
    if (parsed) sheets.push(parsed);
  }
  return sheets;
}

export function tableFromMatrix(name: string, matrix: unknown[][]): ParsedSheet | null {
  const rows = matrix.filter((row) => Array.isArray(row) && row.some((cell) => cleanHeader(cell) !== ""));
  if (!rows.length) return null;

  let bestIndex = -1;
  let bestScore = 0;
  let bestWidth = 0;
  const scan = Math.min(rows.length, 30);
  for (let index = 0; index < scan; index += 1) {
    const score = headerScore(rows[index]);
    const width = rows[index].filter((cell) => cleanHeader(cell) !== "").length;
    if (score > bestScore || (score === bestScore && score > 0 && width > bestWidth)) {
      bestIndex = index;
      bestScore = score;
      bestWidth = width;
    }
  }
  if (bestIndex < 0 || bestWidth < 2 || bestScore < 1) return null;

  const headers = uniqueHeaders(rows[bestIndex]);
  const records: Record<string, unknown>[] = [];
  for (const row of rows.slice(bestIndex + 1)) {
    const record: Record<string, unknown> = {};
    let filled = false;
    headers.forEach((header, index) => {
      const value = row[index] ?? null;
      record[header] = value;
      if (cleanHeader(value) !== "") filled = true;
    });
    if (!filled) continue;
    if (headers.every((header, index) => cleanHeader(row[index]) === header)) continue;
    records.push(record);
  }
  if (!records.length) return null;
  if (records.length > 250_000) {
    throw new Error("This file has more than 250,000 data rows. Split it into smaller files.");
  }
  return { name, headerRow: bestIndex + 1, headers, records };
}

function uniqueHeaders(row: unknown[]) {
  const seen = new Map<string, number>();
  return row.map((cell, index) => {
    const base = cleanHeader(cell) || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

async function parsePdf(buffer: Buffer): Promise<ParsedSheet[]> {
  let text = "";
  try {
    const unpdf = await import("unpdf");
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
    const extracted = await unpdf.extractText(pdf, { mergePages: true });
    text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF parser failed";
    throw new Error(`Could not read this PDF (${message}). Export the report to Excel or CSV and upload that file.`);
  }
  const sheet = tableFromText(text);
  if (!sheet) {
    throw new Error(
      "This PDF did not contain a readable table. Text-based tables with columns, pipes, or 'Label: value' lines can be imported. Scanned image PDFs cannot.",
    );
  }
  return [sheet];
}

export function tableFromText(text: string): ParsedSheet | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const pipeLines = lines.filter((line) => line.includes("|"));
  if (pipeLines.length >= 2) {
    const matrix = pipeLines.map((line) => line.split("|").map((cell) => cell.trim()));
    const table = tableFromMatrix("PDF", matrix);
    if (table) return table;
  }

  const spaced = lines
    .map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()))
    .filter((row) => row.length > 1);
  if (spaced.length >= 3) {
    const table = tableFromMatrix("PDF", spaced);
    if (table) return table;
  }

  const pairs = lines
    .map((line) => line.match(/^([^:|]+):\s*(-?\d[\d,]*(?:\.\d+)?)\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  if (pairs.length >= 2) {
    return {
      name: "PDF",
      headerRow: 1,
      headers: ["Metric", "Value"],
      records: pairs.map((match) => ({ Metric: match[1].trim(), Value: match[2].replace(/,/g, "") })),
    };
  }

  const commaLines = lines.filter((line) => line.split(",").length > 2);
  if (commaLines.length >= 3) {
    const matrix = commaLines.map((line) => line.split(",").map((cell) => cell.trim()));
    return tableFromMatrix("PDF", matrix);
  }
  return null;
}
