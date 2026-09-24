import { NextResponse } from "next/server";
import { isUuid } from "@/lib/ids";
import { analyzePersonal } from "@/lib/jobs/process";

/** Personal-lens research plus analysis, like a standalone enrichment. */
export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: RouteContext<"/api/ideas/[id]/personal-analysis">,
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const outcome = await analyzePersonal(id);

  if (!outcome.ok) {
    const status =
      outcome.reason === "not_found"
        ? 404
        : outcome.reason === "disabled"
          ? 503
          : outcome.reason === "unsupported"
            ? 422
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
