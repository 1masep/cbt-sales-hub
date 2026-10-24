"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { computeTotal } from "../../lib/total";
import styles from "./dashboard.module.css";
import { money } from "./format";

export type SaleForm = Record<
  | "invoiceNumber"
  | "customerName"
  | "date"
  | "commodityCategory"
  | "sku"
  | "quantity"
  | "price"
  | "invoiceAmount"
  | "discount"
  | "salesTax"
  | "salesRep"
  | "address"
  | "zipCode"
  | "phone"
  | "email",
  string
>;

function amount(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Options for a dropdown: keep a value that isn't in the list selectable (an old
// sale's rep, or the AI's answer), and offer a blank choice when nothing is set.
function optionsFor(list: string[], value: string): string[] {
  if (!value) return ["", ...list];
  return list.includes(value) ? list : [value, ...list];
}

export type DrawerText = {
  eyebrow: string;
  title: string;
  save: string;
  remove: string;
  confirmRemove: string;
  gone: string;
};

// The sale form used both for editing a saved sale and for checking an AI draft.
// submit/remove do the request; the panel shows field errors from the answer.
export function SaleFormDrawer({
  text,
  initial,
  categories,
  reps,
  notice,
  submit,
  remove,
  onClose,
  onDone,
}: {
  text: DrawerText;
  initial: SaleForm;
  categories: string[];
  reps: string[];
  notice?: (actions: { save: (extra?: Record<string, unknown>) => void; busy: boolean }) => React.ReactNode;
  submit: (form: SaleForm, extra: Record<string, unknown>) => Promise<Response>;
  remove: () => Promise<Response>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<SaleForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = computeTotal(amount(form.invoiceAmount), amount(form.discount), amount(form.salesTax));

  async function save(e: React.FormEvent | null, extra: Record<string, unknown> = {}) {
    e?.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await submit(form, extra);
      const body = await res.json().catch(() => ({}));
      if (res.ok) return onDone();
      setErrors(body.fields ?? {});
      setMessage(res.status === 404 ? text.gone : body.fields ? "Fix the highlighted fields and save again." : (body.error ?? "Couldn't save."));
    } catch {
      setMessage("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doRemove() {
    setBusy(true);
    try {
      const res = await remove();
      if (res.ok || res.status === 404) return onDone();
      setMessage("Couldn't remove it. Try again.");
    } catch {
      setMessage("Couldn't remove it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = (key: keyof SaleForm, label: string, props: React.ComponentProps<"input"> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
        {...props}
      />
      {errors[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );

  const select = (key: keyof SaleForm, label: string, options: string[]) => (
    <label className="field">
      <span>{label}</span>
      <select
        className="input"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "Choose…"}
          </option>
        ))}
      </select>
      {errors[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <header className={styles.drawerHeader}>
          <div>
            <p className={styles.kpiLabel}>{text.eyebrow}</p>
            <h2 id="edit-title" className="mono">
              {text.title}
            </h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <form className={styles.drawerBody} onSubmit={(e) => save(e)} noValidate>
          {notice?.({ save: (extra) => save(null, extra), busy })}

          <fieldset className={styles.group}>
            <legend>Sale</legend>
            <div className={styles.grid2}>
              {input("invoiceNumber", "Invoice number", { ref: firstField })}
              {input("date", "Date", { type: "date" })}
            </div>
            {select("commodityCategory", "Commodity category", optionsFor(categories, form.commodityCategory))}
            {select("salesRep", "Sales rep", optionsFor(reps, form.salesRep))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Product</legend>
            {input("sku", "SKU", { className: "input mono" })}
            <div className={styles.grid2}>
              {input("quantity", "Quantity", { inputMode: "numeric" })}
              {input("price", "Price (each)", { inputMode: "decimal" })}
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Amounts</legend>
            <div className={styles.grid3}>
              {input("invoiceAmount", "Invoice amount", { inputMode: "decimal" })}
              {input("discount", "Discount", { inputMode: "decimal" })}
              {input("salesTax", "Sales tax", { inputMode: "decimal" })}
            </div>
            <div className={styles.totalLine}>
              <span>Total amount</span>
              <strong className="num">{money(total)}</strong>
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Customer</legend>
            {input("customerName", "Customer / company name")}
            {input("address", "Address")}
            <div className={styles.grid2}>
              {input("zipCode", "Zip code", { inputMode: "numeric" })}
              {input("phone", "Phone", { type: "tel" })}
            </div>
            {input("email", "Email", { type: "email" })}
          </fieldset>

          {message && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}

          <footer className={styles.drawerFooter}>
            {confirmDelete ? (
              <div className={styles.confirm}>
                <span>{text.confirmRemove}</span>
                <div>
                  <button className="btn btn-danger" type="button" onClick={doRemove} disabled={busy}>
                    {text.remove}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button className="btn btn-danger-quiet" type="button" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} strokeWidth={1.75} />
                  {text.remove}
                </button>
                <div className={styles.footerActions}>
                  <button className="btn btn-ghost" type="button" onClick={onClose}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={busy}>
                    {busy ? "Saving…" : text.save}
                  </button>
                </div>
              </>
            )}
          </footer>
        </form>
      </aside>
    </div>
  );
}
