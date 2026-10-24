import { beforeEach, describe, expect, it } from "vitest";
import { createPglite, SCHEMA } from "../lib/db";
import {
  alarmsBySalesperson,
  callListCsv,
  NEXT_STEPS,
  nextStepFor,
  outreachMessage,
  scorecard,
  topCustomers,
  viewCustomers,
  viewProducts,
  type CustomerRow,
  type ProductRow,
} from "../lib/hub/metrics";
import { combineMonthly, monthlyFromCustomers, project, shiftMonth, type MonthPoint } from "../lib/hub/projection";
import { sampleCustomers, sampleProducts } from "../lib/hub/sample";
import { createHubStore, regionFromAddress } from "../lib/hub/store";
import { createSalesRepo } from "../lib/sales-repo";
import { validateSale } from "../lib/validate";
import { validSale } from "./fixtures";

const TODAY = new Date("2026-10-24T12:00:00Z");

function customer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    key: "harbor inn", customerId: "C10001", name: "Harbor Inn", salesperson: "Website", region: "Northeast", mainProduct: "Bath",
    lastYearSales: 1000, thisYearSales: 1000, q1: 250, q2: 250, q3: 250, q4: 250, lastContactDate: "2026-10-14", origin: "records",
    ...overrides,
  };
}

describe("Action Guide (exact wording from the brief)", () => {
  it.each([
    [-35, NEXT_STEPS.largeDrop],
    [-20, NEXT_STEPS.largeDrop],
    [-19.99, NEXT_STEPS.moderateDrop],
    [-10, NEXT_STEPS.moderateDrop],
    [-9.5, NEXT_STEPS.smallDrop],
    [-1, NEXT_STEPS.smallDrop],
    [-0.5, NEXT_STEPS.smallDrop],
    [0.5, NEXT_STEPS.steadyGrowth],
    [19.99, NEXT_STEPS.steadyGrowth],
    [20, NEXT_STEPS.strongGrowth],
    [140, NEXT_STEPS.strongGrowth],
    [0, NEXT_STEPS.unchanged],
  ])("a %s%% yearly change gets the right next step", (pct, step) => {
    expect(nextStepFor(pct, 100, 100).step).toBe(step);
  });

  it("uses the brief's text verbatim", () => {
    expect(NEXT_STEPS.largeDrop).toBe("Urgent Owner/Manager Check-In: Call within 48 hours, review competitor pricing, and offer a 10% comeback discount.");
    expect(NEXT_STEPS.strongGrowth).toBe("Expand & Reward: Offer an annual volume agreement, introduce premium products, and give priority stock access.");
  });

  it("handles new customers and customers who stopped buying", () => {
    const [fresh, lost] = viewCustomers([customer({ lastYearSales: 0, thisYearSales: 500 }), customer({ key: "x", lastYearSales: 800, thisYearSales: 0 })], TODAY);
    expect([fresh.yearlyChangePct, fresh.trend, fresh.nextStep]).toEqual([null, "new", NEXT_STEPS.newCustomer]);
    expect([lost.yearlyChangePct, lost.trend, lost.nextStep]).toEqual([-100, "declined", NEXT_STEPS.largeDrop]);
  });
});

