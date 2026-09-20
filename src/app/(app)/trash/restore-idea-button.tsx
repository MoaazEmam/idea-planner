"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RestoreIdeaButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function restore() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/ideas/${id}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3 text-sm">
      <button
        type="button"
        onClick={restore}
        disabled={busy}
        className="text-neutral-400 transition hover:text-neutral-100 disabled:opacity-40"
      >
        {busy ? "Restoring…" : "Restore"}
      </button>
      {error ? <span className="text-red-400">Failed</span> : null}
    </div>
  );
}
