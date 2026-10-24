import { runWooSync, wooStatus } from "../../../../lib/woo-runner";

export const maxDuration = 300;

export async function GET() {
  return Response.json(await wooStatus());
}

// "Check now" from the dashboard.
export async function POST() {
  return Response.json(await runWooSync());
}
