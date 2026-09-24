import { describe, expect, it } from "vitest";
import { buildPromotedProject } from "./promote";
import type { StandaloneStoredAnalysis } from "./schema";

const ideaText = "A tool that turns a sentence into a plan";

function standalone(
  overrides: Partial<StandaloneStoredAnalysis> = {},
): StandaloneStoredAnalysis {
  return {
    kind: "standalone",
    promptVersion: 1,
    model: "deepseek-flash",
    generatedAt: "2026-09-20T00:00:00.000Z",
    searchQueries: ["q"],
    sources: [{ title: "Source", url: "https://example.com" }],
    summary: "Worth building, narrowly.",
    market_landscape: "Crowded but shallow.",
    existing_solutions: [{ name: "Incumbent", notes: "Big", gap: "Slow" }],
    feasibility: "Doable alone.",
    suggested_features: ["feature one", "feature two"],
    risks: ["risk one"],
    next_step: "Interview five users.",
    scores: {
      market: { value: 7, reason: "some demand" },
      differentiation: { value: 5, reason: "copyable" },
      feasibility: { value: 8, reason: "small scope" },
      monetization: { value: 6, reason: "plausible" },
    },
    ...overrides,
  };
}

describe("buildPromotedProject", () => {
  it("derives the name from the idea text", () => {
    expect(buildPromotedProject(ideaText, null).name).toBe(ideaText);
  });

  it("truncates a long name", () => {
    const long = "x".repeat(200);
    const name = buildPromotedProject(long, null).name;
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.endsWith("…")).toBe(true);
  });

  it("falls back to a placeholder name for empty text", () => {
    expect(buildPromotedProject("   ", null).name).toBe("Untitled project");
  });

  it("uses the analysis summary as the one-liner", () => {
    expect(buildPromotedProject(ideaText, standalone()).oneLiner).toBe(
      "Worth building, narrowly.",
    );
  });

  it("carries features, risks, scores, and sources into the context", () => {
    const { context } = buildPromotedProject(ideaText, standalone());
    expect(context).toContain("feature one");
    expect(context).toContain("risk one");
    expect(context).toContain("Market: 7/10");
    expect(context).toContain("https://example.com");
    expect(context).toContain(ideaText);
  });

  it("has an empty one-liner and generic context without an analysis", () => {
    const { oneLiner, context } = buildPromotedProject(ideaText, null);
    expect(oneLiner).toBe("");
    expect(context).toContain("## Original idea");
    expect(context).toContain(ideaText);
  });

  it("carries the personal build lens into the context when present", () => {
    const withPersonal = standalone({
      personal_build: {
        verdict: "use_free",
        verdict_reason: "ToolX already does this.",
        worth_it: { value: 3, reason: "not worth it" },
        build_effort: { size: "small", estimated_hours: 8, reason: "a weekend" },
        running_cost: { monthly_estimate: 0, notes: "free" },
        maintenance: { risk: "low", reason: "static" },
        alternatives: [
          {
            name: "ToolX",
            kind: "oss_selfhost",
            coverage: "full",
            pricing: "free",
            license: "MIT",
            notes: "does it",
          },
        ],
        cheapest_adequate: { name: "ToolX", cost: "free", notes: "covers it" },
        mvp_scope: ["capture"],
        unknowns: ["nothing"],
      },
    });
    const { context } = buildPromotedProject(ideaText, withPersonal);
    expect(context).toContain("## Personal build lens");
    expect(context).toContain("Verdict: use_free");
    expect(context).toContain("ToolX");
    expect(context).toContain("Minimum viable personal version");
  });

  it("omits the personal build section when absent", () => {
    const { context } = buildPromotedProject(ideaText, standalone());
    expect(context).not.toContain("Personal build lens");
  });

  it("caps the context at the column limit", () => {
    const huge = standalone({
      market_landscape: "m".repeat(2500),
      feasibility: "f".repeat(2500),
      existing_solutions: Array.from({ length: 8 }, (_, index) => ({
        name: `n${index}`,
        notes: "o".repeat(700),
        gap: "g".repeat(700),
      })),
      suggested_features: Array.from({ length: 12 }, (_, index) =>
        `${index}${"x".repeat(399)}`,
      ),
      risks: Array.from({ length: 10 }, (_, index) => `${index}${"r".repeat(399)}`),
    });
    const { context } = buildPromotedProject("i".repeat(2000), huge);
    expect(context.length).toBeLessThanOrEqual(20_000);
  });
});
