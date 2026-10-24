// Fills the LOCAL database with realistic demo sales so you can try the
// dashboard. Refuses to run against a real database (DATABASE_URL).
// Run with: npm run seed-demo
import { COMMODITY_CATEGORIES, SALES_REPS } from "../lib/config";
import { getDb } from "../lib/db";
import { DuplicateInvoiceError } from "../lib/process-sale";
import { createSalesRepo } from "../lib/sales-repo";
import { validateSale } from "../lib/validate";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set. Demo data is only for the local database; unset it to seed locally.");
  process.exit(1);
}

const customers = [
  ["Harbor Lane Bakery", "48 Harbor Ln, Salem, MA", "01970"],
  ["Northfield Dental", "210 Main St, Northfield, MN", "55057"],
  ["Priya Raman", "77 Elm Ct, Austin, TX", "78704"],
  ["Copperline Builders", "1500 Industrial Way, Denver, CO", "80216"],
  ["Marcus Bell", "9 Willow Rd, Portland, ME", "04101"],
  ["Greenleaf Grocers", "302 Market St, Asheville, NC", "28801"],
  ["Ortega Family Farms", "Rte 4 Box 12, Visalia, CA", "93291"],
  ["Lena Hoffmann", "61 Park Ave, Hoboken, NJ", "07030"],
  ["Summit Outfitters", "88 Canyon Blvd, Boulder, CO", "80302"],
  ["Daniel Okafor", "415 Oak St, Columbus, OH", "43215"],
];

const SKUS: Record<string, string[]> = {
  Restaurant: ["22299", "43194", "22207"],
  Kitchen: ["KT-PAN-HALF", "KT-TONGS-12"],
  Bedding: ["BD-SHEET-Q", "BD-PILLOW-STD"],
  Bath: ["BT-TWL-27", "BT-POOL-30"],
  "Cups & Lids": ["CL-CUP-12", "CL-LID-12"],
  "Vacuums & More": ["VC-UPRIGHT-14"],
  "Misc.": ["MS-MISC-01"],
};

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

async function main() {
  const repo = createSalesRepo(await getDb());
  let added = 0;
  for (let i = 0; i < 80; i++) {
    const [customerName, address, zipCode] = pick(customers);
    const day = new Date(Date.UTC(2026, 0, 5) + Math.floor(rand() * 290) * 86400000);
    const category = pick(COMMODITY_CATEGORIES);
    const quantity = 1 + Math.floor(rand() * 24);
    const price = Math.round((5 + rand() * 180) * 100) / 100;
    const amount = Math.round(quantity * price * 100) / 100;
    const discount = rand() < 0.3 ? Math.round(amount * pick([0.05, 0.1, 0.15]) * 100) / 100 : 0;
    const result = validateSale({
      invoiceNumber: `INV-${String(1001 + i).padStart(5, "0")}`,
      customerName,
      date: day.toISOString().slice(0, 10),
      commodityCategory: category,
      sku: pick(SKUS[category] ?? ["MS-MISC-01"]),
      quantity,
      price,
      invoiceAmount: amount,
      discount,
      salesTax: Math.round((amount - discount) * 0.0625 * 100) / 100,
      salesRep: rand() < 0.45 ? SALES_REPS[0] : pick(SALES_REPS),
      address,
      zipCode,
      phone: `(${200 + Math.floor(rand() * 700)}) 555-${String(Math.floor(rand() * 10000)).padStart(4, "0")}`,
      email: `${customerName.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`,
    });
    if (!result.ok) continue;
    try {
      await repo.insert(result.sale);
      added++;
    } catch (err) {
      if (!(err instanceof DuplicateInvoiceError)) throw err;
    }
  }
  console.log(`Added ${added} demo sales.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
