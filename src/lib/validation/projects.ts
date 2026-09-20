import { z } from "zod";

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200),
  one_liner: optionalText(300),
  context: optionalText(20000),
  status: z.enum(PROJECT_STATUSES).default("active"),
  archived: z.boolean().optional(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
