"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_PRIMARY, CONTROL, FIELD } from "@/components/button";
import type { Project } from "@/db/schema";
import { PROJECT_STATUSES } from "@/lib/validation/projects";

type Props =
  | { mode: "create"; project?: undefined }
  | { mode: "edit"; project: Project };

export function ProjectForm(props: Props) {
  const { mode } = props;
  const project = mode === "edit" ? props.project : undefined;
  const router = useRouter();

  const [name, setName] = useState(project?.name ?? "");
  const [oneLiner, setOneLiner] = useState(project?.oneLiner ?? "");
  const [context, setContext] = useState(project?.context ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [archived, setArchived] = useState(Boolean(project?.archivedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fieldClass = FIELD;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const endpoint =
        mode === "create" ? "/api/projects" : `/api/projects/${project!.id}`;
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          one_liner: oneLiner,
          context,
          status,
          ...(mode === "edit" ? { archived } : {}),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? `Request failed (${response.status})`);
      }

      if (mode === "create") {
        setName("");
        setOneLiner("");
        setContext("");
        setStatus("active");
        router.refresh();
      } else {
        setNotice("Saved.");
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="project-name" className="text-xs text-neutral-500">
          Name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          className={fieldClass}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="project-one-liner" className="text-xs text-neutral-500">
          One-liner
        </label>
        <input
          id="project-one-liner"
          value={oneLiner}
          onChange={(event) => setOneLiner(event.target.value)}
          placeholder="What it is, in one sentence"
          className={fieldClass}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="project-context" className="text-xs text-neutral-500">
          Context
        </label>
        <textarea
          id="project-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          rows={8}
          placeholder="What it does, who it's for, current scope, stack, what's in and out…"
          className={`${fieldClass} resize-y leading-relaxed`}
        />
        <p className="text-xs text-neutral-600">
          This is what the linked analysis will read.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <div className="space-y-1">
          <label htmlFor="project-status" className="text-xs text-neutral-500">
            Status
          </label>
          <select
            id="project-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={CONTROL}
          >
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {mode === "edit" ? (
          <label className="flex items-center gap-2 pt-4 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
              className="size-4 accent-neutral-300"
            />
            Archived
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || name.trim().length === 0}
          className={BUTTON_PRIMARY}
        >
          {saving
            ? "Saving…"
            : mode === "create"
              ? "Add project"
              : "Save changes"}
        </button>
        {error ? <span className="text-sm text-red-400">{error}</span> : null}
        {notice ? (
          <span className="text-sm text-emerald-400">{notice}</span>
        ) : null}
      </div>
    </form>
  );
}
