import { createHash } from "node:crypto";
import { COMMODITY_CATEGORIES, SALES_REPS, STORE_GROUPINGS } from "./config";
import type { DraftsRepo } from "./drafts-repo";
import { processSale, type SalesStore } from "./process-sale";
import type { SyncState } from "./sync-state";

// Reads paid orders from the website's WooCommerce store with a read-only REST
// API key and adds them to the sheet, one row per product.

export const SOURCE = "woocommerce";
export const STATE_KEY = "woocommerce";
const PAID_STATUSES = "processing,completed";
const PAGE_SIZE = 50;
const MAX_PAGES_PER_RUN = 20; // 1,000 orders; the next run carries on from there
const BACKFILL_DAYS = 30; // how far back the very first check looks
const OVERLAP_MS = 2 * 60 * 1000; // re-read a little each time; duplicates are ignored

export type WooConfig = { url: string; key: string; secret: string };

export function wooConfig(): WooConfig | null {
  const url = process.env.WOOCOMMERCE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.WOOCOMMERCE_KEY?.trim();
  const secret = process.env.WOOCOMMERCE_SECRET?.trim();
  return url && key && secret ? { url, key, secret } : null;
}

// The parts of WooCommerce's order format (REST API v3) that we use.
export type WooAddress = {
  first_name?: string; last_name?: string; company?: string; address_1?: string; address_2?: string;
  city?: string; state?: string; postcode?: string; country?: string; email?: string; phone?: string;
};
export type WooLine = {
  id: number; name: string; product_id: number; quantity: number; subtotal: string; total: string; total_tax: string; sku: string;
};
export type WooOrder = {
  id: number; number: string; status: string; created_via?: string;
  date_created: string; date_paid: string | null; date_modified_gmt: string;
  billing: WooAddress; shipping?: WooAddress; line_items: WooLine[];
  meta_data?: { key: string; value: unknown }[];
};
export type WooCategory = { id: number; name: string; parent: number };
export type WooProduct = { id: number; categories: { id: number; name: string }[] };

export class WooError extends Error {}

export type WooFetch = (path: string, params: Record<string, string>) => Promise<{ body: unknown; totalPages: number }>;

export function createWooFetch(config: WooConfig, fetchImpl: typeof fetch = fetch): WooFetch {
  return async (path, params) => {
    const url = new URL(`${config.url}/wp-json/wc/v3/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const basic = `Basic ${Buffer.from(`${config.key}:${config.secret}`).toString("base64")}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: basic, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      // Some hosts strip the Authorization header; WooCommerce also accepts the
      // key as query parameters over HTTPS.
      if (res.status === 401 && url.protocol === "https:") {
        url.searchParams.set("consumer_key", config.key);
        url.searchParams.set("consumer_secret", config.secret);
        res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      }
    } catch {
      throw new WooError("Couldn't reach the website. It may be down or slow; the next check will try again.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new WooError("The website refused the key. Check WOOCOMMERCE_KEY and WOOCOMMERCE_SECRET, and that the key has Read access.");
    }
    if (res.status === 404) throw new WooError("The website's WooCommerce connection wasn't found. Check WOOCOMMERCE_URL.");
    if (!res.ok) throw new WooError(`The website answered with an error (${res.status}). The next check will try again.`);
    return { body: await res.json(), totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1) };
  };
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8243;/g, "″")
    .trim();
}

const cents = (value: string | number) => Math.round(Number(value) * 100);
const dollars = (c: number) => c / 100;

// Works out a product's category: each of its WooCommerce categories is traced
// up to its top level, store groupings are dropped, and what's left must be
// exactly one of our categories.
export function categorize(
  product: WooProduct | undefined,
  tree: Map<number, WooCategory>,
): { category: string } | { reason: string } {
  if (!product) return { reason: "The product no longer exists in WooCommerce, so its category is unknown" };
  const tops = new Set<string>();
  for (const assigned of product.categories) {
    let node = tree.get(assigned.id) ?? { id: assigned.id, name: assigned.name, parent: 0 };
    for (let guard = 0; node.parent && tree.has(node.parent) && guard < 20; guard++) node = tree.get(node.parent)!;
    tops.add(decode(node.name));
  }
  const groupings = new Set(STORE_GROUPINGS.map((g) => g.toLowerCase()));
  const real = [...tops].filter((t) => !groupings.has(t.toLowerCase()));
  const matched = [...new Set(real.map((t) => COMMODITY_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase()) ?? null))];
  if (matched.length === 1 && matched[0]) return { category: matched[0] };
  if (real.length === 0) return { reason: `The product is only in store groupings (${[...tops].join(", ") || "no category"}), not a product category` };
  if (matched.includes(null)) return { reason: `The product's category "${real.join(", ")}" isn't one of the sheet's categories` };
  return { reason: `The product is in more than one category (${real.join(", ")})` };
}

