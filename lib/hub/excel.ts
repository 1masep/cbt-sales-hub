// Analysis Hub Excel: reading an uploaded workbook (forgiving about blank
// rows, "$1,234" typed as text, and dates in any common format) and building
// the 6-tab report.
import ExcelJS from "exceljs";
import { isAlarm, scorecard, topCustomers, type CustomerRow, type CustomerView, type ProductRow, type ProductView } from "./metrics";
import type { Projection } from "./projection";
import { customerIdFor, customerKey } from "./store";

// ---------- reading ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const CUSTOMER_HEADERS: Record<keyof Omit<CustomerRow, "key" | "origin">, string[]> = {
  customerId: ["customerid", "id", "accountid", "customerno", "customernumber"],
  name: ["customername", "customer", "name", "companyname", "customercompanyname", "company"],
  salesperson: ["salesperson", "salesrep", "rep", "assignedsalesperson"],
  region: ["region", "territory"],
  mainProduct: ["mainproduct", "product", "maincategory", "category"],
  lastYearSales: ["lastyearsales", "lastyear", "lysales", "priorlyearsales", "previousyearsales"],
  thisYearSales: ["thisyearsales", "thisyear", "tysales", "currentyearsales", "ytdsales"],
  q1: ["q1sales", "q1"],
  q2: ["q2sales", "q2"],
  q3: ["q3sales", "q3"],
  q4: ["q4sales", "q4"],
  lastContactDate: ["lastcontactdate", "lastcontact", "lastcontacted", "lastorderdate"],
};

const PRODUCT_HEADERS: Record<keyof Omit<ProductRow, "origin">, string[]> = {
  code: ["productcode", "sku", "code", "itemcode", "productid"],
  name: ["productname", "product", "name", "description", "itemname"],
  category: ["category", "productcategory"],
  sellingPrice: ["sellingprice", "price", "saleprice"],
  unitCost: ["unitcost", "cost"],
  unitsInStock: ["unitsinstock", "instock", "stock", "onhand", "quantityonhand", "units"],
  dailyUsage: ["dailyusageunitsday", "dailyusage", "usageperday", "unitsperday"],
  orderingDays: ["orderingtimedays", "orderingtime", "leadtime", "leadtimedays", "supplierleadtime"],
  backupStock: ["backupstockunits", "backupstock", "safetystock", "buffer"],
};

type Header<K extends string> = Partial<Record<K, number>>;

function matchHeaders<K extends string>(row: unknown[], table: Record<K, string[]>): Header<K> {
  const found: Header<K> = {};
  row.forEach((cell, col) => {
    const h = norm(cellText(cell));
    if (!h) return;
    for (const [field, aliases] of Object.entries(table) as [K, string[]][]) {
      if (found[field] === undefined && aliases.includes(h)) {
        found[field] = col;
        break;
      }
    }
  });
  return found;
}

function cellValue(cell: unknown): unknown {
  if (cell && typeof cell === "object" && !(cell instanceof Date)) {
    const c = cell as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
    if ("result" in c) return c.result;
    if (c.richText) return c.richText.map((r) => r.text).join("");
    if (typeof c.text === "string") return c.text;
    if (c.error) return null;
  }
  return cell;
}

function cellText(cell: unknown): string {
  const v = cellValue(cell);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export type ImportStats = { fixed: number };

export function parseNumber(cell: unknown, stats: ImportStats): number {
  const v = cellValue(cell);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = cellText(v);
  if (!s || s === "-" || s === "—") return 0;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g, ""));
  const digits = s.replace(/[^0-9.]/g, "");
  const n = Number(digits);
  if (!digits || !Number.isFinite(n)) {
    stats.fixed++;
    return 0;
  }
  if (/[^0-9.,$\s()%-]/.test(s.replace(/usd/i, ""))) stats.fixed++;
  return negative ? -n : n;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseDate(cell: unknown, stats: ImportStats): string | null {
  const v = cellValue(cell);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10); // Excel serial date
  }
  const s = cellText(v);
  if (!s) return null;
  const ymd = (y: number, m: number, d: number) => {
    const year = y < 100 ? 2000 + y : y;
    const date = new Date(Date.UTC(year, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d && year >= 1990 && year <= 2100 ? date.toISOString().slice(0, 10) : null;
  };
  let m: RegExpMatchArray | null;
  let out: string | null = null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) out = ymd(+m[1], +m[2], +m[3]);
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) out = ymd(+m[3], +m[1], +m[2]); // US: month/day/year
  else if ((m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i))) out = ymd(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  else if ((m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i))) out = ymd(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  if (!out) stats.fixed++;
  return out;
}

