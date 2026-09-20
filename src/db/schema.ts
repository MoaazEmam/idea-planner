import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Projects are the things ideas can be linked to. `context` is the field the
 * project-linked analysis prompt reads, so it is deliberately free-form.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  oneLiner: text("one_liner"),
  context: text("context"),
  status: text("status").notNull().default("active"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Enrichment columns (analysis, routing, link metadata) arrive in Phase 3+.
 */
export const ideas = pgTable("ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  rawText: text("raw_text").notNull(),
  status: text("status").notNull().default("inbox"),
  captureKey: text("capture_key").unique(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
