"use client";

import { RefreshCw, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SyncStatus } from "../../lib/woocommerce";
import styles from "./dashboard.module.css";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleString();
}

export type WooState = { status: SyncStatus | null; checking: boolean; checkNow: () => void };

// Whether the website's orders are flowing in, refreshed every minute.
export function useWooStatus(onSynced: () => void): WooState {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/woocommerce")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/admin/woocommerce", { method: "POST" });
      if (res.ok) setStatus(await res.json());
      onSynced();
    } finally {
      setChecking(false);
    }
  }, [onSynced]);

  return { status, checking, checkNow };
}

export const wooHasProblem = (s: SyncStatus | null) => !!s && (!s.configured || s.lastOk === false);

// Quiet indicator in the header while everything is working.
export function WooIndicator({ status, checking, checkNow }: WooState) {
  if (!status?.configured || status.lastOk === false) return null;
  return (
    <div className={styles.wooIndicator}>
      <span className={styles.liveDot} aria-hidden />
      <span>
        Website orders{" "}
        <span className={styles.wooWhen}>{status.lastRunAt ? `checked ${ago(status.lastRunAt)}` : "first check starting"}</span>
      </span>
      <button className="icon-btn" type="button" onClick={checkNow} disabled={checking} aria-label="Check website orders now" title="Check now">
        <RefreshCw size={16} strokeWidth={1.75} className={checking ? styles.spin : undefined} />
      </button>
    </div>
  );
}

// A row in the "needs your attention" list when the connection isn't working.
export function WooAttention({ status, checking, checkNow }: WooState) {
  if (!wooHasProblem(status)) return null;
  if (!status!.configured) {
    return (
      <li className={styles.attentionItem}>
        <Store size={18} strokeWidth={1.75} className={styles.attentionIconQuiet} aria-hidden />
        <span>
          <strong>Website orders aren&apos;t connected yet.</strong> Add the WooCommerce read-only key to the settings to bring
          them in automatically.
        </span>
      </li>
    );
  }
  return (
    <li className={styles.attentionItem}>
      <Store size={18} strokeWidth={1.75} className={styles.attentionIconDanger} aria-hidden />
      <span>
        <strong>Website orders couldn&apos;t be checked.</strong> {status!.message}
      </span>
      <button className="btn btn-secondary" type="button" onClick={checkNow} disabled={checking}>
        <RefreshCw size={15} strokeWidth={1.75} className={checking ? styles.spin : undefined} />
        {checking ? "Checking…" : "Try again"}
      </button>
    </li>
  );
}
