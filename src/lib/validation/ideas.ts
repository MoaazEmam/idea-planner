import { z } from "zod";

export const createIdeaSchema = z.object({
  raw_text: z
    .string()
    .trim()
    .min(1, "raw_text must not be empty")
    .max(20000, "raw_text is too long"),
});

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;

export const updateIdeaSchema = z.object({
  raw_text: z
    .string()
    .trim()
    .min(1, "raw_text must not be empty")
    .max(20000, "raw_text is too long"),
});

export type UpdateIdeaInput = z.infer<typeof updateIdeaSchema>;

/**
 * Manual sorting payload. `unsorted` parks the idea, `standalone` sends it to
 * market research, and a feature/spinoff requires a project.
 */
export const routeIdeaSchema = z.discriminatedUnion("link_type", [
  z.object({ link_type: z.literal("unsorted") }),
  z.object({ link_type: z.literal("standalone") }),
  z.object({
    link_type: z.enum(["feature", "spinoff"]),
    project_id: z.string().trim().min(1, "project_id is required"),
  }),
]);

export type RouteIdeaInput = z.infer<typeof routeIdeaSchema>;
