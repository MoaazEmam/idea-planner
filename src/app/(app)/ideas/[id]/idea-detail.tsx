"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_QUIET,
} from "@/components/button";
import type { Idea } from "@/db/schema";
import { isAnalysisStale } from "@/lib/analysis/state";

export function IdeaDetail({
  idea,
  additions = [],
}: {
  idea: Idea;
  additions?: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(idea.rawText);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = isAnalysisStale(idea, additions);

  async function save() {
    const value = text.trim();
    if (!value || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: value }),
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) {
      return;
    }
    if (!window.confirm("Delete this idea? It will be removed from the inbox.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${idea.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not delete.");
      setBusy(false);
    }
  }

  async function reanalyze() {
    if (busy || analyzing) {
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${idea.id}/reanalyze`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message ?? `Request failed (${response.status})`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-analyze.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            autoFocus
            className="w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base leading-relaxed text-neutral-100 outline-none focus:border-neutral-600"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || text.trim().length === 0}
              className={BUTTON_PRIMARY}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(idea.rawText);
                setEditing(false);
                setError(null);
              }}
              className={BUTTON_QUIET}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <article className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-100">
            {idea.rawText}
          </p>
        </article>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={BUTTON_QUIET}
          >
            Edit
          </button>
        )}
        {editing ? null : (
          <button
            type="button"
            onClick={reanalyze}
            disabled={busy || analyzing}
            className={BUTTON_QUIET}
          >
            {analyzing
              ? "Analyzing…"
              : idea.analysisStatus === "new"
                ? "Analyze now"
                : "Re-analyze"}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy || analyzing}
          className={BUTTON_DANGER}
        >
          Delete
        </button>
        {stale && !analyzing ? (
          <span className="px-2 text-amber-400">Edited since last analysis</span>
        ) : null}
        {error ? <span className="px-2 text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}
