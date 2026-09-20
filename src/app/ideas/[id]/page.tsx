import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRelativeTime } from "@/lib/format";
import { getIdea } from "@/lib/ideas";

export const dynamic = "force-dynamic";

export default async function IdeaPage(props: PageProps<"/ideas/[id]">) {
  const { id } = await props.params;
  const idea = await getIdea(id);

  if (!idea) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        href="/"
        className="text-sm text-neutral-500 transition hover:text-neutral-300"
      >
        ← Back
      </Link>

      <article className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-100">
          {idea.rawText}
        </p>
      </article>

      <dl className="mt-6 space-y-2 text-sm text-neutral-500">
        <div className="flex justify-between gap-4">
          <dt>Captured</dt>
          <dd>{formatRelativeTime(idea.createdAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Status</dt>
          <dd>{idea.status}</dd>
        </div>
      </dl>
    </main>
  );
}
