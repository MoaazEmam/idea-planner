import type { Idea } from "@/db/schema";
import { parseStoredAnalysis } from "./schema";

/**
 * Stable change-detection hash (FNV-1a). Deliberately not cryptographic: it only
 * needs to notice that the idea text changed, and it must run in both the server
 * and the browser without imports.
 */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The full analysable source: the original capture plus any later additions, in
 * capture order. Both the analyser and the staleness hash use this, so adding a
 * clarification marks an analysis out of date exactly as editing the text does.
 */
export function ideaSourceText(
  rawText: string,
  clarifications: string[] = [],
): string {
  if (clarifications.length === 0) {
    return rawText;
  }
  return `${rawText}\n\n--- Later clarifications ---\n${clarifications.join("\n")}`;
}

/**
 * True when the idea text changed after the analysis was produced, so what is
 * stored no longer describes what is on screen.
 *
 * Prefers the stored source hash: timestamps also move on a failed re-analysis,
 * which is not an edit. Analyses written before sourceHash existed fall back to
 * the timestamp comparison.
 */
export function isAnalysisStale(
  idea: Pick<
    Idea,
    "updatedAt" | "routedAt" | "processedAt" | "rawText" | "analysis"
  >,
  clarifications: string[] = [],
): boolean {
  const analysis = parseStoredAnalysis(idea.analysis);
  if (!analysis) {
    // Nothing analysed yet, so there is nothing that can be out of date.
    return false;
  }

  if (analysis.sourceHash) {
    return (
      analysis.sourceHash !== hashText(ideaSourceText(idea.rawText, clarifications))
    );
  }

  // Legacy analysis written before sourceHash existed.
  const analyzedAt = idea.processedAt ?? idea.routedAt;
  return analyzedAt ? idea.updatedAt.getTime() > analyzedAt.getTime() : false;
}
