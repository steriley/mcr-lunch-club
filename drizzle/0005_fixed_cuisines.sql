-- Phase 2 of the venue admin overhaul (#10): free-text cuisine becomes a
-- fixed list (src/lib/cuisines.ts). Existing values are folded in with the
-- same mapping as mapLegacyCuisine(); anything unrecognised becomes Other.
-- The table below is checked against LEGACY_CUISINE_MAP by src/lib/cuisines.test.ts.
CREATE TYPE "public"."cuisine" AS ENUM('asian', 'bakery_cafe', 'fast_food', 'fish_and_chips', 'indian', 'mexican', 'middle_eastern_mediterranean', 'pizza', 'sandwiches_subs', 'steak_grill', 'other');--> statement-breakpoint
ALTER TABLE "venues" RENAME COLUMN "cuisine" TO "cuisine_legacy";--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "cuisine" "public"."cuisine" DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE TEMPORARY TABLE "cuisine_map" ("raw" text PRIMARY KEY, "value" "public"."cuisine" NOT NULL);--> statement-breakpoint
INSERT INTO "cuisine_map" ("raw", "value") VALUES
  ('detroit pan pizza', 'pizza'),
  ('nyc style pizza', 'pizza'),
  ('neapolitan pizza', 'pizza'),
  ('pizza', 'pizza'),
  ('pizza & slices', 'pizza'),
  ('burgers', 'fast_food'),
  ('burgers & loaded fries', 'fast_food'),
  ('smash burgers', 'fast_food'),
  ('fried chicken', 'fast_food'),
  ('louisiana fried chicken', 'fast_food'),
  ('nashville hot chicken', 'fast_food'),
  ('wings', 'fast_food'),
  ('wings & dive bar', 'fast_food'),
  ('fish & chips', 'fish_and_chips'),
  ('traditional chippy', 'fish_and_chips'),
  ('deli & sandwiches', 'sandwiches_subs'),
  ('gourmet subs', 'sandwiches_subs'),
  ('italian-american subs', 'sandwiches_subs'),
  ('grilled cheese', 'sandwiches_subs'),
  ('bakery & toasties', 'bakery_cafe'),
  ('cafe & bakes', 'bakery_cafe'),
  ('deli & bakery', 'bakery_cafe'),
  ('asian noodles & soups', 'asian'),
  ('cantonese bbq', 'asian'),
  ('chinese street food', 'asian'),
  ('ramen', 'asian'),
  ('wok noodles', 'asian'),
  ('indian', 'indian'),
  ('rice ''n'' three', 'indian'),
  ('levantine / shawarma', 'middle_eastern_mediterranean'),
  ('greek street food', 'middle_eastern_mediterranean'),
  ('mexican / burritos', 'mexican'),
  ('steakhouse', 'steak_grill'),
  ('brazilian rodizio', 'steak_grill'),
  ('casual dining', 'other'),
  ('asian', 'asian'),
  ('bakery_cafe', 'bakery_cafe'),
  ('bakery & cafe', 'bakery_cafe'),
  ('fast_food', 'fast_food'),
  ('fast food', 'fast_food'),
  ('fish_and_chips', 'fish_and_chips'),
  ('mexican', 'mexican'),
  ('middle_eastern_mediterranean', 'middle_eastern_mediterranean'),
  ('middle eastern & mediterranean', 'middle_eastern_mediterranean'),
  ('sandwiches_subs', 'sandwiches_subs'),
  ('sandwiches & subs', 'sandwiches_subs'),
  ('steak_grill', 'steak_grill'),
  ('steak & grill', 'steak_grill'),
  ('other', 'other');--> statement-breakpoint
-- Same normalisation as normaliseLegacyCuisine(): &amp; to &, curly quotes straight, trim, collapse spaces, lower case.
UPDATE "venues" SET "cuisine" = m."value"
FROM "cuisine_map" m
WHERE m."raw" = lower(regexp_replace(trim(translate(regexp_replace("venues"."cuisine_legacy", '&amp;', '&', 'gi'), '‘’', '''''')), '\s+', ' ', 'g'));--> statement-breakpoint
DO $$
DECLARE entry record;
BEGIN
  FOR entry IN SELECT "cuisine", count(*) AS total FROM "venues" GROUP BY "cuisine" ORDER BY "cuisine" LOOP
    RAISE NOTICE 'Cuisine %: % venue(s)', entry."cuisine", entry.total;
  END LOOP;
  FOR entry IN
    SELECT coalesce("cuisine_legacy", '(none)') AS raw, count(*) AS total FROM "venues"
    WHERE "cuisine" = 'other' AND lower(trim(coalesce("cuisine_legacy", ''))) NOT IN ('casual dining', 'other')
    GROUP BY 1 ORDER BY 1
  LOOP
    RAISE NOTICE 'Fell through to Other: "%" (% venue(s))', entry.raw, entry.total;
  END LOOP;
END $$;--> statement-breakpoint
DROP TABLE "cuisine_map";--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "cuisine_legacy";
