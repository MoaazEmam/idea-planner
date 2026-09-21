import { NextResponse } from "next/server";
import { addAddition } from "@/lib/additions";
import { getIdea } from "@/lib/ideas";
import { isUuid } from "@/lib/ids";
import { additionSchema } from "@/lib/validation/ideas";

/** Append a clarification to an idea. Additions are never edited, only removed. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/ideas/[id]/additions">,
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

  const parsed = additionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const idea = await getIdea(id);
  if (!idea) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const addition = await addAddition(id, parsed.data.text);
  if (!addition) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: addition.id });
}
