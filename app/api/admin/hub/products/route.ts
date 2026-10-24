import { cleanCode, cleanProductFields } from "../../../../../lib/hub/fields";
import { hubStore } from "../../../../../lib/hub/load";
import { readJson } from "../../../../../lib/read-json";
import { isOwner } from "../../../../../lib/session";

export async function POST(request: Request) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const { code, newCode, fields } = body.value as { code?: unknown; newCode?: unknown; fields?: Record<string, unknown> };
  const current = cleanCode(code);
  if (!current) return Response.json({ error: "Every product needs a Product Code" }, { status: 400 });
  const store = await hubStore();
  const renamed = cleanCode(newCode);
  if (renamed && renamed !== current) {
    if ((await store.products()).some((p) => p.code.toLowerCase() === renamed.toLowerCase())) {
      return Response.json({ error: `Another product already uses the code ${renamed}` }, { status: 409 });
    }
    await store.renameProduct(current, renamed);
  }
  await store.saveProduct(renamed || current, cleanProductFields(fields ?? {}));
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const code = cleanCode(new URL(request.url).searchParams.get("code"));
  if (!code) return Response.json({ error: "Missing code" }, { status: 400 });
  await (await hubStore()).deleteProduct(code);
  return new Response(null, { status: 204 });
}
