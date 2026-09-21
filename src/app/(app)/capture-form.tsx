"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_PRIMARY } from "@/components/button";

export function CaptureForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: value }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      setText("");
      router.refresh();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={5}
        autoFocus
        placeholder="Capture an idea…"
        className="w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            "⌘/Ctrl + Enter to save"
          )}
        </p>
        <button
          type="submit"
          disabled={saving || text.trim().length === 0}
          className={BUTTON_PRIMARY}
        >
          {saving ? "Saving…" : "Capture"}
        </button>
      </div>
    </form>
  );
}
