import Link from "next/link";
import { RestoreIdeaButton } from "./restore-idea-button";
import { formatRelativeTime } from "@/lib/format";
import { listDeletedIdeas } from "@/lib/ideas";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const ideas = await listDeletedIdeas();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        href="/"
        className="text-sm text-neutral-500 transition hover:text-neutral-300"
      >
        ← Inbox
      </Link>

      <div className="mt-4">
        <h1 className="text-lg font-semibold">Trash</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Deleted ideas can be restored. Projects are deleted permanently.
        </p>
      </div>

      {ideas.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nothing deleted.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="line-clamp-2 text-neutral-400">{idea.rawText}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Deleted{" "}
                  {idea.deletedAt ? formatRelativeTime(idea.deletedAt) : ""}
                </p>
              </div>
              <RestoreIdeaButton id={idea.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
