-- Walking times move to a 24 minute mile (MINUTES_PER_MILE in
-- src/lib/map/config.ts). routeToVenueValues() now derives the minutes from
-- the route distance, but stored venues keep the minutes they were saved
-- with, so this recomputes them from the stored distance the same way:
-- whole minutes, at least one. Only ORS-routed venues (route_updated_at set);
-- an old straight-line estimate is left for the route backfill to replace.
--
-- Each changed venue gets a revision, as the route backfill writes: its
-- latest snapshot with the new walking time, and no editor (a script).
--
-- One statement on purpose: it is atomic under both migration drivers (see
-- 0013). Safe to re-run: a venue already at the new pace is not touched.
WITH changed AS (
  UPDATE venues
  SET walking_time_min = greatest(1, round(distance_miles * 24))::integer
  WHERE route_updated_at IS NOT NULL
    AND distance_miles IS NOT NULL
    AND walking_time_min IS DISTINCT FROM greatest(1, round(distance_miles * 24))::integer
  RETURNING id, walking_time_min
)
INSERT INTO venue_revisions (venue_id, changed_by, snapshot)
SELECT changed.id, NULL, latest.snapshot || jsonb_build_object('walkingTimeMin', changed.walking_time_min)
FROM changed
CROSS JOIN LATERAL (
  SELECT snapshot FROM venue_revisions
  WHERE venue_revisions.venue_id = changed.id
  ORDER BY changed_at DESC
  LIMIT 1
) latest;
