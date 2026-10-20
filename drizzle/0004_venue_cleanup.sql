-- Phase 1 of the venue admin overhaul (#9).
-- Visibility is now derived (approved tier + coordinates) instead of the
-- `published` toggle. `tier` becomes nullable and means "last approved tier".
ALTER TABLE "venues" ALTER COLUMN "tier" DROP NOT NULL;--> statement-breakpoint
-- Unpublished drafts must stay hidden once `published` is gone, so they lose
-- their tier. Run this first to see which venues it affects:
--   SELECT name, tier FROM venues WHERE published = false ORDER BY name;
UPDATE "venues" SET "tier" = NULL WHERE "published" = false;--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "verdict";--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "rank";--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "rejection_reason";--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "published";--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "sort_order";
