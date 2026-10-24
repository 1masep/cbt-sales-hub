import { getDb } from "./db";
import { createDraftsRepo } from "./drafts-repo";
import { createSalesRepo, salesStore } from "./sales-repo";
import { createSyncState } from "./sync-state";
import { createHubStore } from "./hub/store";
import { syncWooStock } from "./hub/woo-stock";
import { createWooFetch, loadCategoryTree, readStatus, syncWooCommerce, wooConfig, type SyncStatus } from "./woocommerce";

// Wires the WooCommerce sync to the real database and settings.
export async function runWooSync(): Promise<SyncStatus> {
  const config = wooConfig();
  if (!config) return { configured: false };
  const db = await getDb();
  const woo = createWooFetch(config);
  const status = await syncWooCommerce({ woo, sales: salesStore(createSalesRepo(db)), drafts: createDraftsRepo(db), state: createSyncState(db) });
  if (!status.lastOk) return status;
  // Stock counts for the Analysis Hub. A failure here doesn't undo the orders.
  try {
    const products = await syncWooStock(woo, createHubStore(db), await loadCategoryTree(woo));
    return { ...status, message: `${status.message}${products ? ` · stock updated for ${products} products` : ""}` };
  } catch (err) {
    console.error("WooCommerce stock sync failed", err);
    return { ...status, message: `${status.message} · stock counts couldn't be updated this time` };
  }
}

export async function wooStatus(): Promise<SyncStatus> {
  return readStatus(createSyncState(await getDb()));
}
