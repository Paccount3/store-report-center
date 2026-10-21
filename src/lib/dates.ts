export function toIsoDate(value: unknown): { iso: string; hint: "day" | "month" } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    const localMidnight = value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0;
    const useUtc = utcMidnight && !localMidnight;
    const year = useUtc ? value.getUTCFullYear() : value.getFullYear();
    const month = (useUtc ? value.getUTCMonth() : value.getMonth()) + 1;
    const day = useUtc ? value.getUTCDate() : value.getDate();
    return { iso: formatParts(year, month, day), hint: "day" };
  }

  if (typeof value === "number" && value > 20000 && value < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + Math.round(value) * 86400000);
    return { iso: dt.toISOString().slice(0, 10), hint: "day" };
  }

  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, hint: "day" };

  const monthOnly = text.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) return { iso: `${monthOnly[1]}-${monthOnly[2]}-01`, hint: "month" };

  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { iso: formatParts(year, month, day), hint: "day" };
  }

  const named = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (named) {
    const month = monthIndex(named[1]);
    if (!month) return null;
    return { iso: formatParts(Number(named[2]), month, 1), hint: "month" };
  }

  return null;
}

export function parseSheetPeriod(name: string): { iso: string; hint: "month" } | null {
  const text = name.trim();
  const numeric = text.match(/^(\d{1,2})\s*[:.\-]\s*(\d{2}|\d{4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    let year = Number(numeric[2]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      return { iso: formatParts(year, month, 1), hint: "month" };
    }
  }

  const named = text.match(/^([A-Za-z]+)\s*[:.\-]?\s*(\d{2}|\d{4})$/);
  if (named) {
    const month = monthIndex(named[1]);
    let year = Number(named[2]);
    if (month && year >= 0) {
      if (year < 100) year += 2000;
      if (year >= 2000 && year <= 2100) return { iso: formatParts(year, month, 1), hint: "month" };
    }
  }

  const parsed = toIsoDate(text);
  if (parsed?.hint === "month") return { iso: parsed.iso, hint: "month" };
  return null;
}

export function shiftYears(iso: string, years: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return formatParts(year + years, month, Math.min(day, last));
}

export function shiftDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

export function weekStart(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const weekday = dt.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function monthEnd(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatParts(year, month, last);
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function formatDay(iso: string, withYear = true) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatMonth(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatRange(from: string, to: string) {
  if (from === to) return formatDay(from);
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${formatDay(from, false)} – ${formatDay(to)}`;
  }
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export function monthBounds(ym: string) {
  return { from: `${ym}-01`, to: monthEnd(`${ym}-01`) };
}

export const MONTH_SECTION_NOTE =
  "Data for this section is broken down by month, not day. Change the date range to see this section.";

export function isCompleteMonths(from?: string | null, to?: string | null) {
  if (!from && !to) return true;
  if (!from || !to) return false;
  return from.endsWith("-01") && to === monthEnd(to);
}

function formatParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthIndex(name: string) {
  const key = name.toLowerCase();
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const exact = months.indexOf(key);
  if (exact !== -1) return exact + 1;
  if (key.length < 3) return null;
  const prefix = months.findIndex((month) => month.startsWith(key.slice(0, 3)));
  return prefix === -1 ? null : prefix + 1;
}
