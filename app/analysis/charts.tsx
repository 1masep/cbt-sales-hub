"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { CustomerView, ProductView } from "../../lib/hub/metrics";
import type { ProjectionPoint } from "../../lib/hub/projection";
import styles from "./charts.module.css";

// Two validated chart colors (dataviz validator: all six checks pass on paper).
export const SERIES = { blue: "#1e4cb2", teal: "#009084" } as const;

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdShort = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
const pct = (n: number | null) => (n === null ? "New" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", " '");

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div className={styles.tooltip} style={{ left: x, top: y }} role="status">
      {children}
    </div>
  );
}

// ---------- Top 20 customers: horizontal bars of this year's sales ----------

export function TopCustomersChart({ rows }: { rows: CustomerView[] }) {
  const max = niceMax(Math.max(0, ...rows.map((r) => r.thisYearSales)));
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const show = (i: number, e: React.MouseEvent | React.FocusEvent) => {
    const box = boxRef.current!.getBoundingClientRect();
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({ i, x: Math.min(box.width - 250, Math.max(0, t.left - box.left + 8)), y: t.bottom - box.top + 6 });
  };
  return (
    <div className={styles.hbars} ref={boxRef} onMouseLeave={() => setHover(null)}>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className={styles.hbarRow}
          tabIndex={0}
          onMouseEnter={(e) => show(i, e)}
          onFocus={(e) => show(i, e)}
          onBlur={() => setHover(null)}
          aria-label={`${i + 1}. ${r.name}: ${usd(r.thisYearSales)} this year, ${pct(r.yearlyChangePct)} vs last year`}
        >
          <span className={styles.hbarLabel} title={r.name}>
            <span className={styles.rank}>{i + 1}</span>
            {r.name}
          </span>
          <span className={styles.hbarTrack}>
            <span className={styles.hbar} style={{ width: `${(Math.max(0, r.thisYearSales) / max) * 100}%`, background: SERIES.blue }} />
          </span>
          <span className={`${styles.hbarValue} num`}>{usdShort(r.thisYearSales)}</span>
        </div>
      ))}
      {hover && rows[hover.i] && (
        <Tooltip x={hover.x} y={hover.y}>
          <strong>{rows[hover.i].name}</strong>
          <span>This year: {usd(rows[hover.i].thisYearSales)}</span>
          <span>Last year: {usd(rows[hover.i].lastYearSales)}</span>
          <span>
            Change: {usd(rows[hover.i].yearlyChange)} ({pct(rows[hover.i].yearlyChangePct)})
          </span>
          <span>Share of total: {rows[hover.i].shareOfTotal.toFixed(1)}%</span>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Sales trend and projection ----------

export function ProjectionChart({ points }: { points: ProjectionPoint[] }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 300;
  const pad = { top: 16, right: 16, bottom: 32, left: 64 };
  const w = Math.max(320, width);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...points.flatMap((p) => [p.actual ?? 0, p.high ?? 0, p.trend])));
  const x = (i: number) => pad.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = (get: (p: ProjectionPoint) => number | null) =>
    points
      .map((p, i) => [i, get(p)] as const)
      .filter(([, v]) => v !== null)
      .map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
      .join(" ");
  const bandIdx = points.map((p, i) => (p.low !== null && p.high !== null ? i : -1)).filter((i) => i >= 0);
  const band = bandIdx.length
    ? `M${bandIdx.map((i) => `${x(i).toFixed(1)},${y(points[i].high!).toFixed(1)}`).join(" L")} L${[...bandIdx].reverse().map((i) => `${x(i).toFixed(1)},${y(points[i].low!).toFixed(1)}`).join(" L")} Z`
    : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))));
  const firstFuture = points.findIndex((p) => p.actual === null);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover === null ? null : points[hover];

  return (
    <div className={styles.chartBox} ref={boxRef}>
      <ul className={styles.legend} aria-label="Legend">
        <li>
          <span className={styles.swatchLine} style={{ background: SERIES.blue }} /> Past monthly sales
        </li>
        <li>
          <span className={styles.swatchDash} style={{ color: "var(--ink-3)" }} /> Overall trendline
        </li>
        <li>
          <span className={styles.swatchDash} style={{ color: SERIES.teal }} /> Projected sales
        </li>
        <li>
          <span className={styles.swatchBand} style={{ background: SERIES.teal }} /> Expected sales range
        </li>
      </ul>
      <svg width={w} height={height} role="img" aria-label="Past monthly sales, trendline and projected sales">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className={styles.axis}>
              {usdShort(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % step === 0 ? (
            <text key={p.month} x={x(i)} y={height - 10} textAnchor="middle" className={styles.axis}>
              {monthLabel(p.month)}
            </text>
          ) : null,
        )}
        {firstFuture > 0 && <line x1={x(firstFuture - 1)} x2={x(firstFuture - 1)} y1={pad.top} y2={pad.top + innerH} stroke="var(--line-strong)" strokeDasharray="2 3" />}
        {band && <path d={band} fill={SERIES.teal} opacity={0.14} />}
        <path d={path((p) => p.trend)} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path((p) => p.projected)} fill="none" stroke={SERIES.teal} strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />
        <path d={path((p) => p.actual)} fill="none" stroke={SERIES.blue} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--ink-3)" strokeWidth={1} />
            {hp.actual !== null && <circle cx={x(hover)} cy={y(hp.actual)} r={4.5} fill={SERIES.blue} stroke="var(--surface)" strokeWidth={2} />}
            {hp.actual === null && hp.projected !== null && <circle cx={x(hover)} cy={y(hp.projected)} r={4.5} fill={SERIES.teal} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}
        <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hp && hover !== null && (
        <Tooltip x={Math.min(w - 230, Math.max(0, x(hover) + 12))} y={pad.top + 24}>
          <strong>{new Date(`${hp.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
          {hp.actual !== null && <span>Sales: {usd(hp.actual)}</span>}
          {hp.actual === null && hp.projected !== null && <span>Projected: {usd(hp.projected)}</span>}
          {hp.actual === null && hp.low !== null && hp.high !== null && (
            <span>
              Expected range: {usd(hp.low)} to {usd(hp.high)}
            </span>
          )}
          <span>Trend: {usd(hp.trend)}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Days of stock left vs. ordering time ----------

const STATUS_ICON = {
  "Order Now": <AlertTriangle size={14} strokeWidth={2} aria-hidden />,
  "Running Low": <Clock size={14} strokeWidth={2} aria-hidden />,
  Healthy: <CheckCircle2 size={14} strokeWidth={2} aria-hidden />,
} as const;

export function StockChart({ products }: { products: ProductView[] }) {
  const capped = (n: number | null) => (n === null ? 0 : n);
  const max = niceMax(Math.max(1, ...products.map((p) => Math.max(Math.min(capped(p.daysOfStockLeft), 365), p.orderingDays))));
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);
  return (
    <div className={styles.chartBox} onMouseLeave={() => setHover(null)}>
      <ul className={styles.legend} aria-label="Legend">
        <li>
          <span className={styles.swatchBar} style={{ background: SERIES.blue }} /> Days of stock left
        </li>
        <li>
          <span className={styles.swatchBar} style={{ background: SERIES.teal }} /> Ordering time (days)
        </li>
      </ul>
      <div className={styles.stockRows}>
        {products.map((p, i) => {
          const left = p.daysOfStockLeft;
          return (
            <div
              key={p.code}
              className={styles.stockRow}
              tabIndex={0}
              onMouseEnter={(e) => setHover({ i, y: (e.currentTarget as HTMLElement).offsetTop + (e.currentTarget as HTMLElement).offsetHeight })}
              onFocus={(e) => setHover({ i, y: (e.currentTarget as HTMLElement).offsetTop + (e.currentTarget as HTMLElement).offsetHeight })}
              onBlur={() => setHover(null)}
              aria-label={`${p.name}: ${left === null ? "not being used up" : `${left} days of stock left`}, ordering time ${p.orderingDays} days, ${p.status}`}
            >
              <span className={styles.stockLabel} title={p.name}>
                {p.name}
                <span className={styles[`status${p.status.replace(" ", "")}` as "statusOrderNow"]}>
                  {STATUS_ICON[p.status]}
                  {p.status}
                </span>
              </span>
              <span className={styles.stockBars}>
                <span className={styles.hbarTrack}>
                  <span className={styles.hbar} style={{ width: `${(Math.min(capped(left), max) / max) * 100}%`, background: SERIES.blue }} />
                  <span className={`${styles.barValue} num`}>{left === null ? "not used up" : `${left > 365 ? "365+" : Math.round(left)} d`}</span>
                </span>
                <span className={styles.hbarTrack}>
                  <span className={styles.hbar} style={{ width: `${(p.orderingDays / max) * 100}%`, background: SERIES.teal }} />
                  <span className={`${styles.barValue} num`}>{p.orderingDays} d</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {hover && products[hover.i] && (
        <Tooltip x={180} y={hover.y}>
          <strong>{products[hover.i].name}</strong>
          <span>Units in stock: {products[hover.i].unitsInStock.toLocaleString()}</span>
          <span>Daily usage: {products[hover.i].dailyUsage.toLocaleString(undefined, { maximumFractionDigits: 2 })} a day</span>
          <span>Order by: {products[hover.i].orderByDate ? new Date(`${products[hover.i].orderByDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "No order needed"}</span>
        </Tooltip>
      )}
    </div>
  );
}
