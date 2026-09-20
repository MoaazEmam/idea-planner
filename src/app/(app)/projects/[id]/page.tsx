import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteProjectButton } from "./delete-project-button";
import { ProjectForm } from "../project-form";
import { IdeaBadge } from "@/components/idea-badge";
import { formatRelativeTime } from "@/lib/format";
import { getProject, listProjectIdeas } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  const ideas = await listProjectIdeas(project.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        href="/projects"
        className="text-sm text-neutral-500 transition hover:text-neutral-300"
      >
        ← Projects
      </Link>

      <div className="mt-4">
        <h1 className="text-lg font-semibold">{project.name}</h1>
        <p className="text-xs text-neutral-500">
          Updated {formatRelativeTime(project.updatedAt)}
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <ProjectForm mode="edit" project={project} />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500">
          Tagged ideas ({ideas.length})
        </h2>

        {ideas.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nothing linked yet. The nightly job tags ideas to this project when
            they match.
          </p>
        ) : (
          <ul className="space-y-2">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/ideas/${idea.id}`}
                  className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-neutral-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-neutral-100">
                      {idea.rawText}
                    </p>
                    <IdeaBadge idea={idea} projectName={project.name} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatRelativeTime(idea.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <DeleteProjectButton id={project.id} name={project.name} />
      </div>
    </main>
  );
}
