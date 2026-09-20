import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Phase 1 keeps the schema intentionally thin: capture and read back only.
 * Enrichment columns (analysis, routing, link metadata) arrive in Phase 3+.
 */
export const ideas = pgTable("ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  rawText: text("raw_text").notNull(),
  status: text("status").notNull().default("inbox"),
  captureKey: text("capture_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
