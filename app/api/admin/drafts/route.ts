import { getDraftsRepo } from "../../../../lib/repo";

export async function GET() {
  return Response.json({ drafts: await (await getDraftsRepo()).listOpen() });
}
