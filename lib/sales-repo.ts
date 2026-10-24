import type { Db } from "./db";
import { DuplicateInvoiceError, type SalesStore } from "./process-sale";
import { toCents } from "./total";
import type { Sale } from "./validate";

export type SaleRecord = Sale & {
  id: number;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  needsReview: boolean;
  source: string;
};

export const SORTABLE = {
  invoiceNumber: "lower(invoice_number)",
  customerName: "lower(customer_name)",
  date: "sale_date",
  commodityCategory: "commodity_category",
  sku: "lower(sku)",
  quantity: "quantity",
  price: "price_cents",
  invoiceAmount: "invoice_amount_cents",
  discount: "discount_cents",
  salesTax: "sales_tax_cents",
  totalAmount: "total_cents",
  salesRep: "sales_rep",
  createdAt: "created_at",
} as const;

export type SortKey = keyof typeof SORTABLE;

export type Filters = {
  q?: string;
  category?: string;
  rep?: string;
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  review?: boolean; // only sales flagged and not yet reviewed
  sort: SortKey;
  dir: "asc" | "desc";
  page: number; // 1-based
  pageSize: number;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function realDate(value: string): string | undefined {
  const match = DATE_RE.exec(value);
  if (!match) return undefined;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : undefined;
}

// Search text and list values: drop invisible control characters (Postgres
// rejects null bytes) and cap the length.
function cleanParam(value: string | null, max = 200): string | undefined {
  const cleaned = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned || undefined;
}

// Largest id Postgres's integer column can hold.
export const MAX_ID = 2_147_483_647;

export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  return {
    q: cleanParam(params.get("q")),
    category: cleanParam(params.get("category")),
    rep: cleanParam(params.get("rep")),
    from: realDate(params.get("from") ?? ""),
    to: realDate(params.get("to") ?? ""),
    review: params.get("review") === "1" || undefined,
    // hasOwn, not "in": "__proto__" or "toString" must not count as a column.
    sort: sort && Object.hasOwn(SORTABLE, sort) ? (sort as SortKey) : "date",
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 500) : 50,
  };
}

function where(filters: Filters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    add(
      "(invoice_number ilike ? or customer_name ilike ? or sku ilike ? or email ilike ? or phone ilike ? or address ilike ? or zip_code ilike ?)",
      like,
    );
  }
  if (filters.category) add("commodity_category = ?", filters.category);
  if (filters.rep) add("sales_rep = ?", filters.rep);
  if (filters.from) add("sale_date >= ?", filters.from);
  if (filters.to) add("sale_date <= ?", filters.to);
  if (filters.review) clauses.push(NEEDS_REVIEW_SQL);
  return { sql: clauses.length ? `where ${clauses.join(" and ")}` : "", params };
}

const NEEDS_REVIEW_SQL = "(cardinality(flags) > 0 and reviewed_at is null)";

const COLUMNS_SQL = `
  id, invoice_number, customer_name, to_char(sale_date, 'YYYY-MM-DD') as sale_date, commodity_category,
  sku, quantity, price_cents, invoice_amount_cents, discount_cents, sales_tax_cents, total_cents, sales_rep, address, zip_code, phone, email,
  flags, reviewed_at, source, created_at, updated_at`;

