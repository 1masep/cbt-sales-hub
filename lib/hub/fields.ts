import type { CustomerRow, ProductRow } from "./metrics";

// Cleans what the owner typed in the hub's spreadsheets before it's saved.
const text = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(Math.max(-99_999_999, Math.min(99_999_999, n)) * 100) / 100 : 0;
};
const count = (v: unknown) => Math.max(0, Math.min(10_000_000, Math.round(money(v))));
const date = (v: unknown) => {
  const s = text(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

export function cleanCustomerFields(input: Record<string, unknown>): Partial<CustomerRow> {
  const out: Partial<CustomerRow> = {};
  for (const k of ["customerId", "name", "salesperson", "region", "mainProduct"] as const) if (k in input) out[k] = text(input[k], k === "customerId" ? 40 : 200);
  for (const k of ["lastYearSales", "thisYearSales", "q1", "q2", "q3", "q4"] as const) if (k in input) out[k] = money(input[k]);
  if ("lastContactDate" in input) out.lastContactDate = date(input.lastContactDate);
  return out;
}

export function cleanProductFields(input: Record<string, unknown>): Partial<ProductRow> {
  const out: Partial<ProductRow> = {};
  for (const k of ["name", "category"] as const) if (k in input) out[k] = text(input[k]);
  for (const k of ["sellingPrice", "unitCost"] as const) if (k in input) out[k] = Math.max(0, money(input[k]));
  for (const k of ["unitsInStock", "orderingDays", "backupStock"] as const) if (k in input) out[k] = count(input[k]);
  if ("dailyUsage" in input) {
    const v = input.dailyUsage;
    out.dailyUsage = v === null || v === "" ? Number.NaN : Math.max(0, Math.min(100_000, money(v))); // blank = work it out from sales
  }
  return out;
}

export const cleanCode = (v: unknown) => text(v, 64);
