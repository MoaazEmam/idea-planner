import { describe, expect, it } from "vitest";
import {
  linkedAnalysisSchema,
  parseStoredAnalysis,
  personalStandaloneAnalysisSchema,
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

function personalBuild(overrides: Record<string, unknown> = {}) {
  return {
    verdict: "use_free",
    verdict_reason: "An open-source tool already does this.",
    worth_it: { value: 4, reason: "not worth the maintenance" },
    build_effort: { size: "medium", estimated_hours: 20, reason: "one weekend" },
    running_cost: { monthly_estimate: null, notes: "free to self-host" },
    maintenance: { risk: "medium", reason: "dependencies move" },
    alternatives: [
      {
        name: "ToolX",
        kind: "oss_selfhost",
        license: "MIT",
        pricing: "free",
        coverage: "full",
        notes: "does the job",
        url: "https://example.com/toolx",
      },
    ],
    cheapest_adequate: { name: "ToolX", cost: "free", notes: "covers it" },
    mvp_scope: ["capture", "list"],
    unknowns: ["long-term maintenance"],
    revisit_trigger: "if ToolX is abandoned",
    ...overrides,
  };
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

  it("parses a stored standalone analysis carrying the personal lens", () => {
    const value = {
      ...standalone(),
      kind: "standalone",
      promptVersion: 2,
      model: "deepseek-flash",
      generatedAt: "2026-09-20T00:00:00.000Z",
      searchQueries: ["q"],
      sources: [{ title: "t", url: "https://example.com" }],
      personal_build: personalBuild(),
    };
    const parsed = parseStoredAnalysis(value);
    expect(parsed?.kind).toBe("standalone");
    expect(
      parsed?.kind === "standalone" ? parsed.personal_build?.verdict : undefined,
    ).toBe("use_free");
  });
});

describe("personalStandaloneAnalysisSchema", () => {
  it("accepts a standalone analysis with a personal lens", () => {
    const result = personalStandaloneAnalysisSchema.safeParse({
      ...standalone(),
      personal_build: personalBuild(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a standalone analysis without a personal lens", () => {
    expect(personalStandaloneAnalysisSchema.safeParse(standalone()).success).toBe(
      false,
    );
  });

  it("rejects an unknown personal verdict", () => {
    const result = personalStandaloneAnalysisSchema.safeParse({
      ...standalone(),
      personal_build: personalBuild({ verdict: "maybe_later" }),
    });
    expect(result.success).toBe(false);
  });

  it("keeps the base schema valid without a personal lens", () => {
    expect(standaloneAnalysisSchema.safeParse(standalone()).success).toBe(true);
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
