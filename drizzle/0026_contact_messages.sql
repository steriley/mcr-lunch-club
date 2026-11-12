CREATE TYPE "public"."contact_status" AS ENUM('new', 'read', 'handled');--> statement-breakpoint
CREATE TYPE "public"."contact_topic" AS ENUM('general', 'venue', 'press', 'other');--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"topic" "contact_topic" NOT NULL,
	"message" text NOT NULL,
	"sender_hash" text,
	"body_hash" text NOT NULL,
	"status" "contact_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "contact_notified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_sender_idx" ON "contact_messages" USING btree ("sender_hash","created_at");