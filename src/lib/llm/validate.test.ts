import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { completeValidatedJson, extractJsonValue } from "./validate";

describe("extractJsonValue", () => {
  const cases: [string, string, string | null][] = [
    ["plain object", '{"a":1}', '{"a":1}'],
    ["trailing prose", '{"a":1} and some notes', '{"a":1}'],
    ["trailing newline prose", '{"a":1}\n\nLet me know.', '{"a":1}'],
    ["fenced", '```json\n{"a":1}\n```', '{"a":1}'],
    [
      "nested braces and strings",
      '{"a":{"b":"}"},"c":[1,2]}',
      '{"a":{"b":"}"},"c":[1,2]}',
    ],
    ["array at top level", '[{"a":1},{"b":2}] trailing', '[{"a":1},{"b":2}]'],
    ["first of two objects", '{"a":1}{"b":2}', '{"a":1}'],
    ["incomplete", '{"a":1', null],
    ["no json at all", "sorry, I cannot help", null],
  ];

  for (const [name, input, expected] of cases) {
    it(`handles ${name}`, () => {
      expect(extractJsonValue(input)).toBe(expected);
    });
  }
});

const schema = z.object({ a: z.number() });

function completion(content: string, finishReason = "stop") {
  return {
    model: "deepseek-flash",
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function stubFetch(bodies: unknown[]) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => call;
}

describe("completeValidatedJson", () => {
  process.env.DEEPSEEK_API_KEY = "test-key";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts clean json in one call", async () => {
    const calls = stubFetch([completion('{"a":1}')]);
    const result = await completeValidatedJson({
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(true);
    expect(calls()).toBe(1);
  });

  it("recovers json followed by prose without a retry", async () => {
    const calls = stubFetch([completion('{"a":1}\n\nHope that helps!')]);
    const result = await completeValidatedJson({
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.a).toBe(1);
    }
    expect(calls()).toBe(1);
  });

  it("retries once when the shape is wrong", async () => {
    const calls = stubFetch([
      completion('{"a":"not a number"}'),
      completion('{"a":7}'),
    ]);
    const result = await completeValidatedJson({
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.a).toBe(7);
      expect(result.repaired).toBe(true);
    }
    expect(calls()).toBe(2);
  });

  it("fails with the parse reason when nothing is recoverable", async () => {
    stubFetch([completion("not json"), completion("still not json")]);
    const result = await completeValidatedJson({
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("invalid JSON");
    }
  });

  it("reports a truncated (empty) answer as a token-limit failure", async () => {
    stubFetch([completion("", "length")]);
    const result = await completeValidatedJson({
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("token limit");
    }
  });

  it("reports a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream exploded", { status: 500 })),
    );
    const result = await completeValidatedJson({
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("500");
    }
  });
});
