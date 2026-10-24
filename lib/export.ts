import ExcelJS from "exceljs";
import { COLUMNS } from "./config";
import type { SaleRecord, Summary } from "./sales-repo";

const MONEY = "$#,##0.00";

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  "ai-import": "AI import",
  "ai-import-reviewed": "AI import (checked by owner)",
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Builds the downloadable workbook: every matching sale plus a Summary tab.
export async function buildSalesWorkbook(rows: SaleRecord[], summary: Summary, filterNote: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const sales = wb.addWorksheet("Sales", { views: [{ state: "frozen", ySplit: 1 }] });
  const widths = [16, 28, 12, 20, 16, 10, 12, 15, 12, 12, 15, 18, 34, 11, 16, 30];
  sales.columns = [...COLUMNS, "Review notes", "Source"].map((header, i) => ({ header, width: widths[i] ?? (i === 16 ? 34 : 18) }));
  sales.getRow(1).font = { bold: true };
  for (const r of rows) {
    sales.addRow([
      r.invoiceNumber,
      r.customerName,
      new Date(`${r.date}T00:00:00Z`),
      r.commodityCategory,
      r.sku,
      r.quantity,
      r.price,
      r.invoiceAmount,
      r.discount,
      r.salesTax,
      r.totalAmount,
      r.salesRep,
      r.address,
      r.zipCode,
      r.phone,
      r.email,
      r.flags.length ? `${r.flags.join("; ")}${r.reviewedAt ? " (reviewed)" : ""}` : "",
      SOURCE_LABELS[r.source] ?? r.source,
    ]);
  }
  sales.getColumn(3).numFmt = "yyyy-mm-dd";
  sales.getColumn(6).numFmt = "#,##0";
  for (const c of [7, 8, 9, 10, 11]) sales.getColumn(c).numFmt = MONEY;
  if (rows.length > 0) sales.autoFilter = { from: "A1", to: `R${rows.length + 1}` };

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 30 }, { width: 12 }, { width: 16 }];
  sum.addRow(["Sales summary"]).font = { bold: true, size: 14 };
  sum.addRow([filterNote]).font = { italic: true, color: { argb: "FF666666" } };
  sum.addRow([]);
  const totals: [string, number, boolean][] = [
    ["Invoices", summary.count, false],
    ["Invoice amount", summary.invoiceAmount, true],
    ["Discounts", summary.discount, true],
    ["Sales tax", summary.salesTax, true],
    ["Total sales", summary.total, true],
  ];
  for (const [label, value, money] of totals) {
    const row = sum.addRow([label, null, value]);
    if (money) row.getCell(3).numFmt = MONEY;
  }

  const section = (title: string, label: string, items: { key: string; count: number; total: number }[], fmt = (k: string) => k) => {
    sum.addRow([]);
    sum.addRow([title]).font = { bold: true, size: 12 };
    sum.addRow([label, "Invoices", "Total sales"]).font = { bold: true };
    for (const item of items) sum.addRow([fmt(item.key), item.count, item.total]).getCell(3).numFmt = MONEY;
  };
  section("By sales rep", "Sales rep", summary.byRep);
  section("By commodity category", "Category", summary.byCategory);
  section("By month", "Month", summary.byMonth, monthLabel);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
