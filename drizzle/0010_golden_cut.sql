-- #19: The Golden Cut, up to five Approved venues the Chairs curate for the home page.
CREATE TABLE "golden_cut" (
	"venue_id" uuid PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"puff_piece" text,
	"anchor_dish" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "golden_cut_position_range" CHECK ("golden_cut"."position" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "golden_cut" ADD CONSTRAINT "golden_cut_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "golden_cut" ADD CONSTRAINT "golden_cut_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "golden_cut_position_idx" ON "golden_cut" USING btree ("position");