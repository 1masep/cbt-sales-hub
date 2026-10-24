// Realistic sample data for trying the Analysis Hub (around 600 customers of
// a hospitality supplier, plus its product inventory). Seeded, so the same
// sample comes back every time "Reset to Sample Customer Data" is used.
import type { CustomerRow, ProductRow } from "./metrics";

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const KINDS = ["Inn", "Hotel", "Suites", "Resort", "Motel", "Lodge", "B&B", "Grill", "Bistro", "Diner", "Cafe", "Kitchen", "Pizzeria", "Rentals", "Cottages", "Tavern"];
const NAMES = ["Harbor", "Seaside", "Maple", "Pinecrest", "Riverbend", "Oakwood", "Summit", "Bayview", "Lakeside", "Magnolia", "Cedar", "Willow", "Coastal", "Granite", "Sunrise", "Meadow", "Bluewater", "Heritage", "Northgate", "Palmetto", "Cypress", "Driftwood", "Hilltop", "Lighthouse", "Orchard", "Redwood", "Saltmarsh", "Timber", "Valley", "Westfield"];
const REGIONS: [string, number][] = [["Southeast", 0.34], ["Northeast", 0.22], ["Midwest", 0.18], ["Southwest", 0.14], ["West", 0.12]];
const PRODUCTS = ["Restaurant", "Kitchen", "Bedding", "Bath", "Cups & Lids", "Vacuums & More", "Misc."];
const REPS = ["Website", "In-store"];

export function sampleCustomers(count = 600, today = new Date()): CustomerRow[] {
  const r = rng(20261024);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const weighted = () => {
    let x = r();
    for (const [name, w] of REGIONS) if ((x -= w) <= 0) return name;
    return REGIONS[0][0];
  };
  const quarterElapsed = (qi: number) => Math.max(0, Math.min(1, (today.getUTCMonth() + 1 - qi * 3) / 3));
  const used = new Set<string>();
  const rows: CustomerRow[] = [];
  for (let i = 0; i < count; i++) {
    let name = "";
    do name = `${pick(NAMES)} ${pick(KINDS)}${r() < 0.25 ? ` of ${pick(NAMES)}` : ""}`;
    while (used.has(name.toLowerCase()));
    used.add(name.toLowerCase());
    // Sales follow a long tail: a few big accounts, many small ones.
    const size = Math.round(1500 + 160000 * r() ** 3.2);
    const lastYear = r() < 0.05 ? 0 : size; // ~5% are new this year
    const change = r() < 0.04 ? -1 : (r() - 0.45) * 0.7 + (r() < 0.1 ? -0.25 : 0); // ~4% stopped buying
    const thisYearFull = Math.max(0, Math.round((lastYear || size) * (1 + change)));
    const seasonal = [0.22, 0.27, 0.3, 0.21];
    const q = seasonal.map((s, qi) => Math.round(thisYearFull * s * quarterElapsed(qi)));
    const thisYear = q.reduce((s, v) => s + v, 0);
    const lastYearSameDates = Math.round(lastYear * seasonal.reduce((s, sv, qi) => s + sv * quarterElapsed(qi), 0));
    const daysAgo = Math.floor(r() ** 1.6 * 200);
    const contact = new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    rows.push({
      key: name.toLowerCase(),
      customerId: `C${String(10001 + i)}`,
      name,
      salesperson: pick(REPS),
      region: weighted(),
      mainProduct: pick(PRODUCTS),
      lastYearSales: lastYearSameDates,
      thisYearSales: thisYear,
      q1: q[0],
      q2: q[1],
      q3: q[2],
      q4: q[3],
      lastContactDate: contact,
      origin: "sample",
    });
  }
  return rows;
}

// A starter inventory using CBT's real categories (SKUs 22299 and 43194 are
// from the live store). Replaced by real stock once WooCommerce is connected.
export function sampleProducts(): ProductRow[] {
  const p = (code: string, name: string, category: string, sellingPrice: number, unitCost: number, unitsInStock: number, dailyUsage: number, orderingDays: number, backupStock: number): ProductRow => ({
    code, name, category, sellingPrice, unitCost, unitsInStock, dailyUsage, orderingDays, backupStock, origin: "sample",
  });
  return [
    p("22299", "Vinyl Gloves Clear XL 10/100 Case", "Restaurant", 48.99, 31.5, 34, 3.2, 10, 12),
    p("43194", "Nemco 12\" White Pizza Box, 50/cs", "Restaurant", 31.5, 19.75, 140, 4.1, 14, 20),
    p("22207", "Scotch-Brite Griddle Cleaner, 40/case", "Kitchen", 86.0, 58.2, 22, 0.9, 21, 6),
    p("KT-PAN-HALF", "Half-Size Steam Table Pan", "Kitchen", 18.75, 9.4, 310, 2.4, 18, 30),
    p("BD-SHEET-Q", "Queen Flat Sheet T-250 (dozen)", "Bedding", 114.0, 71.0, 58, 2.6, 28, 15),
    p("BD-PILLOW-STD", "Standard Pillow, Hotel Grade (case of 6)", "Bedding", 96.0, 58.0, 41, 0.8, 30, 8),
    p("BT-TWL-27", "Bath Towel 27x54 Dobby Hem (dozen)", "Bath", 64.5, 38.9, 95, 3.8, 21, 25),
    p("BT-POOL-30", "Pool Towel 30x60 Blue Stripe (dozen)", "Bath", 89.0, 52.0, 12, 1.1, 25, 6),
    p("CL-CUP-12", "12 oz Hot Cup, 1,000/case", "Cups & Lids", 89.25, 54.0, 26, 1.9, 12, 8),
    p("CL-LID-12", "Sip Lid for 12 oz Cup, 1,000/case", "Cups & Lids", 42.0, 24.5, 64, 1.7, 12, 8),
    p("VC-UPRIGHT-14", "14\" Commercial Upright Vacuum", "Vacuums & More", 279.0, 171.0, 9, 0.15, 35, 2),
    p("MS-WIPES-500", "Multi-Surface Wipes, 500 ct", "Misc.", 24.0, 13.8, 220, 2.2, 9, 20),
  ];
}
