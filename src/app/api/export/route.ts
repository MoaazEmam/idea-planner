import { asc, desc } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { ideas, processingRuns, projects } from "@/db/schema";

/**
 * Full JSON dump of every table, so the data is never trapped in one Vercel
 * project or one Supabase instance. It is deliberately plain and has no
 * memory of one. `formatVersion` lets a future importer reject a shape it does
 * not understand.
 *
 * `connection()` keeps the dump out of prerendering: nothing here reads a
 * request-time API, so without it Next would run these queries at build time.
 * It replaces `export const dynamic = "force-dynamic"`, which the Next 16 docs
 * deprecate in favour of tying dynamic rendering to the incoming request.
 *
 * The queries run sequentially rather than through `Promise.all`. Three
 * concurrent statements is well within the pool, but the export is not
 * latency-sensitive and this keeps one request to one connection.
 */
export const maxDuration = 30;

export async function GET() {
  await connection();

  const db = getDb();

  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.name));
  const ideaRows = await db.select().from(ideas).orderBy(desc(ideas.createdAt));
  const runRows = await db
    .select()
    .from(processingRuns)
    .orderBy(desc(processingRuns.startedAt));

  const payload = {
    app: "idea-inbox",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      projects: projectRows.length,
      ideas: ideaRows.length,
      runs: runRows.length,
    },
    projects: projectRows,
    ideas: ideaRows,
    runs: runRows,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="idea-inbox-${stamp}.json"`,
    },
  });
}
