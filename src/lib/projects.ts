import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideas, projects, type Idea, type Project } from "@/db/schema";
import { unsortedResetFields } from "@/lib/ideas";
import { isUuid } from "@/lib/ids";
import type { ProjectInput } from "@/lib/validation/projects";

export async function listProjects({
  includeArchived = false,
}: { includeArchived?: boolean } = {}): Promise<Project[]> {
  const db = getDb();
  return db.query.projects.findMany({
    where: includeArchived ? undefined : isNull(projects.archivedAt),
    orderBy: [asc(projects.name)],
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }
  const db = getDb();
  return db.query.projects.findFirst({
    where: eq(projects.id, id),
  });
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const db = getDb();
  const [inserted] = await db
    .insert(projects)
    .values({
      name: input.name,
      oneLiner: input.one_liner,
      context: input.context,
      status: input.status,
    })
    .returning();
  return inserted;
}

export async function updateProject(
  id: string,
  input: ProjectInput,
): Promise<Project | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }

  const db = getDb();
  const [updated] = await db
    .update(projects)
    .set({
      name: input.name,
      oneLiner: input.one_liner,
      context: input.context,
      status: input.status,
      updatedAt: new Date(),
      ...(input.archived === undefined
        ? {}
        : { archivedAt: input.archived ? new Date() : null }),
    })
    .where(eq(projects.id, id))
    .returning();

  return updated;
}

export type DeleteProjectResult = { deleted: boolean; unlinked: number };

/**
 * Deletes a project and unlinks its ideas in one transaction. `project_id` is
 * `onDelete: set null`, which would otherwise leave ideas claiming a feature of
 * a project that no longer exists; instead they are parked as unsorted so they
 * can be re-sorted by hand.
 */
export async function deleteProject(id: string): Promise<DeleteProjectResult> {
  if (!isUuid(id)) {
    return { deleted: false, unlinked: 0 };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const unlinked = await tx
      .update(ideas)
      .set(unsortedResetFields())
      .where(eq(ideas.projectId, id))
      .returning({ id: ideas.id });

    const [deleted] = await tx
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });

    return { deleted: Boolean(deleted), unlinked: unlinked.length };
  });
}

/** Ideas currently linked to a project, newest first. */
export async function listProjectIdeas(
  projectId: string,
  limit = 100,
): Promise<Idea[]> {
  if (!isUuid(projectId)) {
    return [];
  }
  const db = getDb();
  return db.query.ideas.findMany({
    where: and(eq(ideas.projectId, projectId), isNull(ideas.deletedAt)),
    orderBy: [desc(ideas.createdAt)],
    limit,
  });
}

/** Tagged-idea count per project id, for the projects list. */
export async function countsByProject(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ projectId: ideas.projectId, value: count() })
    .from(ideas)
    .where(and(isNull(ideas.deletedAt), isNotNull(ideas.projectId)))
    .groupBy(ideas.projectId);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.projectId) {
      counts.set(row.projectId, row.value);
    }
  }
  return counts;
}
