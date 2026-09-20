import { and, count, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ideas, type Idea } from "@/db/schema";
import { enrichLinked } from "@/lib/analysis/analyze-linked";
import { enrichStandalone } from "@/lib/analysis/analyze-standalone";
import type { StoredAnalysis } from "@/lib/analysis/schema";
import { unsortedResetFields } from "@/lib/ideas";
import { getProject, listProjects } from "@/lib/projects";
import { routeIdea, type RoutingDecision } from "@/lib/routing/route-idea";
import { ensureRun, finishRun, recordRunProgress } from "./runs";

const LOCK_MINUTES = 10;
const MAX_ATTEMPTS = 3;

type RunDelta = Parameters<typeof recordRunProgress>[1];

/** Routing as applied to an idea: chosen by the model, or set by hand. */
type AppliedRouting = {
  decision: RoutingDecision;
  source: "auto" | "manual";
  raw?: string;
};

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

export type ReanalyzeOutcome =
  | { ok: true; status: string; error?: string }
  | { ok: false; reason: "not_found" | "busy" | "disabled"; message: string };

export type ManualRouteOutcome = ReanalyzeOutcome;

export function processingEnabled(): boolean {
  return process.env.PROCESSING_ENABLED !== "false";
}

/**
 * Mirrors the claim predicate so "remaining" and "claimable" never diverge.
 * A routed idea that is linked to a project still needs its analysis, so it
 * stays claimable until it reaches "enriched". Unsorted stays parked until the
 * user sorts it by hand.
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

type ClaimByIdResult =
  | { ok: true; idea: Idea }
  | { ok: false; reason: "not_found" | "busy"; message: string };

/**
 * Claims one specific idea (the interactive path). Refuses while another run
 * holds a live lock, and resets the attempt counter so a retry-exhausted idea
 * can recover. `clearAnalysis` drops a previous analysis that no longer matches
 * the routing being applied.
 */
async function claimIdeaById(
  ideaId: string,
  options: { clearAnalysis: boolean },
): Promise<ClaimByIdResult> {
  const db = getDb();

  const [claimed] = await db
    .update(ideas)
    .set({
      analysisStatus: "processing",
      analysisAttempts: 0,
      analysisError: null,
      lockExpiresAt: sql`now() + (${LOCK_MINUTES} * interval '1 minute')`,
      updatedAt: new Date(),
      ...(options.clearAnalysis
        ? { analysis: null, analysisRaw: null, processedAt: null }
        : {}),
    })
    .where(
      and(
        eq(ideas.id, ideaId),
        isNull(ideas.deletedAt),
        or(isNull(ideas.lockExpiresAt), lt(ideas.lockExpiresAt, sql`now()`)),
      ),
    )
    .returning({ id: ideas.id });

  if (!claimed) {
    const existing = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, ideaId), isNull(ideas.deletedAt)),
    });
    return existing
      ? {
          ok: false,
          reason: "busy",
          message: "this idea is already being analyzed",
        }
      : { ok: false, reason: "not_found", message: "idea not found" };
  }

  const idea = await db.query.ideas.findFirst({ where: eq(ideas.id, ideaId) });
  return idea
    ? { ok: true, idea }
    : { ok: false, reason: "not_found", message: "idea not found" };
}

/** Closes the run once the queue drains, and reports what is left. */
async function finalize(runId: string): Promise<number> {
  const remaining = await countClaimable();
  if (remaining === 0) {
    await finishRun(runId, "completed");
  }
  return remaining;
}

function routingFields(routing: AppliedRouting) {
  return {
    linkType: routing.decision.linkType,
    linkSource: routing.source,
    linkConfidence: routing.decision.confidence,
    projectId: routing.decision.projectId,
  };
}

/** Routing succeeded, but the idea is not a candidate for deep research. */
async function markRouted(
  ideaId: string,
  routing: AppliedRouting,
): Promise<void> {
  const db = getDb();
  // One timestamp for both columns: isAnalysisStale compares them directly.
  const now = new Date();
  await db
    .update(ideas)
    .set({
      analysisStatus: "routed",
      analysisAttempts: sql`${ideas.analysisAttempts} + 1`,
      analysisRaw: routing.raw ?? null,
      analysisError: null,
      routedAt: now,
      lockExpiresAt: null,
      updatedAt: now,
      ...routingFields(routing),
    })
    .where(eq(ideas.id, ideaId));
}

