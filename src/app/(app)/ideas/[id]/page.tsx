import Link from "next/link";
import { notFound } from "next/navigation";
import { IdeaDetail } from "./idea-detail";
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
        ← Inbox
      </Link>

      <div className="mt-6">
        <IdeaDetail idea={idea} />
      </div>

      <dl className="mt-8 space-y-2 text-sm text-neutral-500">
        <div className="flex justify-between gap-4">
          <dt>Captured</dt>
          <dd>{formatRelativeTime(idea.createdAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Updated</dt>
          <dd>{formatRelativeTime(idea.updatedAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Status</dt>
          <dd>{idea.status}</dd>
        </div>
      </dl>
    </main>
  );
}
