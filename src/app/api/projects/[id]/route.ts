import { NextResponse } from "next/server";
import { updateProject } from "@/lib/projects";
import { projectInputSchema } from "@/lib/validation/projects";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;

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

  const project = await updateProject(id, parsed.data);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: project.id });
}
