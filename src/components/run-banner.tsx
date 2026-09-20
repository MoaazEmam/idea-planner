import Link from "next/link";
import type { ProcessingRun } from "@/db/schema";
import { formatRelativeTime } from "@/lib/format";

export function RunBanner({ run }: { run?: ProcessingRun }) {
  if (!run) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-500">
        No enrichment runs yet.
      </div>
    );
  }

  const running = run.status === "running";
  const summary = [
    `${run.processed} ${run.processed === 1 ? "idea" : "ideas"}`,
    run.searches > 0 ? `${run.searches} searches` : null,
    run.failed > 0 ? `${run.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href="/runs"
      className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-neutral-700"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-400">
          {running
            ? "Enrichment running…"
            : `Last run ${formatRelativeTime(run.startedAt)}`}
        </span>
        <span className="shrink-0 text-[11px] text-neutral-600">
          {run.trigger}
        </span>
      </div>
      <p className="mt-1 text-xs">
        <span className="text-neutral-500">{running ? "In progress" : summary}</span>
        {!running && run.failed > 0 ? (
          <span className="text-amber-400"> · check failures</span>
        ) : null}
      </p>
    </Link>
  );
}
