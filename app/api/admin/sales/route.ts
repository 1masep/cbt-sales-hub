import type { NextRequest } from "next/server";
import { getDraftsRepo, getRepo } from "../../../../lib/repo";
import { parseFilters } from "../../../../lib/sales-repo";
import { isOwner } from "../../../../lib/session";

export async function GET(request: NextRequest) {
  if (!(await isOwner())) return Response.json({ error: "Not logged in" }, { status: 401 });
  const filters = parseFilters(request.nextUrl.searchParams);
  const [repo, drafts] = await Promise.all([getRepo(), getDraftsRepo()]);
  const [{ rows, total }, summary, needsReview, openDrafts] = await Promise.all([
    repo.list(filters),
    repo.summary(filters),
    repo.countNeedsReview(),
    drafts.countOpen(),
  ]);
  return Response.json({ rows, total, page: filters.page, pageSize: filters.pageSize, summary, needsReview, openDrafts });
}
