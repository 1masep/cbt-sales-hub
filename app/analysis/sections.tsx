"use client";

import { AlertTriangle, CheckCircle2, Clock, Copy, Download, Mail, RotateCcw, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { HubData } from "../../lib/hub/load";
import {
  alarmsBySalesperson,
  callListCsv,
  NEXT_STEPS,
  outreachMessage,
  topCustomers,
  type CustomerRow,
  type CustomerView,
  type ProductRow,
  type ProductView,
} from "../../lib/hub/metrics";
import type { Projection } from "../../lib/hub/projection";
import { ProjectionChart, StockChart, TopCustomersChart } from "./charts";
import type { HubSettings } from "./hub";
import styles from "./hub.module.css";
import { SheetEditor, type SheetColumn } from "./sheet-editor";

const usd = (n: number, cents = false) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).replace("-", "−");
const pct = (n: number | null) => (n === null ? "New" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`);
const shortStep = (s: string) => s.split(":")[0];
const dateLabel = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "–");
const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West", "Canada", "Other"];

function Step({ text }: { text: string }) {
  return (
    <span className={styles.step} title={text}>
      {shortStep(text)}
    </span>
  );
}

function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// ================= Summary =================

const GUIDES: { title: string; text: string; trend: CustomerView["trend"]; test: (c: CustomerView) => boolean }[] = [
  { title: "Large drop (down 20% or more)", text: NEXT_STEPS.largeDrop, trend: "declined", test: (c) => c.nextStep === NEXT_STEPS.largeDrop },
  { title: "Moderate drop (down 10% to 20%)", text: NEXT_STEPS.moderateDrop, trend: "declined", test: (c) => c.nextStep === NEXT_STEPS.moderateDrop },
  { title: "Small drop (down 1% to 10%)", text: NEXT_STEPS.smallDrop, trend: "declined", test: (c) => c.nextStep === NEXT_STEPS.smallDrop },
  { title: "Strong growth (up 20% or more)", text: NEXT_STEPS.strongGrowth, trend: "increased", test: (c) => c.nextStep === NEXT_STEPS.strongGrowth },
  { title: "Steady growth (up 1% to 20%)", text: NEXT_STEPS.steadyGrowth, trend: "increased", test: (c) => c.nextStep === NEXT_STEPS.steadyGrowth },
  { title: "New this year", text: NEXT_STEPS.newCustomer, trend: "new", test: (c) => c.trend === "new" },
];

export function SummaryTab({ customers }: { customers: CustomerView[] }) {
  const top = useMemo(() => topCustomers(customers), [customers]);
  return (
    <div className={styles.stack}>
      <section>
        <SectionHead title="Top 20 Customers">
          <p className={styles.sectionNote}>Ranked by this year&apos;s sales. Hover a bar for details.</p>
        </SectionHead>
        <div className={styles.split}>
          <TopCustomersChart rows={top} />
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.num}>Rank</th>
                  <th>Customer</th>
                  <th className={styles.num}>This Year</th>
                  <th className={styles.num}>Last Year</th>
                  <th className={styles.num}>Yearly Change</th>
                  <th className={styles.num}>Share of Total</th>
                  <th>Salesperson</th>
                </tr>
              </thead>
              <tbody>
                {top.map((c, i) => (
                  <tr key={c.key}>
                    <td className={`${styles.num} ${styles.muted}`}>{i + 1}</td>
                    <td className={styles.strongCell} title={c.name}>
                      {c.name}
                    </td>
                    <td className={styles.num}>{usd(c.thisYearSales)}</td>
                    <td className={styles.num}>{usd(c.lastYearSales)}</td>
                    <td className={styles.num}>
                      <ChangeCell value={c.yearlyChange} pct={c.yearlyChangePct} />
                    </td>
                    <td className={styles.num}>{c.shareOfTotal.toFixed(1)}%</td>
                    <td>{c.salesperson || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <SectionHead title="What Should We Do?">
          <p className={styles.sectionNote}>Every customer gets a recommended next step from their yearly sales change.</p>
        </SectionHead>
        <ul className={styles.guides}>
          {GUIDES.map((g) => {
            const list = customers.filter(g.test).sort((a, b) => Math.abs(b.yearlyChange) - Math.abs(a.yearlyChange));
            return (
              <li key={g.title} className={styles.guide}>
                <div className={styles.guideHead}>
                  <span className={g.trend === "declined" ? styles.guideDown : g.trend === "increased" ? styles.guideUp : styles.guideNew}>
                    {g.trend === "declined" ? <AlertTriangle size={16} strokeWidth={1.75} aria-hidden /> : <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden />}
                    {g.title}
                  </span>
                  <span className={`${styles.guideCount} num`}>
                    {list.length} {list.length === 1 ? "customer" : "customers"} · {usd(list.reduce((s, c) => s + c.yearlyChange, 0))}
                  </span>
                </div>
                <p>{g.text}</p>
                {list.length > 0 && (
                  <details>
                    <summary>Show {list.length === 1 ? "the customer" : `the ${list.length} customers`}</summary>
                    <ul className={styles.guideList}>
                      {list.slice(0, 100).map((c) => (
                        <li key={c.key}>
                          <span>{c.name}</span>
                          <span className="num">
                            {pct(c.yearlyChangePct)} · {c.salesperson || "Unassigned"}
                          </span>
                        </li>
                      ))}
                      {list.length > 100 && <li className={styles.muted}>…and {list.length - 100} more (all are in the Excel report)</li>}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function ChangeCell({ value, pct: p }: { value: number; pct: number | null }) {
  if (p === null) return <span className={styles.muted}>New</span>;
  const cls = value > 0 ? styles.up : value < 0 ? styles.down : styles.muted;
  return (
    <span className={cls}>
      {value > 0 ? "+" : ""}
      {usd(value)} <span className={styles.pctPart}>({pct(p)})</span>
    </span>
  );
}

// ================= Analysis =================

export function AnalysisTab({
  customers,
  products,
  projection,
  settings,
  setSettings,
  categories,
  reps,
}: {
  customers: CustomerView[];
  products: ProductView[];
  projection: Projection;
  settings: HubSettings;
  setSettings: React.Dispatch<React.SetStateAction<HubSettings>>;
  categories: string[];
  reps: string[];
}) {
  const [filters, setFilters] = useState({ salesperson: "", region: "", mainProduct: "" });
  const options = (field: "salesperson" | "region" | "mainProduct", base: string[]) => [...new Set([...base, ...customers.map((c) => c[field]).filter(Boolean)])].sort();
  const filtered = customers.filter(
    (c) => (!filters.salesperson || c.salesperson === filters.salesperson) && (!filters.region || c.region === filters.region) && (!filters.mainProduct || c.mainProduct === filters.mainProduct),
  );
  const urgentFirst = useMemo(() => {
    const rank = { "Order Now": 0, "Running Low": 1, Healthy: 2 } as const;
    return [...products].sort((a, b) => rank[a.status] - rank[b.status] || (a.daysOfStockLeft ?? 1e9) - (b.daysOfStockLeft ?? 1e9));
  }, [products]);

  return (
    <div className={styles.stack}>
      <section>
        <SectionHead title="Who Increased vs. Who Declined" />
        <div className={styles.controls} aria-label="Customer filters">
          {(
            [
              ["salesperson", "Salesperson", options("salesperson", reps)],
              ["region", "Region", options("region", [])],
              ["mainProduct", "Main Product", options("mainProduct", categories)],
            ] as const
          ).map(([key, label, opts]) => (
            <label key={key} className={styles.control}>
              <span>{label}</span>
              <select className="input" value={filters[key]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}>
                <option value="">All</option>
                {opts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
          {(filters.salesperson || filters.region || filters.mainProduct) && (
            <button className="btn btn-ghost" type="button" onClick={() => setFilters({ salesperson: "", region: "", mainProduct: "" })}>
              Clear filters
            </button>
          )}
        </div>
        <div className={styles.twoCol}>
          <ChangeTable title="Customers Who Increased" rows={filtered.filter((c) => c.trend === "increased")} direction="up" />
          <ChangeTable title="Customers Who Declined" rows={filtered.filter((c) => c.trend === "declined")} direction="down" />
        </div>
      </section>

      <section>
        <SectionHead title="Yearly Sales Trend and Sales Projection" />
        <div className={styles.controls} aria-label="Projection settings">
          <label className={styles.control}>
            <span>
              Months to Project Ahead: <strong className="num">{settings.monthsAhead}</strong>
            </span>
            <input
              type="range"
              min={6}
              max={24}
              step={1}
              value={settings.monthsAhead}
              onChange={(e) => setSettings((s) => ({ ...s, monthsAhead: Number(e.target.value) }))}
              className={styles.slider}
            />
          </label>
          <div className={styles.control} role="radiogroup" aria-label="Trend Type">
            <span>Trend Type</span>
            <div className={styles.segmented}>
              {(
                [
                  ["straight", "Straight-Line Trend"],
                  ["curved", "Curved Growth Trend"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings.trend === value}
                  className={settings.trend === value ? styles.segActive : styles.seg}
                  onClick={() => setSettings((s) => ({ ...s, trend: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={settings.seasonal} onChange={(e) => setSettings((s) => ({ ...s, seasonal: e.target.checked }))} />
            Include Seasonal Sales Patterns
          </label>
        </div>
        <ProjectionChart points={projection.points} />
        <p className={styles.chartCaption}>
          {projection.projectedTotal > 0 && (
            <>
              Projected sales for the next {settings.monthsAhead} months: <strong className="num">{usd(projection.projectedTotal)}</strong>.{" "}
            </>
          )}
          {projection.note}
        </p>
        <details className={styles.numbers}>
          <summary>See the numbers</summary>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className={styles.num}>Past Sales</th>
                  <th className={styles.num}>Trend</th>
                  <th className={styles.num}>Projected</th>
                  <th className={styles.num}>Expected Range</th>
                </tr>
              </thead>
              <tbody>
                {projection.points.map((p) => (
                  <tr key={p.month}>
                    <td>{new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
                    <td className={styles.num}>{p.actual === null ? "–" : usd(p.actual)}</td>
                    <td className={styles.num}>{usd(p.trend)}</td>
                    <td className={styles.num}>{p.actual === null && p.projected !== null ? usd(p.projected) : "–"}</td>
                    <td className={styles.num}>{p.actual === null && p.low !== null ? `${usd(p.low)} to ${usd(p.high!)}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section>
        <SectionHead title="Product Stock Left vs. Supplier Ordering Time">
          <p className={styles.sectionNote}>When the blue bar is shorter than the teal one, the product runs out before a new shipment arrives.</p>
        </SectionHead>
        <StockChart products={urgentFirst} />
      </section>
    </div>
  );
}

