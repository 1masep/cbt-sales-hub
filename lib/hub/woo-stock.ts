// Brings the website's stock counts into the Analysis Hub inventory. Only
// products whose stock WooCommerce tracks ("Manage stock") are included; the
// owner's ordering time, backup stock and typed daily usage are kept.
import { categorize, type WooCategory, type WooFetch } from "../woocommerce";
import type { HubStore } from "./store";

type WooStockProduct = {
  id: number;
  sku: string;
  name: string;
  price: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  categories: { id: number; name: string }[];
  meta_data?: { key: string; value: unknown }[];
};

// Unit cost, when a cost-of-goods plugin stores it on the product.
const COST_KEYS = ["_wc_cog_cost", "_alg_wc_cog_cost", "_purchase_price", "_cost_price"];

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#8243;/g, "″").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim();

export async function syncWooStock(woo: WooFetch, hub: HubStore, tree: Map<number, WooCategory>): Promise<number> {
  const existing = new Map((await hub.products()).map((p) => [p.code.toLowerCase(), p]));
  let updated = 0;
  for (let page = 1; page <= 20; page++) {
    const { body, totalPages } = await woo("products", { per_page: "100", page: String(page), status: "publish" });
    for (const p of body as WooStockProduct[]) {
      if (!p.manage_stock || p.stock_quantity === null) continue;
      const code = p.sku?.trim() || `WC-${p.id}`;
      const cat = categorize({ id: p.id, categories: p.categories }, tree);
      const cost = (p.meta_data ?? []).find((m) => COST_KEYS.includes(m.key) && Number(m.value) > 0)?.value;
      const before = existing.get(code.toLowerCase());
      await hub.saveProduct(
        code,
        {
          name: decode(p.name),
          category: "category" in cat ? cat.category : (before?.category ?? ""),
          sellingPrice: Number(p.price) || 0,
          unitsInStock: Math.max(0, Math.round(p.stock_quantity)),
          ...(cost !== undefined ? { unitCost: Number(cost) } : {}),
          ...(before ? {} : { orderingDays: 14, backupStock: 0, dailyUsage: Number.NaN }),
        },
        "woocommerce",
      );
      updated++;
    }
    if (page >= totalPages) break;
  }
  if (updated > 0) await hub.removeSampleProducts();
  return updated;
}
