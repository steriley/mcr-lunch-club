ALTER TABLE "bribery_records" ALTER COLUMN "incident_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "incident_time" text;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "people_involved" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "witnesses" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "benefit_offered" text;--> statement-breakpoint
ALTER TABLE "bribery_records" ADD COLUMN "value" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "rank" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "cost" text DEFAULT '££' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "cuisine" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "distance_miles" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "walking_time_min" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "last_inspection_date" date;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "map_search_link" text;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;