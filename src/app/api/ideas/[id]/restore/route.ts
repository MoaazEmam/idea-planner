import { NextResponse } from "next/server";
import { restoreIdea } from "@/lib/ideas";
import { isUuid } from "@/lib/ids";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/ideas/[id]/restore">,
) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const restored = await restoreIdea(id);
  if (!restored) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id, restored: true });
}
