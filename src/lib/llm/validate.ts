import type { z } from "zod";
import {
  completeJson,
  type ChatMessage,
  type CompletionOptions,
  type CompletionUsage,
} from "./client";

export type ValidatedJsonResult<T> =
  | {
      ok: true;
      data: T;
      raw: string;
      usage: CompletionUsage;
      model: string;
      repaired: boolean;
    }
  | {
      ok: false;
      raw: string;
      error: string;
      usage: CompletionUsage;
      model: string;
    };

const EMPTY_USAGE: CompletionUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

function addUsage(a: CompletionUsage, b: CompletionUsage): CompletionUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/**
 * Extracts the first complete JSON value from a string. `json_object` mode
 * usually returns clean JSON, but thinking models sometimes wrap it in a code
 * fence or append prose; recovering it beats burning a run.
 */
export function extractJsonValue(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const start = trimmed.search(/[{[]/);
  if (start === -1) {
    return null;
  }

  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseAndValidate<T>(
  schema: z.ZodType<T>,
  raw: string,
): { ok: true; data: T } | { ok: false; error: string } {
  const extracted = extractJsonValue(raw);
  const candidates =
    extracted && extracted !== raw ? [raw, extracted] : [raw];

  let json: unknown;
  let parsed = false;
  let parseError = "parse error";

  for (const candidate of candidates) {
    try {
      json = JSON.parse(candidate);
      parsed = true;
      break;
    } catch (error) {
      parseError = error instanceof Error ? error.message : "parse error";
    }
  }

  if (!parsed) {
    return { ok: false, error: `invalid JSON: ${parseError}` };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `schema mismatch: ${detail}` };
  }

  return { ok: true, data: result.data };
}

/**
 * Calls the model, parses the JSON, and validates it against a schema. On a
 * parse/schema failure it retries once with the error fed back to the model.
 * `json_object` mode guarantees parseable JSON, not the shape we asked for,
 * so this repair loop is required rather than optional.
 */
export async function completeValidatedJson<T>(params: {
  schema: z.ZodType<T>;
  messages: ChatMessage[];
  options?: CompletionOptions;
  maxRepairs?: number;
}): Promise<ValidatedJsonResult<T>> {
  const { schema, messages, options } = params;
  const maxRepairs = params.maxRepairs ?? 1;
  let conversation = messages;

  let usage = EMPTY_USAGE;
  let lastRaw = "";
  let lastError = "no attempt made";
  let lastModel = "";
  let repaired = false;

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    let content: string;
    try {
      const completion = await completeJson(conversation, options);
      content = completion.content;
      lastModel = completion.model;
      usage = addUsage(usage, completion.usage);
    } catch (error) {
      return {
        ok: false,
        raw: lastRaw,
        error: error instanceof Error ? error.message : "LLM request failed",
        usage,
        model: lastModel,
      };
    }

    lastRaw = content;
    const parsed = parseAndValidate(schema, content);
    if (parsed.ok) {
      return {
        ok: true,
        data: parsed.data,
        raw: content,
        usage,
        model: lastModel,
        repaired,
      };
    }

    lastError = parsed.error;

    if (attempt < maxRepairs) {
      repaired = true;
      conversation = [
        ...conversation,
        { role: "assistant", content },
        {
          role: "user",
          content: `Your previous response was not valid json for the required schema. Error: ${parsed.error}. Return only corrected json, no prose.`,
        },
      ];
    }
  }

  return { ok: false, raw: lastRaw, error: lastError, usage, model: lastModel };
}
