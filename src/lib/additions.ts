import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideaAdditions, type IdeaAddition } from "@/db/schema";
import { isUuid } from "@/lib/ids";

/** Additions in capture order — the same order the analyser sees them. */
export async function listAdditions(ideaId: string): Promise<IdeaAddition[]> {
  if (!isUuid(ideaId)) {
    return [];
  }
  const db = getDb();
  return db.query.ideaAdditions.findMany({
    where: eq(ideaAdditions.ideaId, ideaId),
    orderBy: [asc(ideaAdditions.createdAt)],
  });
}

export async function listAdditionTexts(ideaId: string): Promise<string[]> {
  const additions = await listAdditions(ideaId);
  return additions.map((addition) => addition.text);
}

export async function addAddition(
  ideaId: string,
  text: string,
): Promise<IdeaAddition | undefined> {
  if (!isUuid(ideaId)) {
    return undefined;
  }
  const db = getDb();
  const [inserted] = await db
    .insert(ideaAdditions)
    .values({ ideaId, text })
    .returning();
  return inserted;
}

export async function deleteAddition(
  ideaId: string,
  additionId: string,
): Promise<boolean> {
  if (!isUuid(ideaId) || !isUuid(additionId)) {
    return false;
  }
  const db = getDb();
  const [deleted] = await db
    .delete(ideaAdditions)
    .where(
      and(eq(ideaAdditions.id, additionId), eq(ideaAdditions.ideaId, ideaId)),
    )
    .returning({ id: ideaAdditions.id });
  return Boolean(deleted);
}
