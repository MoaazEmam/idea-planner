import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideas, projects, type Idea } from "@/db/schema";
import { isUuid } from "@/lib/ids";

/**
 * Fields that park an idea as unsorted with no analysis. Shared by manual
 * de-sorting and by project deletion, so both leave the same clean state.
 */
export function unsortedResetFields() {
  const now = new Date();
  return {
    analysisStatus: "routed",
    analysisAttempts: 0,
    analysis: null,
    analysisRaw: null,
    analysisError: null,
    linkType: null,
    linkSource: "manual" as const,
    linkConfidence: null,
    projectId: null,
    routedAt: now,
    processedAt: null,
    lockExpiresAt: null,
    updatedAt: now,
  };
}

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

export type IdeaListItem = Idea & { projectName: string | null };

/** Inbox feed. Joins the project name so the list can show where each idea went. */
export async function listIdeas(limit = 100): Promise<IdeaListItem[]> {
  const db = getDb();
  const rows = await db
    .select({ idea: ideas, projectName: projects.name })
    .from(ideas)
    .leftJoin(projects, eq(ideas.projectId, projects.id))
    .where(isNull(ideas.deletedAt))
    .orderBy(desc(ideas.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row.idea, projectName: row.projectName }));
}

export async function getIdea(id: string): Promise<Idea | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }
  const db = getDb();
  return db.query.ideas.findFirst({
    where: and(eq(ideas.id, id), isNull(ideas.deletedAt)),
  });
}

export async function updateIdeaText(
  id: string,
  rawText: string,
): Promise<Idea | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }
  const db = getDb();
  const [updated] = await db
    .update(ideas)
    .set({ rawText, updatedAt: new Date() })
    .where(and(eq(ideas.id, id), isNull(ideas.deletedAt)))
    .returning();
  return updated;
}

export async function softDeleteIdea(id: string): Promise<boolean> {
  if (!isUuid(id)) {
    return false;
  }
  const db = getDb();
  const [deleted] = await db
    .update(ideas)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(ideas.id, id), isNull(ideas.deletedAt)))
    .returning({ id: ideas.id });
  return Boolean(deleted);
}

export async function restoreIdea(id: string): Promise<boolean> {
  if (!isUuid(id)) {
    return false;
  }
  const db = getDb();
  const [restored] = await db
    .update(ideas)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(ideas.id, id), isNotNull(ideas.deletedAt)))
    .returning({ id: ideas.id });
  return Boolean(restored);
}

export async function listDeletedIdeas(limit = 100): Promise<Idea[]> {
  const db = getDb();
  return db.query.ideas.findMany({
    where: isNotNull(ideas.deletedAt),
    orderBy: [desc(ideas.deletedAt)],
    limit,
  });
}

export async function countDeletedIdeas(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(ideas)
    .where(isNotNull(ideas.deletedAt));
  return row?.value ?? 0;
}
