import type { NextRequest } from "next/server";
import { buildHubWorkbook } from "../../../../../lib/hub/excel";
import { loadHub } from "../../../../../lib/hub/load";
import { viewCustomers, viewProducts } from "../../../../../lib/hub/metrics";
import { project } from "../../../../../lib/hub/projection";
import { isOwner } from "../../../../../lib/session";

// The 6-tab report, built from the hub's current settings (alarm trigger and projection controls).
export async function GET(request: NextRequest) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const p = request.nextUrl.searchParams;
  const num = (k: string, d: number, lo: number, hi: number) => {
    const n = Number(p.get(k));
    return Number.isFinite(n) && p.get(k) !== null ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const triggerPct = num("trigger", -15, -100, -1);
  const monthsAhead = Math.round(num("months", 12, 6, 24));
  const today = new Date();
  const hub = await loadHub(today);
  const projection = project(hub.monthly, { monthsAhead, trend: p.get("trend") === "curved" ? "curved" : "straight", seasonal: p.get("seasonal") !== "0" });
  const file = await buildHubWorkbook({
    customers: viewCustomers(hub.customers, today),
    products: viewProducts(hub.products, today),
    projection,
    triggerPct,
    monthsAhead,
    sourceNote: hub.source === "sample" ? "Sample customer data" : "From your sales records, uploads and edits",
    today,
  });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CBT Data Analysis Hub - ${today.toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
