import type { Project } from "@/db/schema";
import type { CompletionUsage } from "@/lib/llm/client";
import { completeValidatedJson } from "@/lib/llm/validate";
import { clarificationBlock } from "./analyze-standalone";
import {
  LINKED_PROMPT_VERSION,
  linkedAnalysisSchema,
  type LinkedStoredAnalysis,
} from "./schema";
import { hashText, ideaSourceText } from "./state";

/** Project context is free-form and can be long; the model sees a bounded slice. */
const MAX_CONTEXT_CHARS = 6000;

export type LinkedDecision = {
  linkType: "feature" | "spinoff";
  confidence: number;
  reasoning: string;
};

export type LinkedEnrichmentResult = {
  analysis: LinkedStoredAnalysis | null;
  raw: string;
  usage: CompletionUsage;
  searches: number;
  credits: number;
  error?: string;
};

const SYSTEM_PROMPT = `You are a blunt product analyst working inside one existing project.
You judge whether a captured idea belongs in that project and how it would be built there.
Return only json.

Rules:
- The project context is the source of truth. If it is thin or silent on something, say so and lower confidence instead of inventing scope.
- Judge scope honestly. A lot of captured ideas are really a separate product; say so plainly.
- Be concrete about implementation: name the parts of the project this idea would touch.
- Scores are whole numbers from 1 to 10 (no decimals, no percentages, no 0..1 probability).
- No hype, no filler, no restating the idea.`;

const USER_INSTRUCTIONS = `Return json with keys:
- summary: 2-3 sentences on whether this is worth doing in this project and why
- scope_fit: {verdict: in_scope | scope_creep | separate_product, reason}
- recommendation: do_now | do_later | skip
- recommendation_reason: one or two sentences
- implementation: how to build it in this project, naming the parts it touches
- effort: {size: small | medium | large, reason}
- scores: {impact, confidence}, each {value, reason}
- risks: array of the things most likely to go wrong
- open_questions: array of things that must be decided before starting
- next_step: the single next action`;

function contextBlock(project: Project): string {
  const context = (project.context ?? "").trim();
  return [
    `Project: ${project.name}`,
    `One-liner: ${project.oneLiner ?? "(none)"}`,
    `Status: ${project.status}`,
    `Context:\n"""${context.slice(0, MAX_CONTEXT_CHARS) || "(no context written yet)"}"""`,
  ].join("\n");
}

/**
 * Project-linked analysis: no web research, because the project context is the
 * ground truth and the question is fit and approach, not market viability.
 */
export async function enrichLinked(
  ideaText: string,
  project: Project,
  decision: LinkedDecision,
  clarifications: string[] = [],
): Promise<LinkedEnrichmentResult> {
  const result = await completeValidatedJson({
    schema: linkedAnalysisSchema,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${contextBlock(project)}

Routing said: ${decision.linkType} (confidence ${decision.confidence}). Reason: ${decision.reasoning || "(none given)"}

Idea:
"""${ideaText}"""${clarificationBlock(clarifications)}

${USER_INSTRUCTIONS}`,
      },
    ],
    options: { kind: "analysis", thinking: true, maxTokens: 12000 },
  });

  if (!result.ok) {
    return {
      analysis: null,
      raw: result.raw,
      usage: result.usage,
      searches: 0,
      credits: 0,
      error: result.error,
    };
  }

  return {
    analysis: {
      ...result.data,
      kind: "linked",
      promptVersion: LINKED_PROMPT_VERSION,
      model: result.model,
      generatedAt: new Date().toISOString(),
      sourceHash: hashText(ideaSourceText(ideaText, clarifications)),
      projectId: project.id,
      projectName: project.name,
      linkType: decision.linkType,
    },
    raw: result.raw,
    usage: result.usage,
    searches: 0,
    credits: 0,
  };
}
