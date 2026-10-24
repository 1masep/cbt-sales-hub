import type { Db } from "./db";

export function createSyncState(db: Db) {
  return {
    async get<T>(key: string): Promise<T | null> {
      const [row] = await db.query<{ value: T | string }>("select value from sync_state where key = $1", [key]);
      if (!row) return null;
      return (typeof row.value === "string" ? JSON.parse(row.value) : row.value) as T;
    },
    async set(key: string, value: unknown): Promise<void> {
      await db.query(
        `insert into sync_state (key, value, updated_at) values ($1, $2::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    },
  };
}

export type SyncState = ReturnType<typeof createSyncState>;
