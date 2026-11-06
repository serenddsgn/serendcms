CREATE TABLE "maintenance_mode" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"headline_de" text DEFAULT 'Wir überarbeiten unsere [[Webseite]]' NOT NULL,
	"headline_en" text DEFAULT 'We are reworking our [[website]]' NOT NULL,
	"logo_media_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "maintenance_singleton_check" CHECK ("maintenance_mode"."singleton" = true)
);
--> statement-breakpoint
ALTER TABLE "maintenance_mode" ADD CONSTRAINT "maintenance_mode_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_mode" ADD CONSTRAINT "maintenance_mode_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "maintenance_mode" ("singleton") VALUES (true) ON CONFLICT DO NOTHING;
