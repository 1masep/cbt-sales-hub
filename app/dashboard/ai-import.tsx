"use client";

import { AlertTriangle, Check, ChevronRight, FileUp, Link2, Sparkles, Type, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ImportResult } from "../../lib/ai-import";
import type { Draft } from "../../lib/drafts-repo";
import styles from "./dashboard.module.css";
import { BlurFade } from "../../components/magicui/blur-fade";
import { money } from "./format";
import { SaleFormDrawer, type SaleForm } from "./sale-form-drawer";

type Mode = "text" | "file" | "url";

function Panel({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <header className={styles.drawerHeader}>
          <div>
            <p className={styles.kpiLabel}>{eyebrow}</p>
            <h2 id="panel-title">{title}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
      </aside>
    </div>
  );
}

export function ImportDialog({ onClose, onImported, onOpenDrafts }: { onClose: () => void; onImported: () => void; onOpenDrafts: () => void }) {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const ready = mode === "text" ? text.trim() !== "" : mode === "url" ? url.trim() !== "" : file !== null;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const body = new FormData();
    if (mode === "text") body.set("text", text);
    if (mode === "url") body.set("url", url);
    if (mode === "file" && file) body.set("file", file);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Something went wrong. Try again.");
      setResult(data);
      onImported();
    } catch {
      setError("Couldn't reach the app. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const held = result?.outcomes.filter((o) => o.status === "held for review").length ?? 0;
  const tabs: [Mode, string, React.ReactNode][] = [
    ["text", "Paste text", <Type key="t" size={15} strokeWidth={1.75} />],
    ["file", "Upload file", <FileUp key="f" size={15} strokeWidth={1.75} />],
    ["url", "Link", <Link2 key="l" size={15} strokeWidth={1.75} />],
  ];

  return (
    <Panel eyebrow="Import with AI" title="Add sales from anything" onClose={onClose}>
      <p className={styles.helpText}>
        Give the AI an order email, an invoice, a receipt photo, or a page with order details. It fills in the sale and saves
        it when every detail is clear and the amounts add up; anything else waits for you as a draft.
      </p>
      <form onSubmit={run} className={styles.importForm}>
        <div className={styles.tabs} role="tablist">
          {tabs.map(([m, label, icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? styles.tabActive : styles.tab}
              onClick={() => setMode(m)}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {mode === "text" && (
          <label className="field">
            <span>Order email, invoice text, or copied web page</span>
            <textarea className={`input ${styles.textarea}`} value={text} onChange={(e) => setText(e.target.value)} rows={10} />
          </label>
        )}
        {mode === "file" && (
          <label className={styles.dropzone}>
            <FileUp size={22} strokeWidth={1.5} aria-hidden />
            <span>{file ? file.name : "Choose a PDF or an image (PNG, JPG, GIF, WebP), up to 10 MB"}</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/gif,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {mode === "url" && (
          <label className="field">
            <span>Link to a page with the order on it</span>
            <input className="input" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            <span className={styles.hint}>The page must be public. For pages behind a login, copy the text and paste it instead.</span>
          </label>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={!ready || busy} style={{ justifySelf: "start" }}>
          <Sparkles size={15} strokeWidth={1.75} />
          {busy ? "Reading… this can take a minute" : "Read and fill in"}
        </button>
      </form>

      {result && (
        <section className={styles.results} aria-live="polite">
          <h3>{result.found === 0 ? "No completed sales found" : `Found ${result.found} ${result.found === 1 ? "sale" : "sales"}`}</h3>
          <p className={styles.hint}>{result.sourceLabel}</p>
          <ul>
            {result.outcomes.map((o, i) => (
              <li key={i}>
                <BlurFade delay={i * 0.04} className={o.status === "held for review" ? styles.resultHeld : styles.resultSaved}>
                {o.status === "held for review" ? <AlertTriangle size={15} strokeWidth={1.75} /> : <Check size={15} strokeWidth={2} />}
                <div>
                  <strong className="mono">{o.invoiceNumber ?? "No invoice number"}</strong> · {o.customerName ?? "Unknown customer"}
                  <span className={styles.resultStatus}>
                    {o.status === "saved" ? "Saved to the sheet" : o.status === "already recorded" ? "Already in the sheet" : "Held as a draft"}
                  </span>
                  {o.reasons.length > 0 && (
                    <ul className={styles.reasons}>
                      {o.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
                </BlurFade>
              </li>
            ))}
          </ul>
          {held > 0 && (
            <button className="btn btn-secondary" type="button" onClick={onOpenDrafts}>
              Check {held === 1 ? "the draft" : `the ${held} drafts`}
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          )}
        </section>
      )}
    </Panel>
  );
}

function draftForm(p: Record<string, unknown>): SaleForm {
  const s = (k: string) => (p[k] === null || p[k] === undefined ? "" : String(p[k]));
  const m = (k: string) => (typeof p[k] === "number" ? (p[k] as number).toFixed(2) : s(k));
  return {
    invoiceNumber: s("invoiceNumber"),
    customerName: s("customerName"),
    date: s("date"),
    commodityCategory: s("commodityCategory"),
    sku: s("sku"),
    quantity: s("quantity"),
    price: m("price"),
    invoiceAmount: m("invoiceAmount"),
    discount: m("discount"),
    salesTax: m("salesTax"),
    salesRep: s("salesRep"),
    address: s("address"),
    zipCode: s("zipCode"),
    phone: s("phone"),
    email: s("email"),
  };
}

export function DraftsPanel({
  categories,
  reps,
  onClose,
  onChanged,
}: {
  categories: string[];
  reps: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [open, setOpen] = useState<Draft | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/admin/drafts")
      .then((r) => r.json())
      .then((d) => setDrafts(d.drafts ?? []))
      .catch(() => setDrafts([]));
  }, [reload]);

  if (open) {
    const p = open.payload;
    return (
      <SaleFormDrawer
        text={{
          eyebrow: "AI draft · check and save",
          title: (p.invoiceNumber as string) || "No invoice number",
          save: "Save to sheet",
          remove: "Discard",
          confirmRemove: "Discard this draft? It won't be added to the sheet.",
          gone: "This draft was already saved or discarded.",
        }}
        initial={draftForm(p)}
        categories={categories}
        reps={reps}
        submit={(form) =>
          fetch(`/api/admin/drafts/${open.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        }
        remove={() => fetch(`/api/admin/drafts/${open.id}`, { method: "DELETE" })}
        onClose={() => setOpen(null)}
        onDone={() => {
          setOpen(null);
          setReload((n) => n + 1);
          onChanged();
        }}
        notice={() => (
          <div className={styles.reviewBox}>
            <div className={styles.reviewHead}>
              <AlertTriangle size={16} strokeWidth={1.75} />
              <strong>Why the AI didn&apos;t save this on its own</strong>
            </div>
            <ul>
              {open.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {typeof p.aiNote === "string" && <p>AI note: {p.aiNote}</p>}
            <p className={styles.sourceLine}>From: {open.sourceLabel}</p>
            {open.sourceExcerpt && (
              <details>
                <summary>Show what the AI read</summary>
                <pre className={styles.excerpt}>{open.sourceExcerpt}</pre>
              </details>
            )}
          </div>
        )}
      />
    );
  }

  return (
    <Panel eyebrow="AI drafts" title={drafts ? `${drafts.length} waiting for you` : "Loading…"} onClose={onClose}>
      {drafts?.length === 0 && <p className={styles.helpText}>Nothing to check. Every sale the AI read has been saved or handled.</p>}
      <ul className={styles.draftList}>
        {drafts?.map((d, i) => {
          const p = d.payload;
          const total =
            typeof p.invoiceAmount === "number" ? (p.invoiceAmount as number) - Number(p.discount ?? 0) + Number(p.salesTax ?? 0) : null;
          return (
            <li key={d.id}>
              <BlurFade delay={i * 0.04}>
              <button type="button" className={styles.draftCard} onClick={() => setOpen(d)}>
                <span className={styles.draftTop}>
                  <strong className="mono">{(p.invoiceNumber as string) || "No invoice number"}</strong>
                  <span className="num">{total === null ? "No amount" : money(total)}</span>
                </span>
                <span>
                  {(p.customerName as string) || "Unknown customer"} · {(p.sku as string) || "no SKU"}
                </span>
                <span className={styles.draftReason}>{d.reasons[0]}</span>
                <span className={styles.hint}>{d.sourceLabel}</span>
              </button>
              </BlurFade>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
