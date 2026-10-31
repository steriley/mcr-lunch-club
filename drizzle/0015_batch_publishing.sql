CREATE TABLE "pending_publish_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"venue_id" uuid,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"requested_by" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted" boolean NOT NULL,
	CONSTRAINT "publish_requests_source_valid" CHECK ("publish_requests"."source" in ('chair', 'auto', 'nightly', 'bulletin'))
);
--> statement-breakpoint
CREATE TABLE "publish_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_published_at" timestamp with time zone,
	CONSTRAINT "publish_state_single_row" CHECK ("publish_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "pending_publish_changes" ADD CONSTRAINT "pending_publish_changes_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_publish_changes" ADD CONSTRAINT "pending_publish_changes_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_requests" ADD CONSTRAINT "publish_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_publish_changes_created_idx" ON "pending_publish_changes" USING btree ("created_at");
--> statement-breakpoint
INSERT INTO "publish_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
