// End-to-end check of the product promise: every order placed in the shop
// shows up in the owner's sheet exactly once, with the right details, quickly,
// and in the Excel download. Needs the sales app (3456) and demo shop (3457)
// running. Run with: npm run check-promise
import ExcelJS from "exceljs";

const SHOP = process.env.SHOP_URL || "http://localhost:3457";
const APP = process.env.SALES_APP_URL || "http://localhost:3456";

type Line = Record<string, string | number> & { invoiceNumber: string; expectedTotal: number; result?: { status: string; note?: string } };
type Order = { orderNumber: string; total: number; lines: Line[] };
type Row = Record<string, string | number>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const baseCustomer = {
  name: "Jamie Rivera",
  company: "Rivera Landscaping",
  address: "22 Orchard St, Burlington, VT",
  zip: "05401",
  phone: "(802) 555-0147",
  email: "jamie@riveralandscaping.com",
};

async function placeOrder(items: { sku: string; qty: number }[], customer = baseCustomer, code = ""): Promise<Order> {
  const res = await fetch(`${SHOP}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, customer, code }),
  });
  if (res.status !== 201) throw new Error(`Shop checkout failed: ${res.status}`);
  return res.json();
}

async function sheetRows(orderNumber: string): Promise<Row[]> {
  const res = await fetch(`${APP}/api/admin/sales?q=${encodeURIComponent(`WEB-${orderNumber}-`)}&pageSize=500&sort=invoiceNumber&dir=asc`);
  return (await res.json()).rows;
}

const FIELDS: [string, string][] = [
  ["invoiceNumber", "invoiceNumber"],
  ["customerName", "customerName"],
  ["date", "date"],
  ["commodityCategory", "commodityCategory"],
  ["sku", "sku"],
  ["quantity", "quantity"],
  ["price", "price"],
  ["invoiceAmount", "invoiceAmount"],
  ["discount", "discount"],
  ["salesTax", "salesTax"],
  ["expectedTotal", "totalAmount"],
  ["salesRep", "salesRep"],
  ["address", "address"],
  ["zipCode", "zipCode"],
  ["email", "email"],
];

function compare(line: Line, row: Row | undefined): string[] {
  if (!row) return ["missing from sheet"];
  const diffs: string[] = [];
  for (const [from, to] of FIELDS) {
    const want = String(line[from]).trim();
    const got = String(row[to]);
    const same = from === "email" ? want.toLowerCase() === got : want === got;
    if (!same) diffs.push(`${to}: shop "${want}" vs sheet "${got}"`);
  }
  // Phone is reformatted by the app; compare digits only.
  const digits = (s: unknown) => String(s).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits(line.phone) !== digits(row.phone)) diffs.push(`phone: shop "${line.phone}" vs sheet "${row.phone}"`);
  return diffs;
}

async function verifyOrder(label: string, order: Order) {
  const rows = await sheetRows(order.orderNumber);
  const byInvoice = new Map(rows.map((r) => [String(r.invoiceNumber), r]));
  const diffs = order.lines.flatMap((l) => compare(l, byInvoice.get(l.invoiceNumber)).map((d) => `${l.invoiceNumber} ${d}`));
  check(`${label}: ${order.lines.length} line(s) in sheet, each exactly once`, rows.length === order.lines.length, `${rows.length} found`);
  check(`${label}: every field matches the shop`, diffs.length === 0, diffs.slice(0, 3).join(" | "));
  const sheetTotal = Math.round(rows.reduce((s, r) => s + Number(r.totalAmount) * 100, 0)) / 100;
  check(`${label}: sheet total equals order total ${order.total}`, sheetTotal === order.total, `sheet ${sheetTotal}`);
  return rows;
}

async function main() {
  console.log(`Shop ${SHOP} -> sales app ${APP}\n`);

  // 1. Single product, timed from checkout to visible in the owner's sheet.
  const t0 = Date.now();
  const single = await placeOrder([{ sku: "BT-TWL-27", qty: 2 }]);
  let seen = 0;
  while (Date.now() - t0 < 10_000 && (await sheetRows(single.orderNumber)).length === 0) await new Promise((r) => setTimeout(r, 100));
  seen = Date.now() - t0;
  check("single-product order visible in sheet within 5 s", seen < 5000, `${seen} ms`);
  await verifyOrder("single-product order", single);

  // 2. Several products with a discount code: one row per product.
  const multi = await placeOrder(
    [
      { sku: "22299", qty: 3 },
      { sku: "BD-SHEET-Q", qty: 1 },
      { sku: "CL-CUP-12", qty: 7 },
    ],
    baseCustomer,
    "SAVE10",
  );
  await verifyOrder("3-product order with SAVE10", multi);

  // 3. The store retries delivery (webhooks do this): no duplicates.
  for (let i = 0; i < 3; i++) await fetch(`${SHOP}/api/orders/${multi.orderNumber}/resend?all=1`, { method: "POST" });
  check("store re-sends the order 3 times: still one row per product", (await sheetRows(multi.orderNumber)).length === 3);

  // 4. A burst of simultaneous orders (busy sale day).
  const burst = await Promise.all(Array.from({ length: 25 }, (_, i) => placeOrder([{ sku: "KT-PAN-HALF", qty: 1 + i }])));
  check("25 orders at once: 25 different order numbers", new Set(burst.map((o) => o.orderNumber)).size === 25);
  const burstRows = await Promise.all(burst.map((o) => sheetRows(o.orderNumber)));
  const burstOk = burst.filter((o, i) => burstRows[i].length === 1 && compare(o.lines[0], burstRows[i][0]).length === 0);
  check("25 orders at once: all 25 in sheet with matching details", burstOk.length === 25, `${burstOk.length}/25`);
  const falseSuccess = burst.filter((o, i) => o.lines[0].result?.status === "recorded" && burstRows[i].length === 0);
  check("no order marked recorded by the shop is missing from the sheet", falseSuccess.length === 0, `${falseSuccess.length} missing`);

  // 5. Details real customers type. Each refused order is a sale missing from the sheet.
  // [label, change, should it be flagged for the owner to review?]
  const variations: [string, Partial<typeof baseCustomer>, boolean][] = [
    ["no company (person's name used)", { company: "" }, false],
    ["apostrophe and accents in name", { company: "", name: "Zoë O'Brien-Núñez" }, false],
    ["ZIP+4", { zip: "05401-2301" }, false],
    ["phone with +1 and dots", { phone: "+1 802.555.0147" }, false],
    ["phone with extension", { phone: "(802) 555-0147 ext. 12" }, false],
    ["international phone (UK)", { phone: "+44 20 7946 0958" }, true],
    ["no phone given", { phone: "" }, true],
    ["Canadian postal code", { zip: "K1A 0B1", address: "80 Wellington St, Ottawa, ON" }, true],
    ["uppercase email", { email: "Jamie@RiveraLandscaping.COM" }, false],
    ["very long company name (150 chars)", { company: "A".repeat(150) }, false],
  ];
  const lost: string[] = [];
  for (const [label, change, shouldFlag] of variations) {
    const order = await placeOrder([{ sku: "43194", qty: 1 }], { ...baseCustomer, ...change });
    const rows = await sheetRows(order.orderNumber);
    const note = order.lines[0].result?.note ?? "";
    check(`customer detail — ${label}: order recorded`, rows.length === 1, rows.length ? "" : `refused: ${note}`);
    if (!rows.length) {
      lost.push(label);
      continue;
    }
    const row = rows[0] as Row & { needsReview: boolean; flags: string[] };
    check(
      `customer detail — ${label}: ${shouldFlag ? "flagged for review" : "not flagged"}`,
      row.needsReview === shouldFlag,
      row.flags.join("; "),
    );
  }

  // 6. The Excel download matches the sheet for these orders.
  const res = await fetch(`${APP}/api/admin/export?q=${encodeURIComponent(`WEB-${multi.orderNumber}-`)}&sort=invoiceNumber&dir=asc`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const ws = wb.getWorksheet("Sales")!;
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
  const excelRows = ws.getSheetValues().slice(2).filter(Boolean) as unknown[][];
  const col = (name: string) => header.indexOf(name) + 1;
  const excelTotal = Math.round(excelRows.reduce((s, r) => s + Number(r[col("Total Amount")]) * 100, 0)) / 100;
  check("Excel download: 3 rows for the 3-product order", excelRows.length === 3, `${excelRows.length}`);
  check("Excel download: total matches the order", excelTotal === multi.total, `excel ${excelTotal} vs order ${multi.total}`);
  const excelSkus = excelRows.map((r) => r[col("SKU")]).join(",");
  check("Excel download: SKUs match", excelSkus === multi.lines.map((l) => l.sku).join(","), excelSkus);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (lost.length) console.log(`Orders that would be MISSING from the sheet: ${lost.join("; ")}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
