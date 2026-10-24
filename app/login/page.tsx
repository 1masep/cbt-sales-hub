import { BRAND } from "../../lib/brand";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the company's own site */}
        <img className={styles.logo} src={BRAND.logo(160)} alt={`${BRAND.name} logo`} width={72} height={72} />
        <h1 className={styles.title}>{BRAND.name}</h1>
        <p className={styles.sub}>Sign in to see your sales.</p>
        <LoginForm next={next ?? "/dashboard"} />
      </div>
    </main>
  );
}
