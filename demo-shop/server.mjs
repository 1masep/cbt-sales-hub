// A stand-in online shop for testing the sales app end to end. It behaves
// like a real store's server: when an order is placed it sends one sale per
// product to the sales app's /api/sales, and keeps its own order list so the
// two can be compared. Run with: npm run demo-shop  (http://localhost:3457)
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.SHOP_PORT || 3457);
const SALES_APP_URL = process.env.SALES_APP_URL || "http://localhost:3456";
const SECRET = process.env.SALES_API_SECRET;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const ORDERS_FILE = path.join(DIR, ".orders.json");
const TAX_RATE = 0.0625;
const CODES = { SAVE10: 0.1, HALF: 0.5 };

const PRODUCTS = [
  { sku: "22299", name: "Vinyl gloves, clear XL (10/100 case)", category: "Restaurant", price: 4899 },
  { sku: "43194", name: "12\" white pizza box (50/case)", category: "Restaurant", price: 3150 },
  { sku: "KT-PAN-HALF", name: "Half-size steam table pan", category: "Kitchen", price: 1875 },
  { sku: "BD-SHEET-Q", name: "Queen flat sheet, T-250 (dozen)", category: "Bedding", price: 11400 },
  { sku: "BT-TWL-27", name: "Bath towel 27x54, dobby hem (dozen)", category: "Bath", price: 6450 },
  { sku: "CL-CUP-12", name: "12 oz hot cup with lid (1,000)", category: "Cups & Lids", price: 8925 },
  { sku: "VC-UPRIGHT-14", name: "14\" commercial upright vacuum", category: "Vacuums & More", price: 27900 },
];

let orders = [];
let sequence = 0;
try {
  orders = JSON.parse(await readFile(ORDERS_FILE, "utf8"));
} catch {}
const save = () => writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2));
const dollars = (cents) => Math.round(cents) / 100;

// Splits an order into one sale per product. Discount and tax are worked out
// per line, so the lines always add up exactly to the order total.
function buildLines(orderNumber, items, customer, code, date) {
  const rate = CODES[code?.toUpperCase?.()] ?? 0;
  return items.map((item, i) => {
    const product = PRODUCTS.find((p) => p.sku === item.sku);
    const amount = product.price * item.qty;
    const discount = Math.round(amount * rate);
    const tax = Math.round((amount - discount) * TAX_RATE);
    return {
      invoiceNumber: `WEB-${orderNumber}-${i + 1}`,
      customerName: customer.company || customer.name,
      date,
      commodityCategory: product.category,
      sku: product.sku,
      quantity: item.qty,
      price: dollars(product.price),
      invoiceAmount: dollars(amount),
      discount: dollars(discount),
      salesTax: dollars(tax),
      salesRep: "Website",
      address: customer.address,
      zipCode: customer.zip,
      phone: customer.phone,
      email: customer.email,
      expectedTotal: dollars(amount - discount + tax),
    };
  });
}

async function sendLine(line) {
  const { expectedTotal, ...sale } = line;
  try {
    const res = await fetch(`${SALES_APP_URL}/api/sales`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(sale),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 201) return { status: "recorded" };
    if (res.status === 200 && body.alreadyRecorded) return { status: "recorded", note: "already recorded" };
    if (res.status === 409) return { status: "failed", note: body.error };
    if (res.status === 400) {
      const fields = Object.entries(body.fields ?? {}).map(([k, v]) => `${k}: ${v}`).join("; ");
      return { status: "rejected", note: fields || body.error };
    }
    return { status: "failed", note: `${res.status} ${body.error ?? ""}`.trim() };
  } catch (err) {
    return { status: "failed", note: err.name === "TimeoutError" ? "sales app timed out" : "sales app unreachable" };
  }
}

async function deliver(order) {
  for (const line of order.lines) {
    if (line.result?.status === "recorded") continue;
    line.result = { ...(await sendLine(line)), at: new Date().toISOString() };
  }
  order.deliveryAttempts = (order.deliveryAttempts ?? 0) + 1;
  await save();
  return order;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, await readFile(path.join(DIR, "index.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/products") return send(res, 200, PRODUCTS);
    if (req.method === "GET" && url.pathname === "/api/orders") return send(res, 200, [...orders].reverse());

    if (req.method === "POST" && url.pathname === "/api/checkout") {
      const { items = [], customer = {}, code = "", date } = await readBody(req);
      const clean = items.filter((i) => PRODUCTS.some((p) => p.sku === i.sku) && Number.isInteger(i.qty) && i.qty > 0);
      if (clean.length === 0) return send(res, 400, { error: "Cart is empty" });
      // Unique even for orders placed in the same millisecond.
      const orderNumber = `${Date.now().toString(36)}${(++sequence).toString(36).padStart(3, "0")}`.toUpperCase();
      const order = {
        orderNumber,
        placedAt: new Date().toISOString(),
        customer,
        code,
        lines: buildLines(orderNumber, clean, customer, code, date || new Date().toISOString().slice(0, 10)),
      };
      order.total = dollars(order.lines.reduce((s, l) => s + Math.round(l.expectedTotal * 100), 0));
      orders.push(order);
      return send(res, 201, await deliver(order));
    }

    const resend = url.pathname.match(/^\/api\/orders\/([A-Z0-9]+)\/resend$/);
    if (req.method === "POST" && resend) {
      const order = orders.find((o) => o.orderNumber === resend[1]);
      if (!order) return send(res, 404, { error: "No such order" });
      // ?all=1 re-sends lines that were already recorded, like a store retrying a webhook.
      if (url.searchParams.get("all") === "1") order.lines.forEach((l) => (l.result = undefined));
      return send(res, 200, await deliver(order));
    }
    send(res, 404, { error: "Not found" });
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
}).listen(PORT, () => console.log(`Demo shop on http://localhost:${PORT} -> sending sales to ${SALES_APP_URL}`));

if (!SECRET) console.warn("SALES_API_SECRET is not set; the sales app will refuse every order.");
