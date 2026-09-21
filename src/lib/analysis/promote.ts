import type { StoredAnalysis } from "./schema";

export type PromotedProjectFields = {
  name: string;
  oneLiner: string;
  context: string;
};

/** `projects.context` is capped at 20000, so the assembled block must fit. */
const MAX_CONTEXT = 20_000;
/** The original capture is referenced, not reproduced in full. */
const MAX_RAW = 2_000;
const MAX_NAME = 80;
const MAX_ONE_LINER = 300;

function firstLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= MAX_NAME) {
    return line;
  }
  return `${line.slice(0, MAX_NAME - 1).trimEnd()}…`;
}

function scoreLine(label: string, score: { value: number; reason: string }) {
  return `- ${label}: ${score.value}/10 — ${score.reason}`;
}

/**
 * Builds the editable defaults for turning an idea into a project. The standalone
 * research is the valuable part: it carries the market landscape, v1 features,
 * risks, scores, and sources so the new project starts with context instead of a
 * blank textarea.
 */
export function buildPromotedProject(
  ideaText: string,
  analysis: StoredAnalysis | null,
): PromotedProjectFields {
  const name = firstLine(ideaText) || "Untitled project";
  const context = analysis?.kind === "standalone"
    ? standaloneContext(ideaText, analysis)
    : genericContext(ideaText);

  return {
    name,
    oneLiner:
      analysis?.kind === "standalone"
        ? analysis.summary.slice(0, MAX_ONE_LINER)
        : "",
    context: context.slice(0, MAX_CONTEXT),
  };
}

function standaloneContext(
  ideaText: string,
  analysis: Extract<StoredAnalysis, { kind: "standalone" }>,
): string {
  const sections: string[] = [
    "# Origin",
    "Promoted from a captured idea after standalone market research.",
    "",
    "## Original idea",
    ideaText.slice(0, MAX_RAW),
    "",
    "## Summary",
    analysis.summary,
    "",
    "## Market landscape",
    analysis.market_landscape,
  ];

  if (analysis.existing_solutions.length > 0) {
    sections.push("", "## Existing solutions");
    for (const solution of analysis.existing_solutions) {
      const gap = solution.gap ? ` Gap: ${solution.gap}` : "";
      sections.push(`- ${solution.name}: ${solution.notes}${gap}`);
    }
  }

  sections.push("", "## Feasibility", analysis.feasibility);

  sections.push("", "## Suggested v1 features");
  for (const feature of analysis.suggested_features) {
    sections.push(`- ${feature}`);
  }

  if (analysis.risks.length > 0) {
    sections.push("", "## Risks");
    for (const risk of analysis.risks) {
      sections.push(`- ${risk}`);
    }
  }

  sections.push(
    "",
    "## Scores",
    scoreLine("Market", analysis.scores.market),
    scoreLine("Differentiation", analysis.scores.differentiation),
    scoreLine("Feasibility", analysis.scores.feasibility),
    scoreLine("Monetization", analysis.scores.monetization),
    "",
    "## Next step",
    analysis.next_step,
  );

  if (analysis.sources.length > 0) {
    sections.push("", "## Sources");
    for (const source of analysis.sources) {
      sections.push(`- ${source.title} — ${source.url}`);
    }
  }

  return sections.join("\n");
}

function genericContext(ideaText: string): string {
  return [
    "# Origin",
    "Promoted from a captured idea.",
    "",
    "## Original idea",
    ideaText.slice(0, MAX_RAW),
  ].join("\n");
}