type Row = {
  id: number;
  invoice_number: string;
  customer_name: string;
  sale_date: string;
  commodity_category: string;
  sku: string;
  quantity: number;
  price_cents: number;
  invoice_amount_cents: number;
  discount_cents: number;
  sales_tax_cents: number;
  total_cents: number;
  sales_rep: string;
  address: string;
  zip_code: string;
  phone: string;
  email: string;
  flags: string[] | null;
  reviewed_at: Date | string | null;
  source: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toRecord(row: Row): SaleRecord {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    date: row.sale_date,
    commodityCategory: row.commodity_category,
    sku: row.sku,
    quantity: row.quantity,
    price: row.price_cents / 100,
    invoiceAmount: row.invoice_amount_cents / 100,
    discount: row.discount_cents / 100,
    salesTax: row.sales_tax_cents / 100,
    totalAmount: row.total_cents / 100,
    salesRep: row.sales_rep,
    address: row.address,
    zipCode: row.zip_code,
    phone: row.phone,
    email: row.email,
    flags: row.flags ?? [],
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    needsReview: (row.flags ?? []).length > 0 && !row.reviewed_at,
    source: row.source ?? "website",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function saleParams(sale: Sale): unknown[] {
  return [
    sale.invoiceNumber,
    sale.customerName,
    sale.date,
    sale.commodityCategory,
    sale.sku,
    sale.quantity,
    toCents(sale.price),
    toCents(sale.invoiceAmount),
    toCents(sale.discount),
    toCents(sale.salesTax),
    toCents(sale.totalAmount),
    sale.salesRep,
    sale.address,
    sale.zipCode,
    sale.phone,
    sale.email,
    sale.flags,
  ];
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export type GroupTotal = { key: string; count: number; total: number };

export type Summary = {
  count: number;
  invoiceAmount: number;
  discount: number;
  salesTax: number;
  total: number;
  byRep: GroupTotal[];
  byCategory: GroupTotal[];
  byMonth: GroupTotal[]; // key is YYYY-MM
};

export function createSalesRepo(db: Db) {
  async function group(expr: string, filters: Filters, orderBy: string): Promise<GroupTotal[]> {
    const w = where(filters);
    const rows = await db.query<{ key: string; count: string | number; total: string | number }>(
      `select ${expr} as key, count(*) as count, coalesce(sum(total_cents), 0) as total
       from sales ${w.sql} group by 1 order by ${orderBy}`,
      w.params,
    );
    return rows.map((r) => ({ key: r.key, count: Number(r.count), total: Number(r.total) / 100 }));
  }

  return {
    async findInvoice(invoiceNumber: string): Promise<SaleRecord | null> {
      const [row] = await db.query<Row>(`select ${COLUMNS_SQL} from sales where lower(invoice_number) = lower($1)`, [
        invoiceNumber.trim(),
      ]);
      return row ? toRecord(row) : null;
    },

    async insert(sale: Sale, source = "website"): Promise<SaleRecord> {
      try {
        const [row] = await db.query<Row>(
          `insert into sales (invoice_number, customer_name, sale_date, commodity_category, sku, quantity, price_cents,
             invoice_amount_cents, discount_cents, sales_tax_cents, total_cents, sales_rep, address, zip_code, phone, email, flags, source)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           returning ${COLUMNS_SQL}`,
          [...saleParams(sale), source],
        );
        return toRecord(row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new DuplicateInvoiceError(sale.invoiceNumber);
        throw err;
      }
    },

    // markReviewed records that the owner checked the flags. If an edit changes
    // the flags, the sale needs review again.
    async update(id: number, sale: Sale, options: { markReviewed?: boolean } = {}): Promise<SaleRecord | null> {
      try {
        const [row] = await db.query<Row>(
          `update sales set invoice_number = $1, customer_name = $2, sale_date = $3, commodity_category = $4,
             sku = $5, quantity = $6, price_cents = $7, invoice_amount_cents = $8, discount_cents = $9,
             sales_tax_cents = $10, total_cents = $11, sales_rep = $12, address = $13, zip_code = $14, phone = $15,
             email = $16, flags = $17,
             reviewed_at = case when $19::boolean then now() when flags is distinct from $17::text[] then null else reviewed_at end,
             updated_at = now()
           where id = $18
           returning ${COLUMNS_SQL}`,
          [...saleParams(sale), id, options.markReviewed === true],
        );
        return row ? toRecord(row) : null;
      } catch (err) {
        if (isUniqueViolation(err)) throw new DuplicateInvoiceError(sale.invoiceNumber);
        throw err;
      }
    },

    async countNeedsReview(): Promise<number> {
      const [row] = await db.query<{ count: string | number }>(`select count(*) as count from sales where ${NEEDS_REVIEW_SQL}`);
      return Number(row.count);
    },

    async remove(id: number): Promise<boolean> {
      const rows = await db.query("delete from sales where id = $1 returning id", [id]);
      return rows.length > 0;
    },

    async list(filters: Filters): Promise<{ rows: SaleRecord[]; total: number }> {
      const w = where(filters);
      const order = `${SORTABLE[filters.sort]} ${filters.dir}, id ${filters.dir}`;
      const offset = (filters.page - 1) * filters.pageSize;
      const [rows, [count]] = await Promise.all([
        db.query<Row>(
          `select ${COLUMNS_SQL} from sales ${w.sql} order by ${order}
           limit ${filters.pageSize} offset ${offset}`,
          w.params,
        ),
        db.query<{ count: string | number }>(`select count(*) as count from sales ${w.sql}`, w.params),
      ]);
      return { rows: rows.map(toRecord), total: Number(count.count) };
    },

    // Every matching row, for the Excel download.
    async all(filters: Filters): Promise<SaleRecord[]> {
      const w = where(filters);
      const rows = await db.query<Row>(
        `select ${COLUMNS_SQL} from sales ${w.sql} order by ${SORTABLE[filters.sort]} ${filters.dir}, id ${filters.dir}`,
        w.params,
      );
      return rows.map(toRecord);
    },

    async summary(filters: Filters): Promise<Summary> {
      const w = where(filters);
      const [[totals], byRep, byCategory, byMonth] = await Promise.all([
        db.query<Record<string, string | number>>(
          `select count(*) as count, coalesce(sum(invoice_amount_cents), 0) as invoice,
             coalesce(sum(discount_cents), 0) as discount, coalesce(sum(sales_tax_cents), 0) as tax,
             coalesce(sum(total_cents), 0) as total
           from sales ${w.sql}`,
          w.params,
        ),
        group("sales_rep", filters, "3 desc"),
        group("commodity_category", filters, "3 desc"),
        group("to_char(sale_date, 'YYYY-MM')", filters, "1 asc"),
      ]);
      return {
        count: Number(totals.count),
        invoiceAmount: Number(totals.invoice) / 100,
        discount: Number(totals.discount) / 100,
        salesTax: Number(totals.tax) / 100,
        total: Number(totals.total) / 100,
        byRep,
        byCategory,
        byMonth,
      };
    },
  };
}

export type SalesRepo = ReturnType<typeof createSalesRepo>;

// Adapter for processSale (the website endpoint). The unique index is the
// real duplicate guard, so concurrent requests can never both get in.
export function salesStore(repo: SalesRepo): SalesStore {
  return {
    findInvoice: (invoiceNumber) => repo.findInvoice(invoiceNumber),
    appendSale: async (sale, source) => {
      await repo.insert(sale, source);
    },
  };
}
