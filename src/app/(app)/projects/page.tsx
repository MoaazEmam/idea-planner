import Link from "next/link";
import { ProjectForm } from "./project-form";
import { countsByProject, listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const { archived } = await props.searchParams;
  const showArchived = archived === "1";
  const projects = await listProjects({ includeArchived: showArchived });
  const counts = await countsByProject();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-10 px-5 py-8">
      <section>
        <h1 className="text-lg font-semibold">New project</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ideas get routed against your projects, so keep this list current.
        </p>
        <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <ProjectForm mode="create" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">
            {showArchived ? "All projects" : "Projects"} ({projects.length})
          </h2>
          <Link
            href={showArchived ? "/projects" : "/projects?archived=1"}
            className="text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-neutral-500">No projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-neutral-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-neutral-100">
                      {project.name}
                    </p>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {counts.get(project.id) ?? 0} ideas ·{" "}
                      {project.archivedAt ? "archived" : project.status}
                    </span>
                  </div>
                  {project.oneLiner ? (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-400">
                      {project.oneLiner}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
