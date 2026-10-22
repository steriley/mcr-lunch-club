-- #35 cutover: copy each venues.image_url into venue_images as the primary
-- photo, check every one arrived, report the counts, then drop the column.
--
-- One DO block on purpose: a single statement is atomic under both migration
-- drivers. The pg migrator already wraps pending migrations in a transaction,
-- but the neon-http migrator runs statements one at a time, and an explicit
-- BEGIN/COMMIT here would end the pg migrator's own transaction early. If the
-- guard raises, nothing is copied and the column stays.
--
-- Migrated rows have no thumbnail, size or uploader (thumb_url, width,
-- height, uploaded_by are null); the public site falls back to full_url.
DO $$
DECLARE missing int; blob_count int; external_count int;
BEGIN
  INSERT INTO venue_images (venue_id, full_url, is_primary)
  SELECT id, image_url, true FROM venues
  WHERE image_url IS NOT NULL AND btrim(image_url) <> '';

  SELECT count(*) INTO missing FROM venues v
  WHERE v.image_url IS NOT NULL AND btrim(v.image_url) <> ''
    AND NOT EXISTS (SELECT 1 FROM venue_images i WHERE i.venue_id = v.id AND i.full_url = v.image_url);
  IF missing > 0 THEN
    RAISE EXCEPTION 'venue_images copy failed: % venues have no matching image row', missing;
  END IF;

  SELECT count(*) INTO blob_count FROM venue_images WHERE full_url LIKE '%.public.blob.vercel-storage.com/%';
  SELECT count(*) INTO external_count FROM venue_images WHERE full_url NOT LIKE '%.public.blob.vercel-storage.com/%';
  RAISE NOTICE 'Migrated images: % on Vercel Blob, % external links', blob_count, external_count;

  ALTER TABLE venues DROP COLUMN image_url;
END $$;
