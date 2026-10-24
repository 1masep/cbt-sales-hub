// CBT Data Analysis Hub: the business rules, as plain functions shared by the
// page (instant recalculation while editing) and the Excel report.

export type CustomerRow = {
  key: string; // stable identity (lower-cased name, or the uploaded Customer ID)
  customerId: string;
  name: string;
  salesperson: string;
  region: string;
  mainProduct: string;
  lastYearSales: number;
  thisYearSales: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  lastContactDate: string | null; // YYYY-MM-DD
  origin: "records" | "upload" | "edit" | "sample";
};

export type CustomerView = CustomerRow & {
  yearlyChange: number;
  yearlyChangePct: number | null; // null = new customer (no sales last year)
  shareOfTotal: number; // % of this year's total
  daysSinceContact: number | null;
  nextStep: string;
  trend: "declined" | "increased" | "unchanged" | "new" | "inactive";
};

// The exact wording from the CBT brief.
export const NEXT_STEPS = {
  largeDrop: "Urgent Owner/Manager Check-In: Call within 48 hours, review competitor pricing, and offer a 10% comeback discount.",
  moderateDrop: "Salesperson Follow-Up: Schedule a check-in call, review missed reorders, and offer a product bundle.",
  smallDrop: "Friendly Reminder: Send a quick reorder check-in and current product catalog.",
  strongGrowth: "Expand & Reward: Offer an annual volume agreement, introduce premium products, and give priority stock access.",
  steadyGrowth: "Build Momentum: Suggest complementary products and thank them for their growing business.",
  // Cases the brief doesn't cover, in the same voice.
  unchanged: "Keep in Touch: Same as last year. Check in with the current catalog to find room to grow.",
  newCustomer: "Welcome & Grow: New this year. Thank them for their business and share the full catalog.",
  inactive: "No sales either year. Confirm the account is still open before reaching out.",
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function nextStepFor(pct: number | null, lastYear: number, thisYear: number): { step: string; trend: CustomerView["trend"] } {
  if (lastYear <= 0 && thisYear <= 0) return { step: NEXT_STEPS.inactive, trend: "inactive" };
  if (pct === null) return { step: NEXT_STEPS.newCustomer, trend: "new" };
  if (pct <= -20) return { step: NEXT_STEPS.largeDrop, trend: "declined" };
  if (pct <= -10) return { step: NEXT_STEPS.moderateDrop, trend: "declined" };
  if (pct < 0) return { step: NEXT_STEPS.smallDrop, trend: "declined" };
  if (pct >= 20) return { step: NEXT_STEPS.strongGrowth, trend: "increased" };
  if (pct > 0) return { step: NEXT_STEPS.steadyGrowth, trend: "increased" };
  return { step: NEXT_STEPS.unchanged, trend: "unchanged" };
}

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const today = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.round((today - from) / 86_400_000));
}

export function viewCustomers(rows: CustomerRow[], today = new Date()): CustomerView[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.thisYearSales), 0);
  return rows.map((r) => {
    const yearlyChange = round2(r.thisYearSales - r.lastYearSales);
    const yearlyChangePct = r.lastYearSales > 0 ? round2((yearlyChange / r.lastYearSales) * 100) : null;
    const { step, trend } = nextStepFor(yearlyChangePct, r.lastYearSales, r.thisYearSales);
    return {
      ...r,
      yearlyChange,
      yearlyChangePct,
      shareOfTotal: total > 0 ? round2((Math.max(0, r.thisYearSales) / total) * 100) : 0,
      daysSinceContact: r.lastContactDate ? daysBetween(r.lastContactDate, today) : null,
      nextStep: step,
      trend,
    };
  });
}

export type Scorecard = {
  thisYearTotal: number;
  lastYearTotal: number;
  totalChange: number;
  totalChangePct: number | null;
  increasedCount: number;
  increasedGain: number;
  declinedCount: number;
  declinedLoss: number; // negative number
  alarmCount: number;
  orderNowCount: number;
};

export const isAlarm = (c: CustomerView, triggerPct: number) => c.yearlyChangePct !== null && c.yearlyChangePct <= triggerPct;

export function scorecard(customers: CustomerView[], products: ProductView[], triggerPct: number): Scorecard {
  const thisYearTotal = round2(customers.reduce((s, c) => s + c.thisYearSales, 0));
  const lastYearTotal = round2(customers.reduce((s, c) => s + c.lastYearSales, 0));
  const up = customers.filter((c) => c.trend === "increased");
  const down = customers.filter((c) => c.trend === "declined");
  return {
    thisYearTotal,
    lastYearTotal,
    totalChange: round2(thisYearTotal - lastYearTotal),
    totalChangePct: lastYearTotal > 0 ? round2(((thisYearTotal - lastYearTotal) / lastYearTotal) * 100) : null,
    increasedCount: up.length,
    increasedGain: round2(up.reduce((s, c) => s + c.yearlyChange, 0)),
    declinedCount: down.length,
    declinedLoss: round2(down.reduce((s, c) => s + c.yearlyChange, 0)),
    alarmCount: customers.filter((c) => isAlarm(c, triggerPct)).length,
    orderNowCount: products.filter((p) => p.status === "Order Now").length,
  };
}

