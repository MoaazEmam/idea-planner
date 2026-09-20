CREATE TABLE "processing_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"claimed" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "analysis_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "analysis_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "analysis_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "link_type" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "link_source" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "link_confidence" real;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "analysis_raw" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "analysis_error" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "routed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "lock_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_analysis_status_idx" ON "ideas" USING btree ("analysis_status");