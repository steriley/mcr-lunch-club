CREATE TYPE "public"."suggestion_status" AS ENUM('new', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "venue_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"cuisine" text,
	"cost" text,
	"recommended_order" text,
	"rationale" text NOT NULL,
	"submitter_name" text,
	"status" "suggestion_status" DEFAULT 'new' NOT NULL,
	"venue_id" uuid,
	"sender_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
ALTER TABLE "venue_suggestions" ADD CONSTRAINT "venue_suggestions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_suggestions" ADD CONSTRAINT "venue_suggestions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;