-- Phase 5 (#13): dual-verified inspections. venues.last_inspection_date stays
-- as a cached copy of the latest confirmed inspection; run
-- `pnpm inspections:import-legacy` to load the corrected legacy dates.
CREATE TYPE "public"."inspection_kind" AS ENUM('verified', 'legacy');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('pending', 'confirmed', 'lapsed');--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"inspection_date" date NOT NULL,
	"status" "inspection_status" DEFAULT 'pending' NOT NULL,
	"kind" "inspection_kind" DEFAULT 'verified' NOT NULL,
	"first_admin_id" text,
	"first_admin_name" text,
	"second_admin_id" text,
	"second_admin_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "inspections_two_different_admins" CHECK ("inspections"."first_admin_id" is null or "inspections"."second_admin_id" is null or "inspections"."first_admin_id" <> "inspections"."second_admin_id")
);
--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_first_admin_id_user_id_fk" FOREIGN KEY ("first_admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_second_admin_id_user_id_fk" FOREIGN KEY ("second_admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_one_pending_per_venue" ON "inspections" USING btree ("venue_id") WHERE "inspections"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_one_legacy_per_venue_date" ON "inspections" USING btree ("venue_id","inspection_date") WHERE "inspections"."kind" = 'legacy';--> statement-breakpoint
CREATE INDEX "inspections_venue_date_idx" ON "inspections" USING btree ("venue_id","inspection_date");