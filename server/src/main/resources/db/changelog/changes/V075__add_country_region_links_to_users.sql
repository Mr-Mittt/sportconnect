-- U16: link users to the reference data (REFERENCE_DATA_DESIGN.md). Cross-domain references are IDs only, so the
-- new columns carry NO foreign key into the reference domain's tables (CLAUDE.md, monolith-first / microservice-ready).
-- Both are nullable: a user need not have chosen a country or region.
ALTER TABLE users ADD COLUMN country_id BIGINT;
ALTER TABLE users ADD COLUMN region_id BIGINT;

-- user_preferences.language stores a languages.code (BCP 47, VARCHAR(35)); it was VARCHAR(10). Widening is
-- lossless and stops a future code like zh-Hant-TW failing on write. Now that the value is validated against the
-- languages table, the two columns should agree on length.
ALTER TABLE user_preferences ALTER COLUMN language TYPE VARCHAR(35);

-- One-time backfill: match the legacy free-text users.country to a country row by name, iso2 or iso3. Case-insensitive
-- and space-insensitive, so "Viet Nam", "vn" and "VNM" all match Vietnam. Only rows not yet linked are touched, so
-- this is safe to run again (REF-4 re-runs it once the remaining countries are seeded). Text that matches nothing
-- keeps only the legacy value, which the API keeps returning as `country` until the user picks a real country.
-- users.region_id is not backfilled: there was never region text to match.
UPDATE users
SET country_id = (
    SELECT c.id
    FROM countries c
    WHERE REPLACE(LOWER(TRIM(users.country)), ' ', '') IN (
        REPLACE(LOWER(c.name), ' ', ''), LOWER(c.iso2), LOWER(c.iso3))
    ORDER BY c.id
    LIMIT 1)
WHERE country_id IS NULL
  AND country IS NOT NULL
  AND TRIM(country) <> '';
