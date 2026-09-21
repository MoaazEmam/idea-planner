"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_QUIET } from "@/components/button";

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
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={restore}
        disabled={busy}
        className={BUTTON_QUIET}
      >
        {busy ? "Restoring…" : "Restore"}
      </button>
      {error ? <span className="text-red-400">Failed</span> : null}
    </div>
  );
}
