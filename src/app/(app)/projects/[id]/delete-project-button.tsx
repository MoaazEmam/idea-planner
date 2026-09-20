"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) {
      return;
    }
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="text-sm text-neutral-500 transition hover:text-red-400 disabled:opacity-40"
    >
      {busy ? "Deleting…" : "Delete project"}
    </button>
  );
}
