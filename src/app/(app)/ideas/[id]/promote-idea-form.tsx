"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_PRIMARY, BUTTON_QUIET, FIELD } from "@/components/button";

export function PromoteIdeaForm({
  ideaId,
  defaults,
}: {
  ideaId: string;
  defaults: { name: string; oneLiner: string; context: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaults.name);
  const [oneLiner, setOneLiner] = useState(defaults.oneLiner);
  const [context, setContext] = useState(defaults.context);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${ideaId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          one_liner: oneLiner,
          context,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        projectId?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.projectId) {
        throw new Error(data?.error ?? `Request failed (${response.status})`);
      }
      router.push(`/projects/${data.projectId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not promote.");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={BUTTON_PRIMARY}
      >
        Promote to project
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="promote-name" className="text-xs text-neutral-500">
          Name
        </label>
        <input
          id="promote-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="promote-one-liner" className="text-xs text-neutral-500">
          One-liner
        </label>
        <input
          id="promote-one-liner"
          value={oneLiner}
          onChange={(event) => setOneLiner(event.target.value)}
          className={FIELD}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="promote-context" className="text-xs text-neutral-500">
          Context
        </label>
        <textarea
          id="promote-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          rows={10}
          className={`${FIELD} resize-y leading-relaxed`}
        />
        <p className="text-xs text-neutral-600">
          Pre-filled from the analysis. Edit before creating if you like.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving || name.trim().length === 0}
          className={BUTTON_PRIMARY}
        >
          {saving ? "Creating…" : "Create project"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className={BUTTON_QUIET}
        >
          Cancel
        </button>
        {error ? <span className="text-sm text-red-400">{error}</span> : null}
      </div>
    </form>
  );
}