export type WorkbookImport = { customers: CustomerRow[]; products: ProductRow[]; notes: string[] };

export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<WorkbookImport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);
  const customers = new Map<string, CustomerRow>();
  const products = new Map<string, ProductRow>();
  const notes: string[] = [];

  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => rows.push((row.values as unknown[]).slice(1)));
    // The header is the first of the top 5 rows that names the needed columns.
    for (let h = 0; h < Math.min(5, rows.length); h++) {
      const ch = matchHeaders(rows[h], CUSTOMER_HEADERS);
      const ph = matchHeaders(rows[h], PRODUCT_HEADERS);
      const isCustomers = ch.name !== undefined && (ch.thisYearSales !== undefined || ch.lastYearSales !== undefined);
      const isProducts = ph.unitsInStock !== undefined && (ph.code !== undefined || ph.name !== undefined);
      if (!isCustomers && !isProducts) continue;
      const stats: ImportStats = { fixed: 0 };
      let added = 0;
      let blank = 0;
      // A customer or product already read from an earlier sheet keeps those
      // values: the report's later tabs repeat customers with fewer columns.
      let repeated = 0;
      for (const row of rows.slice(h + 1)) {
        const get = (col: number | undefined) => (col === undefined ? undefined : row[col]);
        if (isCustomers) {
          const name = cellText(get(ch.name));
          if (!name) {
            blank++;
            continue;
          }
          const key = customerKey(name);
          if (customers.has(key)) {
            repeated++;
            continue;
          }
          const q = [ch.q1, ch.q2, ch.q3, ch.q4].map((c) => parseNumber(get(c), stats));
          const thisYear = ch.thisYearSales !== undefined ? parseNumber(get(ch.thisYearSales), stats) : q.reduce((s, v) => s + v, 0);
          customers.set(key, {
            key,
            customerId: cellText(get(ch.customerId)) || customerIdFor(key),
            name,
            salesperson: cellText(get(ch.salesperson)),
            region: cellText(get(ch.region)),
            mainProduct: cellText(get(ch.mainProduct)),
            lastYearSales: parseNumber(get(ch.lastYearSales), stats),
            thisYearSales: thisYear,
            q1: q[0],
            q2: q[1],
            q3: q[2],
            q4: q[3],
            lastContactDate: ch.lastContactDate === undefined ? null : parseDate(get(ch.lastContactDate), stats),
            origin: "upload",
          });
        } else {
          const name = cellText(get(ph.name));
          const code = cellText(get(ph.code)) || name;
          if (!code) {
            blank++;
            continue;
          }
          if (products.has(code.toLowerCase())) {
            repeated++;
            continue;
          }
          products.set(code.toLowerCase(), {
            code,
            name: name || code,
            category: cellText(get(ph.category)),
            sellingPrice: parseNumber(get(ph.sellingPrice), stats),
            unitCost: parseNumber(get(ph.unitCost), stats),
            unitsInStock: Math.max(0, Math.round(parseNumber(get(ph.unitsInStock), stats))),
            dailyUsage: ph.dailyUsage === undefined ? Number.NaN : Math.max(0, parseNumber(get(ph.dailyUsage), stats)),
            orderingDays: ph.orderingDays === undefined ? 14 : Math.max(0, Math.round(parseNumber(get(ph.orderingDays), stats))),
            backupStock: Math.max(0, Math.round(parseNumber(get(ph.backupStock), stats))),
            origin: "upload",
          });
        }
        added++;
      }
      const what = isCustomers ? "customers" : "products";
      const extras = [repeated && `${repeated} already listed on an earlier sheet`, blank && `${blank} blank ${blank === 1 ? "row" : "rows"} skipped`, stats.fixed && `${stats.fixed} ${stats.fixed === 1 ? "cell" : "cells"} with text or an unreadable date set to 0 or left blank`].filter(Boolean);
      notes.push(`"${ws.name}": ${added} ${what}${extras.length ? ` (${extras.join("; ")})` : ""}.`);
      return;
    }
  });
  return { customers: [...customers.values()], products: [...products.values()], notes };
}

// ---------- the 6-tab report ----------

const MONEY = "$#,##0.00";
const PCT = '0.0"%"';


