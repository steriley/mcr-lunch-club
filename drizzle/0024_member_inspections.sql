CREATE TYPE "public"."member_cost" AS ENUM('£', '££', '£££');--> statement-breakpoint
CREATE TYPE "public"."member_inspection_hold_reason" AS ENUM('new_accounts', 'score_spike');--> statement-breakpoint
CREATE TYPE "public"."member_inspection_status" AS ENUM('visible', 'held', 'removed');--> statement-breakpoint
CREATE TYPE "public"."member_inspection_verification" AS ENUM('none', 'gps');--> statement-breakpoint
CREATE TYPE "public"."member_verdict_vote" AS ENUM('approve', 'if_we_must', 'reject');--> statement-breakpoint
CREATE TABLE "member_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"visit_date" date NOT NULL,
	"dish" text NOT NULL,
	"cost" "member_cost" NOT NULL,
	"verdict_vote" "member_verdict_vote" NOT NULL,
	"pull_quote" text,
	"verified_on_site" boolean DEFAULT false NOT NULL,
	"verification" "member_inspection_verification" DEFAULT 'none' NOT NULL,
	"status" "member_inspection_status" DEFAULT 'visible' NOT NULL,
	"held_reason" "member_inspection_hold_reason",
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"bribery_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_inspections_dish_length" CHECK (char_length("member_inspections"."dish") between 1 and 120),
	CONSTRAINT "member_inspections_quote_length" CHECK ("member_inspections"."pull_quote" is null or char_length("member_inspections"."pull_quote") between 1 and 140),
	CONSTRAINT "member_inspections_verified_matches" CHECK ("member_inspections"."verified_on_site" = ("member_inspections"."verification" <> 'none')),
	CONSTRAINT "member_inspections_removal_reason" CHECK ("member_inspections"."status" <> 'removed' or char_length(trim("member_inspections"."review_reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "member_inspections" ADD CONSTRAINT "member_inspections_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_inspections" ADD CONSTRAINT "member_inspections_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_inspections" ADD CONSTRAINT "member_inspections_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_inspections" ADD CONSTRAINT "member_inspections_bribery_record_id_bribery_records_id_fk" FOREIGN KEY ("bribery_record_id") REFERENCES "public"."bribery_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_inspections_one_per_member_day" ON "member_inspections" USING btree ("member_id","visit_date");--> statement-breakpoint
CREATE INDEX "member_inspections_venue_idx" ON "member_inspections" USING btree ("venue_id","status","created_at");--> statement-breakpoint
CREATE INDEX "member_inspections_member_venue_idx" ON "member_inspections" USING btree ("member_id","venue_id");--> statement-breakpoint
CREATE INDEX "member_inspections_held_idx" ON "member_inspections" USING btree ("created_at") WHERE "member_inspections"."status" = 'held';