function repFor(order: WooOrder): string {
  const fromMeta = (order.meta_data ?? [])
    .filter((m) => /cashier|sales_?rep|served_?by|staff|agent/i.test(m.key) && typeof m.value === "string")
    .map((m) => String(m.value).trim());
  const named = fromMeta.find((v) => SALES_REPS.some((r) => r.toLowerCase() === v.toLowerCase()));
  if (named) return SALES_REPS.find((r) => r.toLowerCase() === named.toLowerCase())!;
  return /pos/i.test(order.created_via ?? "") ? "In-store" : "Website";
}

function addressOf(a: WooAddress | undefined): string {
  if (!a) return "";
  return [a.address_1, a.address_2, a.city, a.state].map((p) => p?.trim()).filter(Boolean).join(", ");
}

export type MappedLine = { order: WooOrder; line: WooLine; payload: Record<string, unknown>; reasons: string[] };

export function mapOrder(order: WooOrder, products: Map<number, WooProduct>, tree: Map<number, WooCategory>): MappedLine[] {
  const billing = order.billing ?? {};
  const shipping = order.shipping ?? {};
  const person = [billing.first_name, billing.last_name].filter(Boolean).join(" ").trim();
  const shipPerson = [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
  const useShipping = !addressOf(billing) && !!addressOf(shipping);
  const rep = repFor(order);

  return order.line_items
    .filter((line) => line.quantity > 0)
    .map((line, i) => {
      const reasons: string[] = [];
      const cat = categorize(products.get(line.product_id), tree);
      if ("reason" in cat) reasons.push(cat.reason);
      if (!line.sku?.trim()) reasons.push(`"${decode(line.name)}" has no SKU in WooCommerce`);
      const subtotal = cents(line.subtotal);
      const discount = Math.max(0, subtotal - cents(line.total));
      const payload = {
        invoiceNumber: `${order.number}-${i + 1}`,
        customerName: decode(billing.company?.trim() || person || shipping.company?.trim() || shipPerson || ""),
        date: (order.date_paid ?? order.date_created).slice(0, 10),
        commodityCategory: "category" in cat ? cat.category : "",
        sku: line.sku?.trim() ?? "",
        quantity: line.quantity,
        price: dollars(Math.round(subtotal / line.quantity)),
        invoiceAmount: dollars(subtotal),
        discount: dollars(discount),
        salesTax: dollars(cents(line.total_tax)),
        salesRep: rep,
        address: decode(useShipping ? addressOf(shipping) : addressOf(billing)),
        zipCode: (useShipping ? shipping.postcode : billing.postcode)?.trim() ?? "",
        phone: billing.phone?.trim() || shipping.phone?.trim() || "",
        email: billing.email?.trim() ?? "",
        productName: decode(line.name),
      };
      return { order, line, payload, reasons };
    });
}

export type SyncStatus = {
  configured: boolean;
  lastRunAt?: string;
  lastOk?: boolean;
  message?: string;
  checkpoint?: string;
  last?: { orders: number; saved: number; alreadyRecorded: number; heldForReview: number };
};

export type SyncDeps = { woo: WooFetch; sales: SalesStore; drafts: DraftsRepo; state: SyncState; now?: () => Date };

export async function loadCategoryTree(woo: WooFetch): Promise<Map<number, WooCategory>> {
  const tree = new Map<number, WooCategory>();
  for (let page = 1; page <= 20; page++) {
    const { body, totalPages } = await woo("products/categories", { per_page: "100", page: String(page) });
    for (const c of body as WooCategory[]) tree.set(c.id, c);
    if (page >= totalPages) break;
  }
  return tree;
}

async function loadProducts(woo: WooFetch, ids: number[]): Promise<Map<number, WooProduct>> {
  const products = new Map<number, WooProduct>();
  const unique = [...new Set(ids.filter((id) => id > 0))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { body } = await woo("products", { include: chunk.join(","), per_page: "100" });
    for (const p of body as WooProduct[]) products.set(p.id, p);
  }
  return products;
}

let running: Promise<SyncStatus> | null = null;

// One check: reads orders paid or changed since the last check and records
// them. Safe to run often and to overlap; only one check runs at a time.
export function syncWooCommerce(deps: SyncDeps): Promise<SyncStatus> {
  running ??= runSync(deps).finally(() => {
    running = null;
  });
  return running;
}

async function runSync({ woo, sales, drafts, state, now = () => new Date() }: SyncDeps): Promise<SyncStatus> {
  const previous = (await state.get<SyncStatus>(STATE_KEY)) ?? { configured: true };
  const startedAt = now();
  const since = previous.checkpoint
    ? new Date(new Date(previous.checkpoint).getTime() - OVERLAP_MS)
    : new Date(startedAt.getTime() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  const counts = { orders: 0, saved: 0, alreadyRecorded: 0, heldForReview: 0 };
  let checkpoint = previous.checkpoint ?? since.toISOString();

  try {
    const tree = await loadCategoryTree(woo);
    for (let page = 1; page <= MAX_PAGES_PER_RUN; page++) {
      const { body, totalPages } = await woo("orders", {
        status: PAID_STATUSES,
        modified_after: since.toISOString(),
        dates_are_gmt: "true",
        orderby: "modified",
        order: "asc",
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const orders = body as WooOrder[];
      const products = await loadProducts(woo, orders.flatMap((o) => o.line_items.map((l) => l.product_id)));

      for (const order of orders) {
        counts.orders++;
        for (const { line, payload, reasons } of mapOrder(order, products, tree)) {
          const { productName, ...sale } = payload;
          if (reasons.length === 0) {
            const result = await processSale(sale, sales, SOURCE);
            if (result.status === 201) {
              counts.saved++;
              continue;
            }
            if (result.status === 200) {
              counts.alreadyRecorded++;
              continue;
            }
            reasons.push(
              result.status === 409
                ? "This order was changed in WooCommerce after it was recorded in the sheet. Compare them and update the sheet if needed"
                : `WooCommerce's details didn't pass the sheet's checks: ${Object.values((result.body.fields as Record<string, string>) ?? {}).join("; ")}`,
            );
          }
          const fingerprint = createHash("sha256").update(JSON.stringify(sale)).digest("hex").slice(0, 16);
          const draft = await drafts.insert(
            {
              sourceKind: SOURCE,
              sourceLabel: `WooCommerce order #${order.number} · ${productName}`,
              sourceExcerpt: "",
              payload: sale,
              reasons,
            },
            `${SOURCE}:${order.id}:${line.id}:${fingerprint}`,
          );
          if (draft) counts.heldForReview++;
        }
        if (order.date_modified_gmt) checkpoint = maxIso(checkpoint, `${order.date_modified_gmt.replace(/Z$/, "")}Z`);
      }
      if (page >= totalPages || orders.length === 0) break;
    }
    const status: SyncStatus = { configured: true, lastRunAt: startedAt.toISOString(), lastOk: true, checkpoint, last: counts, message: summary(counts) };
    await state.set(STATE_KEY, status);
    return status;
  } catch (err) {
    const message = err instanceof WooError ? err.message : "The check failed unexpectedly; the next one will try again.";
    if (!(err instanceof WooError)) console.error("WooCommerce sync failed", err);
    // Keep the old checkpoint so nothing is skipped; anything already saved is safe.
    const status: SyncStatus = { ...previous, configured: true, lastRunAt: startedAt.toISOString(), lastOk: false, message, last: counts };
    await state.set(STATE_KEY, status);
    return status;
  }
}

function maxIso(a: string, b: string): string {
  return new Date(b).getTime() > new Date(a).getTime() ? new Date(b).toISOString() : a;
}

function summary(c: { saved: number; heldForReview: number }): string {
  const parts: string[] = [];
  if (c.saved) parts.push(`${c.saved} new ${c.saved === 1 ? "sale" : "sales"} added`);
  if (c.heldForReview) parts.push(`${c.heldForReview} held for review`);
  return parts.join(", ") || "No new sales";
}

export async function readStatus(state: SyncState): Promise<SyncStatus> {
  if (!wooConfig()) return { configured: false };
  return (await state.get<SyncStatus>(STATE_KEY)) ?? { configured: true };
}
