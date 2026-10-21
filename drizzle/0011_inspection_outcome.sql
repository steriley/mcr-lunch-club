-- #30: each inspection records an outcome. Verified inspections made before this
-- existed are backfilled as satisfactory; legacy rows (dates only) stay null.
CREATE TYPE "public"."inspection_outcome" AS ENUM('satisfactory', 'below_par');--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "outcome" "inspection_outcome";--> statement-breakpoint
UPDATE "inspections" SET "outcome" = 'satisfactory' WHERE "kind" = 'verified';--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_verified_has_outcome" CHECK ("inspections"."kind" = 'legacy' or "inspections"."outcome" is not null);