function ChangeTable({ title, rows, direction }: { title: string; rows: CustomerView[]; direction: "up" | "down" }) {
  const [by, setBy] = useState<"pct" | "usd">("pct");
  const [all, setAll] = useState(false);
  const sorted = [...rows].sort((a, b) => {
    const d = by === "pct" ? (a.yearlyChangePct ?? 0) - (b.yearlyChangePct ?? 0) : a.yearlyChange - b.yearlyChange;
    return direction === "up" ? -d : d;
  });
  const shown = all ? sorted : sorted.slice(0, 15);
  const total = rows.reduce((s, c) => s + c.yearlyChange, 0);
  return (
    <div className={styles.changePanel}>
      <div className={styles.changeHead}>
        <h3>
          {title} <span className={`${styles.muted} num`}>({rows.length})</span>
        </h3>
        <div className={styles.segmented} role="radiogroup" aria-label={`Rank ${title} by`}>
          {(
            [
              ["pct", "Rank by %"],
              ["usd", "Rank by $"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={by === v} className={by === v ? styles.segActive : styles.seg} onClick={() => setBy(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.sectionNote}>
        {direction === "up" ? "Total gained: " : "Total lost: "}
        <strong className="num">{usd(total)}</strong>
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Customer</th>
              <th className={styles.num}>{direction === "up" ? "$ Gained" : "$ Lost"}</th>
              <th className={styles.num}>{direction === "up" ? "% Growth" : "% Drop"}</th>
              <th>Salesperson</th>
              <th>Recommended Next Step</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.key}>
                <td className={styles.strongCell} title={c.name}>
                  {c.name}
                </td>
                <td className={`${styles.num} ${direction === "up" ? styles.up : styles.down}`}>{usd(c.yearlyChange)}</td>
                <td className={`${styles.num} ${direction === "up" ? styles.up : styles.down}`}>{pct(c.yearlyChangePct)}</td>
                <td>{c.salesperson || "–"}</td>
                <td>
                  <Step text={c.nextStep} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className={styles.emptyNote}>No customers here with these filters.</p>}
      </div>
      {rows.length > 15 && (
        <button className="btn btn-ghost" type="button" onClick={() => setAll((a) => !a)}>
          {all ? "Show the top 15" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

// ================= Alerts =================

export function AlertsTab({
  customers,
  products,
  settings,
  setSettings,
}: {
  customers: CustomerView[];
  products: ProductView[];
  settings: HubSettings;
  setSettings: React.Dispatch<React.SetStateAction<HubSettings>>;
}) {
  const groups = useMemo(() => alarmsBySalesperson(customers, settings.triggerPct), [customers, settings.triggerPct]);
  const names = [...groups.keys()];
  const [chosen, setChosen] = useState<string>("");
  const who = names.includes(chosen) ? chosen : (names[0] ?? "");
  const list = groups.get(who) ?? [];
  const message = who ? outreachMessage(who, list, settings.triggerPct) : null;
  const [copied, setCopied] = useState(false);
  const total = [...groups.values()].reduce((s, g) => s + g.length, 0);

  // Keep the pre-written email short enough for every mail app; the full list
  // is in the copy box and the call list.
  const mailto = message
    ? `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(
        list.length > 12 ? outreachMessage(who, list.slice(0, 12), settings.triggerPct).body + `\n\n(${list.length - 12} more customers are on the attached call list.)` : message.body,
      )}`
    : "";

  const downloadCsv = () => {
    const blob = new Blob([callListCsv(list)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Call list - ${who} - ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const reorders = products
    .filter((p) => p.status !== "Healthy")
    .sort((a, b) => (a.status === b.status ? (a.orderByDate ?? "").localeCompare(b.orderByDate ?? "") : a.status === "Order Now" ? -1 : 1));

  return (
    <div className={styles.stack}>
      <section>
        <SectionHead title="Customer Decline Alarms" />
        <div className={styles.controls}>
          <label className={styles.control}>
            <span>
              Decline Alarm Trigger (Yearly % Drop): <strong className="num">{settings.triggerPct}%</strong>
            </span>
            <input
              type="range"
              min={-60}
              max={-5}
              step={1}
              value={settings.triggerPct}
              onChange={(e) => setSettings((s) => ({ ...s, triggerPct: Number(e.target.value) }))}
              className={styles.slider}
            />
          </label>
          <p className={styles.sectionNote}>
            <strong className="num">{total}</strong> {total === 1 ? "customer is" : "customers are"} down {Math.abs(settings.triggerPct)}% or more, across{" "}
            {names.length} {names.length === 1 ? "salesperson" : "salespeople"}.
          </p>
        </div>

        {names.length === 0 ? (
          <p className={styles.emptyNote}>No customers are down {Math.abs(settings.triggerPct)}% or more. Nothing to send.</p>
        ) : (
          <div className={styles.notify}>
            <div>
              <label className={styles.control}>
                <span>Select Salesperson to Notify</span>
                <select className="input" value={who} onChange={(e) => setChosen(e.target.value)}>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n} ({groups.get(n)!.length})
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className={styles.num}>Last Year</th>
                      <th className={styles.num}>This Year</th>
                      <th className={styles.num}>Change</th>
                      <th>Last Contact</th>
                      <th>Next Step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.key}>
                        <td className={styles.strongCell} title={c.name}>
                          {c.name}
                        </td>
                        <td className={styles.num}>{usd(c.lastYearSales)}</td>
                        <td className={styles.num}>{usd(c.thisYearSales)}</td>
                        <td className={`${styles.num} ${styles.down}`}>{pct(c.yearlyChangePct)}</td>
                        <td className="num">{c.daysSinceContact === null ? "–" : `${c.daysSinceContact} days ago`}</td>
                        <td>
                          <Step text={c.nextStep} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.messageBox}>
              <span className={styles.controlLabel}>Message for {who}</span>
              <textarea className={`input ${styles.message}`} readOnly value={message ? `Subject: ${message.subject}\n\n${message.body}` : ""} rows={14} aria-label={`Message for ${who}`} />
              <div className={styles.messageActions}>
                <a className="btn btn-primary" href={mailto}>
                  <Mail size={16} strokeWidth={1.75} aria-hidden />
                  Open Pre-Written Email
                </a>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={async () => {
                    if (!message) return;
                    await navigator.clipboard.writeText(`Subject: ${message.subject}\n\n${message.body}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy size={16} strokeWidth={1.75} aria-hidden />
                  {copied ? "Copied" : "Copy Message"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={downloadCsv}>
                  <Download size={16} strokeWidth={1.75} aria-hidden />
                  Download Salesperson Call List (.csv)
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Inventory Ordering Reminders">
          <p className={styles.sectionNote}>Products to order now or soon, so they don&apos;t run out before the supplier delivers.</p>
        </SectionHead>
        {reorders.length === 0 ? (
          <p className={styles.emptyNote}>Everything is well stocked. Nothing to order right now.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th className={styles.num}>Units in Stock</th>
                  <th className={styles.num}>Minimum Stock Level</th>
                  <th className={styles.num}>Suggested Order Quantity</th>
                  <th className={styles.num}>Daily Usage</th>
                  <th className={styles.num}>Ordering Time (Days)</th>
                  <th>Order By Date</th>
                </tr>
              </thead>
              <tbody>
                {reorders.map((p) => (
                  <tr key={p.code}>
                    <td className={styles.strongCell} title={p.name}>
                      {p.name} <span className={`mono ${styles.muted}`}>{p.code}</span>
                    </td>
                    <td>
                      <StatusLabel status={p.status} />
                    </td>
                    <td className={styles.num}>{p.unitsInStock.toLocaleString()}</td>
                    <td className={styles.num}>{p.minimumStockLevel.toLocaleString()}</td>
                    <td className={`${styles.num} ${styles.strongCell}`}>{p.suggestedOrderQty.toLocaleString()}</td>
                    <td className={styles.num}>{p.dailyUsage.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={styles.num}>{p.orderingDays}</td>
                    <td className="num">{p.status === "Order Now" ? "Today" : dateLabel(p.orderByDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusLabel({ status }: { status: ProductView["status"] }) {
  const map = {
    "Order Now": [styles.statusNow, <AlertTriangle key="i" size={14} strokeWidth={2} aria-hidden />],
    "Running Low": [styles.statusLow, <Clock key="i" size={14} strokeWidth={2} aria-hidden />],
    Healthy: [styles.statusOk, <CheckCircle2 key="i" size={14} strokeWidth={2} aria-hidden />],
  } as const;
  const [cls, icon] = map[status];
  return (
    <span className={cls}>
      {icon}
      {status}
    </span>
  );
}

// ================= Spreadsheets =================

export function SpreadsheetsTab({
  data,
  customers,
  products,
  categories,
  reps,
  onUpload,
  onSource,
  onSaveCustomer,
  onAddCustomer,
  onDeleteCustomer,
  onSaveProduct,
  onAddProduct,
  onDeleteProduct,
}: {
  data: HubData;
  customers: CustomerView[];
  products: ProductView[];
  categories: string[];
  reps: string[];
  onUpload: (file: File) => Promise<void>;
  onSource: (action: "sample" | "records" | "clear-changes") => Promise<void>;
  onSaveCustomer: (row: CustomerRow, column: string, value: string) => void;
  onAddCustomer: () => void;
  onDeleteCustomer: (row: CustomerRow) => void;
  onSaveProduct: (row: ProductRow, column: string, value: string) => void;
  onAddProduct: () => void;
  onDeleteProduct: (row: ProductRow) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<"sample" | "clear-changes" | null>(null);
  const changedCount = data.customers.filter((c) => c.origin === "upload" || c.origin === "edit").length;
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const customerColumns: SheetColumn<CustomerView>[] = [
    { key: "customerId", label: "Customer ID", kind: "text", width: 110, get: (c) => c.customerId },
    { key: "name", label: "Customer Name", kind: "text", width: 220, get: (c) => c.name },
    { key: "salesperson", label: "Salesperson", kind: "select", options: reps, width: 130, get: (c) => c.salesperson },
    { key: "region", label: "Region", kind: "select", options: REGIONS, width: 130, get: (c) => c.region },
    { key: "mainProduct", label: "Main Product", kind: "select", options: categories, width: 150, get: (c) => c.mainProduct },
    { key: "lastYearSales", label: "Last Year Sales ($)", kind: "money", width: 130, get: (c) => c.lastYearSales },
    { key: "thisYearSales", label: "This Year Sales ($)", kind: "money", width: 130, get: (c) => c.thisYearSales },
    { key: "q1", label: "Q1 Sales", kind: "money", width: 110, get: (c) => c.q1 },
    { key: "q2", label: "Q2 Sales", kind: "money", width: 110, get: (c) => c.q2 },
    { key: "q3", label: "Q3 Sales", kind: "money", width: 110, get: (c) => c.q3 },
    { key: "q4", label: "Q4 Sales", kind: "money", width: 110, get: (c) => c.q4 },
    { key: "lastContactDate", label: "Last Contact Date", kind: "date", width: 150, get: (c) => c.lastContactDate },
    { key: "yearlyChange", label: "Yearly Change ($)", kind: "computed", numeric: true, width: 130, get: (c) => c.yearlyChange, render: (c) => usd(c.yearlyChange, true) },
    { key: "yearlyChangePct", label: "Yearly Change (%)", kind: "computed", numeric: true, width: 120, get: (c) => c.yearlyChangePct, render: (c) => pct(c.yearlyChangePct) },
    { key: "share", label: "Share of Total Sales (%)", kind: "computed", numeric: true, width: 140, get: (c) => c.shareOfTotal, render: (c) => `${c.shareOfTotal.toFixed(2)}%` },
    { key: "days", label: "Days Since Last Contact", kind: "computed", numeric: true, width: 130, get: (c) => c.daysSinceContact, render: (c) => (c.daysSinceContact === null ? "–" : c.daysSinceContact) },
    { key: "step", label: "Recommended Next Step", kind: "computed", width: 220, get: (c) => c.nextStep, render: (c) => <Step text={c.nextStep} /> },
  ];

  const productColumns: SheetColumn<ProductView>[] = [
    { key: "code", label: "Product Code", kind: "text", width: 130, get: (p) => p.code },
    { key: "name", label: "Product Name", kind: "text", width: 240, get: (p) => p.name },
    { key: "category", label: "Category", kind: "select", options: categories, width: 150, get: (p) => p.category },
    { key: "sellingPrice", label: "Selling Price ($)", kind: "money", width: 120, get: (p) => p.sellingPrice },
    { key: "unitCost", label: "Unit Cost ($)", kind: "money", width: 110, get: (p) => p.unitCost },
    { key: "unitsInStock", label: "Units in Stock", kind: "count", width: 110, get: (p) => p.unitsInStock },
    { key: "dailyUsage", label: "Daily Usage (Units/Day)", kind: "decimal", width: 140, get: (p) => p.dailyUsage },
    { key: "orderingDays", label: "Ordering Time (Days)", kind: "count", width: 130, get: (p) => p.orderingDays },
    { key: "backupStock", label: "Backup Stock (Units)", kind: "count", width: 130, get: (p) => p.backupStock },
    { key: "daysLeft", label: "Days of Stock Left", kind: "computed", numeric: true, width: 120, get: (p) => p.daysOfStockLeft, render: (p) => (p.daysOfStockLeft === null ? "Not used up" : p.daysOfStockLeft.toLocaleString()) },
    { key: "minLevel", label: "Minimum Stock Level", kind: "computed", numeric: true, width: 130, get: (p) => p.minimumStockLevel },
    { key: "orderQty", label: "Suggested Order Quantity", kind: "computed", numeric: true, width: 150, get: (p) => p.suggestedOrderQty },
    { key: "orderBy", label: "Order By Date", kind: "computed", width: 130, get: (p) => p.orderByDate, render: (p) => (p.status === "Order Now" ? "Today" : dateLabel(p.orderByDate)) },
    { key: "status", label: "Stock Status", kind: "computed", width: 130, get: (p) => p.status, render: (p) => <StatusLabel status={p.status} /> },
  ];

  return (
    <div className={styles.stack}>
      <section className={styles.dataControls} aria-label="Data controls">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void run("upload", () => onUpload(f));
          }}
        />
        <button className="btn btn-primary" type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          <Upload size={16} strokeWidth={1.75} aria-hidden />
          {busy === "upload" ? "Reading workbook…" : "Upload Excel Workbook (.xlsx)"}
        </button>
        {confirmReset === "sample" ? (
          <span className={styles.inlineConfirm}>
            Replace the sample customers with a fresh copy?
            <button className="btn btn-danger" type="button" onClick={() => void run("sample", () => onSource("sample")).then(() => setConfirmReset(null))}>
              Reset
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmReset(null)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => (data.source === "sample" ? setConfirmReset("sample") : void run("sample", () => onSource("sample")))}>
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
            Reset to Sample Customer Data
          </button>
        )}
        {data.source === "sample" ? (
          <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => void run("records", () => onSource("records"))}>
            Use Our Sales Records
          </button>
        ) : (
          changedCount > 0 &&
          (confirmReset === "clear-changes" ? (
            <span className={styles.inlineConfirm}>
              Remove {changedCount} uploaded or edited customers?
              <button className="btn btn-danger" type="button" onClick={() => void run("clear", () => onSource("clear-changes")).then(() => setConfirmReset(null))}>
                Remove
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmReset(null)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmReset("clear-changes")}>
              Undo My Uploads & Edits
            </button>
          ))
        )}
        <p className={styles.sectionNote}>
          {data.source === "sample"
            ? "You're looking at sample customers. Uploading a workbook or choosing Use Our Sales Records switches to your real data."
            : "Customers come from your sales records. Uploads and edits sit on top: anything you change here stays, and new sales keep updating the rest."}{" "}
          The Excel report&apos;s All_Customer_Sales tab can be edited and uploaded back.
        </p>
      </section>

      <section>
        <SectionHead title="Customer Sales Spreadsheet">
          <p className={styles.sectionNote}>Columns marked auto recalculate as you edit.</p>
        </SectionHead>
        <SheetEditor
          caption="Customer Sales Spreadsheet"
          columns={customerColumns}
          rows={customers}
          rowKey={(c) => c.key}
          rowLabel={(c) => c.name}
          searchText={(c) => `${c.customerId} ${c.name} ${c.salesperson} ${c.region} ${c.mainProduct}`}
          onSave={onSaveCustomer}
          onDelete={onDeleteCustomer}
          onAdd={onAddCustomer}
          addLabel="Add Customer"
        />
      </section>

      <section>
        <SectionHead title="Product Inventory and Ordering Time Spreadsheet">
          <p className={styles.sectionNote}>
            Stock counts come from the website once WooCommerce is connected. Leave Daily Usage blank to work it out from the last 90 days of sales.
          </p>
        </SectionHead>
        <SheetEditor
          caption="Product Inventory and Ordering Time Spreadsheet"
          columns={productColumns}
          rows={products}
          rowKey={(p) => p.code}
          rowLabel={(p) => p.name}
          searchText={(p) => `${p.code} ${p.name} ${p.category}`}
          onSave={onSaveProduct}
          onDelete={onDeleteProduct}
          onAdd={onAddProduct}
          addLabel="Add Product"
        />
      </section>
    </div>
  );
}
