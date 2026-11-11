CREATE TYPE "public"."member_event_action" AS ENUM('name_hidden', 'name_allowed', 'banned', 'unbanned');--> statement-breakpoint
CREATE TABLE "member_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text,
	"action" "member_event_action" NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"display_name_key" text,
	"show_publicly" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_by_chair_at" timestamp with time zone,
	"renamed_after_hide_at" timestamp with time zone,
	CONSTRAINT "member_profiles_display_name_key_unique" UNIQUE("display_name_key"),
	CONSTRAINT "member_profiles_name_and_key" CHECK (("member_profiles"."display_name" is null) = ("member_profiles"."display_name_key" is null))
);
--> statement-breakpoint
CREATE TABLE "member_reserved_names" (
	"name_key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_events" ADD CONSTRAINT "member_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_events" ADD CONSTRAINT "member_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_reserved_names" ADD CONSTRAINT "member_reserved_names_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_events_user_idx" ON "member_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "member_reserved_names_user_idx" ON "member_reserved_names" USING btree ("user_id");