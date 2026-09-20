/**
 * The only module that knows which research provider we use. Swapping Tavily
 * for another search API means changing this file and nothing else.
 */

const DEFAULT_BASE_URL = "https://api.tavily.com";
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 5;

export type ResearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

export type ResearchBatch = {
  results: ResearchResult[];
  credits: number;
};

export class ResearchError extends Error {}

function baseUrl(): string {
  return process.env.TAVILY_BASE_URL ?? DEFAULT_BASE_URL;
}

async function searchOne(
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<{ results: ResearchResult[]; credits: number }> {
  const response = await fetch(`${baseUrl()}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_usage: true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ResearchError(
      `Tavily request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    results?: {
      title?: unknown;
      url?: unknown;
      content?: unknown;
      score?: unknown;
    }[];
    usage?: { credits?: unknown };
  };

  const results: ResearchResult[] = [];
  for (const row of payload.results ?? []) {
    if (typeof row.url !== "string" || row.url.length === 0) {
      continue;
    }
    results.push({
      title: typeof row.title === "string" ? row.title : "Untitled",
      url: row.url,
      content: typeof row.content === "string" ? row.content.trim() : "",
      score: typeof row.score === "number" ? row.score : 0,
    });
  }

  const credits =
    typeof payload.usage?.credits === "number" ? payload.usage.credits : 0;

  return { results, credits };
}

/**
 * Runs the queries in parallel and merges the results, dropping duplicate URLs.
 * One failed query does not sink the batch, but if every query fails we rethrow
 * so the caller can mark the idea for retry instead of analysing nothing.
 */
export async function searchMany(
  queries: string[],
  options: { maxResults?: number } = {},
): Promise<ResearchBatch> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new ResearchError("TAVILY_API_KEY is not set");
  }

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

  const settled = await Promise.allSettled(
    queries.map((query) => searchOne(apiKey, query, maxResults)),
  );

  const results: ResearchResult[] = [];
  const seen = new Set<string>();
  let credits = 0;
  let firstError: unknown;

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      firstError ??= outcome.reason;
      continue;
    }
    credits += outcome.value.credits;
    for (const result of outcome.value.results) {
      if (seen.has(result.url)) {
        continue;
      }
      seen.add(result.url);
      results.push(result);
    }
  }

  if (results.length === 0 && firstError !== undefined) {
    throw firstError instanceof Error
      ? firstError
      : new ResearchError("research failed");
  }

  return { credits, results };
}
