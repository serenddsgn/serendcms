CREATE TABLE "navigation_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"location" text NOT NULL,
	"label" text NOT NULL,
	"page_id" uuid,
	"url" text,
	"fragment" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "navigation_locale_check" CHECK ("navigation_items"."locale" in ('de', 'en')),
	CONSTRAINT "navigation_status_check" CHECK ("navigation_items"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "navigation_location_check" CHECK ("navigation_items"."location" in ('header', 'footer', 'legal')),
	CONSTRAINT "navigation_target_check" CHECK (("navigation_items"."page_id" is not null) <> ("navigation_items"."url" is not null))
);
--> statement-breakpoint
CREATE TABLE "page_media" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"revision_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" text DEFAULT 'block' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt_override" text,
	CONSTRAINT "page_media_role_check" CHECK ("page_media"."role" = 'block')
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"og_media_id" uuid,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_revisions_slug_format" CHECK ("page_revisions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"translation_group_id" uuid DEFAULT uuidv7() NOT NULL,
	"system_key" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_locale_check" CHECK ("pages"."locale" in ('de', 'en')),
	CONSTRAINT "pages_status_check" CHECK ("pages"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "pages_system_key_check" CHECK ("pages"."system_key" is null or "pages"."system_key" in ('home', 'projects'))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"translation_group_id" uuid DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_locale_check" CHECK ("services"."locale" in ('de', 'en')),
	CONSTRAINT "services_status_check" CHECK ("services"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "services_key_check" CHECK ("services"."key" in ('web', 'shop', 'brand', 'print'))
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"value" jsonb NOT NULL,
	"media_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_locale_check" CHECK ("site_settings"."locale" in ('de', 'en'))
);
--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_media" ADD CONSTRAINT "page_media_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_media" ADD CONSTRAINT "page_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_og_media_id_media_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_published_revision_id_page_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "navigation_locale_location_idx" ON "navigation_items" USING btree ("locale","location","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "page_media_unique" ON "page_media" USING btree ("revision_id","role","media_id");--> statement-breakpoint
CREATE INDEX "page_media_media_idx" ON "page_media" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_page_no_key" ON "page_revisions" USING btree ("page_id","revision_no");--> statement-breakpoint
CREATE INDEX "page_revisions_og_idx" ON "page_revisions" USING btree ("og_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_group_locale_key" ON "pages" USING btree ("translation_group_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_system_key_locale_key" ON "pages" USING btree ("locale","system_key") WHERE "pages"."system_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "services_locale_key_key" ON "services" USING btree ("locale","key");--> statement-breakpoint
CREATE UNIQUE INDEX "site_settings_key_locale_key" ON "site_settings" USING btree ("key","locale");