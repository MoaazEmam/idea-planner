import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AnalysisView } from "./analysis-view";
import { IdeaDetail } from "./idea-detail";
import { LinkedAnalysisView } from "./linked-analysis-view";
import type { Idea } from "@/db/schema";
import { parseStoredAnalysis } from "@/lib/analysis/schema";
import { formatRelativeTime } from "@/lib/format";
import { getIdea } from "@/lib/ideas";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

function routingLabel(idea: Idea, projectName: string | null): string {
  if (idea.analysisStatus === "new") return "Not routed yet";
  if (idea.linkType === "standalone") return "Standalone";
  if (idea.linkType && projectName) return `${idea.linkType} → ${projectName}`;
  if (idea.linkType) return idea.linkType;
  if (idea.analysisStatus === "failed") return "Routing failed";
  return "Unsorted";
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default async function IdeaPage(props: PageProps<"/ideas/[id]">) {
  const { id } = await props.params;
  const idea = await getIdea(id);

  if (!idea) {
    notFound();
  }

  const project = idea.projectId ? await getProject(idea.projectId) : undefined;
  const analysis = parseStoredAnalysis(idea.analysis);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        href="/"
        className="text-sm text-neutral-500 transition hover:text-neutral-300"
      >
        ← Inbox
      </Link>

      <div className="mt-6">
        <IdeaDetail idea={idea} />
      </div>

      <dl className="mt-8 space-y-2 text-sm text-neutral-500">
        <Row label="Captured" value={formatRelativeTime(idea.createdAt)} />
        <Row label="Routing" value={routingLabel(idea, project?.name ?? null)} />
        {idea.analysisStatus !== "new" && idea.linkConfidence !== null ? (
          <Row
            label="Confidence"
            value={`${Math.round(idea.linkConfidence * 100)}%${
              idea.linkSource ? ` · ${idea.linkSource}` : ""
            }`}
          />
        ) : null}
        <Row label="Analysis" value={idea.analysisStatus} />
        {idea.processedAt ? (
          <Row
            label="Researched"
            value={formatRelativeTime(idea.processedAt)}
          />
        ) : null}
        {idea.analysisError ? (
          <Row
            label="Error"
            value={<span className="text-red-400">{idea.analysisError}</span>}
          />
        ) : null}
      </dl>

      {analysis ? (
        <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-5 text-xs uppercase tracking-widest text-neutral-500">
            {analysis.kind === "standalone" ? "Research" : "Project analysis"}
          </h2>
          {analysis.kind === "standalone" ? (
            <AnalysisView analysis={analysis} />
          ) : (
            <LinkedAnalysisView analysis={analysis} />
          )}
        </section>
      ) : null}
    </main>
  );
}
