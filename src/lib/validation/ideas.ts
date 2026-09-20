import { z } from "zod";

export const createIdeaSchema = z.object({
  raw_text: z
    .string()
    .trim()
    .min(1, "raw_text must not be empty")
    .max(20000, "raw_text is too long"),
});

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;
