import type { Db } from "./db";

// A sale the AI read but wasn't sure enough to save. payload holds the fields
// it extracted (any may be missing); reasons say why it was held back.
export type Draft = {
  id: number;
  sourceKind: string;
  sourceLabel: string;
  sourceExcerpt: string;
  payload: Record<string, unknown>;
  reasons: string[];
  createdAt: string;
};

type Row = {
  id: number;
  source_kind: string;
  source_label: string;
  source_excerpt: string;
  payload: Record<string, unknown> | string;
  reasons: string[] | null;
  created_at: Date | string;
};

function toDraft(row: Row): Draft {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceLabel: row.source_label,
    sourceExcerpt: row.source_excerpt,
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    reasons: row.reasons ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createDraftsRepo(db: Db) {
  return {
    // With a dedupeKey, the same draft is only ever created once (even after it's
    // been saved or discarded); returns null when it already exists.
    async insert(draft: Omit<Draft, "id" | "createdAt">, dedupeKey?: string): Promise<Draft | null> {
      const [row] = await db.query<Row>(
        `insert into drafts (source_kind, source_label, source_excerpt, payload, reasons, dedupe_key)
         values ($1, $2, $3, $4::jsonb, $5, $6)
         on conflict (dedupe_key) do nothing
         returning *`,
        [draft.sourceKind, draft.sourceLabel, draft.sourceExcerpt, JSON.stringify(draft.payload), draft.reasons, dedupeKey ?? null],
      );
      return row ? toDraft(row) : null;
    },

    async listOpen(): Promise<Draft[]> {
      return (await db.query<Row>("select * from drafts where status = 'open' order by created_at desc, id desc")).map(toDraft);
    },

    async countOpen(): Promise<number> {
      const [row] = await db.query<{ count: string | number }>("select count(*) as count from drafts where status = 'open'");
      return Number(row.count);
    },

    async get(id: number): Promise<Draft | null> {
      const [row] = await db.query<Row>("select * from drafts where id = $1 and status = 'open'", [id]);
      return row ? toDraft(row) : null;
    },

    // status: "saved" once it's in the sheet, "discarded" if the owner throws it away.
    async resolve(id: number, status: "saved" | "discarded"): Promise<boolean> {
      const rows = await db.query("update drafts set status = $2, resolved_at = now() where id = $1 and status = 'open' returning id", [
        id,
        status,
      ]);
      return rows.length > 0;
    },
  };
}

export type DraftsRepo = ReturnType<typeof createDraftsRepo>;
