import type { ReactNode } from "react";
import type { StandaloneStoredAnalysis } from "@/lib/analysis/schema";

const SCORE_LABELS: Record<
  keyof StandaloneStoredAnalysis["scores"],
  string
> = {
  market: "Market",
  differentiation: "Differentiation",
  feasibility: "Feasibility",
  monetization: "Monetization",
};

function scoreTone(value: number): string {
  if (value >= 8) return "text-emerald-300";
  if (value >= 6) return "text-sky-300";
  if (value >= 4) return "text-amber-300";
  return "text-red-300";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-neutral-500">
        {title}
      </h3>
      <div className="text-sm leading-relaxed text-neutral-300">{children}</div>
    </section>
  );
}

export function AnalysisView({ analysis }: { analysis: StandaloneStoredAnalysis }) {
  const scoreKeys = Object.keys(SCORE_LABELS) as (keyof StandaloneStoredAnalysis["scores"])[];

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-neutral-200">
        {analysis.summary}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {scoreKeys.map((key) => {
          const score = analysis.scores[key];
          return (
            <div
              key={key}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {SCORE_LABELS[key]}
                </span>
                <span
                  className={`text-lg font-semibold ${scoreTone(score.value)}`}
                >
                  {score.value}
                </span>
              </div>
              <p className="mt-1 text-xs leading-snug text-neutral-500">
                {score.reason}
              </p>
            </div>
          );
        })}
      </div>

      <Section title="Market">{analysis.market_landscape}</Section>

      {analysis.existing_solutions.length > 0 ? (
        <Section title="Existing solutions">
          <ul className="space-y-2">
            {analysis.existing_solutions.map((solution) => (
              <li
                key={solution.name}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
              >
                <p className="font-medium text-neutral-200">{solution.name}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {solution.notes}
                </p>
                {solution.gap ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    Gap: {solution.gap}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Feasibility">{analysis.feasibility}</Section>

      <Section title="A v1 could include">
        <ul className="list-disc space-y-1 pl-5">
          {analysis.suggested_features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </Section>

      {analysis.risks.length > 0 ? (
        <Section title="Risks">
          <ul className="list-disc space-y-1 pl-5">
            {analysis.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Next step">
        <p className="text-neutral-200">{analysis.next_step}</p>
      </Section>

      {analysis.sources.length > 0 ? (
        <Section title={`Sources (${analysis.sources.length})`}>
          <ul className="space-y-1">
            {analysis.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-sky-400 underline-offset-2 hover:underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <p className="text-[11px] text-neutral-600">
        {analysis.model || "model"} · prompt v{analysis.promptVersion} ·{" "}
        {analysis.searchQueries.length} searches
      </p>
    </div>
  );
}
