"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Idea } from "@/db/schema";
import { isAnalysisStale } from "@/lib/analysis/state";

export function IdeaDetail({ idea }: { idea: Idea }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(idea.rawText);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = isAnalysisStale(idea);

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy || text.trim().length === 0}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
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
              className="text-sm text-neutral-500 transition hover:text-neutral-300"
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

      <div className="flex items-center gap-5 text-sm">
        {editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-neutral-400 transition hover:text-neutral-100"
          >
            Edit
          </button>
        )}
        {editing ? null : (
          <button
            type="button"
            onClick={reanalyze}
            disabled={busy || analyzing}
            className="text-neutral-400 transition hover:text-neutral-100 disabled:opacity-40"
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
          className="text-neutral-500 transition hover:text-red-400 disabled:opacity-40"
        >
          Delete
        </button>
        {stale && !analyzing ? (
          <span className="text-amber-400">Edited since last analysis</span>
        ) : null}
        {error ? <span className="text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}
