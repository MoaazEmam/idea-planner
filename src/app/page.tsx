import Link from "next/link";
import { CaptureForm } from "./capture-form";
import { formatRelativeTime } from "@/lib/format";
import { listIdeas } from "@/lib/ideas";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ideas = await listIdeas();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Idea Inbox</h1>
        <form action="/api/logout" method="post">
          <button className="text-sm text-neutral-500 transition hover:text-neutral-300">
            Log out
          </button>
        </form>
      </header>

      <CaptureForm />

      <section className="mt-10 space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500">
          Recent ({ideas.length})
        </h2>

        {ideas.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing captured yet.</p>
        ) : (
          <ul className="space-y-2">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/ideas/${idea.id}`}
                  className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-neutral-700"
                >
                  <p className="line-clamp-2 text-neutral-100">
                    {idea.rawText}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatRelativeTime(idea.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
