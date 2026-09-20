import { z } from "zod";

export const ANALYSIS_PROMPT_VERSION = 1;

const scoreSchema = z.object({
  value: z.number().int().min(1).max(10),
  reason: z.string().min(1).max(400),
});

/**
 * The contract the model must satisfy for a standalone idea. Deliberately flat
 * and bounded: every string has a cap so one runaway response cannot bloat the
 * jsonb column, and every score carries its own reason so the UI can justify it.
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
 * What actually lands in ideas.analysis. The model output plus provenance.
 * `sources` comes from the research provider, never from the model, so links
 * shown in the UI are always real.
 */
export type StoredAnalysis = StandaloneAnalysis & {
  kind: "standalone";
  promptVersion: number;
  model: string;
  generatedAt: string;
  searchQueries: string[];
  sources: AnalysisSource[];
};

const storedAnalysisSchema = standaloneAnalysisSchema.extend({
  kind: z.literal("standalone"),
  promptVersion: z.number().int(),
  model: z.string(),
  generatedAt: z.string(),
  searchQueries: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

/** Reads the jsonb column defensively; returns null if it is not our shape. */
export function parseStoredAnalysis(value: unknown): StoredAnalysis | null {
  const parsed = storedAnalysisSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
