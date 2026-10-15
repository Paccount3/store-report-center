export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (!text || text === "-" || text === "—" || text === "–") return null;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[$,%\s]/g, "").replace(/[()]/g, "").replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

export function normCode(value: unknown) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  const text = String(value).trim();
  if (/^\d+\.0+$/.test(text)) return String(parseInt(text, 10));
  return text;
}

export function codesEqual(left: unknown, right: unknown) {
  const a = normCode(left);
  const b = normCode(right);
  if (!a || !b) return false;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return parseInt(a, 10) === parseInt(b, 10);
  return a.toLowerCase() === b.toLowerCase();
}

export function slugMetric(header: string) {
  const slug = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `custom:${slug || "value"}`;
}

export function isTotalLabel(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return text === "total" || text === "grand total" || text === "subtotal" || text.startsWith("total ");
}
