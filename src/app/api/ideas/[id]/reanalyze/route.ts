import { NextResponse } from "next/server";
import { isUuid } from "@/lib/ids";
import { reanalyzeIdea } from "@/lib/jobs/process";

/** Routing plus enrichment for one idea can take ~40s. */
export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: RouteContext<"/api/ideas/[id]/reanalyze">,
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const outcome = await reanalyzeIdea(id);

  if (!outcome.ok) {
    const status =
      outcome.reason === "not_found"
        ? 404
        : outcome.reason === "disabled"
          ? 503
          : 409;
    return NextResponse.json(
      { error: outcome.reason, message: outcome.message },
      { status },
    );
  }

  return NextResponse.json({
    id,
    status: outcome.status,
    error: outcome.error ?? null,
  });
}
