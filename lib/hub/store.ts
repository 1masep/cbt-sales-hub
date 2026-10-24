// Analysis Hub data: customers built from the sales records (with the owner's
// uploads and edits layered on top), or the sample customers; and the product
// inventory (from WooCommerce, uploads, edits, or the starter sample).
import { createHash } from "node:crypto";
import type { Db } from "../db";
import { addDays, type CustomerRow, type ProductRow } from "./metrics";
import { type MonthPoint } from "./projection";
import { sampleCustomers, sampleProducts } from "./sample";

export type CustomerSource = "records" | "sample";
type HubState = { customers?: CustomerSource };
const STATE_KEY = "analysis-hub";

const CENSUS: Record<string, string> = Object.fromEntries(
  [
    ["Northeast", "CT ME MA NH RI VT NJ NY PA"],
    ["Midwest", "IL IN MI OH WI IA KS MN MO NE ND SD"],
    ["Southeast", "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA"],
    ["Southwest", "AZ NM OK TX"],
    ["West", "CO ID MT NV UT WY AK CA HI OR WA"],
  ].flatMap(([region, states]) => states.split(" ").map((s) => [s, region])),
);

export function regionFromAddress(address: string, zip: string): string {
  const state = [...address.toUpperCase().matchAll(/(?:^|[\s,])([A-Z]{2})(?=\s*(?:\d{5}|,|$))/g)].map((m) => m[1]).pop();
  if (state && CENSUS[state]) return CENSUS[state];
  if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(zip.trim())) return "Canada";
  return "Other";
}

export function customerIdFor(key: string): string {
  return `C${String(parseInt(createHash("sha1").update(key).digest("hex").slice(0, 8), 16) % 90000 + 10000)}`;
}

export const customerKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const dollars = (cents: unknown) => Math.round(Number(cents ?? 0)) / 100;

