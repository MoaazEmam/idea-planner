"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BUTTON_PRIMARY } from "@/components/button";
import type { PersonalBuild } from "@/lib/analysis/schema";
import { PersonalBuildView } from "./personal-build-view";

type Tab = "product" | "personal";

const TABS: { id: Tab; label: string }[] = [
  { id: "product", label: "As a product" },
  { id: "personal", label: "As a personal tool" },
];

/**
 * Two independent reads of one idea. The commercial analysis arrives already
 * rendered (it is a server component); the personal lens is generated on demand
 * and lives in the second tab, so neither lens replaces the other.
 */
export function AnalysisTabs({
  ideaId,
  commercial,
  personalBuild,
}: {
  ideaId: string;
  commercial: ReactNode;
  personalBuild: PersonalBuild | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("product");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPersonal() {
    if (running) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${ideaId}/personal-analysis`, {
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
      setError(
        err instanceof Error ? err.message : "Could not run the personal lens.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Analysis lens"
        className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1"
      >
        {TABS.map((entry) => {
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(entry.id);
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "product" ? (
          commercial
        ) : (
          <div className="space-y-4">
            {personalBuild ? <PersonalBuildView build={personalBuild} /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runPersonal}
                disabled={running}
                className={BUTTON_PRIMARY}
              >
                {running
                  ? "Analyzing…"
                  : personalBuild
                    ? "Refresh personal lens"
                    : "Analyze as a personal tool"}
              </button>
              {error ? (
                <span className="text-sm text-red-400">{error}</span>
              ) : null}
            </div>
            {!personalBuild && !error ? (
              <p className="text-sm text-neutral-500">
                Weighs this against free and paid alternatives, estimates the
                effort and running cost, and decides whether it is worth
                building at all.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
