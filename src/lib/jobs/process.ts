import { count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideas, type Idea } from "@/db/schema";
import { enrichLinked } from "@/lib/analysis/analyze-linked";
import { enrichStandalone } from "@/lib/analysis/analyze-standalone";
import type { StoredAnalysis } from "@/lib/analysis/schema";
import { getProject, listProjects } from "@/lib/projects";
import { routeIdea, type RouteIdeaResult } from "@/lib/routing/route-idea";
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

/**
 * Mirrors the claim predicate so "remaining" and "claimable" never diverge.
 * A routed idea that is linked to a project still needs its analysis, so it
 * stays claimable until it reaches "enriched". Unsorted stays parked.
 */
function claimableCondition() {
  return sql`${ideas.deletedAt} IS NULL
    AND ${ideas.analysisAttempts} < ${MAX_ATTEMPTS}
    AND (${ideas.lockExpiresAt} IS NULL OR ${ideas.lockExpiresAt} < now())
    AND (
      ${ideas.analysisStatus} IN ('new', 'failed')
      OR (${ideas.analysisStatus} = 'routed' AND ${ideas.projectId} IS NOT NULL)
    )`;
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

/** Closes the run once the queue drains, and reports what is left. */
async function finalize(runId: string): Promise<number> {
  const remaining = await countClaimable();
  if (remaining === 0) {
    await finishRun(runId, "completed");
  }
  return remaining;
}

function routingFields(routing: RouteIdeaResult) {
  return {
    linkType: routing.decision.linkType,
    linkSource: "auto" as const,
    linkConfidence: routing.decision.confidence,
    projectId: routing.decision.projectId,
  };
}

/** Routing succeeded, but the idea is not a candidate for deep research. */
async function markRouted(
  ideaId: string,
  routing: RouteIdeaResult,
): Promise<void> {
  const db = getDb();
  await db
    .update(ideas)
    .set({
      analysisStatus: "routed",
      analysisAttempts: sql`${ideas.analysisAttempts} + 1`,
      analysisRaw: routing.raw,
      analysisError: null,
      routedAt: new Date(),
      lockExpiresAt: null,
      updatedAt: new Date(),
      ...routingFields(routing),
    })
    .where(eq(ideas.id, ideaId));
}

/** Routing plus a completed research analysis. */
async function markEnriched(
  ideaId: string,
  routing: RouteIdeaResult,
  analysis: StoredAnalysis,
  raw: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(ideas)
    .set({
      analysisStatus: "enriched",
      analysisAttempts: sql`${ideas.analysisAttempts} + 1`,
      analysis,
      analysisRaw: raw,
      analysisError: null,
      routedAt: now,
      processedAt: now,
      lockExpiresAt: null,
      updatedAt: now,
      ...routingFields(routing),
    })
    .where(eq(ideas.id, ideaId));
}

/**
 * Marks the idea for retry. When routing already succeeded we still store it so
 * the UI keeps showing the link while the enrichment is retried next run.
 */
async function markFailed(
  ideaId: string,
  error: string,
  raw?: string,
  routing?: RouteIdeaResult,
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
      ...(routing ? routingFields(routing) : {}),
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
      return {
        skipped: false,
        processed: true,
        remaining: await finalize(runId),
        ideaId: idea.id,
        status: "failed",
        error: routing.error,
      };
    }

    // Standalone ideas get web research. Linked ideas get a project-context
    // analysis. Unsorted ideas stop at "routed" until the user sorts them.
    if (routing.decision.status === "standalone") {
      const enrichment = await enrichStandalone(idea.rawText);

      await recordRunProgress(runId, {
        inputTokens: enrichment.usage.promptTokens,
        outputTokens: enrichment.usage.completionTokens,
        searches: enrichment.searches,
      });

      if (!enrichment.analysis) {
        const message = enrichment.error ?? "enrichment produced no analysis";
        await markFailed(idea.id, message, enrichment.raw, routing);
        await recordRunProgress(runId, { failed: 1 });
        return {
          skipped: false,
          processed: true,
          remaining: await finalize(runId),
          ideaId: idea.id,
          status: "failed",
          error: message,
        };
      }

      await markEnriched(idea.id, routing, enrichment.analysis, enrichment.raw);
      await recordRunProgress(runId, { processed: 1 });
      return {
        skipped: false,
        processed: true,
        remaining: await finalize(runId),
        ideaId: idea.id,
        status: "enriched",
      };
    }

    if (routing.decision.status === "linked") {
      const project =
        projects.find(
          (candidate) => candidate.id === routing.decision.projectId,
        ) ?? (await getProject(routing.decision.projectId));
      if (!project) {
        throw new Error("routed to a project that no longer exists");
      }

      const enrichment = await enrichLinked(idea.rawText, project, {
        linkType: routing.decision.linkType,
        confidence: routing.decision.confidence,
        reasoning: routing.decision.reasoning,
      });

      await recordRunProgress(runId, {
        inputTokens: enrichment.usage.promptTokens,
        outputTokens: enrichment.usage.completionTokens,
      });

      if (!enrichment.analysis) {
        const message = enrichment.error ?? "enrichment produced no analysis";
        await markFailed(idea.id, message, enrichment.raw, routing);
        await recordRunProgress(runId, { failed: 1 });
        return {
          skipped: false,
          processed: true,
          remaining: await finalize(runId),
          ideaId: idea.id,
          status: "failed",
          error: message,
        };
      }

      await markEnriched(idea.id, routing, enrichment.analysis, enrichment.raw);
      await recordRunProgress(runId, { processed: 1 });
      return {
        skipped: false,
        processed: true,
        remaining: await finalize(runId),
        ideaId: idea.id,
        status: "enriched",
      };
    }

    await markRouted(idea.id, routing);
    await recordRunProgress(runId, { processed: 1 });
    return {
      skipped: false,
      processed: true,
      remaining: await finalize(runId),
      ideaId: idea.id,
      status: routing.decision.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing failed";
    await markFailed(idea.id, message);
    await recordRunProgress(runId, { failed: 1 });
    return {
      skipped: false,
      processed: true,
      remaining: await finalize(runId),
      ideaId: idea.id,
      status: "failed",
      error: message,
    };
  }
}
