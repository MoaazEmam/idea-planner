import { z } from "zod";

export const STANDALONE_PROMPT_VERSION = 2;
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
/* Personal-tool lens: is this worth building at all, and what already does   */
/* the job? Added alongside the commercial scores, never instead of them.     */
/* -------------------------------------------------------------------------- */

/**
 * The honest answers, including the ones that say "do not build this". Ordered
 * from build to not-build; `simpler_form` is distinct from `do_nothing` because
 * "you need a script, not an app" is actionable advice.
 */
export const PERSONAL_BUILD_VERDICTS = [
  "build",
  "fork",
  "use_free",
  "buy",
  "simpler_form",
  "do_nothing",
] as const;

export const ALTERNATIVE_KINDS = [
  "oss_selfhost",
  "oss_cloud",
  "paid_saas",
  "freemium",
  "manual",
] as const;

export const ALTERNATIVE_COVERAGE = ["full", "partial", "adjacent"] as const;

/**
 * One comparable tool. Pricing and license are free text on purpose: the
 * grounded sources rarely state them cleanly, and "unknown (check)" is a valid,
 * useful answer that a numeric field could not carry.
 */
const alternativeSchema = z.object({
  name: z.string().min(1).max(150),
  kind: z.enum(ALTERNATIVE_KINDS),
  license: z.string().max(80).optional(),
  pricing: z.string().max(300).optional(),
  /** When the source stated the price, so a stale price is visible as stale. */
  priced_at: z.string().max(40).optional(),
  hosting: z.enum(["self", "cloud", "both"]).optional(),
  coverage: z.enum(ALTERNATIVE_COVERAGE),
  notes: z.string().min(1).max(700),
  /** Only a real URL from the research sources, never one the model invented. */
  url: z.string().max(500).optional(),
});

export const personalBuildSchema = z.object({
  verdict: z.enum(PERSONAL_BUILD_VERDICTS),
  verdict_reason: z.string().min(1).max(900),
  worth_it: scoreSchema,
  build_effort: z.object({
    size: z.enum(["small", "medium", "large"]),
    estimated_hours: z.number().nonnegative().max(10000).optional(),
    reason: z.string().min(1).max(700),
  }),
  running_cost: z.object({
    monthly_estimate: z.number().nonnegative().max(100000).nullable().optional(),
    notes: z.string().max(500),
  }),
  maintenance: z.object({
    risk: z.enum(["low", "medium", "high"]),
    reason: z.string().min(1).max(500),
  }),
  alternatives: z.array(alternativeSchema).max(10).default([]),
  cheapest_adequate: z
    .object({
      name: z.string().min(1).max(150),
      cost: z.string().min(1).max(200),
      notes: z.string().max(500),
    })
    .optional(),
  mvp_scope: z.array(z.string().min(1).max(400)).max(10).default([]),
  unknowns: z.array(z.string().min(1).max(400)).max(10).default([]),
  revisit_trigger: z.string().max(400).optional(),
});

export type PersonalBuild = z.infer<typeof personalBuildSchema>;
export type Alternative = z.infer<typeof alternativeSchema>;

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
  /**
   * Optional: only present when the analysis was run in personal-tool mode.
   * Absent on every stored v1 analysis and on ordinary nightly standalone runs,
   * which is what keeps old rows parsing after the v2 bump.
   */
  personal_build: personalBuildSchema.optional(),
});

export type StandaloneAnalysis = z.infer<typeof standaloneAnalysisSchema>;

/**
 * The LLM-call schema for personal mode: identical to the standalone schema but
 * `personal_build` is required, so a run that silently omits it fails validation
 * and gets repaired instead of storing a half-answer.
 */
export const personalStandaloneAnalysisSchema = standaloneAnalysisSchema.extend({
  personal_build: personalBuildSchema,
});

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
  /** Hash of the idea text this analysis was produced from. */
  sourceHash?: string;
  searchQueries: string[];
  sources: AnalysisSource[];
};

const standaloneStoredSchema = standaloneAnalysisSchema.extend({
  kind: z.literal("standalone"),
  promptVersion: z.number().int(),
  model: z.string(),
  generatedAt: z.string(),
  sourceHash: z.string().optional(),
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
  /** Hash of the idea text this analysis was produced from. */
  sourceHash?: string;
  /** Project name is snapshotted so the analysis reads correctly after a rename. */
  projectId: string;
  projectName: string;
  linkType: "feature" | "spinoff";
  /**
   * Present for spinoffs, which also run standalone market research because a
   * spinoff is its own product. Absent when the research half failed.
   */
  research?: StandaloneStoredAnalysis;
};

const linkedStoredSchema = linkedAnalysisSchema.extend({
  kind: z.literal("linked"),
  promptVersion: z.number().int(),
  model: z.string(),
  generatedAt: z.string(),
  sourceHash: z.string().optional(),
  projectId: z.string(),
  projectName: z.string(),
  linkType: z.enum(["feature", "spinoff"]),
  research: standaloneStoredSchema.optional(),
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
