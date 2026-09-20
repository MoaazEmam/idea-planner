import { count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideas, type Idea } from "@/db/schema";
import { listProjects } from "@/lib/projects";
import { routeIdea } from "@/lib/routing/route-idea";
import { ensureRun, finishRun, recordRunProgress } from "./runs";

const LOCK_MINUTES = 10;
const MAX_ATTEMPTS = 3;

export type ProcessOutcome =
  | { skipped: true; reason: string; remaining: number }
  | {
      skipped: false;
      processed: boolean;
      remaining: number;
      ideaId?: string;
      status?: string;
      error?: string;
    };

export function processingEnabled(): boolean {
  return process.env.PROCESSING_ENABLED !== "false";
}

/** Mirrors the claim predicate so "remaining" and "claimable" never diverge. */
function claimableCondition() {
  return sql`${ideas.deletedAt} IS NULL
    AND ${ideas.analysisAttempts} < ${MAX_ATTEMPTS}
    AND ${ideas.analysisStatus} IN ('new', 'failed')
    AND (${ideas.lockExpiresAt} IS NULL OR ${ideas.lockExpiresAt} < now())`;
}

async function countClaimable(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(ideas)
    .where(claimableCondition());
  return row?.value ?? 0;
}

/**
 * Atomic claim: picks the oldest claimable idea and locks it. `SKIP LOCKED`
 * means a concurrent invocation can never claim the same row, which is what
 * stops a re-run from double-charging the model.
 */
async function claimNextIdea(): Promise<Idea | undefined> {
  const db = getDb();
  const claimed = await db.execute(sql`
    UPDATE ideas
    SET analysis_status = 'processing',
        lock_expires_at = now() + (${LOCK_MINUTES} * interval '1 minute'),
        updated_at = now()
    WHERE id = (
      SELECT id FROM ideas
      WHERE ${claimableCondition()}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  const rows = claimed as unknown as { id: string }[];
  const id = rows[0]?.id;
  if (!id) {
    return undefined;
  }

  return db.query.ideas.findFirst({ where: eq(ideas.id, id) });
}

async function markFailed(
  ideaId: string,
  error: string,
  raw?: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(ideas)
    .set({
      analysisStatus: "failed",
      analysisAttempts: sql`${ideas.analysisAttempts} + 1`,
      analysisError: error.slice(0, 2000),
      analysisRaw: raw ?? null,
      lockExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(ideas.id, ideaId));
}

export async function processNextIdea(
  runId: string,
  trigger: string,
): Promise<ProcessOutcome> {
  if (!processingEnabled()) {
    return { skipped: true, reason: "processing disabled", remaining: 0 };
  }

  await ensureRun(runId, trigger);

  const idea = await claimNextIdea();
  if (!idea) {
    const remaining = await countClaimable();
    if (remaining === 0) {
      await finishRun(runId, "completed");
    }
    return { skipped: false, processed: false, remaining };
  }

  await recordRunProgress(runId, { claimed: 1 });

  try {
    const projects = await listProjects();
    const routing = await routeIdea(idea.rawText, projects);

    await recordRunProgress(runId, {
      inputTokens: routing.usage.promptTokens,
      outputTokens: routing.usage.completionTokens,
    });

    if (routing.error) {
      await markFailed(idea.id, routing.error, routing.raw);
      await recordRunProgress(runId, { failed: 1 });
      const remaining = await countClaimable();
      if (remaining === 0) {
        await finishRun(runId, "completed");
      }
      return {
        skipped: false,
        processed: true,
        remaining,
        ideaId: idea.id,
        status: "failed",
        error: routing.error,
      };
    }

    const db = getDb();
    await db
      .update(ideas)
      .set({
        analysisStatus: "routed",
        analysisAttempts: sql`${ideas.analysisAttempts} + 1`,
        linkType: routing.decision.linkType,
        linkSource: "auto",
        linkConfidence: routing.decision.confidence,
        projectId: routing.decision.projectId,
        analysisRaw: routing.raw,
        analysisError: null,
        routedAt: new Date(),
        lockExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(ideas.id, idea.id));

    await recordRunProgress(runId, { processed: 1 });

    const remaining = await countClaimable();
    if (remaining === 0) {
      await finishRun(runId, "completed");
    }

    return {
      skipped: false,
      processed: true,
      remaining,
      ideaId: idea.id,
      status: routing.decision.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing failed";
    await markFailed(idea.id, message);
    await recordRunProgress(runId, { failed: 1 });
    const remaining = await countClaimable();
    if (remaining === 0) {
      await finishRun(runId, "completed");
    }
    return {
      skipped: false,
      processed: true,
      remaining,
      ideaId: idea.id,
      status: "failed",
      error: message,
    };
  }
}
