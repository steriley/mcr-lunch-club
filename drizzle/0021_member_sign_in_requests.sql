CREATE TABLE "member_sign_in_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"sender_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "member_sign_in_requests_created_idx" ON "member_sign_in_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "member_sign_in_requests_email_idx" ON "member_sign_in_requests" USING btree ("email_hash","created_at");