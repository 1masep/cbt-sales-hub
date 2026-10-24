"use client";

import { AlertTriangle, Check } from "lucide-react";
import type { SaleRecord } from "../../lib/sales-repo";
import styles from "./dashboard.module.css";
import { SaleFormDrawer, type SaleForm } from "./sale-form-drawer";

function toForm(sale: SaleRecord): SaleForm {
  return {
    invoiceNumber: sale.invoiceNumber,
    customerName: sale.customerName,
    date: sale.date,
    commodityCategory: sale.commodityCategory,
    sku: sale.sku,
    quantity: String(sale.quantity),
    price: sale.price.toFixed(2),
    invoiceAmount: sale.invoiceAmount.toFixed(2),
    discount: sale.discount.toFixed(2),
    salesTax: sale.salesTax.toFixed(2),
    salesRep: sale.salesRep,
    address: sale.address,
    zipCode: sale.zipCode,
    phone: sale.phone,
    email: sale.email,
  };
}

export function EditDrawer({
  sale,
  categories,
  reps,
  onClose,
  onSaved,
}: {
  sale: SaleRecord;
  categories: string[];
  reps: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <SaleFormDrawer
      text={{
        eyebrow: sale.source.startsWith("ai-import") ? "Edit sale · entered by AI" : "Edit sale",
        title: sale.invoiceNumber,
        save: "Save changes",
        remove: "Delete",
        confirmRemove: "Delete this sale? This can't be undone.",
        gone: "This sale was already deleted.",
      }}
      initial={toForm(sale)}
      categories={categories}
      reps={reps}
      submit={(form, extra) =>
        fetch(`/api/admin/sales/${sale.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, ...extra }),
        })
      }
      remove={() => fetch(`/api/admin/sales/${sale.id}`, { method: "DELETE" })}
      onClose={onClose}
      onDone={onSaved}
      notice={({ save, busy }) =>
        sale.flags.length > 0 && (
          <div className={sale.needsReview ? styles.reviewBox : `${styles.reviewBox} ${styles.reviewDone}`}>
            <div className={styles.reviewHead}>
              {sale.needsReview ? <AlertTriangle size={16} strokeWidth={1.75} /> : <Check size={16} strokeWidth={2} />}
              <strong>{sale.needsReview ? "Double-check this sale" : "Reviewed"}</strong>
            </div>
            <ul>
              {sale.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {sale.needsReview ? (
              <button className="btn btn-secondary" type="button" onClick={() => save({ markReviewed: true })} disabled={busy}>
                <Check size={15} strokeWidth={2} />
                Mark as reviewed
              </button>
            ) : (
              sale.reviewedAt && <p>Marked reviewed {new Date(sale.reviewedAt).toLocaleDateString()}.</p>
            )}
          </div>
        )
      }
    />
  );
}
