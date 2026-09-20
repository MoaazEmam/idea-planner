import { describe, expect, it } from "vitest";
import { hashText, isAnalysisStale } from "./state";

const text = "some idea text";
const earlier = new Date("2026-09-20T00:30:00Z");
const later = new Date("2026-09-20T01:00:00Z");

function analysisWith(sourceHash?: string) {
  return {
    kind: "standalone",
    promptVersion: 1,
    model: "deepseek-flash",
    generatedAt: "2026-09-20T00:00:00.000Z",
    ...(sourceHash ? { sourceHash } : {}),
    searchQueries: ["q"],
    sources: [{ title: "t", url: "https://example.com" }],
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

type IdeaShape = Parameters<typeof isAnalysisStale>[0];
function makeIdea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    updatedAt: later,
    routedAt: earlier,
    processedAt: earlier,
    rawText: text,
    analysis: analysisWith(hashText(text)),
    ...overrides,
  } as unknown as IdeaShape;
}

describe("hashText", () => {
  it("is stable for the same input", () => {
    expect(hashText(text)).toBe(hashText(text));
  });

  it("changes when the text changes", () => {
    expect(hashText(text)).not.toBe(hashText(`${text} more`));
  });

  it("is order sensitive", () => {
    expect(hashText("ab")).not.toBe(hashText("ba"));
  });
});

describe("isAnalysisStale", () => {
  it("is false when the text is unchanged", () => {
    expect(isAnalysisStale(makeIdea())).toBe(false);
  });

  it("is true when the text was edited", () => {
    expect(isAnalysisStale(makeIdea({ rawText: `${text} edited` }))).toBe(true);
  });

  it("stays false when a failed run only bumped updatedAt", () => {
    // The regression: a failed re-analysis must not look like an edit.
    expect(isAnalysisStale(makeIdea({ updatedAt: later, processedAt: earlier }))).toBe(
      false,
    );
  });

  it("falls back to timestamps for analyses without a source hash", () => {
    expect(
      isAnalysisStale(makeIdea({ analysis: analysisWith(), updatedAt: earlier })),
    ).toBe(false);
    expect(
      isAnalysisStale(makeIdea({ analysis: analysisWith(), updatedAt: later })),
    ).toBe(true);
  });

  it("is false when there is no analysis to be out of date", () => {
    expect(isAnalysisStale(makeIdea({ analysis: null }))).toBe(false);
    expect(
      isAnalysisStale(makeIdea({ analysis: null, processedAt: null, updatedAt: later })),
    ).toBe(false);
  });
});
