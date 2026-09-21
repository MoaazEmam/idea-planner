import { NextResponse } from "next/server";
import { deleteAddition } from "@/lib/additions";
import { isUuid } from "@/lib/ids";

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/ideas/[id]/additions/[additionId]">,
) {
  const { id, additionId } = await context.params;
  if (!isUuid(id) || !isUuid(additionId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const deleted = await deleteAddition(id, additionId);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: additionId, deleted: true });
}
