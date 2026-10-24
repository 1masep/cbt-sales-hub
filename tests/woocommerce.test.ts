import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPglite, SCHEMA } from "../lib/db";
import { createDraftsRepo, type DraftsRepo } from "../lib/drafts-repo";
import { createSalesRepo, parseFilters, salesStore, type SalesRepo } from "../lib/sales-repo";
import { createSyncState, type SyncState } from "../lib/sync-state";
import {
  categorize,
  createWooFetch,
  mapOrder,
  syncWooCommerce,
  WooError,
  type WooCategory,
  type WooFetch,
  type WooOrder,
  type WooProduct,
} from "../lib/woocommerce";

// A slice of the real store's category tree (names as WooCommerce returns them).
const CATEGORIES: WooCategory[] = [
  { id: 186, name: "Bath", parent: 0 },
  { id: 200, name: "Blissful Towels", parent: 186 },
  { id: 201, name: "Normal Hem Towels", parent: 200 },
  { id: 480, name: "Kitchen", parent: 0 },
  { id: 5395, name: "Restaurant", parent: 0 },
  { id: 5402, name: "Cups &amp; Lids", parent: 0 },
  { id: 5380, name: "SALE Items", parent: 0 },
  { id: 5400, name: "New Products", parent: 0 },
  { id: 9000, name: "Gift Cards", parent: 0 },
];
const tree = new Map(CATEGORIES.map((c) => [c.id, c]));

const PRODUCTS: WooProduct[] = [
  { id: 11, categories: [{ id: 201, name: "Normal Hem Towels" }] },
  { id: 12, categories: [{ id: 480, name: "Kitchen" }, { id: 5380, name: "SALE Items" }] },
  { id: 13, categories: [{ id: 5402, name: "Cups &amp; Lids" }] },
  { id: 14, categories: [{ id: 5400, name: "New Products" }] },
  { id: 15, categories: [{ id: 480, name: "Kitchen" }, { id: 5395, name: "Restaurant" }] },
  { id: 16, categories: [{ id: 9000, name: "Gift Cards" }] },
];
const products = new Map(PRODUCTS.map((p) => [p.id, p]));

function order(overrides: Partial<WooOrder> = {}): WooOrder {
  return {
    id: 7001,
    number: "5821",
    status: "processing",
    created_via: "checkout",
    date_created: "2026-10-23T09:12:40",
    date_paid: "2026-10-23T09:13:02",
    date_modified_gmt: "2026-10-23T14:13:05",
    billing: {
      first_name: "Ana",
      last_name: "Ruiz",
      company: "Seaside Inn &amp; Suites",
      address_1: "12 Ocean Ave",
      address_2: "Suite 4",
      city: "Myrtle Beach",
      state: "SC",
      postcode: "29577",
      email: "purchasing@seasideinn.example",
      phone: "843-555-0121",
    },
    shipping: {},
    line_items: [
      { id: 1, name: "Bath towel 27x54 (dozen)", product_id: 11, quantity: 3, subtotal: "193.50", total: "174.15", total_tax: "10.88", sku: "BT-TWL-27" },
      { id: 2, name: "Half-size steam pan", product_id: 12, quantity: 4, subtotal: "75.00", total: "67.50", total_tax: "4.22", sku: "KT-PAN-HALF" },
    ],
    meta_data: [],
    ...overrides,
  };
}

describe("categorize", () => {
  it("traces a sub-category up to its top-level category", () => {
    expect(categorize(products.get(11), tree)).toEqual({ category: "Bath" });
  });
  it("ignores store groupings like SALE Items", () => {
    expect(categorize(products.get(12), tree)).toEqual({ category: "Kitchen" });
  });
  it("decodes HTML in category names", () => {
    expect(categorize(products.get(13), tree)).toEqual({ category: "Cups & Lids" });
  });
  it("can't place a product that's only in a store grouping", () => {
    expect(categorize(products.get(14), tree)).toMatchObject({ reason: expect.stringMatching(/only in store groupings \(New Products\)/) });
  });
  it("can't choose between two real categories", () => {
    expect(categorize(products.get(15), tree)).toMatchObject({ reason: expect.stringMatching(/more than one category \(Kitchen, Restaurant\)/) });
  });
  it("flags a category the sheet doesn't have", () => {
    expect(categorize(products.get(16), tree)).toMatchObject({ reason: expect.stringMatching(/"Gift Cards" isn't one of the sheet's categories/) });
  });
  it("flags a deleted product", () => {
    expect(categorize(undefined, tree)).toMatchObject({ reason: expect.stringMatching(/no longer exists/) });
  });
});

