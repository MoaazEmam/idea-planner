import type { ReactNode } from "react";
import type { LinkedStoredAnalysis } from "@/lib/analysis/schema";

const SCOPE_FIT: Record<
  LinkedStoredAnalysis["scope_fit"]["verdict"],
  { label: string; tone: string }
> = {
  in_scope: {
    label: "In scope",
    tone: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  },
  scope_creep: {
    label: "Scope creep",
    tone: "border-amber-800 bg-amber-950/40 text-amber-300",
  },
  separate_product: {
    label: "Separate product",
    tone: "border-violet-800 bg-violet-950/40 text-violet-300",
  },
};

const RECOMMENDATION: Record<
  LinkedStoredAnalysis["recommendation"],
  { label: string; tone: string }
> = {
  do_now: {
    label: "Do now",
    tone: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  },
  do_later: {
    label: "Do later",
    tone: "border-sky-800 bg-sky-950/40 text-sky-300",
  },
  skip: {
    label: "Skip",
    tone: "border-red-900 bg-red-950/40 text-red-300",
  },
};

const EFFORT: Record<LinkedStoredAnalysis["effort"]["size"], string> = {
  small: "Small effort",
  medium: "Medium effort",
  large: "Large effort",
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

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>
      {label}
    </span>
  );
}

export function LinkedAnalysisView({
  analysis,
}: {
  analysis: LinkedStoredAnalysis;
}) {
  const scores = [
    { key: "impact" as const, label: "Impact" },
    { key: "confidence" as const, label: "Confidence" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill {...SCOPE_FIT[analysis.scope_fit.verdict]} />
        <Pill {...RECOMMENDATION[analysis.recommendation]} />
        <Pill
          label={EFFORT[analysis.effort.size]}
          tone="border-neutral-700 text-neutral-400"
        />
      </div>

      <p className="text-sm leading-relaxed text-neutral-200">
        {analysis.summary}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {scores.map(({ key, label }) => {
          const score = analysis.scores[key];
          return (
            <div
              key={key}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {label}
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

      <Section title="Scope">
        <p>{analysis.scope_fit.reason}</p>
      </Section>

      <Section title="Recommendation">
        <p>{analysis.recommendation_reason}</p>
      </Section>

      <Section title="How to build it">{analysis.implementation}</Section>

      <Section title="Effort">
        <p>{analysis.effort.reason}</p>
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

      {analysis.open_questions.length > 0 ? (
        <Section title="Open questions">
          <ul className="list-disc space-y-1 pl-5">
            {analysis.open_questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Next step">
        <p className="text-neutral-200">{analysis.next_step}</p>
      </Section>

      <p className="text-[11px] text-neutral-600">
        {analysis.model || "model"} · prompt v{analysis.promptVersion} ·{" "}
        {analysis.projectName} · {analysis.linkType}
      </p>
    </div>
  );
}
