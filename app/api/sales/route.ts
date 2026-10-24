import { createHash, timingSafeEqual } from "node:crypto";
import { processSale } from "../../../lib/process-sale";
import { readJson } from "../../../lib/read-json";
import { getRepo } from "../../../lib/repo";
import { salesStore } from "../../../lib/sales-repo";

// Compare hashes so the check takes the same time whatever the input length.
function isAuthorized(request: Request): boolean {
  const secret = process.env.SALES_API_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

// Called by the business's website each time an order is completed.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });

  try {
    const result = await processSale(body.value, salesStore(await getRepo()));
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Failed to save sale", err);
    return Response.json({ error: "Could not save the sale. Try again." }, { status: 500 });
  }
}
