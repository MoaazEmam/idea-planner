import { z } from "zod";

export const STANDALONE_PROMPT_VERSION = 1;
export const LINKED_PROMPT_VERSION = 1;

/**
 * Models occasionally answer on the wrong scale (0.85 meaning "85%", or 85 for
 * a percentage). Rather than burn a repair round-trip on that, normalise the
 * common cases and clamp into 1..10.
 */
const scoreValueSchema = z.preprocess((input) => {
  const numeric = typeof input === "string" ? Number(input) : input;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return input;
  }
  const scaled = numeric > 0 && numeric <= 1 ? numeric * 10 : numeric;
  return Math.min(10, Math.max(1, Math.round(scaled)));
}, z.number().int().min(1).max(10));

const scoreSchema = z.object({
  value: scoreValueSchema,
  reason: z.string().min(1).max(400),
});

/* -------------------------------------------------------------------------- */
/* Standalone: is this worth building as its own thing, against the web?      */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately flat and bounded: every string has a cap so one runaway response
 * cannot bloat the jsonb column, and every score carries its own reason.
 */
export const standaloneAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  market_landscape: z.string().min(1).max(2500),
  existing_solutions: z
    .array(
      z.object({
        name: z.string().min(1).max(150),
        notes: z.string().min(1).max(700),
        gap: z.string().max(700).default(""),
      }),
    )
    .max(8)
    .default([]),
  feasibility: z.string().min(1).max(2500),
  suggested_features: z.array(z.string().min(1).max(400)).min(1).max(12),
  risks: z.array(z.string().min(1).max(400)).max(10).default([]),
  next_step: z.string().min(1).max(700),
  scores: z.object({
    market: scoreSchema,
    differentiation: scoreSchema,
    feasibility: scoreSchema,
    monetization: scoreSchema,
  }),
});

export type StandaloneAnalysis = z.infer<typeof standaloneAnalysisSchema>;

export type AnalysisSource = { title: string; url: string };

/**
 * The model output plus provenance. `sources` comes from the research provider,
 * never from the model, so links shown in the UI are always real.
 */
export type StandaloneStoredAnalysis = StandaloneAnalysis & {
  kind: "standalone";
  promptVersion: number;
  model: string;
  generatedAt: string;
  searchQueries: string[];
  sources: AnalysisSource[];
};

const standaloneStoredSchema = standaloneAnalysisSchema.extend({
  kind: z.literal("standalone"),
  promptVersion: z.number().int(),
  model: z.string(),
  generatedAt: z.string(),
  searchQueries: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

/* -------------------------------------------------------------------------- */
/* Linked: does this belong in this project, and how would it be built?       */
/* -------------------------------------------------------------------------- */

export const LINKED_SCOPE_FITS = [
  "in_scope",
  "scope_creep",
  "separate_product",
] as const;
export const LINKED_RECOMMENDATIONS = ["do_now", "do_later", "skip"] as const;
export const LINKED_EFFORTS = ["small", "medium", "large"] as const;

export const linkedAnalysisSchema = z.object({
  summary: z.string().min(1).max(1500),
  scope_fit: z.object({
    verdict: z.enum(LINKED_SCOPE_FITS),
    reason: z.string().min(1).max(700),
  }),
  recommendation: z.enum(LINKED_RECOMMENDATIONS),
  recommendation_reason: z.string().min(1).max(700),
  implementation: z.string().min(1).max(3000),
  effort: z.object({
    size: z.enum(LINKED_EFFORTS),
    reason: z.string().min(1).max(700),
  }),
  scores: z.object({
    impact: scoreSchema,
    confidence: scoreSchema,
  }),
  risks: z.array(z.string().min(1).max(400)).max(10).default([]),
  open_questions: z.array(z.string().min(1).max(400)).max(10).default([]),
  next_step: z.string().min(1).max(700),
});

export type LinkedAnalysis = z.infer<typeof linkedAnalysisSchema>;

export type LinkedStoredAnalysis = LinkedAnalysis & {
  kind: "linked";
  promptVersion: number;
  model: string;
  generatedAt: string;
  /** Project name is snapshotted so the analysis reads correctly after a rename. */
  projectId: string;
  projectName: string;
  linkType: "feature" | "spinoff";
};

const linkedStoredSchema = linkedAnalysisSchema.extend({
  kind: z.literal("linked"),
  promptVersion: z.number().int(),
  model: z.string(),
  generatedAt: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  linkType: z.enum(["feature", "spinoff"]),
});

/* -------------------------------------------------------------------------- */

export type StoredAnalysis = StandaloneStoredAnalysis | LinkedStoredAnalysis;

/** Reads the jsonb column defensively; returns null if it is not our shape. */
export function parseStoredAnalysis(value: unknown): StoredAnalysis | null {
  if (value && typeof value === "object" && "kind" in value) {
    const kind = (value as { kind?: unknown }).kind;
    if (kind === "linked") {
      const parsed = linkedStoredSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    }
  }

  const parsed = standaloneStoredSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
