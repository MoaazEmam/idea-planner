"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_PRIMARY, CONTROL } from "@/components/button";

type ProjectOption = { id: string; name: string };

const UNSORTED = "unsorted";
const STANDALONE = "standalone";

export function RoutingControls({
  ideaId,
  projectId,
  linkType,
  projects,
}: {
  ideaId: string;
  projectId: string | null;
  linkType: string | null;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState(
    projectId ?? (linkType === "standalone" ? STANDALONE : UNSORTED),
  );
  const [kind, setKind] = useState<"feature" | "spinoff">(
    linkType === "spinoff" ? "spinoff" : "feature",
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProject = target !== UNSORTED && target !== STANDALONE;
  const unchanged =
    !isProject &&
    ((target === UNSORTED && !projectId && linkType !== "standalone") ||
      (target === STANDALONE && linkType === "standalone"));

  async function apply() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const body = isProject
        ? { link_type: kind, project_id: target }
        : { link_type: target };
      const response = await fetch(`/api/ideas/${ideaId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message ?? `Request failed (${response.status})`,
        );
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update routing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setDone(false);
          }}
          disabled={busy}
          className={CONTROL}
          aria-label="Where this idea belongs"
        >
          <option value={UNSORTED}>Unsorted</option>
          <option value={STANDALONE}>Standalone — market research</option>
          {projects.length > 0 ? (
            <optgroup label="Link to project">
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>

        {isProject ? (
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value === "spinoff" ? "spinoff" : "feature")
            }
            disabled={busy}
            className={CONTROL}
            aria-label="Link type"
          >
            <option value="feature">Feature</option>
            <option value="spinoff">Spinoff</option>
          </select>
        ) : null}

        <button
          type="button"
          onClick={apply}
          disabled={busy || unchanged}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Analyzing…" : "Apply"}
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        {busy
          ? "Routing and analyzing — this can take ~20s."
          : done
            ? "Updated."
            : "Standalone runs market research; a project runs a fit analysis."}
      </p>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
