"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { BRAND } from "../../lib/brand";
import { logout } from "../login/actions";
import styles from "./app-header.module.css";

const PAGES = [
  { href: "/dashboard", label: "Sales", id: "sales" },
  { href: "/analysis", label: "Analysis Hub", id: "analysis" },
] as const;

// The header shared by every signed-in page: the company, the page links,
// page-specific status and actions, and Log out.
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
        <form action={logout}>
          <button className="icon-btn" type="submit" aria-label="Log out" title="Log out">
            <LogOut size={18} strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </header>
  );
}