/** Routing plus a completed analysis. */
async function markEnriched(
  ideaId: string,
  routing: AppliedRouting,
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
 * the UI keeps showing the link while the analysis is retried.
 */
async function markFailed(
  ideaId: string,
  error: string,
  raw?: string,
  routing?: AppliedRouting,
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

/**
 * Route then enrich one already-claimed idea. This is the whole pipeline minus
 * claiming, so the nightly queue, the re-analyze button, and manual sorting all
 * share one code path. `runId` is null for interactive runs, and `manual` skips
 * the routing model call entirely.
 */
async function analyzeIdea(
  idea: Idea,
  runId: string | null,
  manual?: RoutingDecision,
): Promise<{ status: string; error?: string }> {
  const record = async (delta: RunDelta) => {
    if (runId) {
      await recordRunProgress(runId, delta);
    }
  };

  const projects = await listProjects();

  let routing: AppliedRouting;
  if (manual) {
    routing = { decision: manual, source: "manual" };
  } else {
    const result = await routeIdea(idea.rawText, projects);
    await record({
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
    });

    if (result.error) {
      await markFailed(idea.id, result.error, result.raw);
      await record({ failed: 1 });
      return { status: "failed", error: result.error };
    }

    routing = { decision: result.decision, source: "auto", raw: result.raw };
  }

  // Standalone ideas get web research. Linked ideas get a project-context
  // analysis. Unsorted ideas stop at "routed" until the user sorts them.
  if (routing.decision.status === "standalone") {
    const enrichment = await enrichStandalone(idea.rawText);
    await record({
      inputTokens: enrichment.usage.promptTokens,
      outputTokens: enrichment.usage.completionTokens,
      searches: enrichment.searches,
    });

    if (!enrichment.analysis) {
      const message = enrichment.error ?? "enrichment produced no analysis";
      await markFailed(idea.id, message, enrichment.raw, routing);
      await record({ failed: 1 });
      return { status: "failed", error: message };
    }

    await markEnriched(idea.id, routing, enrichment.analysis, enrichment.raw);
    await record({ processed: 1 });
    return { status: "enriched" };
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

    await record({
      inputTokens: enrichment.usage.promptTokens,
      outputTokens: enrichment.usage.completionTokens,
    });

    if (!enrichment.analysis) {
      const message = enrichment.error ?? "enrichment produced no analysis";
      await markFailed(idea.id, message, enrichment.raw, routing);
      await record({ failed: 1 });
      return { status: "failed", error: message };
    }

    await markEnriched(idea.id, routing, enrichment.analysis, enrichment.raw);
    await record({ processed: 1 });
    return { status: "enriched" };
  }

  await markRouted(idea.id, routing);
  await record({ processed: 1 });
  return { status: routing.decision.status };
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
    const result = await analyzeIdea(idea, runId);
    return {
      skipped: false,
      processed: true,
      remaining: await finalize(runId),
      ideaId: idea.id,
      status: result.status,
      error: result.error,
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

/** Interactive re-analysis for one idea, used after its text is edited. */
export async function reanalyzeIdea(
  ideaId: string,
): Promise<ReanalyzeOutcome> {
  if (!processingEnabled()) {
    return {
      ok: false,
      reason: "disabled",
      message: "processing is disabled",
    };
  }

  const claimed = await claimIdeaById(ideaId, { clearAnalysis: false });
  if (!claimed.ok) {
    return { ok: false, reason: claimed.reason, message: claimed.message };
  }

  try {
    return { ok: true, ...(await analyzeIdea(claimed.idea, null)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "analysis failed";
    await markFailed(ideaId, message);
    return { ok: true, status: "failed", error: message };
  }
}

/**
 * Manual sorting: the user says where an idea belongs. Routing the model call
 * is skipped, and any previous analysis is dropped because it described a
 * different destination.
 */
export async function routeIdeaManually(
  ideaId: string,
  decision: RoutingDecision,
): Promise<ManualRouteOutcome> {
  if (!processingEnabled()) {
    return {
      ok: false,
      reason: "disabled",
      message: "processing is disabled",
    };
  }

  const claimed = await claimIdeaById(ideaId, { clearAnalysis: true });
  if (!claimed.ok) {
    return { ok: false, reason: claimed.reason, message: claimed.message };
  }

  try {
    return { ok: true, ...(await analyzeIdea(claimed.idea, null, decision)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "analysis failed";
    await markFailed(ideaId, message);
    return { ok: true, status: "failed", error: message };
  }
}

/** Parks an idea as unsorted and clears any analysis that assumed otherwise. */
export async function setIdeaUnsorted(
  ideaId: string,
): Promise<ManualRouteOutcome> {
  const db = getDb();

  const [updated] = await db
    .update(ideas)
    .set(unsortedResetFields())
    .where(
      and(
        eq(ideas.id, ideaId),
        isNull(ideas.deletedAt),
        or(isNull(ideas.lockExpiresAt), lt(ideas.lockExpiresAt, sql`now()`)),
      ),
    )
    .returning({ id: ideas.id });

  if (!updated) {
    const existing = await db.query.ideas.findFirst({
      where: and(eq(ideas.id, ideaId), isNull(ideas.deletedAt)),
    });
    return existing
      ? {
          ok: false,
          reason: "busy",
          message: "this idea is already being analyzed",
        }
      : { ok: false, reason: "not_found", message: "idea not found" };
  }

  return { ok: true, status: "unsorted" };
}
