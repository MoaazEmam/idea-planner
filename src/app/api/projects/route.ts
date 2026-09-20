import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects";
import { projectInputSchema } from "@/lib/validation/projects";

export async function GET(request: Request) {
  const includeArchived =
    new URL(request.url).searchParams.get("archived") === "1";
  const projects = await listProjects({ includeArchived });
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
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

  const project = await createProject(parsed.data);
  return NextResponse.json({ id: project.id }, { status: 201 });
}
