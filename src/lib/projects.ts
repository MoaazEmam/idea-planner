import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projects, type Project } from "@/db/schema";
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
