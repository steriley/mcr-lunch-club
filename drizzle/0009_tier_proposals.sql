-- Phase 6 (#14): tier changes become proposals a different admin must approve.
CREATE TYPE "public"."tier_proposal_status" AS ENUM('pending', 'approved', 'declined', 'withdrawn', 'superseded');--> statement-breakpoint
CREATE TABLE "tier_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"from_tier" "tier",
	"proposed_tier" "tier" NOT NULL,
	"proposed_by" text,
	"proposed_by_name" text,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "tier_proposal_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"decline_reason" text,
	"inspection_id" uuid,
	CONSTRAINT "tier_proposals_decline_reason" CHECK ("tier_proposals"."status" <> 'declined' or length(trim("tier_proposals"."decline_reason")) > 0),
	CONSTRAINT "tier_proposals_decider_not_proposer" CHECK ("tier_proposals"."proposed_by" is null or "tier_proposals"."decided_by" is null or "tier_proposals"."status" not in ('approved', 'declined') or "tier_proposals"."proposed_by" <> "tier_proposals"."decided_by")
);
--> statement-breakpoint
ALTER TABLE "tier_proposals" ADD CONSTRAINT "tier_proposals_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_proposals" ADD CONSTRAINT "tier_proposals_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_proposals" ADD CONSTRAINT "tier_proposals_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_proposals" ADD CONSTRAINT "tier_proposals_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tier_proposals_one_pending_per_venue" ON "tier_proposals" USING btree ("venue_id") WHERE "tier_proposals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "tier_proposals_venue_idx" ON "tier_proposals" USING btree ("venue_id","proposed_at");--> statement-breakpoint
CREATE INDEX "tier_proposals_status_idx" ON "tier_proposals" USING btree ("status","decided_at");