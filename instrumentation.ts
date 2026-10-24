// When the app runs on its own server (your computer, or any host without a
// scheduler), check WooCommerce every 5 minutes. On Vercel, Vercel Cron calls
// /api/cron/woocommerce-sync instead (see vercel.json).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const { wooConfig } = await import("./lib/woocommerce");
  if (!wooConfig()) return;

  const g = globalThis as typeof globalThis & { __wooTimer?: ReturnType<typeof setInterval> };
  if (g.__wooTimer) return; // dev reloads re-run this file
  const { runWooSync } = await import("./lib/woo-runner");
  const check = () =>
    runWooSync()
      .then((s) => console.log(`[WooCommerce] ${s.lastOk ? "✓" : "✗"} ${s.message ?? ""}`))
      .catch((err) => console.error("[WooCommerce] check failed", err));
  setTimeout(check, 10_000);
  g.__wooTimer = setInterval(check, 5 * 60 * 1000);
}
