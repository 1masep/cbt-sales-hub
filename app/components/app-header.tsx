"use client";

import Link from "next/link";
import { BRAND } from "../../lib/brand";
import styles from "./app-header.module.css";

const PAGES = [
  { href: "/dashboard", label: "Sales", id: "sales" },
  { href: "/analysis", label: "Analysis Hub", id: "analysis" },
] as const;

// The header shared by every page: the company, the page links, and
// page-specific status and actions.
export function AppHeader({ current, children }: { current: (typeof PAGES)[number]["id"]; children?: React.ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.brandBlock}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the company's own site */}
        <img className={styles.logo} src={BRAND.logo(96)} alt="" width={36} height={36} />
        <span className={styles.brandName}>{BRAND.name}</span>
      </div>
      <nav className={styles.nav} aria-label="Pages">
        {PAGES.map((p) => (
          <Link key={p.id} href={p.href} className={p.id === current ? styles.navActive : styles.navLink} aria-current={p.id === current ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <div className={styles.actions}>
        {children}
      </div>
    </header>
  );
}
