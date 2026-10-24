import { cleanCustomerFields } from "../../../../../lib/hub/fields";
import { hubStore } from "../../../../../lib/hub/load";
import { readJson } from "../../../../../lib/read-json";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const { key, fields } = body.value as { key?: unknown; fields?: Record<string, unknown> };
  const clean = cleanCustomerFields(fields ?? {});
  const saved = await (await hubStore()).saveCustomer(typeof key === "string" && key ? key.slice(0, 300) : null, clean);
  return Response.json({ key: saved, fields: clean });
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  await (await hubStore()).deleteCustomer(key.slice(0, 300));
  return new Response(null, { status: 204 });
}
