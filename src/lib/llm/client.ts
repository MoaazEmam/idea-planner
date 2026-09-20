/**
 * The only module that knows which LLM provider we use. Swapping DeepSeek for
 * Claude (or anything OpenAI-compatible) means changing this file alone.
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_ROUTING_MODEL = "deepseek-flash";
const DEFAULT_ANALYSIS_MODEL = "deepseek-flash";
const REQUEST_TIMEOUT_MS = 120_000;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionOptions = {
  /** Selects the default model for the task; an explicit `model` wins. */
  kind?: "routing" | "analysis";
  model?: string;
  /** DeepSeek thinking mode. Off by default (cheaper, faster). */
  thinking?: boolean;
  maxTokens?: number;
  /** Ignored when thinking is enabled (the provider rejects it). */
  temperature?: number;
};

export type CompletionUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type CompletionResult = {
  content: string;
  model: string;
  usage: CompletionUsage;
};

type DeepSeekChatResponse = {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function baseUrl(): string {
  return process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL;
}

export function routingModel(): string {
  return process.env.DEEPSEEK_ROUTING_MODEL ?? DEFAULT_ROUTING_MODEL;
}

export function analysisModel(): string {
  return process.env.DEEPSEEK_ANALYSIS_MODEL ?? DEFAULT_ANALYSIS_MODEL;
}

export async function completeJson(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  const thinking = options.thinking ?? false;
  const model =
    options.model ??
    (options.kind === "analysis" ? analysisModel() : routingModel());

  const body: Record<string, unknown> = {
    model,
    messages,
    response_format: { type: "json_object" },
    max_tokens: options.maxTokens ?? 2000,
    thinking: { type: thinking ? "enabled" : "disabled" },
  };

  if (!thinking && options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `DeepSeek request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as DeepSeekChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("DeepSeek returned an empty response");
  }

  return {
    content,
    model: payload.model ?? model,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    },
  };
}
