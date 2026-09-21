"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_PRIMARY, BUTTON_QUIET, FIELD } from "@/components/button";
import { formatRelativeTime } from "@/lib/format";

type Addition = { id: string; text: string; createdAt: Date | string };

export function IdeaAdditions({
  ideaId,
  additions,
}: {
  ideaId: string;
  additions: Addition[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const value = text.trim();
    if (!value || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${ideaId}/additions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      setText("");
      router.refresh();
    } catch {
      setError("Could not add.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${ideaId}/additions/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      router.refresh();
    } catch {
      setError("Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-neutral-500">
        Additions{additions.length > 0 ? ` (${additions.length})` : ""}
      </h2>

      {additions.length > 0 ? (
        <ul className="space-y-2">
          {additions.map((addition) => (
            <li
              key={addition.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                {addition.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-neutral-600">
                  {formatRelativeTime(addition.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(addition.id)}
                  disabled={busy}
                  className={BUTTON_QUIET}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Add a clarification or a new thought…"
        className={`${FIELD} resize-y leading-relaxed`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={busy || text.trim().length === 0}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Adding…" : "Add"}
        </button>
        {error ? <span className="text-sm text-red-400">{error}</span> : null}
      </div>

      <p className="text-xs text-neutral-600">
        Additions are folded into the analysis on the next re-analyze. This is
        not a discussion thread.
      </p>
    </div>
  );
}
