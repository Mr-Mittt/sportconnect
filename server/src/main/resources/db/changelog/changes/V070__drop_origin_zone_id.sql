-- SESSION-34 (scope correction, 2026-09-17): drops sessions.origin_zone_id, added by SESSION-33
-- (V069) as a fallback for GET /history?dateCount's calendar-date bucketing. That fallback was
-- superseded before any client ever read/wrote it in production: /history?dateCount now buckets by
-- the caller's own current zone (viewerZoneId, supplied per request) falling back directly to UTC,
-- never by a per-session stored zone. No other consumer ever read this column (grepped the whole
-- codebase to confirm) -- safe to drop outright, no data-migration/backfill concern.

ALTER TABLE sessions DROP COLUMN origin_zone_id;
