import { mkdir } from "node:fs/promises";
import path from "node:path";

// The few things the app needs from a database. Production uses Postgres
// (DATABASE_URL, e.g. Neon); local development and tests use PGlite, an
// embedded Postgres that needs no install and stores data in .data/pglite.
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export const SCHEMA = `
  create table if not exists sales (
    id serial primary key,
    invoice_number text not null,
    customer_name text not null,
    sale_date date not null,
    commodity_category text not null,
    sku text not null default '',
    quantity integer not null default 1,
    price_cents integer not null default 0,
    invoice_amount_cents integer not null,
    discount_cents integer not null default 0,
    sales_tax_cents integer not null default 0,
    total_cents integer not null,
    sales_rep text not null,
    address text not null,
    zip_code text not null,
    phone text not null,
    email text not null,
    flags text[] not null default '{}',
    reviewed_at timestamptz,
    source text not null default 'website',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  -- Columns added after the first release; no-ops on new databases.
  alter table sales add column if not exists sku text not null default '';
  alter table sales add column if not exists quantity integer not null default 1;
  alter table sales add column if not exists price_cents integer not null default 0;
  alter table sales add column if not exists flags text[] not null default '{}';
  alter table sales add column if not exists reviewed_at timestamptz;
  alter table sales add column if not exists source text not null default 'website';
  -- Sales the AI read but wasn't confident about, waiting for the owner.
  create table if not exists drafts (
    id serial primary key,
    status text not null default 'open',
    source_kind text not null,
    source_label text not null,
    source_excerpt text not null default '',
    payload jsonb not null,
    reasons text[] not null default '{}',
    created_at timestamptz not null default now(),
    resolved_at timestamptz
  );
  -- Same problem found again on a later check → no second copy of the draft.
  alter table drafts add column if not exists dedupe_key text;
  create unique index if not exists drafts_dedupe_key on drafts (dedupe_key);
  -- Analysis Hub: the owner's uploads/edits on top of customers built from sales,
  -- or the sample customers; and the product inventory.
  create table if not exists hub_customer_overrides (
    key text primary key,
    fields jsonb not null default '{}',
    origin text not null,
    hidden boolean not null default false,
    updated_at timestamptz not null default now()
  );
  create table if not exists hub_products (
    code text primary key,
    name text not null,
    category text not null default '',
    price_cents integer not null default 0,
    cost_cents integer not null default 0,
    units_in_stock integer not null default 0,
    daily_usage double precision,
    ordering_days integer not null default 14,
    backup_units integer not null default 0,
    origin text not null,
    woo_id integer,
    updated_at timestamptz not null default now()
  );
  -- Small key/value store for background jobs (e.g. the WooCommerce sync).
  create table if not exists sync_state (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
  );
  create unique index if not exists sales_invoice_number_unique on sales (lower(invoice_number));
  create index if not exists sales_sale_date_idx on sales (sale_date);
`;

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    async query(sql, params) {
      return (await pool.query(sql, params)).rows;
    },
  };
}

export async function createPglite(dataDir?: string): Promise<Db & { exec(sql: string): Promise<unknown> }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  return {
    async query(sql, params) {
      return (await pg.query(sql, params)).rows as never[];
    },
    exec: (sql) => pg.exec(sql),
  };
}

let dbPromise: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  dbPromise ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) {
      const db = await createPostgres(url);
      const statements = SCHEMA.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
      for (const statement of statements) await db.query(statement);
      return db;
    }
    const dir = path.join(process.cwd(), ".data", "pglite");
    await mkdir(dir, { recursive: true });
    const db = await createPglite(dir);
    await db.exec(SCHEMA);
    return db;
  })();
  dbPromise.catch(() => (dbPromise = undefined));
  return dbPromise;
}
