CREATE TABLE "venue_public_score_history" (
	"venue_id" uuid NOT NULL,
	"day" date NOT NULL,
	"position" smallint NOT NULL,
	"eligible_members" integer NOT NULL,
	CONSTRAINT "venue_public_score_history_venue_id_day_pk" PRIMARY KEY("venue_id","day"),
	CONSTRAINT "venue_public_score_history_position" CHECK ("venue_public_score_history"."position" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "venue_public_scores" (
	"venue_id" uuid PRIMARY KEY NOT NULL,
	"eligible_members" integer DEFAULT 0 NOT NULL,
	"eligible_logs" integer DEFAULT 0 NOT NULL,
	"weight_total" double precision DEFAULT 0 NOT NULL,
	"weighted_sum" double precision DEFAULT 0 NOT NULL,
	"variance" double precision DEFAULT 0 NOT NULL,
	"approve_count" integer DEFAULT 0 NOT NULL,
	"if_we_must_count" integer DEFAULT 0 NOT NULL,
	"reject_count" integer DEFAULT 0 NOT NULL,
	"typical_cost" "member_cost",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_public_score_history" ADD CONSTRAINT "venue_public_score_history_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_public_scores" ADD CONSTRAINT "venue_public_scores_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;