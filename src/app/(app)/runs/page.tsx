import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { listRuns } from "@/lib/jobs/runs";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await listRuns(50);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        href="/"
        className="text-sm text-neutral-500 transition hover:text-neutral-300"
      >
        ← Inbox
      </Link>

      <div className="mt-4">
        <h1 className="text-lg font-semibold">Enrichment runs</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Each nightly or manual run, newest first.
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">No runs yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {runs.map((run) => {
            const tokens = run.inputTokens + run.outputTokens;
            return (
              <li
                key={run.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-200">
                    {formatRelativeTime(run.startedAt)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                      run.failed > 0
                        ? "border-amber-800 bg-amber-950/40 text-amber-300"
                        : "border-neutral-700 text-neutral-400"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {run.trigger} · {run.processed} processed · {run.failed} failed
                  {run.searches > 0 ? ` · ${run.searches} searches` : ""}
                  {tokens > 0 ? ` · ${tokens} tokens` : ""}
                </p>
                {run.error ? (
                  <p className="mt-1 text-xs text-red-400">{run.error}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
