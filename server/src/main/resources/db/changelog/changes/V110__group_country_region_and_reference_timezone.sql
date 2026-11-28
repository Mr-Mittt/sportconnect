-- B25 (owner, 2026-11-27): a group has a required country and region (ids of the reference domain, no foreign key), and the
-- reference data carries the timezone a group's local date is read in (the region's, else the country's).

-- 1. The timezone of the reference data (IANA ids). The region's is optional and overrides the country's.
ALTER TABLE countries ADD COLUMN timezone VARCHAR(64);
ALTER TABLE regions   ADD COLUMN timezone VARCHAR(64);
UPDATE countries SET timezone = 'Asia/Ho_Chi_Minh' WHERE iso2 = 'VN';

-- 2. The group's country and region, added nullable first so existing rows can be filled.
ALTER TABLE groups ADD COLUMN country_id BIGINT;
ALTER TABLE groups ADD COLUMN region_id  BIGINT;

-- 3. Each group takes the country and region of its CURRENT owner (the group_owner membership, not created_by: ownership moves).
--    An owner with a country but no region has no usable data either.
UPDATE groups g
SET country_id = u.country_id, region_id = u.region_id
FROM group_members m
JOIN group_roles r ON r.id = m.role_id AND r.role_name = 'group_owner'
JOIN users u ON u.id = m.user_id
WHERE m.group_id = g.id AND u.country_id IS NOT NULL AND u.region_id IS NOT NULL;

-- 4. A group whose owner has no country and region is invalid business data: it is deactivated (the app's own delete is a soft
--    delete, so no dependent row of any domain is touched) and carries the first region as a placeholder so the columns can be
--    NOT NULL. The placeholder row is inactive and never read. The count is written to the migration log and the release notes.
DO $$
DECLARE
    missing_count INTEGER;
    placeholder_country BIGINT;
    placeholder_region BIGINT;
BEGIN
    SELECT COUNT(*) INTO missing_count FROM groups WHERE country_id IS NULL OR region_id IS NULL;
    IF missing_count > 0 THEN
        SELECT r.country_id, r.id INTO placeholder_country, placeholder_region FROM regions r ORDER BY r.id LIMIT 1;
        IF placeholder_region IS NULL THEN
            RAISE EXCEPTION 'B25: % group(s) have no owner country/region and no region exists to use as a placeholder', missing_count;
        END IF;
        UPDATE groups SET is_active = FALSE, country_id = placeholder_country, region_id = placeholder_region
        WHERE country_id IS NULL OR region_id IS NULL;
    END IF;
    RAISE NOTICE 'B25: % group(s) deactivated because their owner has no country and region', missing_count;
END $$;

-- 5. Required from now on.
ALTER TABLE groups ALTER COLUMN country_id SET NOT NULL;
ALTER TABLE groups ALTER COLUMN region_id  SET NOT NULL;
CREATE INDEX idx_groups_region_id ON groups (region_id);
