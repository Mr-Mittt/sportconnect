-- LOC-4: locations gain a real IANA timezone (e.g. "Asia/Ho_Chi_Minh"), derived automatically
-- from latitude/longitude at creation time via a point-in-polygon timezone lookup
-- (LocationServiceImpl.createLocation) rather than manually entered. Nullable and best-effort:
-- null when a location has no coordinates (still allowed -- latitude/longitude stay optional),
-- and also null when coordinates fall outside every timezone polygon (open ocean, parts of
-- Antarctica) -- no rejection, no fallback default, per user decision.
--
-- No backfill for existing rows: only a handful of real Location rows exist today, so any that
-- need a value can be corrected with a direct manual UPDATE once this column exists, rather than
-- an automated backfill step.
--
-- This is the foundation `session-impl`'s SESSION-34/35 AT TIME ZONE queries join against --
-- see documentation/md/LOCATION_TIMEZONE_DESIGN.md.

ALTER TABLE locations ADD COLUMN timezone VARCHAR(64);
