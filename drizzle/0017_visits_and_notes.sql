CREATE TYPE "public"."note_visibility" AS ENUM('internal', 'public');--> statement-breakpoint
CREATE TABLE "venue_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"inspection_id" uuid,
	"visitor_id" text,
	"visitor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility" "note_visibility" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "visit_notes_body_length" CHECK (char_length(trim("visit_notes"."body")) between 1 and 4000),
	CONSTRAINT "visit_notes_internal_only" CHECK ("visit_notes"."visibility" = 'internal')
);
--> statement-breakpoint
ALTER TABLE "venue_visits" ADD CONSTRAINT "venue_visits_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_visits" ADD CONSTRAINT "venue_visits_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_visits" ADD CONSTRAINT "venue_visits_visitor_id_user_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_visit_id_venue_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."venue_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_visits_one_per_chair_day" ON "venue_visits" USING btree ("venue_id","visitor_id","visit_date") WHERE "venue_visits"."visitor_id" is not null;--> statement-breakpoint
CREATE INDEX "venue_visits_venue_date_idx" ON "venue_visits" USING btree ("venue_id","visit_date");--> statement-breakpoint
CREATE INDEX "venue_visits_inspection_idx" ON "venue_visits" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "visit_notes_visit_idx" ON "visit_notes" USING btree ("visit_id","created_at");--> statement-breakpoint
-- Backfill: one visit per Chair recorded on an existing verified inspection (pending, confirmed or
-- lapsed), dated the inspection's day and linked to it. Legacy inspections recorded no Chairs, so
-- they get none. Safe to re-run: a visit already linked to that inspection for that Chair is skipped,
-- and the one-per-Chair-per-day index skips anything else that would duplicate.
INSERT INTO "venue_visits" ("venue_id", "visit_date", "inspection_id", "visitor_id", "visitor_name", "created_at")
SELECT c."venue_id", c."inspection_date", c."id", c."visitor_id", c."visitor_name", c."created_at"
FROM (
  SELECT "venue_id", "inspection_date", "id", "first_admin_id" AS "visitor_id", "first_admin_name" AS "visitor_name", "created_at"
  FROM "inspections"
  WHERE "kind" = 'verified' AND ("first_admin_id" IS NOT NULL OR "first_admin_name" IS NOT NULL)
  UNION ALL
  SELECT "venue_id", "inspection_date", "id", "second_admin_id", "second_admin_name", coalesce("confirmed_at", "created_at")
  FROM "inspections"
  WHERE "kind" = 'verified' AND ("second_admin_id" IS NOT NULL OR "second_admin_name" IS NOT NULL)
) c
WHERE NOT EXISTS (
  SELECT 1 FROM "venue_visits" v
  WHERE v."inspection_id" = c."id"
    AND v."visitor_id" IS NOT DISTINCT FROM c."visitor_id"
    AND v."visitor_name" IS NOT DISTINCT FROM c."visitor_name"
)
ON CONFLICT DO NOTHING;
