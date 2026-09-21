import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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
 * Enrichment lifecycle:
 *   analysis_status: new -> processing -> routed -> (enriched | failed)
 *   routing: link_type/link_source/link_confidence/project_id set, idea "routed"
 *   unsorted is represented as routed with link_type and project_id both null
 */
export const ideas = pgTable(
  "ideas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawText: text("raw_text").notNull(),
    captureKey: text("capture_key").unique(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    analysisStatus: text("analysis_status").notNull().default("new"),
    analysisAttempts: integer("analysis_attempts").notNull().default(0),

    linkType: text("link_type"),
    linkSource: text("link_source"),
    linkConfidence: real("link_confidence"),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    analysis: jsonb("analysis"),
    analysisRaw: text("analysis_raw"),
    analysisError: text("analysis_error"),

    routedAt: timestamp("routed_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ideas_analysis_status_idx").on(table.analysisStatus)],
);

/**
 * Append-only clarifications for an idea. Kept in their own table rather than a
 * column so the original capture is never rewritten, and so each addition can
 * be deleted on its own. Ordering by created_at is the order they are fed to the
 * analyser, which makes the source hash stable.
 */
export const ideaAdditions = pgTable(
  "idea_additions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idea_additions_idea_id_idx").on(table.ideaId, table.createdAt),
  ],
);

export type IdeaAddition = typeof ideaAdditions.$inferSelect;
export type NewIdeaAddition = typeof ideaAdditions.$inferInsert;

/**
 * One row per nightly (or manual) processing run. The GitHub Actions loop
 * passes a stable runId so counters accumulate across its per-idea requests.
 */export const processingRuns = pgTable("processing_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull().default("manual"),
  status: text("status").notNull().default("running"),
  claimed: integer("claimed").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  searches: integer("searches").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type ProcessingRun = typeof processingRuns.$inferSelect;

/**
 * Login brute-force guard. Serverless functions share no memory, so the failed
 * attempts are counted in Postgres keyed by client IP. Old rows are pruned
 * opportunistically by the same code that writes them.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    successful: boolean("successful").notNull().default(false),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("login_attempts_ip_attempted_at_idx").on(table.ip, table.attemptedAt),
  ],
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;

