import { getDraftsRepo } from "../../../../lib/repo";
import { isOwner } from "../../../../lib/session";

export async function GET() {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  return Response.json({ drafts: await (await getDraftsRepo()).listOpen() });
}
