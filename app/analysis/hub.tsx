"use client";

import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NumberTicker } from "../../components/magicui/number-ticker";
import type { HubData } from "../../lib/hub/load";
import { scorecard, viewCustomers, viewProducts, type CustomerRow, type ProductRow } from "../../lib/hub/metrics";
import { project, type ProjectionOptions } from "../../lib/hub/projection";
import { AppHeader } from "../components/app-header";
import styles from "./hub.module.css";
import { AlertsTab, AnalysisTab, SpreadsheetsTab, SummaryTab } from "./sections";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "analysis", label: "Analysis" },
  { id: "alerts", label: "Alerts" },
  { id: "spreadsheets", label: "Spreadsheets" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export type HubSettings = { triggerPct: number } & ProjectionOptions;

const toNumber = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function AnalysisHub({ categories, reps }: { categories: string[]; reps: string[] }) {
  const [data, setData] = useState<HubData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("summary");
  const [settings, setSettings] = useState<HubSettings>({ triggerPct: -15, monthsAhead: 12, trend: "straight", seasonal: true });

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabId;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
    fetch("/api/admin/hub")
      .then(async (r) => {
        if (r.status === 401) return void (window.location.href = "/login?next=/analysis");
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => setError("Couldn't load the Analysis Hub. Check your connection and refresh the page."));
  }, []);

  const chooseTab = (id: TabId) => {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  };

  const today = useMemo(() => (data ? new Date(`${data.today}T12:00:00Z`) : new Date()), [data]);
  const customers = useMemo(() => (data ? viewCustomers(data.customers, today) : []), [data, today]);
  const products = useMemo(() => (data ? viewProducts(data.products, today) : []), [data, today]);
  const projection = useMemo(
    () => (data ? project(data.monthly, { monthsAhead: settings.monthsAhead, trend: settings.trend, seasonal: settings.seasonal }) : null),
    [data, settings.monthsAhead, settings.trend, settings.seasonal],
  );
  const card = useMemo(() => scorecard(customers, products, settings.triggerPct), [customers, products, settings.triggerPct]);

  const report = `/api/admin/hub/export?${new URLSearchParams({
    trigger: String(settings.triggerPct),
    months: String(settings.monthsAhead),
    trend: settings.trend,
    seasonal: settings.seasonal ? "1" : "0",
  })}`;

  // ----- changes from the Spreadsheets tab (shown at once, saved in the background) -----

  const fail = (what: string) => setNotice(`Couldn't save ${what}. Check your connection; your change is shown but not saved yet.`);

  const saveCustomer = useCallback((row: CustomerRow, column: string, value: string) => {
    const numeric = ["lastYearSales", "thisYearSales", "q1", "q2", "q3", "q4"].includes(column);
    const local = numeric ? toNumber(value) : column === "lastContactDate" ? value || null : value;
    setData((d) => d && { ...d, customers: d.customers.map((c) => (c.key === row.key ? { ...c, [column]: local } : c)) });
    fetch("/api/admin/hub/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: row.key.startsWith("tmp-") ? null : row.key, fields: { [column]: value } }) })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const saved = (await r.json()) as { key: string; fields: Partial<CustomerRow> };
        setData((d) => d && { ...d, customers: d.customers.map((c) => (c.key === row.key ? { ...c, ...saved.fields, key: saved.key, origin: c.origin === "records" ? "edit" : c.origin } : c)) });
      })
      .catch(() => fail(row.name || "that customer"));
  }, []);

  const addCustomer = useCallback(() => {
    const key = `tmp-${Date.now().toString(36)}`;
    const blank: CustomerRow = { key, customerId: "", name: "New customer", salesperson: reps[0] ?? "", region: "", mainProduct: "", lastYearSales: 0, thisYearSales: 0, q1: 0, q2: 0, q3: 0, q4: 0, lastContactDate: today.toISOString().slice(0, 10), origin: "edit" };
    setData((d) => d && { ...d, customers: [blank, ...d.customers] });
    fetch("/api/admin/hub/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: null, fields: blank }) })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const saved = (await r.json()) as { key: string; fields: Partial<CustomerRow> };
        setData((d) => d && { ...d, customers: d.customers.map((c) => (c.key === key ? { ...c, ...saved.fields, key: saved.key } : c)) });
      })
      .catch(() => fail("the new customer"));
  }, [reps, today]);

  const deleteCustomer = useCallback((row: CustomerRow) => {
    setData((d) => d && { ...d, customers: d.customers.filter((c) => c.key !== row.key) });
    if (!row.key.startsWith("tmp-")) fetch(`/api/admin/hub/customers?key=${encodeURIComponent(row.key)}`, { method: "DELETE" }).catch(() => fail("the deletion"));
  }, []);

  const saveProduct = useCallback((row: ProductRow, column: string, value: string) => {
    const numeric = ["sellingPrice", "unitCost", "unitsInStock", "dailyUsage", "orderingDays", "backupStock"].includes(column);
    if (column === "code") {
      const code = value.trim();
      if (!code) return setNotice("Every product needs a Product Code.");
      setData((d) => d && { ...d, products: d.products.map((p) => (p.code === row.code ? { ...p, code } : p)) });
      fetch("/api/admin/hub/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: row.code, newCode: code, fields: {} }) }).then(async (r) => {
        if (r.ok) return;
        const body = await r.json().catch(() => ({}));
        setNotice(body.error ?? "Couldn't rename the product.");
        setData((d) => d && { ...d, products: d.products.map((p) => (p.code === code ? { ...p, code: row.code } : p)) });
      });
      return;
    }
    const local = numeric ? (column === "dailyUsage" && value.trim() === "" ? 0 : toNumber(value)) : value;
    setData((d) => d && { ...d, products: d.products.map((p) => (p.code === row.code ? { ...p, [column]: local } : p)) });
    fetch("/api/admin/hub/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: row.code, fields: { [column]: value } }) })
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() => fail(row.name || "that product"));
  }, []);

  const addProduct = useCallback(() => {
    const code = `NEW-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const blank: ProductRow = { code, name: "New product", category: categories[0] ?? "", sellingPrice: 0, unitCost: 0, unitsInStock: 0, dailyUsage: 0, orderingDays: 14, backupStock: 0, origin: "edit" };
    setData((d) => d && { ...d, products: [blank, ...d.products] });
    fetch("/api/admin/hub/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, fields: { ...blank, dailyUsage: 0 } }) }).catch(() => fail("the new product"));
  }, [categories]);

  const deleteProduct = useCallback((row: ProductRow) => {
    setData((d) => d && { ...d, products: d.products.filter((p) => p.code !== row.code) });
    fetch(`/api/admin/hub/products?code=${encodeURIComponent(row.code)}`, { method: "DELETE" }).catch(() => fail("the deletion"));
  }, []);

  const switchSource = useCallback(async (action: "sample" | "records" | "clear-changes") => {
    const r = await fetch("/api/admin/hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!r.ok) return setNotice("Couldn't switch the customer data. Try again.");
    setData(await r.json());
    setNotice(action === "sample" ? "Showing the sample customers." : action === "records" ? "Showing customers from your sales records." : "Your uploads and edits were removed; customers now come straight from your sales records.");
  }, []);

  const upload = useCallback(async (file: File) => {
    const body = new FormData();
    body.set("file", file);
    const r = await fetch("/api/admin/hub/upload", { method: "POST", body });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) return setNotice(res.error ?? "Couldn't read that workbook.");
    setData(res.hub);
    setNotice(`Uploaded ${file.name}. ${(res.notes as string[]).join(" ")}`);
  }, []);

  const sourceNote =
    data?.source === "sample"
      ? "Showing sample customers (about 600) so you can try everything. Switch to your sales records on the Spreadsheets tab."
      : "From your sales records, with your uploads and edits. This Year is Jan 1 to today; Last Year is the same dates a year earlier.";

  return (
    <div className={styles.shell}>
      <AppHeader current="analysis">
        <a className="btn btn-primary" href={report} download aria-label="Download Excel Report (.xlsx)">
          <Download size={16} strokeWidth={1.75} aria-hidden />
          <span className={styles.hideSmall}>Download Excel Report</span>
        </a>
      </AppHeader>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>CBT Data Analysis Hub</h1>
          <p className={styles.subtitle}>{data ? sourceNote : "Loading…"}</p>
        </div>

        {error && (
          <p className={styles.errorBox} role="alert">
            {error}
          </p>
        )}

        <section className={styles.scorecard} aria-label="Business scorecard" aria-busy={!data}>
          <Figure label="This Year Total Sales" lead>
            {data ? <NumberTicker value={card.thisYearTotal} decimalPlaces={2} prefix="$" /> : <span className={styles.skeleton} />}
            {data && (
              <Change value={card.totalChange} pct={card.totalChangePct} suffix="vs. last year" />
            )}
          </Figure>
          <Figure label="Customers Who Increased">
            {data ? <NumberTicker value={card.increasedCount} /> : <span className={styles.skeleton} />}
            {data && <span className={styles.figureNote}>+{card.increasedGain.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} gained</span>}
          </Figure>
          <Figure label="Customers Who Declined">
            {data ? <NumberTicker value={card.declinedCount} /> : <span className={styles.skeleton} />}
            {data && <span className={styles.figureNote}>{card.declinedLoss.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).replace("-", "−")} lost</span>}
          </Figure>
          <Figure label="Active Decline Alarms">
            {data ? <NumberTicker value={card.alarmCount} /> : <span className={styles.skeleton} />}
            {data && <span className={styles.figureNote}>down {Math.abs(settings.triggerPct)}% or more</span>}
            {data && (
              <button type="button" className={styles.figureLink} onClick={() => chooseTab("alerts")}>
                See the alarms
              </button>
            )}
          </Figure>
          <Figure label="Products to Order Now">
            {data ? <NumberTicker value={card.orderNowCount} /> : <span className={styles.skeleton} />}
            {data && <span className={styles.figureNote}>would run out before delivery</span>}
            {data && (
              <button type="button" className={styles.figureLink} onClick={() => chooseTab("alerts")}>
                See the list
              </button>
            )}
          </Figure>
        </section>

        {notice && (
          <div className={styles.notice} role="status">
            <span>{notice}</span>
            <button className="btn btn-ghost" type="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className={styles.tabs} role="tablist" aria-label="Analysis Hub sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={tab === t.id ? styles.tabActive : styles.tab}
              onClick={() => chooseTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
          {!data ? (
            <p className={styles.emptyNote}>Loading…</p>
          ) : tab === "summary" ? (
            <SummaryTab customers={customers} />
          ) : tab === "analysis" ? (
            <AnalysisTab customers={customers} products={products} projection={projection!} settings={settings} setSettings={setSettings} categories={categories} reps={reps} />
          ) : tab === "alerts" ? (
            <AlertsTab customers={customers} products={products} settings={settings} setSettings={setSettings} />
          ) : (
            <SpreadsheetsTab
              data={data}
              customers={customers}
              products={products}
              categories={categories}
              reps={reps}
              onUpload={upload}
              onSource={switchSource}
              onSaveCustomer={saveCustomer}
              onAddCustomer={addCustomer}
              onDeleteCustomer={deleteCustomer}
              onSaveProduct={saveProduct}
              onAddProduct={addProduct}
              onDeleteProduct={deleteProduct}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function Figure({ label, lead, children }: { label: string; lead?: boolean; children: React.ReactNode }) {
  return (
    <div className={lead ? styles.figureLead : styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={`${styles.figureValue} num`}>{children}</span>
    </div>
  );
}

function Change({ value, pct, suffix }: { value: number; pct: number | null; suffix: string }) {
  const up = value >= 0;
  const amount = Math.abs(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return (
    <span className={up ? styles.changeUp : styles.changeDown}>
      {up ? <ArrowUpRight size={15} strokeWidth={2} aria-hidden /> : <ArrowDownRight size={15} strokeWidth={2} aria-hidden />}
      {up ? "Up" : "Down"} {amount}
      {pct !== null && ` (${Math.abs(pct).toFixed(1)}%)`} {suffix}
    </span>
  );
}
