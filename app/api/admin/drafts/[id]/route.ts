import { processSale } from "../../../../../lib/process-sale";
import { readJson } from "../../../../../lib/read-json";
import { getDraftsRepo, getRepo } from "../../../../../lib/repo";
import { MAX_ID, salesStore } from "../../../../../lib/sales-repo";
import { isOwner } from "../../../../../lib/session";

type Context = { params: Promise<{ id: string }> };

async function draftId(context: Context): Promise<number | null> {
  const id = Number((await context.params).id);
  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}

// Save a draft into the sheet, with whatever corrections the owner made.
export async function POST(request: Request, context: Context) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const id = await draftId(context);
  const drafts = await getDraftsRepo();
  if (!id || !(await drafts.get(id))) return Response.json({ error: "Draft not found" }, { status: 404 });

  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });

  const result = await processSale(body.value, salesStore(await getRepo()), "ai-import-reviewed");
  if (result.status === 201 || result.status === 200) {
    await drafts.resolve(id, "saved");
    return Response.json(result.body, { status: result.status });
  }
  if (result.status === 409) {
    return Response.json(
      { error: "Validation failed", fields: { invoiceNumber: "Another sale already uses this invoice number" } },
      { status: 409 },
    );
  }
  return Response.json(result.body, { status: result.status });
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const id = await draftId(context);
  if (!id || !(await (await getDraftsRepo()).resolve(id, "discarded"))) {
    return Response.json({ error: "Draft not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
