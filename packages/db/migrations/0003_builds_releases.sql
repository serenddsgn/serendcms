CREATE TABLE "builds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text NOT NULL,
	"triggered_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_summary" text,
	"log" text,
	"checks" jsonb,
	"manifest" jsonb,
	CONSTRAINT "builds_status_check" CHECK ("builds"."status" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "builds_trigger_check" CHECK ("builds"."trigger" in ('publish', 'manual', 'deploy', 'settings'))
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"build_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builds_requested_idx" ON "builds" USING btree ("requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "builds_one_queued_key" ON "builds" USING btree ("status") WHERE "builds"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "builds_one_running_key" ON "builds" USING btree ("status") WHERE "builds"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "releases_one_active_key" ON "releases" USING btree ("is_active") WHERE "releases"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "releases_build_key" ON "releases" USING btree ("build_id");