import { DuplicateInvoiceError } from "../../../../../lib/process-sale";
import { readJson } from "../../../../../lib/read-json";
import { getRepo } from "../../../../../lib/repo";
import { MAX_ID } from "../../../../../lib/sales-repo";
import { isOwner } from "../../../../../lib/session";
import { validateSale } from "../../../../../lib/validate";

type Context = { params: Promise<{ id: string }> };

async function saleId(context: Context): Promise<number | null> {
  const id = Number((await context.params).id);
  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}

export async function PATCH(request: Request, context: Context) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const id = await saleId(context);
  if (!id) return Response.json({ error: "Sale not found" }, { status: 404 });

  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const result = validateSale(body.value);
  if (!result.ok) return Response.json({ error: "Validation failed", fields: result.errors }, { status: 400 });

  try {
    const markReviewed = (body.value as { markReviewed?: unknown }).markReviewed === true;
    const sale = await (await getRepo()).update(id, result.sale, { markReviewed });
    if (!sale) return Response.json({ error: "Sale not found" }, { status: 404 });
    return Response.json({ sale });
  } catch (err) {
    if (err instanceof DuplicateInvoiceError) {
      return Response.json(
        { error: "Validation failed", fields: { invoiceNumber: "Another sale already uses this invoice number" } },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const id = await saleId(context);
  if (!id || !(await (await getRepo()).remove(id))) {
    return Response.json({ error: "Sale not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
