-- Phase 3 (#11): when distance/walking time last came from an ORS walking
-- route. Existing values are straight-line estimates, so this starts NULL and
-- `pnpm routes:backfill` replaces them.
ALTER TABLE "venues" ADD COLUMN "route_updated_at" timestamp with time zone;
