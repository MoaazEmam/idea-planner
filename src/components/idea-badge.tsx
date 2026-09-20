import type { Idea } from "@/db/schema";

const TONES = {
  neutral: "border-neutral-700 text-neutral-400",
  blue: "border-sky-800 bg-sky-950/40 text-sky-300",
  violet: "border-violet-800 bg-violet-950/40 text-violet-300",
  amber: "border-amber-800 bg-amber-950/40 text-amber-300",
  red: "border-red-900 bg-red-950/40 text-red-300",
  green: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
} as const;

type Tone = keyof typeof TONES;

/**
 * One label per idea, derived from its enrichment state. Kept in one place so
 * the inbox, project pages, and detail view always agree on what a state means.
 */
export function describeIdea(
  idea: Pick<
    Idea,
    "analysisStatus" | "linkType" | "projectId" | "linkConfidence"
  >,
  projectName: string | null,
): { label: string; tone: Tone } {
  if (idea.analysisStatus === "failed") {
    return {
      label: idea.linkType ? "research failed" : "routing failed",
      tone: "red",
    };
  }
  if (idea.analysisStatus === "processing") {
    return { label: "processing…", tone: "amber" };
  }
  if (idea.analysisStatus === "new") {
    return { label: "not routed yet", tone: "neutral" };
  }

  // Routed or enriched from here on.
  if (idea.projectId && projectName) {
    const kind = idea.linkType === "spinoff" ? "spinoff" : "feature";
    const suffix =
      idea.analysisStatus === "enriched" ? " · researched" : "";
    return { label: `${projectName} · ${kind}${suffix}`, tone: "blue" };
  }

  if (idea.linkType === "standalone") {
    return {
      label:
        idea.analysisStatus === "enriched"
          ? "standalone · researched"
          : "standalone",
      tone: "violet",
    };
  }

  return { label: "unsorted", tone: "amber" };
}

export function IdeaBadge({
  idea,
  projectName = null,
}: {
  idea: Pick<
    Idea,
    "analysisStatus" | "linkType" | "projectId" | "linkConfidence"
  >;
  projectName?: string | null;
}) {
  const { label, tone } = describeIdea(idea, projectName);
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-5 ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}
