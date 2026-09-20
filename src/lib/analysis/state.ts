import type { Idea } from "@/db/schema";

/**
 * True when the idea text changed after the analysis was produced, so the
 * stored analysis no longer describes what is on screen. `markEnriched` and
 * `markRouted` write routedAt/processedAt and updatedAt from one timestamp, so
 * a plain comparison is enough; only an edit moves updatedAt forward.
 */
export function isAnalysisStale(
  idea: Pick<Idea, "updatedAt" | "routedAt" | "processedAt">,
): boolean {
  const analyzedAt = idea.processedAt ?? idea.routedAt;
  return analyzedAt ? idea.updatedAt.getTime() > analyzedAt.getTime() : false;
}
