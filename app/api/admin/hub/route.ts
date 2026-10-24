import { readJson } from "../../../../lib/read-json";
import { hubStore, loadHub } from "../../../../lib/hub/load";
import { isOwner } from "../../../../lib/session";

export async function GET() {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  return Response.json(await loadHub());
}

// Switch between the sales records and the sample customers, or undo uploads/edits.
export async function POST(request: Request) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const body = await readJson(request);
  const action = body.ok ? (body.value as { action?: string }).action : undefined;
  const store = await hubStore();
  if (action === "sample") await store.setSource("sample", true);
  else if (action === "records") await store.setSource("records");
  else if (action === "clear-changes") await store.clearCustomerChanges();
  else return Response.json({ error: "Unknown action" }, { status: 400 });
  return Response.json(await loadHub());
}
