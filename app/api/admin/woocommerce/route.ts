import { isOwner } from "../../../../lib/session";
import { runWooSync, wooStatus } from "../../../../lib/woo-runner";

export const maxDuration = 300;

export async function GET() {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  return Response.json(await wooStatus());
}

// "Check now" from the dashboard.
export async function POST() {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  return Response.json(await runWooSync());
}