describe("customer calculations", () => {
  it("works out yearly change, share of total and days since contact", () => {
    const [a, b] = viewCustomers([customer({ lastYearSales: 2000, thisYearSales: 1500 }), customer({ key: "b", thisYearSales: 500 })], TODAY);
    expect(a).toMatchObject({ yearlyChange: -500, yearlyChangePct: -25, shareOfTotal: 75, daysSinceContact: 10 });
    expect(b).toMatchObject({ yearlyChange: -500, yearlyChangePct: -50, shareOfTotal: 25 });
  });

  it("builds the scorecard, counting alarms at the trigger", () => {
    const customers = viewCustomers(
      [
        customer({ key: "a", lastYearSales: 1000, thisYearSales: 1300 }),
        customer({ key: "b", lastYearSales: 1000, thisYearSales: 850 }), // -15%: on the trigger
        customer({ key: "c", lastYearSales: 1000, thisYearSales: 950 }),
      ],
      TODAY,
    );
    const products = viewProducts(sampleProducts(), TODAY);
    const card = scorecard(customers, products, -15);
    expect(card).toMatchObject({
      thisYearTotal: 3100, lastYearTotal: 3000, totalChange: 100, totalChangePct: 3.33,
      increasedCount: 1, increasedGain: 300, declinedCount: 2, declinedLoss: -200, alarmCount: 1,
    });
    expect(card.orderNowCount).toBe(products.filter((p) => p.status === "Order Now").length);
  });

  it("ranks the top 20 by this year's sales", () => {
    const rows = Array.from({ length: 30 }, (_, i) => customer({ key: `c${i}`, name: `C${i}`, thisYearSales: i * 10 }));
    const top = topCustomers(viewCustomers(rows, TODAY));
    expect(top).toHaveLength(20);
    expect(top[0].thisYearSales).toBe(290);
  });

  it("groups alarms by salesperson, biggest drop first, with an email and call list", () => {
    const customers = viewCustomers(
      [
        customer({ key: "a", name: "Alpha", salesperson: "In-store", lastYearSales: 1000, thisYearSales: 500 }),
        customer({ key: "b", name: "=Bravo", salesperson: "In-store", lastYearSales: 1000, thisYearSales: 800 }),
        customer({ key: "c", name: "Charlie", salesperson: "Website", lastYearSales: 1000, thisYearSales: 990 }),
      ],
      TODAY,
    );
    const groups = alarmsBySalesperson(customers, -15);
    expect([...groups.keys()]).toEqual(["In-store"]);
    expect(groups.get("In-store")!.map((c) => c.name)).toEqual(["Alpha", "=Bravo"]);
    const { subject, body } = outreachMessage("In-store", groups.get("In-store")!, -15);
    expect(subject).toBe("Customers to call: 2 down 15% or more this year");
    expect(body).toContain("1. Alpha (C10001): $1,000.00 last year → $500.00 this year (-50%).");
    expect(body).toContain(`Next step: ${NEXT_STEPS.largeDrop}`);
    const csv = callListCsv(groups.get("In-store")!);
    expect(csv.split("\n")[0]).toBe("Customer ID,Customer Name,Last Year Sales ($),This Year Sales ($),Yearly Change ($),Yearly Change (%),Last Contact Date,Recommended Next Step");
    expect(csv).toContain("'=Bravo"); // formula-looking names are neutralised
  });
});

describe("inventory ordering", () => {
  const product = (o: Partial<ProductRow>): ProductRow => ({
    code: "X", name: "X", category: "Bath", sellingPrice: 10, unitCost: 5, unitsInStock: 100, dailyUsage: 2, orderingDays: 10, backupStock: 10, origin: "edit", ...o,
  });

  it("orders now when stock is at or below the minimum level (ordering time × usage + backup)", () => {
    const [p] = viewProducts([product({ unitsInStock: 30 })], TODAY);
    expect(p).toMatchObject({ minimumStockLevel: 30, daysOfStockLeft: 15, status: "Order Now", orderByDate: "2026-10-24", suggestedOrderQty: 60 });
  });

  it("is running low within two weeks of the order-by date", () => {
    const [p] = viewProducts([product({ unitsInStock: 50 })], TODAY);
    expect(p).toMatchObject({ status: "Running Low", orderByDate: "2026-11-03" });
  });

  it("is healthy otherwise, with no order quantity", () => {
    const [p] = viewProducts([product({ unitsInStock: 200 })], TODAY);
    expect(p).toMatchObject({ status: "Healthy", suggestedOrderQty: 0, orderByDate: "2027-01-17" }); // (200 - 30) / 2 = 85 days
  });

  it("handles products nobody is buying", () => {
    const [p] = viewProducts([product({ dailyUsage: 0, backupStock: 0 })], TODAY);
    expect(p).toMatchObject({ daysOfStockLeft: null, status: "Healthy", orderByDate: null });
  });
});

