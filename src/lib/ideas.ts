import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideas, type Idea } from "@/db/schema";
import { isUuid } from "@/lib/ids";

export type CreateIdeaResult = {
  idea: Idea;
  created: boolean;
};

/**
 * Idempotent insert. When a capture key is supplied and already exists, the
 * original row is returned with `created: false` so a retried Apple Shortcut
 * never produces a duplicate.
 */
export async function createIdea(
  rawText: string,
  captureKey: string | null,
): Promise<CreateIdeaResult> {
  const db = getDb();

  if (!captureKey) {
    const [inserted] = await db
      .insert(ideas)
      .values({ rawText })
      .returning();
    return { idea: inserted, created: true };
  }

  const [inserted] = await db
    .insert(ideas)
    .values({ rawText, captureKey })
    .onConflictDoNothing({ target: ideas.captureKey })
    .returning();

  if (inserted) {
    return { idea: inserted, created: true };
  }

  const existing = await db.query.ideas.findFirst({
    where: eq(ideas.captureKey, captureKey),
  });

  if (!existing) {
    throw new Error("Idea conflict could not be resolved");
  }

  return { idea: existing, created: false };
}

export async function listIdeas(limit = 100): Promise<Idea[]> {
  const db = getDb();
  return db.query.ideas.findMany({
    orderBy: [desc(ideas.createdAt)],
    limit,
  });
}

export async function getIdea(id: string): Promise<Idea | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }
  const db = getDb();
  return db.query.ideas.findFirst({
    where: eq(ideas.id, id),
  });
}
