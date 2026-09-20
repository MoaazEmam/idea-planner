import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { processNextIdea, processingEnabled } from "@/lib/jobs/process";
import { finishRun } from "@/lib/jobs/runs";

/** One idea per request keeps each invocation well inside the function limit. */
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const payload = (body ?? {}) as {
    action?: unknown;
    runId?: unknown;
    trigger?: unknown;
  };

  const runId =
    typeof payload.runId === "string" && payload.runId.length > 0
      ? payload.runId
      : randomUUID();
  const trigger = payload.trigger === "cron" ? "cron" : "manual";

  if (payload.action === "finish") {
    await finishRun(runId, "completed");
    return NextResponse.json({ runId, finished: true });
  }

  try {
    const outcome = await processNextIdea(runId, trigger);
    return NextResponse.json({ runId, enabled: processingEnabled(), ...outcome });
  } catch (error) {
    // Anything that escapes the per-idea handling is a run-level failure; keep
    // the reason on the run so /runs can explain it.
    const message = error instanceof Error ? error.message : "processing failed";
    await finishRun(runId, "failed", message);
    return NextResponse.json(
      { runId, error: "processing_failed", message },
      { status: 500 },
    );
  }
}
