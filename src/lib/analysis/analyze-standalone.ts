import type { CompletionUsage } from "@/lib/llm/client";
import { completeValidatedJson } from "@/lib/llm/validate";
import { searchMany, type ResearchResult } from "@/lib/research/tavily";
import { generateSearchQueries } from "./queries";
import {
  STANDALONE_PROMPT_VERSION,
  standaloneAnalysisSchema,
  type StandaloneStoredAnalysis,
} from "./schema";
import { hashText } from "./state";

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

function sourceBlock(sources: ResearchResult[]): string {
  return sources
    .map((source, index) => {
      const snippet = source.content.slice(0, MAX_SNIPPET_CHARS);
      return `[${index + 1}] ${source.title}\n${source.url}\n${snippet}`;
    })
    .join("\n\n");
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
): Promise<StandaloneEnrichmentResult> {
  const queryResult = await generateSearchQueries(ideaText);

  let usage = queryResult.usage;

  const trimmedIdea = ideaText.replace(/\s+/g, " ").trim();
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
    schema: standaloneAnalysisSchema,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Idea:\n"""${ideaText}"""\n\nSources:\n${sourceBlock(sources)}\n\n${USER_INSTRUCTIONS}`,
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
      sourceHash: hashText(ideaText),
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