export function createHubStore(db: Db, now: () => Date = () => new Date()) {
  async function state(): Promise<HubState> {
    const [row] = await db.query<{ value: HubState | string }>("select value from sync_state where key = $1", [STATE_KEY]);
    return row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : {};
  }
  async function setState(next: HubState) {
    await db.query(
      `insert into sync_state (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [STATE_KEY, JSON.stringify(next)],
    );
  }

  // Customers from the sales records. "Last year" covers the same dates as
  // this year so far, so a partial year isn't compared with a full one.
  async function fromRecords(): Promise<CustomerRow[]> {
    const today = now();
    const y = today.getUTCFullYear();
    const tyEnd = today.toISOString().slice(0, 10);
    const lyEnd = `${y - 1}${tyEnd.slice(4)}`.replace(`${y - 1}-02-29`, `${y - 1}-02-28`);
    const totals = await db.query<Record<string, string | number | null>>(
      `select lower(trim(customer_name)) as key, max(customer_name) as name,
         sum(case when sale_date between $1 and $2 then total_cents else 0 end) as ly,
         sum(case when sale_date between $3 and $4 then total_cents else 0 end) as ty,
         sum(case when sale_date between $3 and $4 and extract(month from sale_date) between 1 and 3 then total_cents else 0 end) as q1,
         sum(case when sale_date between $3 and $4 and extract(month from sale_date) between 4 and 6 then total_cents else 0 end) as q2,
         sum(case when sale_date between $3 and $4 and extract(month from sale_date) between 7 and 9 then total_cents else 0 end) as q3,
         sum(case when sale_date between $3 and $4 and extract(month from sale_date) between 10 and 12 then total_cents else 0 end) as q4,
         to_char(max(sale_date), 'YYYY-MM-DD') as last_date
       from sales group by 1`,
      [`${y - 1}-01-01`, lyEnd, `${y}-01-01`, tyEnd],
    );
    // Whoever (or whatever) accounts for the most of this year's sales;
    // customers with no sales this year fall back to all their sales.
    const top = async (column: string) => {
      const rows = await db.query<{ key: string; v: string; ty: string | number; t: string | number }>(
        `select lower(trim(customer_name)) as key, ${column} as v,
           sum(case when sale_date >= $1 then total_cents else 0 end) as ty, sum(total_cents) as t
         from sales group by 1, 2`,
        [`${y}-01-01`],
      );
      const best = new Map<string, { v: string; ty: number; t: number }>();
      for (const r of rows) {
        const cur = best.get(r.key);
        const cand = { v: r.v, ty: Number(r.ty), t: Number(r.t) };
        if (!cur || cand.ty > cur.ty || (cand.ty === cur.ty && cand.t > cur.t)) best.set(r.key, cand);
      }
      return new Map([...best].map(([k, b]) => [k, b.v]));
    };
    const [reps, categories, places] = await Promise.all([
      top("sales_rep"),
      top("commodity_category"),
      db.query<{ key: string; name: string; address: string; zip_code: string }>(
        "select lower(trim(customer_name)) as key, trim(customer_name) as name, address, zip_code from sales order by sale_date desc, id desc",
      ),
    ]);
    // Name spelling and address come from the customer's most recent sale.
    const place = new Map<string, { name: string; address: string; zip: string }>();
    for (const p of places) if (!place.has(p.key)) place.set(p.key, { name: p.name, address: p.address, zip: p.zip_code });

    return totals.map((t) => {
      const key = String(t.key);
      const where = place.get(key);
      return {
        key,
        customerId: customerIdFor(key),
        name: where?.name ?? String(t.name),
        salesperson: reps.get(key) ?? "",
        region: where ? regionFromAddress(where.address, where.zip) : "Other",
        mainProduct: categories.get(key) ?? "",
        lastYearSales: dollars(t.ly),
        thisYearSales: dollars(t.ty),
        q1: dollars(t.q1),
        q2: dollars(t.q2),
        q3: dollars(t.q3),
        q4: dollars(t.q4),
        lastContactDate: (t.last_date as string) ?? null,
        origin: "records" as const,
      };
    });
  }

  // Sample customers live under their own key prefix so a sample name can
  // never collide with an uploaded or edited customer of the same name.
  const SAMPLE = "sample:";
  const sampleKey = (key: string) => SAMPLE + key;

  type OverrideRow = { key: string; fields: Partial<CustomerRow> | string; origin: string; hidden: boolean };
  async function overrides(origins: string[]): Promise<OverrideRow[]> {
    return db.query<OverrideRow>("select key, fields, origin, hidden from hub_customer_overrides where origin = any($1::text[])", [origins]);
  }
  const fieldsOf = (o: OverrideRow) => (typeof o.fields === "string" ? JSON.parse(o.fields) : o.fields) as Partial<CustomerRow>;

  async function source(): Promise<CustomerSource> {
    const s = await state();
    if (s.customers) return s.customers;
    // First visit: use the records when they hold any last-year sales to
    // compare against; otherwise start with the sample so the hub is useful.
    const records = await fromRecords();
    return records.some((r) => r.lastYearSales > 0) ? "records" : "sample";
  }

  async function ensureSample() {
    const [row] = await db.query<{ n: string | number }>(`select count(*) as n from hub_customer_overrides where key like '${SAMPLE}%'`);
    if (Number(row.n) === 0) await resetSample();
  }

  async function resetSample() {
    await db.query(`delete from hub_customer_overrides where origin = 'sample' or key like '${SAMPLE}%'`);
    const rows = sampleCustomers(600, now());
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await db.query(
        `insert into hub_customer_overrides (key, fields, origin) select * from unnest($1::text[], $2::jsonb[], $3::text[])`,
        [chunk.map((r) => sampleKey(r.key)), chunk.map((r) => JSON.stringify(r)), chunk.map(() => "sample")],
      );
    }
  }

  return {
    source,

    async setSource(next: CustomerSource, resetSampleRows = false) {
      if (next === "sample" && resetSampleRows) await resetSample();
      await setState({ ...(await state()), customers: next });
    },

    async customers(): Promise<{ source: CustomerSource; rows: CustomerRow[] }> {
      const src = await source();
      if (src === "sample") {
        await ensureSample();
        const rows = (await overrides(["sample"])).filter((o) => !o.hidden).map((o) => ({ ...(fieldsOf(o) as CustomerRow), key: o.key.slice(SAMPLE.length), origin: "sample" as const }));
        return { source: src, rows: rows.sort((a, b) => a.customerId.localeCompare(b.customerId)) };
      }
      const base = new Map((await fromRecords()).map((r) => [r.key, r]));
      for (const o of await overrides(["upload", "edit"])) {
        if (o.key.startsWith(SAMPLE)) continue;
        if (o.hidden) {
          base.delete(o.key);
          continue;
        }
        const derived = base.get(o.key);
        const merged = { ...(derived ?? blankCustomer(o.key)), ...fieldsOf(o), key: o.key, origin: o.origin as CustomerRow["origin"] };
        base.set(o.key, merged);
      }
      return { source: src, rows: [...base.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    },

    // Save the owner's edit to one customer (only the changed fields, so new
    // sales keep updating everything else).
    async saveCustomer(key: string | null, fields: Partial<CustomerRow>): Promise<string> {
      const src = await source();
      const origin = src === "sample" ? "sample" : "edit";
      const rowKey = key ?? `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const clean = Object.fromEntries(Object.entries(fields).filter(([k]) => !["key", "origin"].includes(k)));
      await db.query(
        `insert into hub_customer_overrides (key, fields, origin) values ($1, $2::jsonb, $3)
         on conflict (key) do update set fields = hub_customer_overrides.fields || excluded.fields, hidden = false, updated_at = now(),
           origin = case when hub_customer_overrides.origin in ('upload', 'sample') then hub_customer_overrides.origin else excluded.origin end`,
        [src === "sample" ? sampleKey(rowKey) : rowKey, JSON.stringify(clean), origin],
      );
      return rowKey;
    },

    async deleteCustomer(key: string): Promise<void> {
      const src = await source();
      if (src === "sample") {
        await db.query("delete from hub_customer_overrides where key = $1", [sampleKey(key)]);
        return;
      }
      await db.query(
        `insert into hub_customer_overrides (key, fields, origin, hidden) values ($1, '{}'::jsonb, 'edit', true)
         on conflict (key) do update set hidden = true, updated_at = now()`,
        [key],
      );
    },

    // Rows from an uploaded workbook replace earlier uploads for the same customers.
    async importCustomers(rows: CustomerRow[]): Promise<void> {
      for (const r of rows) {
        const { key, origin, ...fields } = r;
        void origin;
        await db.query(
          `insert into hub_customer_overrides (key, fields, origin) values ($1, $2::jsonb, 'upload')
           on conflict (key) do update set fields = excluded.fields, origin = 'upload', hidden = false, updated_at = now()`,
          [key, JSON.stringify(fields)],
        );
      }
      await setState({ ...(await state()), customers: "records" });
    },

    // Clears uploads and edits: back to what the sales records say.
    async clearCustomerChanges(): Promise<void> {
      await db.query("delete from hub_customer_overrides where origin in ('upload', 'edit')");
    },

    // Monthly sales totals from the records, for the trend and projection.
    async monthlySales(): Promise<MonthPoint[]> {
      const rows = await db.query<{ month: string; cents: string | number }>(
        `select to_char(sale_date, 'YYYY-MM') as month, sum(total_cents) as cents from sales
         where sale_date >= $1 group by 1 order by 1`,
        [`${now().getUTCFullYear() - 3}-01-01`],
      );
      const current = now().toISOString().slice(0, 7);
      return rows.filter((r) => r.month < current).map((r) => ({ month: r.month, sales: dollars(r.cents) }));
    },

    // ---------- products ----------

    async products(): Promise<ProductRow[]> {
      let rows = await db.query<Record<string, unknown>>("select * from hub_products order by category, name");
      if (rows.length === 0) {
        for (const p of sampleProducts()) await upsertProduct(db, p);
        rows = await db.query<Record<string, unknown>>("select * from hub_products order by category, name");
      }
      const usage = await usageFromSales(db, now());
      return rows.map((r) => ({
        code: String(r.code),
        name: String(r.name),
        category: String(r.category),
        sellingPrice: dollars(r.price_cents),
        unitCost: dollars(r.cost_cents),
        unitsInStock: Number(r.units_in_stock),
        // Daily usage the owner typed wins; otherwise it comes from the last 90 days of sales.
        dailyUsage: r.daily_usage === null || r.daily_usage === undefined ? (usage.get(String(r.code).toLowerCase()) ?? 0) : Number(r.daily_usage),
        orderingDays: Number(r.ordering_days),
        backupStock: Number(r.backup_units),
        origin: r.origin as ProductRow["origin"],
      }));
    },

    async saveProduct(code: string, fields: Partial<ProductRow>, origin: ProductRow["origin"] = "edit"): Promise<void> {
      const [existing] = await db.query<Record<string, unknown>>("select * from hub_products where code = $1", [code]);
      const base: ProductRow = existing
        ? {
            code,
            name: String(existing.name),
            category: String(existing.category),
            sellingPrice: dollars(existing.price_cents),
            unitCost: dollars(existing.cost_cents),
            unitsInStock: Number(existing.units_in_stock),
            dailyUsage: existing.daily_usage === null ? NaN : Number(existing.daily_usage),
            orderingDays: Number(existing.ordering_days),
            backupStock: Number(existing.backup_units),
            origin: existing.origin as ProductRow["origin"],
          }
        : { code, name: code, category: "", sellingPrice: 0, unitCost: 0, unitsInStock: 0, dailyUsage: NaN, orderingDays: 14, backupStock: 0, origin };
      await upsertProduct(db, { ...base, ...fields, code, origin: existing?.origin === "woocommerce" ? "woocommerce" : origin });
    },

    async renameProduct(oldCode: string, newCode: string): Promise<void> {
      await db.query("update hub_products set code = $2, updated_at = now() where code = $1", [oldCode, newCode]);
    },

    async deleteProduct(code: string): Promise<void> {
      await db.query("delete from hub_products where code = $1", [code]);
    },

    async removeSampleProducts(): Promise<void> {
      await db.query("delete from hub_products where origin = 'sample'");
    },
  };
}

