-- LOC-5: venues gain a country and a region, as reference-domain ids (no FK: cross-domain ids only),
-- derived from the coordinates when a location is created (LocationServiceImpl.createLocation) and, for rows
-- that already exist, by LocationGeoBackfillRunner at start-up. Nullable and best-effort, the same stance as
-- the LOC-4 timezone: null when there are no coordinates, nothing resolves, or the country is not seeded.
--
-- No backfill here: it needs the boundary polygons (an application resource), so the runner does it, once,
-- idempotently, on the first start after this migration.
--
-- Needed by the statistics chain (SESSION-53): a ranking game counts toward a region or country board only
-- when the venue's region or country equals the player's.

ALTER TABLE locations ADD COLUMN country_id BIGINT;
ALTER TABLE locations ADD COLUMN region_id BIGINT;
