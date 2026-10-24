import { beforeEach, describe, expect, it } from "vitest";
import { createPglite, SCHEMA } from "../lib/db";
import { DuplicateInvoiceError, processSale } from "../lib/process-sale";
import { createSalesRepo, parseFilters, salesStore, type SalesRepo } from "../lib/sales-repo";
import { validateSale, type Sale } from "../lib/validate";
import { validSale } from "./fixtures";

function sale(overrides: Record<string, unknown> = {}): Sale {
  const result = validateSale(validSale(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.sale;
}

const filters = (query = "") => parseFilters(new URLSearchParams(query));

let repo: SalesRepo;

beforeEach(async () => {
  const db = await createPglite(); // in-memory, fresh per test
  await db.exec(SCHEMA);
  repo = createSalesRepo(db);
});

describe("website sales (processSale)", () => {
  it("saves a new sale and returns 201", async () => {
    const result = await processSale(validSale(), salesStore(repo));
    expect(result.status).toBe(201);
    const { rows } = await repo.list(filters());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceNumber: "INV-1001",
      sku: "EL-HDMI-2M",
      quantity: 4,
      price: 250,
      totalAmount: 1026,
      zipCode: "01105",
      date: "2026-10-24",
    });
  });

  it("answers an identical re-send as already recorded and saves nothing new (any case/spacing)", async () => {
    await processSale(validSale(), salesStore(repo));
    const result = await processSale(validSale({ invoiceNumber: " inv-1001 " }), salesStore(repo));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, alreadyRecorded: true });
    expect((await repo.list(filters())).total).toBe(1);
  });

  it("refuses a different sale that reuses an invoice number with a 409 conflict", async () => {
    await processSale(validSale(), salesStore(repo));
    const result = await processSale(validSale({ quantity: 9 }), salesStore(repo));
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ conflict: true });
    const { rows } = await repo.list(filters());
    expect(rows.map((r) => r.quantity)).toEqual([4]);
  });

  it("saves one of many simultaneous identical sales and answers the rest as already recorded", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => processSale(validSale(), salesStore(repo))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(4);
  });

  it("flags simultaneous different sales with the same invoice number as conflicts", async () => {
    const results = await Promise.all([1, 2, 3].map((quantity) => processSale(validSale({ quantity }), salesStore(repo))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it("does not save anything when validation fails", async () => {
    const result = await processSale(validSale({ email: "bad" }), salesStore(repo));
    expect(result.status).toBe(400);
    expect((await repo.list(filters())).total).toBe(0);
  });
});

describe("dashboard queries", () => {
  beforeEach(async () => {
    await repo.insert(sale({ invoiceNumber: "A-1", sku: "AP-HOOD-M", quantity: 10, price: 10, date: "2026-09-03", commodityCategory: "Bath", salesRep: "In-store", invoiceAmount: 100, discount: 0, salesTax: 5, customerName: "Birch & Co" }));
    await repo.insert(sale({ invoiceNumber: "A-2", date: "2026-10-10", commodityCategory: "Kitchen", salesRep: "Website", invoiceAmount: 500, discount: 50, salesTax: 30 }));
    await repo.insert(sale({ invoiceNumber: "A-3", date: "2026-10-20", commodityCategory: "Kitchen", salesRep: "In-store", invoiceAmount: 200, discount: 0, salesTax: 10, email: "owner@100%real.com" }));
  });

  it("sorts newest first by default and pages", async () => {
    expect((await repo.list(filters())).rows.map((r) => r.invoiceNumber)).toEqual(["A-3", "A-2", "A-1"]);
    const page2 = await repo.list(filters("pageSize=2&page=2"));
    expect(page2.rows.map((r) => r.invoiceNumber)).toEqual(["A-1"]);
    expect(page2.total).toBe(3);
  });

  it("sorts by any column, ignoring unknown sort keys", async () => {
    expect((await repo.list(filters("sort=totalAmount&dir=asc"))).rows.map((r) => r.invoiceNumber)).toEqual(["A-1", "A-3", "A-2"]);
    expect((await repo.list(filters("sort=drop table&dir=asc"))).rows[0].invoiceNumber).toBe("A-1");
    expect((await repo.list(filters("sort=quantity&dir=desc"))).rows[0].invoiceNumber).toBe("A-1");
  });

  it("filters by category, rep, date range and search text", async () => {
    expect((await repo.list(filters("category=Kitchen"))).total).toBe(2);
    expect((await repo.list(filters("rep=In-store&category=Kitchen"))).rows[0].invoiceNumber).toBe("A-3");
    expect((await repo.list(filters("from=2026-10-01&to=2026-10-10"))).rows.map((r) => r.invoiceNumber)).toEqual(["A-2"]);
    expect((await repo.list(filters("q=birch"))).rows.map((r) => r.invoiceNumber)).toEqual(["A-1"]);
    expect((await repo.list(filters("q=hood"))).rows.map((r) => r.invoiceNumber)).toEqual(["A-1"]);
  });

  it("treats % and _ in search as plain text", async () => {
    expect((await repo.list(filters("q=100%25real"))).rows.map((r) => r.invoiceNumber)).toEqual(["A-3"]);
    expect((await repo.list(filters("q=%25"))).total).toBe(1);
  });

  it("summarises totals by rep, category and month for the current filters", async () => {
    const all = await repo.summary(filters());
    expect(all).toMatchObject({ count: 3, invoiceAmount: 800, discount: 50, salesTax: 45, total: 795 });
    expect(all.byRep).toEqual([
      { key: "Website", count: 1, total: 480 },
      { key: "In-store", count: 2, total: 315 },
    ]);
    expect(all.byMonth).toEqual([
      { key: "2026-09", count: 1, total: 105 },
      { key: "2026-10", count: 2, total: 690 },
    ]);
    expect((await repo.summary(filters("category=Bath"))).total).toBe(105);
  });

  it("updates a sale and recalculated total", async () => {
    const [target] = (await repo.list(filters("q=A-1"))).rows;
    const updated = await repo.update(target.id, sale({ invoiceNumber: "A-1", sku: "AP-HOOD-L", quantity: 3, price: 40, invoiceAmount: 120, discount: 20, salesTax: 6 }));
    expect(updated).toMatchObject({ invoiceNumber: "A-1", sku: "AP-HOOD-L", quantity: 3, price: 40, totalAmount: 106 });
    expect(await repo.update(99999, sale())).toBeNull();
  });

  it("refuses to give a sale another sale's invoice number", async () => {
    const [target] = (await repo.list(filters("q=A-1"))).rows;
    await expect(repo.update(target.id, sale({ invoiceNumber: "a-2" }))).rejects.toBeInstanceOf(DuplicateInvoiceError);
  });

  it("filters to sales that need review, and marking reviewed clears them", async () => {
    const flagged = await repo.insert(sale({ invoiceNumber: "F-1", phone: "", zipCode: "K1A 0B1" }));
    expect(flagged).toMatchObject({ flags: ["Postal code isn't a US zip code", "No phone number"], needsReview: true });
    expect(flagged.flags).toHaveLength(2);
    expect(await repo.countNeedsReview()).toBe(1);
    expect((await repo.list(filters("review=1"))).rows.map((r) => r.invoiceNumber)).toEqual(["F-1"]);

    const reviewed = await repo.update(flagged.id, sale({ invoiceNumber: "F-1", phone: "", zipCode: "K1A 0B1" }), { markReviewed: true });
    expect(reviewed).toMatchObject({ needsReview: false });
    expect(reviewed!.reviewedAt).not.toBeNull();
    expect(await repo.countNeedsReview()).toBe(0);

    // An edit that keeps the same flags stays reviewed…
    const same = await repo.update(flagged.id, sale({ invoiceNumber: "F-1", phone: "", zipCode: "K1A 0B1", customerName: "Renamed" }));
    expect(same).toMatchObject({ needsReview: false });
    // …but one that changes them needs review again.
    const changed = await repo.update(flagged.id, sale({ invoiceNumber: "F-1", phone: "+44 20 7946 0958", zipCode: "K1A 0B1" }));
    expect(changed).toMatchObject({ needsReview: true, reviewedAt: null });
    // Fixing the details removes the flags entirely.
    const fixed = await repo.update(flagged.id, sale({ invoiceNumber: "F-1" }));
    expect(fixed).toMatchObject({ flags: [], needsReview: false });
  });

  it("deletes a sale", async () => {
    const [target] = (await repo.list(filters("q=A-1"))).rows;
    expect(await repo.remove(target.id)).toBe(true);
    expect(await repo.remove(target.id)).toBe(false);
    expect((await repo.list(filters())).total).toBe(2);
  });
});
