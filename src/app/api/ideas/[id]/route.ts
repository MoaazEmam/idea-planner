import { NextResponse } from "next/server";
import { softDeleteIdea, updateIdeaText } from "@/lib/ideas";
import { updateIdeaSchema } from "@/lib/validation/ideas";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/ideas/[id]">,
) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const idea = await updateIdeaText(id, parsed.data.raw_text);
  if (!idea) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: idea.id });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/ideas/[id]">,
) {
  const { id } = await context.params;
  const deleted = await softDeleteIdea(id);

  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id, deleted: true });
}
