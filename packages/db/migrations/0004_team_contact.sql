CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_locale_check" CHECK ("contact_messages"."locale" in ('de', 'en')),
	CONSTRAINT "contact_status_check" CHECK ("contact_messages"."status" in ('new', 'read', 'spam', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"translation_group_id" uuid DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"role_title" text NOT NULL,
	"bio" text,
	"photo_media_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_locale_check" CHECK ("team_members"."locale" in ('de', 'en')),
	CONSTRAINT "team_status_check" CHECK ("team_members"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_photo_media_id_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "team_photo_idx" ON "team_members" USING btree ("photo_media_id");