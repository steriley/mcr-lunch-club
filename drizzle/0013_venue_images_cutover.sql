-- #35 copy step: copy each venues.image_url into venue_images as the primary
-- photo, check every one arrived, and report the counts. This is the expand
-- half of expand/contract: venues.image_url is left in place (nothing reads it
-- any more) so the previous deployment keeps working while this one goes live,
-- and a code rollback never meets a missing column. A later pull request drops
-- the column once this one is live and verified.
--
-- One DO block on purpose: a single statement is atomic under both migration
-- drivers (the pg migrator wraps pending migrations in a transaction, the
-- neon-http one runs statements one at a time, and an explicit BEGIN/COMMIT
-- would end the pg migrator's transaction early). If the guard raises, nothing
-- is copied. Safe to re-run by hand: a venue whose image is already copied is
-- skipped, and a copy only becomes primary when the venue has no primary yet.
--
-- Migrated rows have no thumbnail, size or uploader (thumb_url, width,
-- height, uploaded_by are null); the public site falls back to full_url.
DO $$
DECLARE missing int; blob_count int; external_count int;
BEGIN
  INSERT INTO venue_images (venue_id, full_url, is_primary)
  SELECT v.id, v.image_url,
    NOT EXISTS (SELECT 1 FROM venue_images p WHERE p.venue_id = v.id AND p.is_primary)
  FROM venues v
  WHERE v.image_url IS NOT NULL AND btrim(v.image_url) <> ''
    AND NOT EXISTS (SELECT 1 FROM venue_images i WHERE i.venue_id = v.id AND i.full_url = v.image_url);

  SELECT count(*) INTO missing FROM venues v
  WHERE v.image_url IS NOT NULL AND btrim(v.image_url) <> ''
    AND NOT EXISTS (SELECT 1 FROM venue_images i WHERE i.venue_id = v.id AND i.full_url = v.image_url);
  IF missing > 0 THEN
    RAISE EXCEPTION 'venue_images copy failed: % venues have no matching image row', missing;
  END IF;

  SELECT count(*) INTO blob_count FROM venue_images WHERE full_url LIKE '%.public.blob.vercel-storage.com/%';
  SELECT count(*) INTO external_count FROM venue_images WHERE full_url NOT LIKE '%.public.blob.vercel-storage.com/%';
  RAISE NOTICE 'Migrated images: % on Vercel Blob, % external links', blob_count, external_count;
END $$;
