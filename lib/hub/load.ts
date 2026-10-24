import { getDb } from "../db";
import type { CustomerRow, ProductRow } from "./metrics";
import { combineMonthly, monthlyFromCustomers, type MonthPoint } from "./projection";
import { createHubStore, type CustomerSource } from "./store";

export type HubData = { source: CustomerSource; customers: CustomerRow[]; products: ProductRow[]; monthly: MonthPoint[]; today: string };

export async function hubStore() {
  return createHubStore(await getDb());
}

// Everything the Analysis Hub page and its Excel report need.
export async function loadHub(today = new Date()): Promise<HubData> {
  const store = await hubStore();
  const [{ source, rows }, products] = await Promise.all([store.customers(), store.products()]);
  const estimated = monthlyFromCustomers(rows, today);
  // Sample customers have no sales records behind them; real ones use the
  // actual monthly sales, with estimates only where records are missing.
  const monthly = source === "sample" ? estimated : combineMonthly(await store.monthlySales(), estimated);
  return { source, customers: rows, products, monthly, today: today.toISOString().slice(0, 10) };
}
