import type { CompletionUsage } from "@/lib/llm/client";
import { completeValidatedJson } from "@/lib/llm/validate";
import { searchMany, type ResearchResult } from "@/lib/research/tavily";
import { generateSearchQueries } from "./queries";
import {
  PERSONAL_BUILD_VERDICTS,
  STANDALONE_PROMPT_VERSION,
  personalStandaloneAnalysisSchema,
  standaloneAnalysisSchema,
  type StandaloneStoredAnalysis,
} from "./schema";
import { hashText, ideaSourceText } from "./state";

/** Sources are ranked and truncated: the model sees a bounded, high-signal set. */
const MAX_SOURCES = 8;
const MAX_SNIPPET_CHARS = 900;
const IDEAS_MAX_QUERY_CHARS = 160;

export type StandaloneEnrichmentResult = {
  analysis: StandaloneStoredAnalysis | null;
  raw: string;
  usage: CompletionUsage;
  searches: number;
  credits: number;
  error?: string;
};

/** `personal` adds the standalone build-vs-buy lens; it never removes the commercial one. */
export type StandaloneEnrichmentOptions = { personal?: boolean };

const SYSTEM_PROMPT = `You are a blunt startup analyst. You judge one raw product idea against web research.
Return only json.

Grounding rules:
- Use only the numbered sources provided. Never invent companies, products, or links.
- If the sources are thin, off-topic, or contradictory, say so and score conservatively.

Scoring (integer 1..10, each with a one-sentence reason):
- market: how real and how large the demand is
- differentiation: how hard this is to copy and how crowded the space is
- feasibility: how achievable this is for one person building with AI tooling
- monetization: how plausibly and how soon it makes money

Scores are whole numbers from 1 to 10 (no decimals, no percentages, no 0..1 probability).

Style: specific and direct. No hype, no filler, no restating the idea.`;

const USER_INSTRUCTIONS = `Return json with keys:
- summary: 2-3 sentences on whether this is worth building and why
- market_landscape: what exists and where the room is
- existing_solutions: array of {name, notes, gap}
- feasibility: the practical build path and the hard parts
- suggested_features: array of concrete things a v1 could include
- risks: array of the things most likely to kill it
- next_step: the single next action to validate it cheaply
- scores: {market, differentiation, feasibility, monetization}, each {value, reason}`;

/**
 * Personal-tool lens. This is an addition to the commercial analysis, not a
 * replacement: the question is whether this needs to be built at all, given
 * what already exists, so "do not build it" must be a reachable answer.
 */
const PERSONAL_SYSTEM_ADDITION = `

You also judge whether this needs to be built at all, by one person using AI tooling.
- Compare honestly against free/open-source and paid alternatives.
- Never invent a price, license, or product. If a source does not state a price, write "unknown (check)".
- "You need a script, not an app" and "an existing tool already does this" are valid, valuable verdicts.
- Do not pad the alternatives list; only include tools the sources actually show.`;

const PERSONAL_USER_ADDITION = `

Also return a "personal_build" object with keys:
- verdict: one of ${PERSONAL_BUILD_VERDICTS.join(" | ")}
- verdict_reason: 2-3 sentences justifying the verdict
- worth_it: {value, reason} — is building it justified at all, given alternatives
- build_effort: {size: small | medium | large, estimated_hours (optional number), reason}
- running_cost: {monthly_estimate (number or null if unknown), notes} — what it costs to operate
- maintenance: {risk: low | medium | high, reason} — how likely it is to rot
- alternatives: array of {name, kind: oss_selfhost | oss_cloud | paid_saas | freemium | manual, license, pricing, priced_at, hosting: self | cloud | both, coverage: full | partial | adjacent, notes, url}
- cheapest_adequate: {name, cost, notes} — the cheapest option that actually covers the need (optional)
- mvp_scope: array of the smallest set of things a personal version would need
- unknowns: array of things the sources do not settle
- revisit_trigger: what would change this verdict (optional)`;

