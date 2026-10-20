-- Phase 4 (#12): "permanently closed" flag (all venues start open) and the
-- venue_events log used for closing/reopening and later admin actions.
CREATE TABLE "venue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "venue_events" ADD CONSTRAINT "venue_events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_events" ADD CONSTRAINT "venue_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_events_venue_id_idx" ON "venue_events" USING btree ("venue_id","created_at");--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;