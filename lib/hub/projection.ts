// Monthly sales history and the sales projection for the Analysis Hub.
// Straight-line trend: least-squares line through monthly sales.
// Curved growth trend: the same fit on the logarithm of sales (steady % growth).
// Seasonal patterns: each calendar month's typical lift or dip versus the trend.
// Expected range: the projection ± about two typical misses (95%), widening
// the further ahead it looks.
import type { CustomerRow } from "./metrics";

export type MonthPoint = { month: string; sales: number }; // month = YYYY-MM

export type ProjectionOptions = { monthsAhead: number; trend: "straight" | "curved"; seasonal: boolean };

export type ProjectionPoint = {
  month: string;
  actual: number | null;
  trend: number;
  projected: number | null;
  low: number | null;
  high: number | null;
};

export type Projection = {
  points: ProjectionPoint[];
  note: string | null; // plain-language caveat shown under the chart
  projectedTotal: number;
  seasonalUsed: boolean;
  trendUsed: ProjectionOptions["trend"];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return monthKey(d);
}

// Estimated monthly sales from a customer table (for uploaded or sample data,
// which only has yearly totals and this year's quarters). Last year follows
// this year's quarterly shape; months after today are left out.
export function monthlyFromCustomers(rows: CustomerRow[], today = new Date()): MonthPoint[] {
  const year = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth(); // 0-based
  const q = [0, 1, 2, 3].map((i) => rows.reduce((s, r) => s + [r.q1, r.q2, r.q3, r.q4][i], 0));
  const lastYear = rows.reduce((s, r) => s + r.lastYearSales, 0);
  const elapsedInQuarter = (qi: number) => Math.max(0, Math.min(3, currentMonth + 1 - qi * 3));
  // Quarter shares from this year's full quarters (fallback: even).
  const fullQuarters = [0, 1, 2, 3].filter((qi) => elapsedInQuarter(qi) === 3 && q[qi] > 0);
  const perMonthRate = fullQuarters.length ? fullQuarters.map((qi) => q[qi] / 3) : [1];
  const avgRate = perMonthRate.reduce((s, v) => s + v, 0) / perMonthRate.length || 1;
  const shape = [0, 1, 2, 3].map((qi) => (fullQuarters.includes(qi) ? q[qi] / 3 / avgRate : 1));
  const shapeTotal = shape.reduce((s, v) => s + v * 3, 0);

  const points: MonthPoint[] = [];
  for (let m = 0; m < 12; m++) {
    points.push({ month: `${year - 1}-${String(m + 1).padStart(2, "0")}`, sales: round2((lastYear * shape[Math.floor(m / 3)]) / shapeTotal) });
  }
  for (let m = 0; m < currentMonth; m++) {
    const qi = Math.floor(m / 3);
    const months = elapsedInQuarter(qi);
    points.push({ month: `${year}-${String(m + 1).padStart(2, "0")}`, sales: round2(months ? q[qi] / months : 0) });
  }
  return points;
}

// Actual monthly sales win; estimated months fill the gaps (e.g. last year,
// before the app existed, when an uploaded workbook gives the yearly totals).
export function combineMonthly(actual: MonthPoint[], estimated: MonthPoint[]): MonthPoint[] {
  const map = new Map(estimated.map((p) => [p.month, p.sales]));
  for (const p of actual) if (p.sales > 0) map.set(p.month, p.sales);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, sales]) => ({ month, sales }));
}

function fitLine(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

export function project(history: MonthPoint[], options: ProjectionOptions): Projection {
  // Drop leading empty months (before the business had data).
  const start = history.findIndex((p) => p.sales > 0);
  const hist = start < 0 ? [] : history.slice(start);
  const monthsAhead = Math.min(24, Math.max(6, Math.round(options.monthsAhead)));
  if (hist.length < 3) {
    return {
      points: hist.map((p) => ({ month: p.month, actual: p.sales, trend: p.sales, projected: null, low: null, high: null })),
      note: "At least 3 months of sales are needed to project ahead.",
      projectedTotal: 0,
      seasonalUsed: false,
      trendUsed: options.trend,
    };
  }

  const n = hist.length;
  const xs = hist.map((_, i) => i);
  const ys = hist.map((p) => Math.max(0, p.sales));
  const monthOfYear = hist.map((p) => Number(p.month.slice(5)) - 1);
  const curved = options.trend === "curved" && ys.every((y) => y > 0);
  const seasonal = options.seasonal && n >= 12;

  const trendAt = (fit: { a: number; b: number }, x: number) => (curved ? Math.exp(fit.a + fit.b * x) : fit.a + fit.b * x);
  const fitTo = (values: number[]) => fitLine(xs, curved ? values.map((v) => Math.log(Math.max(v, 1e-6))) : values);

  // Seasonal index per calendar month: average ratio of sales to trend.
  let fit = fitTo(ys);
  let index = new Array(12).fill(1);
  if (seasonal) {
    const sums = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    ys.forEach((y, i) => {
      const t = trendAt(fit, i);
      if (t > 0) {
        sums[monthOfYear[i]] += y / t;
        counts[monthOfYear[i]]++;
      }
    });
    index = sums.map((s, m) => (counts[m] ? s / counts[m] : 1));
    const mean = index.reduce((s, v) => s + v, 0) / 12;
    index = index.map((v) => (mean > 0 ? v / mean : 1));
    fit = fitTo(ys.map((y, i) => y / (index[monthOfYear[i]] || 1))); // refit on deseasonalized sales
  }

  const fitted = xs.map((x, i) => trendAt(fit, x) * index[monthOfYear[i]]);
  const residualSd = Math.sqrt(ys.reduce((s, y, i) => s + (y - fitted[i]) ** 2, 0) / Math.max(1, n - 2));

  const points: ProjectionPoint[] = hist.map((p, i) => ({
    month: p.month,
    actual: round2(p.sales),
    trend: round2(Math.max(0, trendAt(fit, i))),
    projected: null,
    low: null,
    high: null,
  }));
  // Join the projection to the last actual month so the line is continuous.
  points[n - 1].projected = points[n - 1].actual;
  points[n - 1].low = points[n - 1].actual;
  points[n - 1].high = points[n - 1].actual;

  let projectedTotal = 0;
  for (let h = 1; h <= monthsAhead; h++) {
    const x = n - 1 + h;
    const month = shiftMonth(hist[n - 1].month, h);
    const m = Number(month.slice(5)) - 1;
    const value = Math.max(0, trendAt(fit, x) * index[m]);
    const spread = 1.96 * residualSd * Math.sqrt(1 + h / n);
    projectedTotal += value;
    points.push({
      month,
      actual: null,
      trend: round2(Math.max(0, trendAt(fit, x))),
      projected: round2(value),
      low: round2(Math.max(0, value - spread)),
      high: round2(value + spread),
    });
  }

  const notes: string[] = [];
  if (options.seasonal && !seasonal) notes.push("Seasonal patterns need at least 12 months of sales, so they aren't included yet.");
  if (options.trend === "curved" && !curved) notes.push("A curved trend needs sales in every month, so a straight-line trend is shown.");
  return {
    points,
    note: notes.join(" ") || null,
    projectedTotal: round2(projectedTotal),
    seasonalUsed: seasonal,
    trendUsed: curved ? "curved" : "straight",
  };
}
