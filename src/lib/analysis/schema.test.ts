import { describe, expect, it } from "vitest";
import {
  linkedAnalysisSchema,
  parseStoredAnalysis,
  standaloneAnalysisSchema,
} from "./schema";

function standalone(overrides: Record<string, unknown> = {}) {
  return {
    summary: "s",
    market_landscape: "m",
    existing_solutions: [{ name: "n", notes: "notes", gap: "gap" }],
    feasibility: "f",
    suggested_features: ["one"],
    risks: ["r"],
    next_step: "n",
    scores: {
      market: { value: 5, reason: "r" },
      differentiation: { value: 5, reason: "r" },
      feasibility: { value: 5, reason: "r" },
      monetization: { value: 5, reason: "r" },
    },
    ...overrides,
  };
}

function linked(overrides: Record<string, unknown> = {}) {
  return {
    summary: "s",
    scope_fit: { verdict: "in_scope", reason: "r" },
    recommendation: "do_now",
    recommendation_reason: "r",
    implementation: "i",
    effort: { size: "small", reason: "r" },
    scores: {
      impact: { value: 5, reason: "r" },
      confidence: { value: 5, reason: "r" },
    },
    risks: ["r"],
    open_questions: ["q"],
    next_step: "n",
    ...overrides,
  };
}

function scoreOf(raw: unknown) {
  const parsed = standaloneAnalysisSchema.parse(raw);
  return parsed.scores.market.value;
}

describe("score normalisation", () => {
  it("keeps valid 1..10 integers", () => {
    expect(scoreOf(standalone({ scores: withMarket(7) }))).toBe(7);
  });

  it("scales a 0..1 probability up", () => {
    expect(scoreOf(standalone({ scores: withMarket(0.85) }))).toBe(9);
  });

  it("clamps a 0..100 percentage", () => {
    expect(scoreOf(standalone({ scores: withMarket(85) }))).toBe(10);
  });

  it("rounds decimals", () => {
    expect(scoreOf(standalone({ scores: withMarket(7.5) }))).toBe(8);
  });

  it("floors at 1", () => {
    expect(scoreOf(standalone({ scores: withMarket(0) }))).toBe(1);
  });

  it("accepts numeric strings", () => {
    expect(scoreOf(standalone({ scores: withMarket("6") }))).toBe(6);
  });

  it("rejects a non-numeric score", () => {
    expect(() => scoreOf(standalone({ scores: withMarket("n/a") }))).toThrow();
  });
});

function withMarket(value: unknown) {
  return {
    market: { value, reason: "r" },
    differentiation: { value: 5, reason: "r" },
    feasibility: { value: 5, reason: "r" },
    monetization: { value: 5, reason: "r" },
  };
}

describe("parseStoredAnalysis", () => {
  it("parses a stored standalone analysis", () => {
    const value = {
      ...standalone(),
      kind: "standalone",
      promptVersion: 1,
      model: "deepseek-flash",
      generatedAt: "2026-09-20T00:00:00.000Z",
      searchQueries: ["q"],
      sources: [{ title: "t", url: "https://example.com" }],
    };
    const parsed = parseStoredAnalysis(value);
    expect(parsed?.kind).toBe("standalone");
  });

  it("parses a stored linked analysis", () => {
    const value = {
      ...linked(),
      kind: "linked",
      promptVersion: 1,
      model: "deepseek-flash",
      generatedAt: "2026-09-20T00:00:00.000Z",
      projectId: "p1",
      projectName: "Domes",
      linkType: "feature",
    };
    const parsed = parseStoredAnalysis(value);
    expect(parsed?.kind).toBe("linked");
  });

  it("still parses legacy analyses without a source hash", () => {
    const value = {
      ...standalone(),
      kind: "standalone",
      promptVersion: 1,
      model: "deepseek-flash",
      generatedAt: "2026-09-20T00:00:00.000Z",
      searchQueries: [],
      sources: [],
    };
    const parsed = parseStoredAnalysis(value);
    expect(parsed?.kind).toBe("standalone");
    expect(parsed?.sourceHash).toBeUndefined();
  });

  it("returns null for an unknown kind", () => {
    expect(parseStoredAnalysis({ kind: "something-else" })).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseStoredAnalysis(null)).toBeNull();
  });
});

describe("linkedAnalysisSchema", () => {
  it("rejects an unknown scope verdict", () => {
    const result = linkedAnalysisSchema.safeParse({
      ...linked(),
      scope_fit: { verdict: "definitely", reason: "r" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const withoutNextStep: Record<string, unknown> = { ...linked() };
    delete withoutNextStep.next_step;
    expect(linkedAnalysisSchema.safeParse(withoutNextStep).success).toBe(false);
  });
});
