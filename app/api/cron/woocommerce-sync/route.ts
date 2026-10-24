import { timingSafeEqual } from "node:crypto";
import { runWooSync } from "../../../../lib/woo-runner";

export const maxDuration = 300;

// Called every 5 minutes by Vercel Cron, which sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await runWooSync();
  return Response.json(status, { status: status.configured && status.lastOk === false ? 502 : 200 });
}
