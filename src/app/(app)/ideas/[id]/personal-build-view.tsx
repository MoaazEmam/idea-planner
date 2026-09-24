import type { ReactNode } from "react";
import type {
  Alternative,
  PersonalBuild,
} from "@/lib/analysis/schema";

const VERDICT: Record<
  PersonalBuild["verdict"],
  { label: string; tone: string }
> = {
  build: {
    label: "Build it",
    tone: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  },
  fork: {
    label: "Fork an existing project",
    tone: "border-sky-800 bg-sky-950/40 text-sky-300",
  },
  use_free: {
    label: "Use a free / open-source tool",
    tone: "border-sky-800 bg-sky-950/40 text-sky-300",
  },
  buy: {
    label: "Buy an alternative",
    tone: "border-amber-800 bg-amber-950/40 text-amber-300",
  },
  simpler_form: {
    label: "Build something simpler",
    tone: "border-amber-800 bg-amber-950/40 text-amber-300",
  },
  do_nothing: {
    label: "Don't build it",
    tone: "border-red-900 bg-red-950/40 text-red-300",
  },
};

const KIND_LABEL: Record<Alternative["kind"], string> = {
  oss_selfhost: "OSS · self-host",
  oss_cloud: "OSS · cloud",
  paid_saas: "Paid SaaS",
  freemium: "Freemium",
  manual: "Manual / spreadsheet",
};

const COVERAGE_TONE: Record<Alternative["coverage"], string> = {
  full: "border-emerald-800 text-emerald-300",
  partial: "border-amber-800 text-amber-300",
  adjacent: "border-neutral-700 text-neutral-400",
};

const RISK_TONE: Record<PersonalBuild["maintenance"]["risk"], string> = {
  low: "text-emerald-300",
  medium: "text-amber-300",
  high: "text-red-300",
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
      <h4 className="text-xs uppercase tracking-widest text-neutral-500">
        {title}
      </h4>
      <div className="text-sm leading-relaxed text-neutral-300">{children}</div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-neutral-200">{children}</div>
    </div>
  );
}

function alternativeMeta(alternative: Alternative): string {
  const bits = [KIND_LABEL[alternative.kind]];
  if (alternative.pricing) bits.push(alternative.pricing);
  if (alternative.license) bits.push(alternative.license);
  if (alternative.hosting) bits.push(`hosting: ${alternative.hosting}`);
  return bits.join(" · ");
}

export function PersonalBuildView({ build }: { build: PersonalBuild }) {
  const verdict = VERDICT[build.verdict];
  const hours = build.build_effort.estimated_hours;
  const running =
    build.running_cost.monthly_estimate === null ||
    build.running_cost.monthly_estimate === undefined
      ? null
      : build.running_cost.monthly_estimate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${verdict.tone}`}>
          {verdict.label}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-neutral-200">
        {build.verdict_reason}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              Worth it
            </span>
            <span
              className={`text-lg font-semibold ${scoreTone(build.worth_it.value)}`}
            >
              {build.worth_it.value}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-neutral-500">
            {build.worth_it.reason}
          </p>
        </div>

        <Stat label="Effort">
          {build.build_effort.size}
          {hours ? ` · ~${hours}h` : ""}
        </Stat>

        <Stat label="Running cost">
          {running === null
            ? build.running_cost.notes
            : `~$${running}/mo`}
        </Stat>

        <Stat label="Maintenance">
          <span className={RISK_TONE[build.maintenance.risk]}>
            {build.maintenance.risk}
          </span>
        </Stat>
      </div>

      <p className="text-xs leading-snug text-neutral-500">
        Effort: {build.build_effort.reason} · Maintenance:{" "}
        {build.maintenance.reason}
        {running !== null ? ` · ${build.running_cost.notes}` : ""}
      </p>

      {build.cheapest_adequate ? (
        <div className="rounded-lg border border-sky-900 bg-sky-950/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-sky-400">
            Cheapest adequate option
          </p>
          <p className="mt-1 text-sm text-neutral-200">
            {build.cheapest_adequate.name} — {build.cheapest_adequate.cost}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {build.cheapest_adequate.notes}
          </p>
        </div>
      ) : null}

      {build.alternatives.length > 0 ? (
        <Section title={`Alternatives (${build.alternatives.length})`}>
          <ul className="space-y-2">
            {build.alternatives.map((alternative) => (
              <li
                key={`${alternative.name}-${alternative.kind}`}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-neutral-200">
                    {alternative.url ? (
                      <a
                        href={alternative.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline-offset-2 hover:underline"
                      >
                        {alternative.name}
                      </a>
                    ) : (
                      alternative.name
                    )}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${COVERAGE_TONE[alternative.coverage]}`}
                  >
                    {alternative.coverage} coverage
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {alternativeMeta(alternative)}
                  {alternative.priced_at ? ` (as of ${alternative.priced_at})` : ""}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {alternative.notes}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {build.mvp_scope.length > 0 ? (
        <Section title="Minimum viable personal version">
          <ul className="list-disc space-y-1 pl-5">
            {build.mvp_scope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {build.unknowns.length > 0 ? (
        <Section title="What the sources don't settle">
          <ul className="list-disc space-y-1 pl-5">
            {build.unknowns.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {build.revisit_trigger ? (
        <Section title="Revisit if">
          <p className="text-neutral-400">{build.revisit_trigger}</p>
        </Section>
      ) : null}
    </div>
  );
}
