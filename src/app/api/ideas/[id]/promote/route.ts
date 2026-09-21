import { NextResponse } from "next/server";
import { isUuid } from "@/lib/ids";
import { createProjectFromIdea } from "@/lib/projects";
import { projectInputSchema } from "@/lib/validation/projects";

/**
 * Promote an idea into a project. The client sends the (editable) defaults the
 * idea page built from the analysis; this endpoint only validates and persists
 * them, so the two stay decoupled.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/ideas/[id]/promote">,
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

  const parsed = projectInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createProjectFromIdea(id, parsed.data);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({
    projectId: result.project.id,
    ideaId: result.idea.id,
  });
}
