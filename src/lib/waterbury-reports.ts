import { isCompleteMonths, monthEnd } from "./dates";
import { WATERBURY_DONORS, WATERBURY_ECOMM } from "./demo/waterbury-source";

export type DonorRow = {
  date: string;
  store: string;
  donors: number;
};

export type EcommRow = {
  month: string;
  sourceFile: string;
  supplierName: string;
  totalItemsSold: number;
  totalItemRevenue: number;
  avgItemValue: number;
  maxItemValue: number;
  minItemValue: number;
};

export function waterburyDonors(storeCode: string, from?: string | null, to?: string | null): DonorRow[] {
  if (storeCode !== "210") return [];
  return WATERBURY_DONORS.filter((row) => overlaps(row.date, row.date, from, to)).map((row) => ({
    date: row.date,
    store: row.store,
    donors: row.donors,
  }));
}

export function waterburyEcomm(storeCode: string, from?: string | null, to?: string | null): EcommRow[] {
  if (storeCode !== "210") return [];
  if (!isCompleteMonths(from, to)) return [];
  return WATERBURY_ECOMM.filter((row) => {
    const start = `${row.month}-01`;
    const end = monthEnd(start);
    if (from && from > start) return false;
    if (to && to < end) return false;
    return true;
  }).map((row) => ({
    month: row.month,
    sourceFile: row.sourceFile,
    supplierName: row.supplierName,
    totalItemsSold: row.totalItemsSold,
    totalItemRevenue: row.totalItemRevenue,
    avgItemValue: row.avgItemValue,
    maxItemValue: row.maxItemValue,
    minItemValue: row.minItemValue,
  }));
}

function overlaps(start: string, end: string, from?: string | null, to?: string | null) {
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}