describe("sales projection", () => {
  const months = (values: number[], start = "2024-11"): MonthPoint[] => values.map((sales, i) => ({ month: shiftMonth(start, i), sales }));

  it("projects a straight-line trend 12 months ahead by default range", () => {
    const p = project(months(Array.from({ length: 24 }, (_, i) => 1000 + 100 * i)), { monthsAhead: 12, trend: "straight", seasonal: false });
    const future = p.points.filter((x) => x.actual === null);
    expect(future).toHaveLength(12);
    expect(future[0]).toMatchObject({ month: "2026-11", projected: 3400 });
    expect(future[11].projected).toBe(4500);
    expect(future[0].low).toBeLessThanOrEqual(3400);
    expect(future[0].high).toBeGreaterThanOrEqual(3400);
  });

  it("follows steady % growth with the curved trend", () => {
    const p = project(months(Array.from({ length: 24 }, (_, i) => Math.round(1000 * 1.05 ** i))), { monthsAhead: 6, trend: "curved", seasonal: false });
    const next = p.points.find((x) => x.actual === null)!;
    expect(next.projected).toBeCloseTo(1000 * 1.05 ** 24, -1);
    expect(p.trendUsed).toBe("curved");
  });

  it("repeats seasonal peaks when seasonal patterns are on", () => {
    const shape = [0.8, 0.8, 0.9, 1, 1.1, 1.3, 1.4, 1.3, 1.1, 0.9, 0.7, 0.7];
    const history = months(Array.from({ length: 24 }, (_, i) => Math.round(2000 * shape[(i + 10) % 12])));
    const withSeason = project(history, { monthsAhead: 12, trend: "straight", seasonal: true });
    const july = withSeason.points.find((x) => x.month === "2027-07")!;
    const jan = withSeason.points.find((x) => x.month === "2027-01")!;
    expect(july.projected!).toBeGreaterThan(jan.projected! * 1.5);
    const flat = project(history, { monthsAhead: 12, trend: "straight", seasonal: false });
    expect(Math.abs(flat.points.find((x) => x.month === "2027-07")!.projected! - flat.points.find((x) => x.month === "2027-01")!.projected!)).toBeLessThan(200);
  });

  it("clamps months ahead to 6–24 and explains what it can't do yet", () => {
    expect(project(months([1, 2, 3, 4, 5]), { monthsAhead: 40, trend: "straight", seasonal: true }).points.filter((p) => p.actual === null)).toHaveLength(24);
    expect(project(months([1, 2, 3, 4, 5]), { monthsAhead: 12, trend: "straight", seasonal: true }).note).toMatch(/at least 12 months/);
    expect(project(months([5, 6]), { monthsAhead: 12, trend: "straight", seasonal: false }).note).toMatch(/At least 3 months/);
  });

  it("estimates monthly history from a customer table and lets real months win", () => {
    const est = monthlyFromCustomers([customer({ lastYearSales: 12000, q1: 3000, q2: 3000, q3: 3000, q4: 1000 })], TODAY);
    expect(est.filter((p) => p.month.startsWith("2025"))).toHaveLength(12);
    expect(est.filter((p) => p.month.startsWith("2026")).map((p) => p.month).at(-1)).toBe("2026-09");
    expect(est.find((p) => p.month === "2026-02")!.sales).toBe(1000);
    const combined = combineMonthly([{ month: "2026-02", sales: 1234 }], est);
    expect(combined.find((p) => p.month === "2026-02")!.sales).toBe(1234);
  });
});

describe("sample data", () => {
  it("has about 600 distinct customers and stops at today's quarter", () => {
    const rows = sampleCustomers(600, TODAY);
    expect(new Set(rows.map((r) => r.key)).size).toBe(600);
    expect(rows.every((r) => r.thisYearSales === r.q1 + r.q2 + r.q3 + r.q4)).toBe(true);
    const v = viewCustomers(rows, TODAY);
    expect(v.filter((c) => c.trend === "declined").length).toBeGreaterThan(100);
    expect(v.filter((c) => c.trend === "increased").length).toBeGreaterThan(100);
  });
});

