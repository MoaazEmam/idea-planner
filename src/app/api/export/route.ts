import { asc, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ideas, processingRuns, projects } from "@/db/schema";

/**
 * Full JSON backup. Session-protected by `proxy.ts` like every other /api
 * route. Trashed ideas are included so a restore is a restore, not a partial
 * memory of one. `formatVersion` lets a future importer reject a shape it does
 * not understand.
 */
export async function GET() {
  const db = getDb();

  const [projectRows, ideaRows, runRows] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.name)),
    db.select().from(ideas).orderBy(desc(ideas.createdAt)),
    db.select().from(processingRuns).orderBy(desc(processingRuns.startedAt)),
  ]);

  const payload = {
    app: "idea-inbox",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      projects: projectRows.length,
      ideas: ideaRows.length,
      processingRuns: runRows.length,
    },
    projects: projectRows,
    ideas: ideaRows,
    processingRuns: runRows,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="idea-inbox-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
