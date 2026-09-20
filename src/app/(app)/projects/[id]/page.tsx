import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectForm } from "../project-form";
import { formatRelativeTime } from "@/lib/format";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

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
    </main>
  );
}
