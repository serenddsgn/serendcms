CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"alt_text" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"focal_x" smallint DEFAULT 50 NOT NULL,
	"focal_y" smallint DEFAULT 50 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_focal_x_range" CHECK ("media"."focal_x" between 0 and 100),
	CONSTRAINT "media_focal_y_range" CHECK ("media"."focal_y" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "project_media" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"revision_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt_override" text,
	CONSTRAINT "project_media_role_check" CHECK ("project_media"."role" in ('gallery', 'block'))
);
--> statement-breakpoint
CREATE TABLE "project_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" jsonb,
	"year" smallint NOT NULL,
	"categories" text[] NOT NULL,
	"color" text NOT NULL,
	"tile_color" text,
	"client" text,
	"live_url" text,
	"cover_media_id" uuid,
	"next_project_id" uuid,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"og_media_id" uuid,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_revisions_slug_format" CHECK ("project_revisions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "project_revisions_year_range" CHECK ("project_revisions"."year" between 2000 and 2100),
	CONSTRAINT "project_revisions_categories_check" CHECK (cardinality("project_revisions"."categories") between 1 and 4 and "project_revisions"."categories" <@ array['web','shop','brand','print']::text[]),
	CONSTRAINT "project_revisions_color_format" CHECK ("project_revisions"."color" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "project_revisions_tile_color_format" CHECK ("project_revisions"."tile_color" is null or "project_revisions"."tile_color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"translation_group_id" uuid DEFAULT uuidv7() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"featured_sort_order" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_locale_check" CHECK ("projects"."locale" in ('de', 'en')),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" smallint DEFAULT 301 NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_status_check" CHECK ("redirects"."status_code" = 301),
	CONSTRAINT "redirects_source_check" CHECK ("redirects"."source" in ('auto', 'manual')),
	CONSTRAINT "redirects_not_self" CHECK ("redirects"."from_path" <> "redirects"."to_path"),
	CONSTRAINT "redirects_locale_check" CHECK ("redirects"."locale" in ('de', 'en'))
);
--> statement-breakpoint
CREATE TABLE "slug_claims" (
	"locale" text NOT NULL,
	"scope" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "slug_claims_locale_scope_slug_pk" PRIMARY KEY("locale","scope","slug"),
	CONSTRAINT "slug_claims_scope_check" CHECK ("slug_claims"."scope" in ('project', 'page')),
	CONSTRAINT "slug_claims_locale_check" CHECK ("slug_claims"."locale" in ('de', 'en'))
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_revision_id_project_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."project_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_next_project_id_projects_id_fk" FOREIGN KEY ("next_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_og_media_id_media_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_published_revision_id_project_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."project_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_key" ON "media" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_media_unique" ON "project_media" USING btree ("revision_id","role","media_id");--> statement-breakpoint
CREATE INDEX "project_media_media_idx" ON "project_media" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_revisions_project_no_key" ON "project_revisions" USING btree ("project_id","revision_no");--> statement-breakpoint
CREATE INDEX "project_revisions_cover_idx" ON "project_revisions" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "project_revisions_og_idx" ON "project_revisions" USING btree ("og_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_group_locale_key" ON "projects" USING btree ("translation_group_id","locale");--> statement-breakpoint
CREATE INDEX "projects_locale_sort_idx" ON "projects" USING btree ("locale","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "redirects_from_path_key" ON "redirects" USING btree ("from_path");--> statement-breakpoint
CREATE INDEX "slug_claims_owner_idx" ON "slug_claims" USING btree ("owner_id");