function addTable<T>(ws: ExcelJS.Worksheet, cols: { header: string; value: (r: T) => unknown; format?: string }[], rows: T[], startRow = 1) {
  ws.getRow(startRow).values = cols.map((c) => c.header);
  ws.getRow(startRow).font = { bold: true };
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i);
    row.values = cols.map((c) => c.value(r) as ExcelJS.CellValue);
    cols.forEach((c, j) => {
      if (c.format) row.getCell(j + 1).numFmt = c.format;
    });
  });
}

function autoFit(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let max = 8;
    col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
      // Title and note rows have one filled cell; Excel lets that text run
      // into the empty cells beside it, so it shouldn't widen the column.
      if (ws.getRow(rowNumber).actualCellCount === 1) return;
      const v = cell.value;
      const text = v instanceof Date ? "2026-10-24" : typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) + "  " : String(v ?? "");
      max = Math.max(max, Math.min(70, text.length + 2));
    });
    col.width = max;
  });
}

const asDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

export type ReportInput = {
  customers: CustomerView[];
  products: ProductView[];
  projection: Projection;
  triggerPct: number;
  monthsAhead: number;
  sourceNote: string;
  today: Date;
};

export async function buildHubWorkbook(input: ReportInput): Promise<Buffer> {
  const { customers, products, projection, triggerPct } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CBT Data Analysis Hub";
  const card = scorecard(customers, products, triggerPct);

  const customerCols: { header: string; value: (c: CustomerView) => unknown; format?: string }[] = [
    { header: "Customer ID", value: (c) => c.customerId },
    { header: "Customer Name", value: (c) => c.name },
    { header: "Salesperson", value: (c) => c.salesperson },
    { header: "Region", value: (c) => c.region },
    { header: "Main Product", value: (c) => c.mainProduct },
    { header: "Last Year Sales ($)", value: (c) => c.lastYearSales, format: MONEY },
    { header: "This Year Sales ($)", value: (c) => c.thisYearSales, format: MONEY },
    { header: "Q1 Sales", value: (c) => c.q1, format: MONEY },
    { header: "Q2 Sales", value: (c) => c.q2, format: MONEY },
    { header: "Q3 Sales", value: (c) => c.q3, format: MONEY },
    { header: "Q4 Sales", value: (c) => c.q4, format: MONEY },
    { header: "Last Contact Date", value: (c) => asDate(c.lastContactDate), format: "yyyy-mm-dd" },
    { header: "Yearly Change ($)", value: (c) => c.yearlyChange, format: MONEY },
    { header: "Yearly Change (%)", value: (c) => c.yearlyChangePct ?? "New customer", format: PCT },
    { header: "Share of Total Sales (%)", value: (c) => c.shareOfTotal, format: '0.00"%"' },
    { header: "Days Since Last Contact", value: (c) => c.daysSinceContact ?? "" },
    { header: "Recommended Next Step", value: (c) => c.nextStep },
  ];
  const changeCols = customerCols.filter((c) =>
    ["Customer ID", "Customer Name", "Salesperson", "Region", "Last Year Sales ($)", "This Year Sales ($)", "Yearly Change ($)", "Yearly Change (%)", "Last Contact Date", "Recommended Next Step"].includes(c.header),
  );

  // 1. Summary & Top 20
  const s = wb.addWorksheet("Summary_&_Top_20");
  s.getCell("A1").value = "CBT Data Analysis Hub";
  s.getCell("A1").font = { bold: true, size: 14 };
  s.getCell("A2").value = `Report date: ${input.today.toISOString().slice(0, 10)} · ${input.sourceNote}`;
  const summary: [string, unknown, string?][] = [
    ["This Year Total Sales", card.thisYearTotal, MONEY],
    ["Change vs. Last Year ($)", card.totalChange, MONEY],
    ["Change vs. Last Year (%)", card.totalChangePct ?? "No sales last year", PCT],
    ["Customers Who Increased", card.increasedCount],
    ["Total Gained ($)", card.increasedGain, MONEY],
    ["Customers Who Declined", card.declinedCount],
    ["Total Lost ($)", card.declinedLoss, MONEY],
    [`Active Decline Alarms (down ${Math.abs(triggerPct)}% or more)`, card.alarmCount],
    ["Products to Order Now", card.orderNowCount],
  ];
  summary.forEach(([label, value, fmt], i) => {
    s.getCell(4 + i, 1).value = label;
    s.getCell(4 + i, 2).value = value as ExcelJS.CellValue;
    if (fmt) s.getCell(4 + i, 2).numFmt = fmt;
  });
  s.getCell(4 + summary.length + 1, 1).value = "Top 20 Customers";
  s.getCell(4 + summary.length + 1, 1).font = { bold: true, size: 12 };
  const top = topCustomers(customers);
  addTable<CustomerView>(
    s,
    [
      { header: "Rank", value: (c) => top.indexOf(c) + 1 },
      ...customerCols.filter((c) =>
        ["Customer ID", "Customer Name", "This Year Sales ($)", "Last Year Sales ($)", "Yearly Change ($)", "Yearly Change (%)", "Share of Total Sales (%)", "Salesperson", "Recommended Next Step"].includes(c.header),
      ),
    ],
    top,
    4 + summary.length + 2,
  );

  // 2. All customer sales (same columns as the upload, so it can be re-uploaded)
  addTable(wb.addWorksheet("All_Customer_Sales", { views: [{ state: "frozen", ySplit: 1 }] }), customerCols, [...customers].sort((a, b) => b.thisYearSales - a.thisYearSales));
  // 3. Declining customer alerts (at the current alarm trigger)
  addTable(
    wb.addWorksheet("Declining_Customer_Alerts", { views: [{ state: "frozen", ySplit: 1 }] }),
    changeCols,
    customers.filter((c) => isAlarm(c, triggerPct)).sort((a, b) => (a.yearlyChangePct ?? 0) - (b.yearlyChangePct ?? 0)),
  );
  // 4. Growing customers
  addTable(
    wb.addWorksheet("Growing_Customers", { views: [{ state: "frozen", ySplit: 1 }] }),
    changeCols,
    customers.filter((c) => c.trend === "increased").sort((a, b) => (b.yearlyChangePct ?? 0) - (a.yearlyChangePct ?? 0)),
  );
  // 5. Inventory & reorders (most urgent first)
  const rank = { "Order Now": 0, "Running Low": 1, Healthy: 2 } as const;
  addTable<ProductView>(
    wb.addWorksheet("Inventory_&_Reorders", { views: [{ state: "frozen", ySplit: 1 }] }),
    [
      { header: "Product Code", value: (p) => p.code },
      { header: "Product Name", value: (p) => p.name },
      { header: "Category", value: (p) => p.category },
      { header: "Selling Price ($)", value: (p) => p.sellingPrice, format: MONEY },
      { header: "Unit Cost ($)", value: (p) => p.unitCost, format: MONEY },
      { header: "Units in Stock", value: (p) => p.unitsInStock },
      { header: "Daily Usage (Units/Day)", value: (p) => p.dailyUsage, format: "0.00" },
      { header: "Ordering Time (Days)", value: (p) => p.orderingDays },
      { header: "Backup Stock (Units)", value: (p) => p.backupStock },
      { header: "Days of Stock Left", value: (p) => p.daysOfStockLeft ?? "Not being used up" },
      { header: "Minimum Stock Level", value: (p) => p.minimumStockLevel },
      { header: "Suggested Order Quantity", value: (p) => p.suggestedOrderQty },
      { header: "Order By Date", value: (p) => asDate(p.orderByDate), format: "yyyy-mm-dd" },
      { header: "Stock Status", value: (p) => p.status },
    ],
    [...products].sort((a, b) => rank[a.status] - rank[b.status] || (a.orderByDate ?? "9").localeCompare(b.orderByDate ?? "9")),
  );
  // 6. Projection
  const pj = wb.addWorksheet("12_Month_Sales_Projection", { views: [{ state: "frozen", ySplit: 1 }] });
  addTable(
    pj,
    [
      { header: "Month", value: (p: Projection["points"][number]) => p.month },
      { header: "Past Monthly Sales ($)", value: (p) => p.actual ?? "", format: MONEY },
      { header: "Overall Trend ($)", value: (p) => p.trend, format: MONEY },
      { header: "Projected Sales ($)", value: (p) => (p.actual === null ? p.projected : ""), format: MONEY },
      { header: "Expected Low ($)", value: (p) => (p.actual === null ? p.low : ""), format: MONEY },
      { header: "Expected High ($)", value: (p) => (p.actual === null ? p.high : ""), format: MONEY },
    ],
    projection.points,
  );
  const noteRow = projection.points.length + 3;
  pj.getCell(noteRow, 1).value = `${input.monthsAhead} months ahead · ${projection.trendUsed === "curved" ? "Curved Growth Trend" : "Straight-Line Trend"} · seasonal patterns ${projection.seasonalUsed ? "included" : "not included"} · projected total ${projection.projectedTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
  if (projection.note) pj.getCell(noteRow + 1, 1).value = projection.note;

  wb.eachSheet(autoFit);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

