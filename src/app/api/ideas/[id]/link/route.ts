import { NextResponse } from "next/server";
import { isUuid } from "@/lib/ids";
import {
  routeIdeaManually,
  setIdeaUnsorted,
  type ManualRouteOutcome,
} from "@/lib/jobs/process";
import { getProject } from "@/lib/projects";
import { routeIdeaSchema } from "@/lib/validation/ideas";

/** Routing plus analysis for one idea can take ~40s. */
export const maxDuration = 60;

function respond(id: string, outcome: ManualRouteOutcome) {
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

export async function POST(
  request: Request,
  context: RouteContext<"/api/ideas/[id]/link">,
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = routeIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.link_type === "unsorted") {
    return respond(id, await setIdeaUnsorted(id));
  }

  if (parsed.data.link_type === "standalone") {
    return respond(
      id,
      await routeIdeaManually(id, {
        status: "standalone",
        projectId: null,
        linkType: "standalone",
        confidence: 1,
        reasoning: "Set manually.",
      }),
    );
  }

  const project = await getProject(parsed.data.project_id);
  if (!project) {
    return NextResponse.json({ error: "unknown_project" }, { status: 400 });
  }

  return respond(
    id,
    await routeIdeaManually(id, {
      status: "linked",
      projectId: project.id,
      linkType: parsed.data.link_type,
      confidence: 1,
      reasoning: "Set manually.",
    }),
  );
}
