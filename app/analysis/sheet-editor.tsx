"use client";

import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./hub.module.css";

export type SheetColumn<T> = {
  key: string;
  label: string;
  kind: "text" | "money" | "count" | "decimal" | "date" | "select" | "computed";
  options?: string[];
  width?: number;
  get: (row: T) => string | number | null;
  render?: (row: T) => React.ReactNode; // computed columns
  numeric?: boolean;
};

const PAGE = 25;

function display(kind: SheetColumn<unknown>["kind"], v: string | number | null): string {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
  if (kind === "money") return Number(v).toFixed(2);
  return String(v);
}

// An Excel-like editable table: type in a cell, leave it (or press Enter) to
// save. Calculated columns update as soon as the change is saved.
export function SheetEditor<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowLabel,
  searchText,
  onSave,
  onDelete,
  onAdd,
  addLabel,
}: {
  caption: string;
  columns: SheetColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowLabel: (row: T) => string;
  searchText: (row: T) => string;
  onSave: (row: T, column: string, value: string) => void;
  onDelete: (row: T) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
  }, [rows, query, searchText]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE, current * PAGE);

  const commit = (row: T, col: SheetColumn<T>, el: HTMLInputElement | HTMLSelectElement) => {
    const before = display(col.kind, col.get(row));
    if (el.value !== before) onSave(row, col.key, el.value);
  };

  return (
    <div className={styles.sheetEditor}>
      <div className={styles.sheetTools}>
        <label className={styles.sheetSearch}>
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            className="input"
            type="search"
            placeholder="Search this table"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label={`Search ${caption}`}
          />
        </label>
        <span className={styles.sheetCount}>
          {filtered.length.toLocaleString()} {filtered.length === 1 ? "row" : "rows"}
        </span>
        <button className="btn btn-secondary" type="button" onClick={onAdd}>
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          {addLabel}
        </button>
      </div>
      <div className={styles.sheetScroll}>
        <table className={styles.sheetTable}>
          <caption className={styles.srOnly}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.numeric || c.kind === "money" || c.kind === "count" || c.kind === "decimal" ? styles.num : undefined} style={{ minWidth: c.width }}>
                  {c.label}
                  {c.kind === "computed" && <span className={styles.calcTag}>auto</span>}
                </th>
              ))}
              <th aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const id = rowKey(row);
              return (
                <tr key={id}>
                  {columns.map((c) => {
                    const value = c.get(row);
                    if (c.kind === "computed") {
                      return (
                        <td key={c.key} className={`${styles.calcCell} ${c.numeric ? styles.num : ""}`}>
                          {c.render ? c.render(row) : display("text", value)}
                        </td>
                      );
                    }
                    const label = `${c.label} for ${rowLabel(row) || "new row"}`;
                    const v = display(c.kind, value);
                    if (c.kind === "select") {
                      const opts = c.options ?? [];
                      return (
                        <td key={c.key}>
                          <select key={`${id}:${v}`} className={styles.cellInput} defaultValue={v} aria-label={label} onChange={(e) => commit(row, c, e.currentTarget)}>
                            {!opts.includes(v) && <option value={v}>{v || "Choose…"}</option>}
                            {opts.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    const numeric = c.kind === "money" || c.kind === "count" || c.kind === "decimal";
                    return (
                      <td key={c.key}>
                        <input
                          key={`${id}:${v}`}
                          className={`${styles.cellInput} ${numeric ? styles.num : ""}`}
                          defaultValue={v}
                          type={c.kind === "date" ? "date" : "text"}
                          inputMode={c.kind === "count" ? "numeric" : numeric ? "decimal" : undefined}
                          aria-label={label}
                          onBlur={(e) => commit(row, c, e.currentTarget)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") {
                              e.currentTarget.value = v;
                              e.currentTarget.blur();
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className={styles.deleteCell}>
                    {confirming === id ? (
                      <span className={styles.confirmDelete}>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => {
                            setConfirming(null);
                            onDelete(row);
                          }}
                        >
                          Delete
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => setConfirming(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button className="icon-btn" type="button" aria-label={`Delete ${rowLabel(row) || "this row"}`} title="Delete row" onClick={() => setConfirming(id)}>
                        <Trash2 size={16} strokeWidth={1.75} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className={styles.emptyNote}>{query ? "No rows match that search." : "No rows yet."}</p>}
      </div>
      {pages > 1 && (
        <div className={styles.sheetPager}>
          <span className="num">
            {((current - 1) * PAGE + 1).toLocaleString()}–{Math.min(current * PAGE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
          </span>
          <div>
            <button className="icon-btn" type="button" onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Previous page">
              <ChevronLeft size={18} strokeWidth={1.75} />
            </button>
            <button className="icon-btn" type="button" onClick={() => setPage(current + 1)} disabled={current >= pages} aria-label="Next page">
              <ChevronRight size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