function blankCustomer(key: string): CustomerRow {
  return {
    key,
    customerId: customerIdFor(key),
    name: "",
    salesperson: "",
    region: "",
    mainProduct: "",
    lastYearSales: 0,
    thisYearSales: 0,
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    lastContactDate: null,
    origin: "edit",
  };
}

export async function upsertProduct(db: Db, p: ProductRow): Promise<void> {
  const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
  await db.query(
    `insert into hub_products (code, name, category, price_cents, cost_cents, units_in_stock, daily_usage, ordering_days, backup_units, origin, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (code) do update set name = excluded.name, category = excluded.category, price_cents = excluded.price_cents,
       cost_cents = excluded.cost_cents, units_in_stock = excluded.units_in_stock, daily_usage = excluded.daily_usage,
       ordering_days = excluded.ordering_days, backup_units = excluded.backup_units, origin = excluded.origin, updated_at = now()`,
    [
      p.code,
      p.name,
      p.category,
      cents(p.sellingPrice),
      cents(p.unitCost),
      Math.round(p.unitsInStock || 0),
      Number.isFinite(p.dailyUsage) ? p.dailyUsage : null,
      Math.round(p.orderingDays || 0),
      Math.round(p.backupStock || 0),
      p.origin,
    ],
  );
}

// Units sold per day of each SKU over the last 90 days.
async function usageFromSales(db: Db, today: Date): Promise<Map<string, number>> {
  const since = addDays(today, -90);
  const rows = await db.query<{ sku: string; units: string | number }>(
    "select lower(sku) as sku, sum(quantity) as units from sales where sale_date >= $1 group by 1",
    [since],
  );
  return new Map(rows.map((r) => [r.sku, Math.round((Number(r.units) / 90) * 100) / 100]));
}

export type HubStore = ReturnType<typeof createHubStore>;