describe("hub store (customers built from sales records)", () => {
  let store: ReturnType<typeof createHubStore>;
  let repo: ReturnType<typeof createSalesRepo>;
  const add = async (o: Record<string, unknown>) => {
    const r = validateSale(validSale(o));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    await repo.insert(r.sale);
  };

  beforeEach(async () => {
    const db = await createPglite();
    await db.exec(SCHEMA);
    repo = createSalesRepo(db);
    store = createHubStore(db, () => TODAY);
    await add({ invoiceNumber: "A1", customerName: "Seaside Inn", date: "2025-03-10", invoiceAmount: 1000, discount: 0, salesTax: 0, address: "1 Main St, Salem, MA" });
    await add({ invoiceNumber: "A2", customerName: "Seaside Inn", date: "2025-11-20", invoiceAmount: 9999, discount: 0, salesTax: 0, address: "1 Main St, Salem, MA" }); // after Oct 24: not "same dates"
    await add({ invoiceNumber: "A3", customerName: "seaside inn ", date: "2026-02-05", invoiceAmount: 600, discount: 0, salesTax: 0, salesRep: "In-store", commodityCategory: "Bath", address: "1 Main St, Salem, MA" });
    await add({ invoiceNumber: "A4", customerName: "Seaside Inn", date: "2026-08-01", invoiceAmount: 200, discount: 0, salesTax: 0, salesRep: "In-store", commodityCategory: "Bath", address: "9 Ocean Dr, Austin, TX" });
  });

  it("compares this year with the same dates last year", async () => {
    await store.setSource("records");
    const { rows } = await store.customers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Seaside Inn", lastYearSales: 1000, thisYearSales: 800, q1: 600, q3: 200, salesperson: "In-store", mainProduct: "Bath",
      region: "Southwest", lastContactDate: "2026-08-01", origin: "records",
    });
  });

  it("layers the owner's edits on top while new sales keep counting", async () => {
    await store.setSource("records");
    const key = (await store.customers()).rows[0].key;
    await store.saveCustomer(key, { salesperson: "Website", lastYearSales: 5000 });
    await add({ invoiceNumber: "A5", customerName: "Seaside Inn", date: "2026-10-01", invoiceAmount: 100, discount: 0, salesTax: 0 });
    const [row] = (await store.customers()).rows;
    expect(row).toMatchObject({ salesperson: "Website", lastYearSales: 5000, thisYearSales: 900, origin: "edit" });
    await store.deleteCustomer(key);
    expect((await store.customers()).rows).toHaveLength(0);
    await store.clearCustomerChanges();
    expect((await store.customers()).rows).toHaveLength(1);
  });

  it("starts with sample customers when the records have nothing to compare against", async () => {
    const empty = createHubStore(await (async () => { const d = await createPglite(); await d.exec(SCHEMA); return d; })(), () => TODAY);
    const { source, rows } = await empty.customers();
    expect(source).toBe("sample");
    expect(rows).toHaveLength(600);
  });

  it("keeps sample customers apart from uploads with the same names", async () => {
    await store.setSource("sample", true);
    const sample = (await store.customers()).rows;
    const twin = sample[0];
    await store.importCustomers([{ ...twin, thisYearSales: 1, origin: "upload" }]);
    await store.setSource("sample", true); // reset to the sample again must not clash with the upload
    const again = (await store.customers()).rows;
    expect(again).toHaveLength(600);
    expect(again.find((r) => r.key === twin.key)!.thisYearSales).toBe(twin.thisYearSales);
    await store.saveCustomer(twin.key, { thisYearSales: 42 });
    await store.setSource("records");
    const records = (await store.customers()).rows;
    expect(records.find((r) => r.key === twin.key)).toMatchObject({ thisYearSales: 1, origin: "upload" });
    expect(records.some((r) => r.key.startsWith("sample:"))).toBe(false);
  });

  it("works out daily usage from the last 90 days of sales unless the owner typed one", async () => {
    await add({ invoiceNumber: "U1", sku: "BT-TWL-27", quantity: 45, date: "2026-10-01" });
    const products = await store.products();
    expect(products.length).toBeGreaterThan(0);
    await store.saveProduct("BT-TWL-27", { dailyUsage: Number.NaN });
    expect((await store.products()).find((p) => p.code === "BT-TWL-27")!.dailyUsage).toBe(0.5);
    await store.saveProduct("BT-TWL-27", { dailyUsage: 7 });
    expect((await store.products()).find((p) => p.code === "BT-TWL-27")!.dailyUsage).toBe(7);
  });

  it.each([
    ["12 Ocean Ave, Myrtle Beach, SC", "29577", "Southeast"],
    ["80 Wellington St, Ottawa, ON", "K1A 0B1", "Canada"],
    ["5 Pine Rd, Portland, OR 97201", "97201", "West"],
    ["Unknown", "", "Other"],
  ])("places %s in a region", (address, zip, region) => {
    expect(regionFromAddress(address, zip)).toBe(region);
  });
});
