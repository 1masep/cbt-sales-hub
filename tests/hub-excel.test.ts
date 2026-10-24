import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildHubWorkbook, parseDate, parseNumber, readWorkbook } from "../lib/hub/excel";
import { viewCustomers, viewProducts } from "../lib/hub/metrics";
import { project } from "../lib/hub/projection";
import { sampleCustomers, sampleProducts } from "../lib/hub/sample";

const TODAY = new Date("2026-10-24T12:00:00Z");

async function workbook(build: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("reading an uploaded workbook", () => {
  it("copes with a title row, renamed columns, blank rows, text numbers and mixed dates", async () => {
    const data = await workbook((wb) => {
      const ws = wb.addWorksheet("Our customers");
      ws.addRow(["CBT customer list (exported from QuickBooks)"]);
      ws.addRow(["Customer", "Sales Rep", "Territory", "Last Year", "This Year", "Q1", "Q2", "Q3", "Q4", "Last Contacted"]);
      ws.addRow(["Harbor Inn", "Website", "Northeast", "$12,500.00", 15000, 4000, 5000, 6000, 0, new Date(Date.UTC(2026, 8, 30))]);
      ws.addRow([]);
      ws.addRow(["", "", "", "", "", "", "", "", "", ""]);
      ws.addRow(["Seaside Grill", "In-store", "Southeast", "(1,000)", "n/a", 0, 0, 0, 0, "10/3/2026"]);
      ws.addRow(["Maple Suites", "Website", "Midwest", "2 000", "2500", "", "", "", "", "Oct 1, 2026"]);
      ws.addRow(["Oak Lodge", "Website", "West", 900, 800, 0, 0, 0, 0, 46300]);
      ws.addRow(["Pine Cafe", "Website", "West", 900, 800, 0, 0, 0, 0, "sometime last week"]);
      const inv = wb.addWorksheet("Stock");
      inv.addRow(["SKU", "Product Name", "Category", "Price", "Cost", "On Hand", "Daily Usage", "Lead Time (Days)", "Safety Stock"]);
      inv.addRow(["BT-TWL-27", "Bath towel", "Bath", "$64.50", 38.9, "95", 3.8, 21, 25]);
      inv.addRow([null, null, null, null, null, null, null, null, null]);
      inv.addRow(["CL-CUP-12", "Hot cup", "Cups & Lids", 89.25, 54, 26, "", "", ""]);
    });
    const { customers, products, notes } = await readWorkbook(data);
    expect(customers.map((c) => c.name)).toEqual(["Harbor Inn", "Seaside Grill", "Maple Suites", "Oak Lodge", "Pine Cafe"]);
    expect(customers[0]).toMatchObject({ key: "harbor inn", salesperson: "Website", region: "Northeast", lastYearSales: 12500, thisYearSales: 15000, q2: 5000, lastContactDate: "2026-09-30", origin: "upload" });
    expect(customers[0].customerId).toMatch(/^C\d{5}$/);
    expect(customers[1]).toMatchObject({ lastYearSales: -1000, thisYearSales: 0, lastContactDate: "2026-10-03" });
    expect(customers[2]).toMatchObject({ lastYearSales: 2000, thisYearSales: 2500, lastContactDate: "2026-10-01" });
    expect(customers[3].lastContactDate).toBe("2026-10-05"); // Excel serial number 46300
    expect(customers[4].lastContactDate).toBeNull();
    expect(products).toEqual([
      expect.objectContaining({ code: "BT-TWL-27", sellingPrice: 64.5, unitsInStock: 95, dailyUsage: 3.8, orderingDays: 21, backupStock: 25 }),
      expect.objectContaining({ code: "CL-CUP-12", unitsInStock: 26, dailyUsage: 0, orderingDays: 0 }),
    ]);
    expect(notes[0]).toMatch(/^"Our customers": 5 customers \(1 blank row skipped; 2 cells/);
    expect(notes[1]).toBe("\"Stock\": 2 products.");
  });

  it.each([
    ["1,234.50", 1234.5], ["$ 99", 99], ["(250.00)", -250], ["-75", -75], ["", 0], ["—", 0],
  ])("reads %s as %s", (text, n) => {
    expect(parseNumber(text, { fixed: 0 })).toBe(n);
  });

  it.each([
    ["2026-10-24", "2026-10-24"], ["10/24/2026", "2026-10-24"], ["10/24/26", "2026-10-24"], ["Oct 24, 2026", "2026-10-24"],
    ["24 October 2026", "2026-10-24"], ["2026/10/24", "2026-10-24"], ["13/45/2026", null], ["soon", null],
  ])("reads the date %s", (text, iso) => {
    expect(parseDate(text, { fixed: 0 })).toBe(iso);
  });
});

describe("the 6-tab Excel report", () => {
  it("has the six named tabs, fitted columns, and can be uploaded again", async () => {
    const customers = viewCustomers(sampleCustomers(600, TODAY), TODAY);
    const products = viewProducts(sampleProducts(), TODAY);
    const projection = project(Array.from({ length: 22 }, (_, i) => ({ month: `20${25 + Math.floor((i) / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, sales: 50000 + i * 900 })), { monthsAhead: 12, trend: "straight", seasonal: true });
    const buf = await buildHubWorkbook({ customers, products, projection, triggerPct: -15, monthsAhead: 12, sourceNote: "Sample customer data", today: TODAY });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Summary_&_Top_20", "All_Customer_Sales", "Declining_Customer_Alerts", "Growing_Customers", "Inventory_&_Reorders", "12_Month_Sales_Projection",
    ]);
    const all = wb.getWorksheet("All_Customer_Sales")!;
    expect(all.rowCount).toBe(601);
    expect(all.getColumn(2).width).toBeGreaterThan(15); // fitted to customer names
    const alerts = wb.getWorksheet("Declining_Customer_Alerts")!;
    const pctCol = (alerts.getRow(1).values as unknown[]).indexOf("Yearly Change (%)");
    for (let r = 2; r <= alerts.rowCount; r++) expect(Number(alerts.getRow(r).getCell(pctCol).value)).toBeLessThanOrEqual(-15);
    expect(wb.getWorksheet("12_Month_Sales_Projection")!.rowCount).toBeGreaterThan(30);

    const again = await readWorkbook(buf);
    expect(again.customers).toHaveLength(600);
    const original = new Map(customers.map((c) => [c.key, c]));
    for (const c of again.customers.slice(0, 50)) {
      const o = original.get(c.key)!;
      expect([c.customerId, c.thisYearSales, c.lastYearSales, c.lastContactDate]).toEqual([o.customerId, o.thisYearSales, o.lastYearSales, o.lastContactDate]);
    }
    // The alert tabs repeat customers with fewer columns; they must not blank out the full rows.
    const decliner = again.customers.find((c) => c.key === customers.find((x) => (x.yearlyChangePct ?? 0) <= -15)!.key)!;
    expect(decliner.mainProduct).not.toBe("");
    expect(decliner.q1 + decliner.q2 + decliner.q3 + decliner.q4).toBeCloseTo(decliner.thisYearSales, 0);
    expect(again.notes.find((n) => n.startsWith('"Declining_Customer_Alerts"'))).toMatch(/0 customers \(\d+ already listed on an earlier sheet\)/);
    expect(again.products).toHaveLength(products.length);
  });
});