describe("mapOrder", () => {
  it("turns each product line into a row with WooCommerce's exact figures", () => {
    const [a, b] = mapOrder(order(), products, tree);
    expect(a.reasons).toEqual([]);
    expect(a.payload).toMatchObject({
      invoiceNumber: "5821-1",
      customerName: "Seaside Inn & Suites",
      date: "2026-10-23",
      commodityCategory: "Bath",
      sku: "BT-TWL-27",
      quantity: 3,
      price: 64.5,
      invoiceAmount: 193.5,
      discount: 19.35,
      salesTax: 10.88,
      salesRep: "Website",
      address: "12 Ocean Ave, Suite 4, Myrtle Beach, SC",
      zipCode: "29577",
      phone: "843-555-0121",
      email: "purchasing@seasideinn.example",
    });
    expect(b.payload).toMatchObject({ invoiceNumber: "5821-2", commodityCategory: "Kitchen", discount: 7.5, salesTax: 4.22 });
  });

  it("uses the person's name when there's no company, and shipping when billing has no address", () => {
    const [row] = mapOrder(
      order({
        billing: { first_name: "Ana", last_name: "Ruiz", email: "ana@example.com" },
        shipping: { address_1: "9 Pier Rd", city: "Charleston", state: "SC", postcode: "29401" },
        line_items: [order().line_items[0]],
      }),
      products,
      tree,
    );
    expect(row.payload).toMatchObject({ customerName: "Ana Ruiz", address: "9 Pier Rd, Charleston, SC", zipCode: "29401" });
  });

  it("marks point-of-sale orders as In-store", () => {
    expect(mapOrder(order({ created_via: "pos-rest-api" }), products, tree)[0].payload.salesRep).toBe("In-store");
  });

  it("holds lines with no SKU or no clear category", () => {
    const rows = mapOrder(
      order({
        line_items: [
          { id: 3, name: "Custom embroidery", product_id: 11, quantity: 1, subtotal: "40.00", total: "40.00", total_tax: "0", sku: "" },
          { id: 4, name: "Mystery box", product_id: 14, quantity: 1, subtotal: "10.00", total: "10.00", total_tax: "0", sku: "MB-1" },
        ],
      }),
      products,
      tree,
    );
    expect(rows[0].reasons).toEqual(['"Custom embroidery" has no SKU in WooCommerce']);
    expect(rows[1].reasons[0]).toMatch(/store groupings/);
  });

  it("rounds the unit price to cents when the subtotal doesn't divide evenly", () => {
    const [row] = mapOrder(
      order({ line_items: [{ id: 5, name: "Cups", product_id: 13, quantity: 3, subtotal: "10.00", total: "10.00", total_tax: "0.63", sku: "CL-CUP-12" }] }),
      products,
      tree,
    );
    expect(row.payload).toMatchObject({ price: 3.33, invoiceAmount: 10 });
  });
});

describe("createWooFetch", () => {
  const config = { url: "https://shop.example", key: "ck_test", secret: "cs_test" };

  it("calls the v3 API with the read-only key and reports page counts", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { headers: { "x-wp-totalpages": "3" } }));
    const woo = createWooFetch(config, fetchImpl as never);
    expect(await woo("orders", { page: "1" })).toEqual({ body: [], totalPages: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://shop.example/wp-json/wc/v3/orders?page=1");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`);
  });

  it("retries with the key in the address when the host strips the auth header", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 401 })).mockResolvedValueOnce(new Response("[]"));
    await createWooFetch(config, fetchImpl as never)("orders", {});
    expect(String(fetchImpl.mock.calls[1][0])).toContain("consumer_key=ck_test");
  });

  it.each([
    [401, /refused the key/],
    [404, /wasn't found/],
    [500, /error \(500\)/],
  ])("explains a %s answer", async (status, message) => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status }));
    await expect(createWooFetch(config, fetchImpl as never)("orders", {})).rejects.toThrow(message);
  });

  it("explains an unreachable website", async () => {
    const woo = createWooFetch(config, (async () => Promise.reject(new TypeError("fetch failed"))) as never);
    await expect(woo("orders", {})).rejects.toBeInstanceOf(WooError);
  });
});

