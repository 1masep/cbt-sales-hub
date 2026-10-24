import type { NextRequest } from "next/server";
import { buildSalesWorkbook } from "../../../../lib/export";
import { getRepo } from "../../../../lib/repo";
import { parseFilters, type Filters } from "../../../../lib/sales-repo";

function describe(filters: Filters): string {
  const parts = [
    filters.from || filters.to ? `Dates: ${filters.from ?? "start"} to ${filters.to ?? "today"}` : "",
    filters.category ? `Category: ${filters.category}` : "",
    filters.rep ? `Sales rep: ${filters.rep}` : "",
    filters.q ? `Search: "${filters.q}"` : "",
  ].filter(Boolean);
  return parts.length ? `Filtered: ${parts.join(" · ")}` : "All sales";
}

export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const repo = await getRepo();
  const [rows, summary] = await Promise.all([repo.all(filters), repo.summary(filters)]);
  const file = await buildSalesWorkbook(rows, summary, describe(filters));
  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sales-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
