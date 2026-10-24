"use client";

import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Highlighter } from "../../components/magicui/highlighter";
import { NumberTicker } from "../../components/magicui/number-ticker";
import type { SaleRecord, SortKey, Summary } from "../../lib/sales-repo";
import { AppHeader } from "../components/app-header";
import styles from "./dashboard.module.css";
import { DraftsPanel, ImportDialog } from "./ai-import";
import { EditDrawer } from "./edit-drawer";
import { useWooStatus, wooHasProblem, WooAttention, WooIndicator } from "./woo-status";
import { money, monthLabel, shortDate } from "./format";

type FilterState = { q: string; category: string; rep: string; from: string; to: string; review: string };
type Data = { rows: SaleRecord[]; total: number; page: number; pageSize: number; summary: Summary; needsReview: number; openDrafts: number };

const EMPTY_FILTERS: FilterState = { q: "", category: "", rep: "", from: "", to: "", review: "" };
const PAGE_SIZE = 50;

const COLUMNS: { key: keyof SaleRecord; label: string; sort?: SortKey; numeric?: boolean }[] = [
  { key: "invoiceNumber", label: "Invoice", sort: "invoiceNumber" },
  { key: "date", label: "Date", sort: "date" },
  { key: "customerName", label: "Customer / company", sort: "customerName" },
  { key: "commodityCategory", label: "Category", sort: "commodityCategory" },
  { key: "sku", label: "SKU", sort: "sku" },
  { key: "quantity", label: "Qty", sort: "quantity", numeric: true },
  { key: "price", label: "Price", sort: "price", numeric: true },
  { key: "invoiceAmount", label: "Amount", sort: "invoiceAmount", numeric: true },
  { key: "discount", label: "Discount", sort: "discount", numeric: true },
  { key: "salesTax", label: "Sales tax", sort: "salesTax", numeric: true },
  { key: "totalAmount", label: "Total", sort: "totalAmount", numeric: true },
  { key: "salesRep", label: "Sales rep", sort: "salesRep" },
  { key: "address", label: "Address" },
  { key: "zipCode", label: "Zip" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
];

function describeFilters(f: FilterState, categories: string[]): string {
  const parts: string[] = [];
  if (f.category && categories.includes(f.category)) parts.push(f.category);
  if (f.rep) parts.push(f.rep);
  if (f.from || f.to) parts.push(`${f.from ? shortDate(f.from) : "Start"} to ${f.to ? shortDate(f.to) : "today"}`);
  if (f.q.trim()) parts.push(`matching "${f.q.trim()}"`);
  return parts.length ? `Showing ${parts.join(" · ")}` : "All sales, newest first";
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function SalesDashboard({ categories, reps }: { categories: string[]; reps: string[] }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SaleRecord | null>(null);
  const [panel, setPanel] = useState<"import" | "drafts" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const q = useDebounced(filters.q, 250);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    const active = { ...filters, q };
    for (const [k, v] of Object.entries(active)) if (v) params.set(k, v);
    params.set("sort", sort.key);
    params.set("dir", sort.dir);
    return params;
  }, [filters, q, sort]);

  const queryString = query.toString();
  useEffect(() => setPage(1), [queryString]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams(queryString);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    fetch(`/api/admin/sales?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error();
        setData((await res.json()) as Data);
        setError(null);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError("Couldn't load sales. Check your connection and try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryString, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));

  const summary = data?.summary;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstRow = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  const woo = useWooStatus(reload);
  // Marks the search match inside a cell (DESIGN.md: matched text only, visible rows only).
  const needle = q.trim().toLowerCase();
  const hl = (text: string) => {
    const at = needle.length >= 2 ? text.toLowerCase().indexOf(needle) : -1;
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <Highlighter key={needle}>{text.slice(at, at + needle.length)}</Highlighter>
        {text.slice(at + needle.length)}
      </>
    );
  };
  const filterNote = describeFilters(filters, categories);
  const attention = (data?.openDrafts ?? 0) > 0 || (data?.needsReview ?? 0) > 0 || wooHasProblem(woo.status);

  return (
    <div className={styles.shell}>
      <AppHeader current="sales">
        <WooIndicator {...woo} />
        <button className="btn btn-secondary" type="button" onClick={() => setPanel("import")} aria-label="Import with AI">
          <Sparkles size={16} strokeWidth={1.75} aria-hidden />
          <span className={styles.hideSmall}>Import with AI</span>
        </button>
        <a className="btn btn-primary" href={`/api/admin/export?${queryString}`} download aria-label="Download Excel">
          <Download size={16} strokeWidth={1.75} aria-hidden />
          <span className={styles.hideSmall}>Download Excel</span>
        </a>
      </AppHeader>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{filters.review ? "Sales to double-check" : "Sales"}</h1>
          <p className={styles.filterNote}>{filterNote}</p>
        </div>

        <dl className={styles.figures} aria-busy={!summary}>
          {(
            [
              ["Total sales", summary?.total, true, true],
              ["Invoices", summary?.count, false, false],
              ["Average sale", summary ? (summary.count ? summary.total / summary.count : 0) : undefined, false, true],
              ["Discounts given", summary?.discount, false, true],
              ["Sales tax", summary?.salesTax, false, true],
            ] as const
          ).map(([label, value, lead, isMoney]) => (
            <div key={label} className={lead ? styles.figureLead : styles.figure}>
              <dt>{label}</dt>
              <dd className="num">
                {value === undefined ? (
                  <span className={styles.skeletonText} />
                ) : (
                  <NumberTicker value={value} decimalPlaces={isMoney ? 2 : 0} prefix={isMoney ? "$" : ""} />
                )}
              </dd>
            </div>
          ))}
        </dl>

        {attention && (
          <section className={styles.attention} aria-label="Needs your attention">
            <h2 className={styles.attentionTitle}>Needs your attention</h2>
            <ul>
              {data && data.openDrafts > 0 && (
                <li className={styles.attentionItem}>
                  <Sparkles size={18} strokeWidth={1.75} className={styles.attentionIconBrand} aria-hidden />
                  <span>
                    <strong>
                      {data.openDrafts} {data.openDrafts === 1 ? "sale" : "sales"} from AI import
                    </strong>{" "}
                    {data.openDrafts === 1 ? "is" : "are"} waiting for you to check before going into the sheet.
                  </span>
                  <button className="btn btn-secondary" type="button" onClick={() => setPanel("drafts")}>
                    Check drafts
                  </button>
                </li>
              )}
              {data && data.needsReview > 0 && (
                <li className={styles.attentionItem}>
                  <AlertTriangle size={18} strokeWidth={1.75} className={styles.attentionIconWarning} aria-hidden />
                  <span>
                    <strong>
                      {data.needsReview} {data.needsReview === 1 ? "sale has" : "sales have"} details to double-check,
                    </strong>{" "}
                    like a missing phone or a non-US postal code.
                  </span>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, review: f.review ? "" : "1" }))}
                    aria-pressed={!!filters.review}
                  >
                    {filters.review ? "Show all sales" : "Review them"}
                  </button>
                </li>
              )}
              <WooAttention {...woo} />
            </ul>
          </section>
        )}

        <section className={styles.toolbar} aria-label="Filters">
          <label className={styles.search}>
            <Search size={17} strokeWidth={1.75} aria-hidden />
            <input
              className="input"
              type="search"
              placeholder="Search invoice, customer, SKU, email, phone"
              value={filters.q}
              onChange={set("q")}
              aria-label="Search sales"
            />
          </label>
          <select className="input" value={filters.category} onChange={set("category")} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="input" value={filters.rep} onChange={set("rep")} aria-label="Sales rep">
            <option value="">All sales reps</option>
            {reps.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <div className={styles.dates}>
            <input className="input" type="date" value={filters.from} onChange={set("from")} aria-label="From date" />
            <span aria-hidden>to</span>
            <input className="input" type="date" value={filters.to} onChange={set("to")} aria-label="To date" />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={16} strokeWidth={1.75} />
              Clear filters
            </button>
          )}
        </section>

        {error && (
          <p className={styles.error} role="alert">
            {error}{" "}
            <button className="btn btn-ghost" type="button" onClick={reload}>
              Retry
            </button>
          </p>
        )}

        <div className={styles.workspace}>
          <section className={styles.sheet} aria-label="Sales" aria-busy={loading}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} className={col.numeric ? styles.numeric : undefined} aria-sort={
                        col.sort && sort.key === col.sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                      }>
                        {col.sort ? (
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort(col.sort!)}>
                            {col.label}
                            {sort.key === col.sort &&
                              (sort.dir === "asc" ? <ArrowUp size={12} strokeWidth={2} /> : <ArrowDown size={12} strokeWidth={2} />)}
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={loading && data ? styles.dim : undefined}>
                  {data?.rows.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => setEditing(row)}
                      // Keep keyboard focus for Tab users, but don't let a mouse click scroll the sheet sideways.
                      onMouseDown={(e) => e.preventDefault()}
                      onKeyDown={(e) => e.key === "Enter" && setEditing(row)}
                      aria-label={`Edit sale ${row.invoiceNumber}`}
                    >
                      <td className="mono">
                        <span className={styles.invoiceCell}>
                          {hl(row.invoiceNumber)}
                          {row.source.startsWith("ai-import") && (
                            <span className={styles.aiBadge} title="Entered by AI import">
                              AI
                            </span>
                          )}
                          {row.needsReview && (
                            <span className={styles.flag} title={row.flags.join(" · ")} aria-label={`Needs review: ${row.flags.join(", ")}`}>
                              <AlertTriangle size={13} strokeWidth={2} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="num">{shortDate(row.date)}</td>
                      <td className={`${styles.strong} ${styles.clip}`} title={row.customerName}>{hl(row.customerName)}</td>
                      <td>{row.commodityCategory}</td>
                      <td className="mono">{hl(row.sku)}</td>
                      <td className={`${styles.numeric} num`}>{row.quantity.toLocaleString()}</td>
                      <td className={`${styles.numeric} num`}>{money(row.price)}</td>
                      <td className={`${styles.numeric} num`}>{money(row.invoiceAmount)}</td>
                      <td className={`${styles.numeric} num ${styles.muted}`}>{row.discount ? `−${money(row.discount)}` : "–"}</td>
                      <td className={`${styles.numeric} num ${styles.muted}`}>{money(row.salesTax)}</td>
                      <td className={`${styles.numeric} num ${styles.strong}`}>{money(row.totalAmount)}</td>
                      <td>{row.salesRep}</td>
                      <td className={styles.wrap}>{hl(row.address)}</td>
                      <td className="num">{hl(row.zipCode)}</td>
                      <td className="num">{hl(row.phone)}</td>
                      <td className={styles.clip} title={row.email}>{hl(row.email)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && data.rows.length === 0 && (
                <div className={styles.empty}>
                  {hasFilters ? (
                    <>
                      <p>No sales match these filters.</p>
                      <button className="btn btn-secondary" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <p>No sales yet. They appear here as soon as the website sends one.</p>
                  )}
                </div>
              )}
              {!data && loading && <div className={styles.empty}>Loading sales…</div>}
            </div>
            {data && data.total > 0 && (
              <footer className={styles.pager}>
                <span className="num">
                  {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {data.total.toLocaleString()}
                </span>
                <div>
                  <button className="icon-btn" type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">
                    <ChevronLeft size={18} strokeWidth={1.75} />
                  </button>
                  <button className="icon-btn" type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label="Next page">
                    <ChevronRight size={18} strokeWidth={1.75} />
                  </button>
                </div>
              </footer>
            )}
          </section>

          <aside className={styles.breakdowns} aria-label="Breakdowns">
            <Breakdown title="By sales rep" items={summary?.byRep} />
            <Breakdown title="By category" items={summary?.byCategory} />
            <Breakdown title="By month" items={summary?.byMonth.slice(-12).reverse()} label={monthLabel} />
          </aside>
        </div>
      </main>

      {panel === "import" && <ImportDialog onClose={() => setPanel(null)} onImported={reload} onOpenDrafts={() => setPanel("drafts")} />}
      {panel === "drafts" && <DraftsPanel categories={categories} reps={reps} onClose={() => setPanel(null)} onChanged={reload} />}

      {editing && (
        <EditDrawer
          sale={editing}
          categories={categories}
          reps={reps}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Breakdown({ title, items, label = (k: string) => k }: { title: string; items?: Summary["byRep"]; label?: (key: string) => string }) {
  const max = Math.max(1, ...(items ?? []).map((i) => i.total));
  return (
    <section className={styles.breakdown}>
      <h2>{title}</h2>
      {items && items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <div className={styles.breakdownRow}>
                <span>{label(item.key)}</span>
                <span className="num">{money(item.total)}</span>
              </div>
              <div className={styles.bar} aria-hidden>
                <span style={{ width: `${(item.total / max) * 100}%` }} />
              </div>
              <span className={`${styles.breakdownCount} num`}>
                {item.count} {item.count === 1 ? "invoice" : "invoices"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>{items ? "Nothing yet" : "Loading…"}</p>
      )}
    </section>
  );
}
