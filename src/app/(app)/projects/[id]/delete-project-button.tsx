"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_DANGER } from "@/components/button";

export function DeleteProjectButton({
  id,
  name,
  linkedCount,
}: {
  id: string;
  name: string;
  linkedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) {
      return;
    }
    const linked =
      linkedCount > 0
        ? ` Its ${linkedCount} linked ${
            linkedCount === 1 ? "idea" : "ideas"
          } will become unsorted.`
        : "";
    if (
      !window.confirm(`Delete "${name}"?${linked} This cannot be undone.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("Could not delete.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className={BUTTON_DANGER}
      >
        {busy ? "Deleting…" : "Delete project"}
      </button>
      {error ? <span className="text-sm text-red-400">{error}</span> : null}
    </div>
  );
}
