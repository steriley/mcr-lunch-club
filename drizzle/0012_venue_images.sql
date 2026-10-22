-- #35: venue photos (additive). venues.image_url stays until the Phase 5 cutover migration.
CREATE TABLE "venue_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"full_url" text NOT NULL,
	"thumb_url" text,
	"width" integer,
	"height" integer,
	"caption" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"focal_x" smallint,
	"focal_y" smallint,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_images_focal_range" CHECK (("venue_images"."focal_x" is null and "venue_images"."focal_y" is null) or ("venue_images"."focal_x" is not null and "venue_images"."focal_y" is not null and "venue_images"."focal_x" between 0 and 100 and "venue_images"."focal_y" between 0 and 100))
);
--> statement-breakpoint
ALTER TABLE "venue_images" ADD CONSTRAINT "venue_images_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_images" ADD CONSTRAINT "venue_images_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_images_one_primary_per_venue" ON "venue_images" USING btree ("venue_id") WHERE "venue_images"."is_primary";--> statement-breakpoint
CREATE INDEX "venue_images_venue_idx" ON "venue_images" USING btree ("venue_id","created_at");