describe("syncWooCommerce (the 5-minute check)", () => {
  let repo: SalesRepo;
  let drafts: DraftsRepo;
  let state: SyncState;
  let orders: WooOrder[];
  let calls: { path: string; params: Record<string, string> }[];
  let fail = false;
  const now = () => new Date("2026-10-24T15:00:00Z");

  const woo: WooFetch = async (path, params) => {
    calls.push({ path, params });
    if (fail) throw new WooError("Couldn't reach the website.");
    if (path === "products/categories") return { body: CATEGORIES, totalPages: 1 };
    if (path === "products") {
      const ids = params.include.split(",").map(Number);
      return { body: PRODUCTS.filter((p) => ids.includes(p.id)), totalPages: 1 };
    }
    const page = Number(params.page);
    const per = 2; // small pages so paging is exercised
    return { body: orders.slice((page - 1) * per, page * per), totalPages: Math.max(1, Math.ceil(orders.length / per)) };
  };
  const run = () => syncWooCommerce({ woo, sales: salesStore(repo), drafts, state, now });
  const sheet = async () => (await repo.list(parseFilters(new URLSearchParams("sort=invoiceNumber&dir=asc&pageSize=500")))).rows;

  beforeEach(async () => {
    const db = await createPglite();
    await db.exec(SCHEMA);
    repo = createSalesRepo(db);
    drafts = createDraftsRepo(db);
    state = createSyncState(db);
    calls = [];
    fail = false;
    orders = [
      order(),
      order({ id: 7002, number: "5822", date_modified_gmt: "2026-10-24T10:00:00", line_items: [order().line_items[1]] }),
      order({
        id: 7003,
        number: "5823",
        created_via: "pos-rest-api",
        date_modified_gmt: "2026-10-24T11:30:00",
        line_items: [{ id: 9, name: "Mystery box", product_id: 14, quantity: 1, subtotal: "10.00", total: "10.00", total_tax: "0", sku: "MB-1" }],
      }),
    ];
  });

  it("first check looks back 30 days for paid orders, oldest changes first", async () => {
    await run();
    const orderCall = calls.find((c) => c.path === "orders")!;
    expect(orderCall.params).toMatchObject({
      status: "processing,completed",
      modified_after: "2026-09-24T15:00:00.000Z",
      dates_are_gmt: "true",
      orderby: "modified",
      order: "asc",
    });
  });

  it("adds every clear line, holds the rest, and records where it got to", async () => {
    const status = await run();
    expect(status).toMatchObject({ lastOk: true, last: { orders: 3, saved: 3, alreadyRecorded: 0, heldForReview: 1 }, checkpoint: "2026-10-24T11:30:00.000Z" });
    expect(status.message).toBe("3 new sales added, 1 held for review");
    expect((await sheet()).map((r) => [r.invoiceNumber, r.source, r.salesRep])).toEqual([
      ["5821-1", "woocommerce", "Website"],
      ["5821-2", "woocommerce", "Website"],
      ["5822-1", "woocommerce", "Website"],
    ]);
    const [draft] = await drafts.listOpen();
    expect(draft).toMatchObject({ sourceKind: "woocommerce", sourceLabel: "WooCommerce order #5823 · Mystery box" });
    expect(draft.payload.salesRep).toBe("In-store");
  });

  it("is safe to run again and again: nothing doubled, no repeat drafts", async () => {
    await run();
    const second = await run();
    expect(second.last).toMatchObject({ saved: 0, heldForReview: 0 });
    expect(await sheet()).toHaveLength(3);
    expect(await drafts.countOpen()).toBe(1);
    // A discarded draft doesn't come back on the next check either.
    await drafts.resolve((await drafts.listOpen())[0].id, "discarded");
    await run();
    expect(await drafts.countOpen()).toBe(0);
  });

  it("only asks for orders changed since the last check (with a small overlap)", async () => {
    await run();
    calls = [];
    await run();
    expect(calls.find((c) => c.path === "orders")!.params.modified_after).toBe("2026-10-24T11:28:00.000Z");
  });

  it("holds an order that was changed in WooCommerce after it was recorded", async () => {
    await run();
    orders[0] = { ...order(), date_modified_gmt: "2026-10-24T12:00:00", line_items: [{ ...order().line_items[0], quantity: 5, subtotal: "322.50", total: "322.50", total_tax: "20.16" }, order().line_items[1]] };
    const status = await run();
    expect(status.last?.heldForReview).toBe(1);
    const changed = (await drafts.listOpen()).find((d) => d.payload.invoiceNumber === "5821-1")!;
    expect(changed.reasons[0]).toMatch(/changed in WooCommerce after it was recorded/);
    expect((await sheet()).find((r) => r.invoiceNumber === "5821-1")!.quantity).toBe(3);
  });

  it("when the website can't be reached, says so and keeps its place", async () => {
    await run();
    fail = true;
    const status = await run();
    expect(status).toMatchObject({ lastOk: false, message: "Couldn't reach the website.", checkpoint: "2026-10-24T11:30:00.000Z" });
  });
});

describe("status message", () => {
  it("says 'No new sales' when a check finds only orders already in the sheet", async () => {
    const db = await createPglite();
    await db.exec(SCHEMA);
    const deps = {
      woo: (async (path: string) =>
        path === "orders" ? { body: [], totalPages: 1 } : { body: path === "products/categories" ? CATEGORIES : [], totalPages: 1 }) as WooFetch,
      sales: salesStore(createSalesRepo(db)),
      drafts: createDraftsRepo(db),
      state: createSyncState(db),
    };
    expect((await syncWooCommerce(deps)).message).toBe("No new sales");
  });
});