export function topCustomers(customers: CustomerView[], n = 20): CustomerView[] {
  return [...customers].sort((a, b) => b.thisYearSales - a.thisYearSales || a.name.localeCompare(b.name)).slice(0, n);
}

// ---------- Inventory ----------

export type ProductRow = {
  code: string;
  name: string;
  category: string;
  sellingPrice: number;
  unitCost: number;
  unitsInStock: number;
  dailyUsage: number;
  orderingDays: number;
  backupStock: number;
  origin: "woocommerce" | "upload" | "edit" | "sample";
};

export type StockStatus = "Order Now" | "Running Low" | "Healthy";

export type ProductView = ProductRow & {
  daysOfStockLeft: number | null; // null = not being used up
  minimumStockLevel: number;
  suggestedOrderQty: number;
  orderByDate: string | null; // YYYY-MM-DD; null = no date needed
  status: StockStatus;
};

// Order early enough to cover the supplier's ordering time plus the backup
// stock; "Running Low" gives two weeks' warning before that point.
export const RUNNING_LOW_DAYS = 14;
// A reorder brings stock back up to the minimum level plus 30 days of usage.
export const ORDER_COVER_DAYS = 30;

export function addDays(date: Date, days: number): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function viewProducts(rows: ProductRow[], today = new Date()): ProductView[] {
  return rows.map((p) => {
    const usage = Math.max(0, p.dailyUsage);
    const minimumStockLevel = Math.ceil(usage * Math.max(0, p.orderingDays) + Math.max(0, p.backupStock));
    const daysOfStockLeft = usage > 0 ? Math.round((p.unitsInStock / usage) * 10) / 10 : null;
    const suggestedOrderQty = Math.max(0, Math.ceil(minimumStockLevel + usage * ORDER_COVER_DAYS - p.unitsInStock));
    let orderByDate: string | null = null;
    let status: StockStatus = "Healthy";
    if (p.unitsInStock <= minimumStockLevel && (usage > 0 || p.backupStock > 0)) {
      status = "Order Now";
      orderByDate = addDays(today, 0);
    } else if (usage > 0) {
      const daysUntilOrder = Math.floor((p.unitsInStock - minimumStockLevel) / usage);
      orderByDate = addDays(today, daysUntilOrder);
      if (daysUntilOrder <= RUNNING_LOW_DAYS) status = "Running Low";
    }
    return { ...p, daysOfStockLeft, minimumStockLevel, suggestedOrderQty: status === "Healthy" ? 0 : suggestedOrderQty, orderByDate, status };
  });
}

// ---------- Salesperson outreach ----------

export function alarmsBySalesperson(customers: CustomerView[], triggerPct: number): Map<string, CustomerView[]> {
  const groups = new Map<string, CustomerView[]>();
  for (const c of customers.filter((x) => isAlarm(x, triggerPct)).sort((a, b) => (a.yearlyChangePct ?? 0) - (b.yearlyChangePct ?? 0))) {
    const who = c.salesperson || "Unassigned";
    groups.set(who, [...(groups.get(who) ?? []), c]);
  }
  return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function outreachMessage(salesperson: string, customers: CustomerView[], triggerPct: number): { subject: string; body: string } {
  const subject = `Customers to call: ${customers.length} down ${Math.abs(triggerPct)}% or more this year`;
  const lines = customers.map(
    (c, i) =>
      `${i + 1}. ${c.name} (${c.customerId}): ${usd(c.lastYearSales)} last year → ${usd(c.thisYearSales)} this year (${c.yearlyChangePct}%).\n   Next step: ${c.nextStep}`,
  );
  const body = [
    `Hi ${salesperson},`,
    "",
    `These customers are buying ${Math.abs(triggerPct)}% or more less than last year. Please reach out this week:`,
    "",
    ...lines,
    "",
    "Thanks!",
    "CBT Hospitality Supplies",
  ].join("\n");
  return { subject, body };
}

export function callListCsv(customers: CustomerView[]): string {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // keep spreadsheet apps from running it as a formula
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["Customer ID", "Customer Name", "Last Year Sales ($)", "This Year Sales ($)", "Yearly Change ($)", "Yearly Change (%)", "Last Contact Date", "Recommended Next Step"];
  const rows = customers.map((c) => [c.customerId, c.name, c.lastYearSales.toFixed(2), c.thisYearSales.toFixed(2), c.yearlyChange.toFixed(2), c.yearlyChangePct ?? "", c.lastContactDate ?? "", c.nextStep]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
