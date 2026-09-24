import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider seams are mocked so this exercises the personal-lens wiring —
 * schema selection, prompt additions, and what gets stored — without touching
 * DeepSeek or Tavily.
 */
const mocks = vi.hoisted(() => ({
  generateSearchQueries: vi.fn(),
  searchMany: vi.fn(),
  completeValidatedJson: vi.fn(),
}));

vi.mock("./queries", () => ({
  generateSearchQueries: mocks.generateSearchQueries,
}));

vi.mock("@/lib/research/tavily", () => ({
  searchMany: mocks.searchMany,
  ResearchError: class ResearchError extends Error {},
}));

vi.mock("@/lib/llm/validate", () => ({
  completeValidatedJson: mocks.completeValidatedJson,
}));

import { enrichStandalone } from "./analyze-standalone";
import {
  personalStandaloneAnalysisSchema,
  standaloneAnalysisSchema,
} from "./schema";

const usage = () => ({
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
});

function commercial() {
  return {
    summary: "s",
    market_landscape: "m",
    existing_solutions: [],
    feasibility: "f",
    suggested_features: ["one"],
    risks: [],
    next_step: "n",
    scores: {
      market: { value: 5, reason: "r" },
      differentiation: { value: 5, reason: "r" },
      feasibility: { value: 5, reason: "r" },
      monetization: { value: 5, reason: "r" },
    },
  };
}

function personalLens() {
  return {
    verdict: "do_nothing",
    verdict_reason: "A spreadsheet covers this.",
    worth_it: { value: 2, reason: "not worth it" },
    build_effort: { size: "small", reason: "a day" },
    running_cost: { monthly_estimate: null, notes: "n/a" },
    maintenance: { risk: "low", reason: "static" },
    alternatives: [],
    mvp_scope: [],
    unknowns: [],
  };
}

function ok(data: unknown) {
  return {
    ok: true as const,
    data,
    raw: JSON.stringify(data),
    usage: usage(),
    model: "deepseek-flash",
    repaired: false,
  };
}

function completionCall(index = 0) {
  return mocks.completeValidatedJson.mock.calls[index][0] as {
    schema: unknown;
    messages: { role: string; content: string }[];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateSearchQueries.mockResolvedValue({
    queries: ["q1", "q2"],
    usage: usage(),
    raw: "{}",
  });
  mocks.searchMany.mockResolvedValue({
    results: [
      { title: "T", url: "https://example.com", content: "c", score: 1 },
    ],
    credits: 1,
  });
});

describe("enrichStandalone", () => {
  it("uses the commercial schema and asks for no personal queries by default", async () => {
    mocks.completeValidatedJson.mockResolvedValue(ok(commercial()));

    const result = await enrichStandalone("idea");

    expect(completionCall().schema).toBe(standaloneAnalysisSchema);
    expect(mocks.generateSearchQueries).toHaveBeenCalledWith("idea", {
      personal: false,
    });
    expect(result.analysis?.personal_build).toBeUndefined();
    expect(result.analysis?.promptVersion).toBe(2);
  });

  it("uses the personal schema and threads the flag into query generation", async () => {
    mocks.completeValidatedJson.mockResolvedValue(
      ok({ ...commercial(), personal_build: personalLens() }),
    );

    const result = await enrichStandalone("idea", [], { personal: true });

    expect(completionCall().schema).toBe(personalStandaloneAnalysisSchema);
    expect(mocks.generateSearchQueries).toHaveBeenCalledWith("idea", {
      personal: true,
    });
    expect(result.analysis?.personal_build?.verdict).toBe("do_nothing");
  });

  it("tells the model to ground pricing and allow not building", async () => {
    mocks.completeValidatedJson.mockResolvedValue(
      ok({ ...commercial(), personal_build: personalLens() }),
    );

    await enrichStandalone("idea", [], { personal: true });

    const { messages } = completionCall();
    const text = messages.map((message) => message.content).join("\n");
    expect(text).toContain("unknown (check)");
    expect(text).toContain("personal_build");
    expect(text).toContain("do_nothing");
  });

  it("returns no analysis when research fails", async () => {
    mocks.searchMany.mockRejectedValue(new Error("tavily down"));

    const result = await enrichStandalone("idea", [], { personal: true });

    expect(result.analysis).toBeNull();
    expect(result.error).toContain("tavily down");
    expect(mocks.completeValidatedJson).not.toHaveBeenCalled();
  });

  it("returns no analysis when research finds nothing", async () => {
    mocks.searchMany.mockResolvedValue({ results: [], credits: 0 });

    const result = await enrichStandalone("idea", [], { personal: true });

    expect(result.analysis).toBeNull();
    expect(result.error).toBe("research returned no results");
  });
});
