import { z } from "zod";
import type { ChatMessage, CompletionUsage } from "@/lib/llm/client";
import { completeValidatedJson } from "@/lib/llm/validate";

const queryResponseSchema = z.object({
  queries: z.array(z.string().min(3).max(200)).min(1).max(6),
});

export type QueryGenerationResult = {
  queries: string[];
  usage: CompletionUsage;
  raw: string;
  error?: string;
};

const SYSTEM_PROMPT = `You design web searches for market research on a raw product idea.
Return only json.

Write 2 to 4 short queries that would surface:
- existing products or startups already doing this
- whether people are already asking for it
- the hard parts (cost, regulation, technical limits)

Each query must be a specific searchable phrase. No boolean operators, no quotes.`;

/**
 * Appended in personal-tool mode. The extra queries target the alternatives
 * that decide build-vs-buy: free/open-source tools and comparable paid pricing.
 */
const PERSONAL_SYSTEM_ADDITION = `

Also add 1 to 2 more queries that would surface:
- free or open-source tools that already do this
- pricing pages for comparable paid tools
Return at most 6 queries in total.`;

export async function generateSearchQueries(
  ideaText: string,
  options: { personal?: boolean } = {},
): Promise<QueryGenerationResult> {
  const system = options.personal
    ? `${SYSTEM_PROMPT}${PERSONAL_SYSTEM_ADDITION}`
    : SYSTEM_PROMPT;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Idea:\n"""${ideaText}"""\n\nReturn json with a "queries" array.`,
    },
  ];

  const result = await completeValidatedJson({
    schema: queryResponseSchema,
    messages,
    options: {
      kind: "routing",
      thinking: false,
      maxTokens: 300,
      temperature: 0.2,
    },
  });

  if (!result.ok) {
    return {
      queries: [],
      usage: result.usage,
      raw: result.raw,
      error: result.error,
    };
  }

  return {
    queries: result.data.queries.map((query) => query.trim()).filter(Boolean),
    usage: result.usage,
    raw: result.raw,
  };
}
