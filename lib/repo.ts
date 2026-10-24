import { getDb } from "./db";
import { createDraftsRepo, type DraftsRepo } from "./drafts-repo";
import { createSalesRepo, type SalesRepo } from "./sales-repo";

export async function getRepo(): Promise<SalesRepo> {
  return createSalesRepo(await getDb());
}

export async function getDraftsRepo(): Promise<DraftsRepo> {
  return createDraftsRepo(await getDb());
}
