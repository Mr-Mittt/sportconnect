-- SESSION-33: Session.scheduledStart/scheduledEndAt become true instants instead of naive
-- wall-clock values with no recorded zone -- foundation for SESSION-34/35's location/caller-zone
-- AT TIME ZONE queries. See documentation/md/LOCATION_TIMEZONE_DESIGN.md.
--
-- Existing rows have no recorded authorial zone, so the only available assumption for
-- already-written data is "whatever the server's JVM zone was at the time" (Asia/Bangkok,
-- confirmed via ZoneId.systemDefault() on this deployment) -- explicit and deterministic rather
-- than relying on whatever ambient session TimeZone the Liquibase-running connection happens to
-- have.
--
-- originZoneId: nullable IANA zone id, captured only for a session created with no locationId yet
-- (PREPARING/standalone) -- the creator's own browser zone, used as SESSION-34's
-- COALESCE(origin_zone_id, location.timezone) fallback/override for calendar-date bucketing. Once
-- set, it stays authoritative even if a real Location is attached later (user decision, 2026-09-17).

ALTER TABLE sessions ALTER COLUMN scheduled_start TYPE TIMESTAMPTZ
    USING scheduled_start AT TIME ZONE 'Asia/Bangkok';
ALTER TABLE sessions ALTER COLUMN scheduled_end_at TYPE TIMESTAMPTZ
    USING scheduled_end_at AT TIME ZONE 'Asia/Bangkok';

ALTER TABLE sessions ADD COLUMN origin_zone_id VARCHAR(64);
