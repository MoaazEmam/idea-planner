import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PersonalBuild } from "@/lib/analysis/schema";
import { PersonalBuildView } from "./personal-build-view";

const build: PersonalBuild = {
  verdict: "use_free",
  verdict_reason: "An open-source tool already covers this.",
  worth_it: { value: 4, reason: "not worth the upkeep" },
  build_effort: { size: "small", estimated_hours: 8, reason: "a weekend" },
  running_cost: { monthly_estimate: 5, notes: "one small VM" },
  maintenance: { risk: "medium", reason: "dependencies move" },
  alternatives: [
    {
      name: "ToolX",
      kind: "oss_selfhost",
      license: "MIT",
      pricing: "free",
      priced_at: "2026-09",
      hosting: "self",
      coverage: "full",
      notes: "does the job",
      url: "https://example.com/toolx",
    },
    {
      name: "PaidApp",
      kind: "paid_saas",
      pricing: "unknown (check)",
      coverage: "partial",
      notes: "half of it",
    },
  ],
  cheapest_adequate: { name: "ToolX", cost: "free", notes: "covers it" },
  mvp_scope: ["capture", "list"],
  unknowns: ["long-term maintenance"],
  revisit_trigger: "if ToolX is abandoned",
};

function render(value: PersonalBuild) {
  return renderToStaticMarkup(createElement(PersonalBuildView, { build: value }));
}

describe("PersonalBuildView", () => {
  it("renders the verdict, alternatives, and edge sections", () => {
    const html = render(build);
    expect(html).toContain("Use a free / open-source tool");
    expect(html).toContain("An open-source tool already covers this.");
    expect(html).toContain("ToolX");
    expect(html).toContain("PaidApp");
    expect(html).toContain("Cheapest adequate option");
    expect(html).toContain("Minimum viable personal version");
    expect(html).toContain("What the sources don&#x27;t settle");
    expect(html).toContain("Revisit if");
    expect(html).toContain("~$5/mo");
  });

  it("labels a do-nothing verdict as not building it", () => {
    const html = render({ ...build, verdict: "do_nothing" });
    expect(html).toContain("Don&#x27;t build it");
  });

  it("renders without optional alternatives and cheapest option", () => {
    const html = render({
      ...build,
      alternatives: [],
      cheapest_adequate: undefined,
    });
    expect(html).toContain("Use a free / open-source tool");
    expect(html).not.toContain("Cheapest adequate option");
  });
});