/** Turns the shared prompt into the personal variant when requested. */
function personalPrompt(base: string, addition: string, personal: boolean): string {
  return personal ? `${base}${addition}` : base;
}

function sourceBlock(sources: ResearchResult[]): string {
  return sources
    .map((source, index) => {
      const snippet = source.content.slice(0, MAX_SNIPPET_CHARS);
      return `[${index + 1}] ${source.title}\n${source.url}\n${snippet}`;
    })
    .join("\n\n");
}

/** Later clarifications are labelled so the model weighs them as refinements. */
export function clarificationBlock(clarifications: string[]): string {
  if (clarifications.length === 0) {
    return "";
  }
  return `\n\nLater clarifications (added after the original idea):\n"""${clarifications.join(
    "\n",
  )}"""`;
}

function addUsage(a: CompletionUsage, b: CompletionUsage): CompletionUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/**
 * Research + scored analysis for an idea that belongs to no project:
 *   queries -> web search -> grounded analysis -> validated JSON.
 * Every failure path returns `analysis: null` with a reason so the caller can
 * record it against the idea and retry on a later run.
 */
export async function enrichStandalone(
  ideaText: string,
  clarifications: string[] = [],
  options: StandaloneEnrichmentOptions = {},
): Promise<StandaloneEnrichmentResult> {
  const personal = options.personal ?? false;
  const sourceText = ideaSourceText(ideaText, clarifications);
  const queryResult = await generateSearchQueries(sourceText, { personal });

  let usage = queryResult.usage;

  const trimmedIdea = sourceText.replace(/\s+/g, " ").trim();
  const queries =
    queryResult.queries.length > 0
      ? queryResult.queries
      : [trimmedIdea.slice(0, IDEAS_MAX_QUERY_CHARS)];

  let sources: ResearchResult[];
  let credits = 0;
  try {
    const batch = await searchMany(queries, { maxResults: 5 });
    credits = batch.credits;
    sources = [...batch.results]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SOURCES);
  } catch (error) {
    return {
      analysis: null,
      raw: queryResult.raw,
      usage,
      searches: queries.length,
      credits,
      error: error instanceof Error ? error.message : "research failed",
    };
  }

  if (sources.length === 0) {
    return {
      analysis: null,
      raw: queryResult.raw,
      usage,
      searches: queries.length,
      credits,
      error: "research returned no results",
    };
  }

  const analysisResult = await completeValidatedJson({
    schema: personal
      ? personalStandaloneAnalysisSchema
      : standaloneAnalysisSchema,
    messages: [
      {
        role: "system",
        content: personalPrompt(SYSTEM_PROMPT, PERSONAL_SYSTEM_ADDITION, personal),
      },
      {
        role: "user",
        content: `Idea:\n"""${ideaText}"""${clarificationBlock(
          clarifications,
        )}\n\nSources:\n${sourceBlock(sources)}\n\n${personalPrompt(
          USER_INSTRUCTIONS,
          PERSONAL_USER_ADDITION,
          personal,
        )}`,
      },
    ],
    options: { kind: "analysis", thinking: true, maxTokens: 12000 },
  });

  usage = addUsage(usage, analysisResult.usage);

  if (!analysisResult.ok) {
    return {
      analysis: null,
      raw: analysisResult.raw,
      usage,
      searches: queries.length,
      credits,
      error: analysisResult.error,
    };
  }

  return {
    analysis: {
      ...analysisResult.data,
      kind: "standalone",
      promptVersion: STANDALONE_PROMPT_VERSION,
      model: analysisResult.model,
      generatedAt: new Date().toISOString(),
      sourceHash: hashText(sourceText),
      searchQueries: queries,
      sources: sources.map((source) => ({
        title: source.title,
        url: source.url,
      })),
    },
    raw: analysisResult.raw,
    usage,
    searches: queries.length,
    credits,
  };
}
