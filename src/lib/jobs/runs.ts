import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { processingRuns, type ProcessingRun } from "@/db/schema";
import { sendAlert } from "@/lib/alerts";

export async function ensureRun(runId: string, trigger: string): Promise<void> {
  const db = getDb();
  await db
    .insert(processingRuns)
    .values({ id: runId, trigger })
    .onConflictDoNothing();
}

export async function recordRunProgress(
  runId: string,
  delta: {
    claimed?: number;
    processed?: number;
    failed?: number;
    searches?: number;
    inputTokens?: number;
    outputTokens?: number;
  },
): Promise<void> {
  const db = getDb();
  await db
    .update(processingRuns)
    .set({
      claimed: sql`${processingRuns.claimed} + ${delta.claimed ?? 0}`,
      processed: sql`${processingRuns.processed} + ${delta.processed ?? 0}`,
      failed: sql`${processingRuns.failed} + ${delta.failed ?? 0}`,
      searches: sql`${processingRuns.searches} + ${delta.searches ?? 0}`,
      inputTokens: sql`${processingRuns.inputTokens} + ${delta.inputTokens ?? 0}`,
      outputTokens: sql`${processingRuns.outputTokens} + ${delta.outputTokens ?? 0}`,
    })
    .where(eq(processingRuns.id, runId));
}

/** One alert per run, on the first close, so a second `finish` is silent. */
async function alertOnRun(run: ProcessingRun): Promise<void> {
  if (run.status === "failed") {
    await sendAlert(
      `Idea Inbox: enrichment run ${run.id} failed — ${
        run.error ?? "no error recorded"
      }`,
    );
    return;
  }

  if (run.failed > 0) {
    await sendAlert(
      `Idea Inbox: enrichment run ${run.id} finished with ${run.failed} failed and ${run.processed} processed.`,
    );
  }
}

export async function finishRun(
  runId: string,
  status: string,
  error?: string,
): Promise<void> {
  const db = getDb();
  const previous = await db.query.processingRuns.findFirst({
    where: eq(processingRuns.id, runId),
  });

  const [run] = await db
    .update(processingRuns)
    .set({ status, error: error ?? null, finishedAt: new Date() })
    .where(eq(processingRuns.id, runId))
    .returning();

  if (run && !previous?.finishedAt) {
    await alertOnRun(run);
  }
}

export async function getRun(runId: string): Promise<ProcessingRun | undefined> {
  const db = getDb();
  return db.query.processingRuns.findFirst({
    where: eq(processingRuns.id, runId),
  });
}

export async function getLatestRun(): Promise<ProcessingRun | undefined> {
  const db = getDb();
  return db.query.processingRuns.findFirst({
    orderBy: (runs, { desc }) => [desc(runs.startedAt)],
  });
}

export async function listRuns(limit = 20): Promise<ProcessingRun[]> {
  const db = getDb();
  return db.query.processingRuns.findMany({
    orderBy: (runs, { desc }) => [desc(runs.startedAt)],
    limit,
  });
}
