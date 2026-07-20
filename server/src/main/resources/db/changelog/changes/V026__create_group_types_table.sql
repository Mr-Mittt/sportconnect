-- Create group_types table: fixed membership-cap tiers, replacing the unenforced
-- manual group_settings.max_members field.
-- B7 (group-impl): audit found max_members was stored but never validated or enforced
-- anywhere. Replaced with fixed tiers so the cap is always meaningful.

CREATE TABLE group_types (
    id BIGSERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    max_members INTEGER NOT NULL
);

COMMENT ON TABLE group_types IS 'Fixed membership-cap tiers for groups (B7)';
COMMENT ON COLUMN group_types.type_name IS 'Tier name, e.g. DEFAULT, STANDARD, PREMIUM';
COMMENT ON COLUMN group_types.max_members IS 'Maximum number of members allowed for groups of this type';

INSERT INTO group_types (type_name, max_members) VALUES
    ('DEFAULT', 50),
    ('STANDARD', 100),
    ('PREMIUM', 500);

-- Every group is silently created as DEFAULT today; changing a group's type is
-- out of scope for this ticket (tracked as a follow-up, see BACKLOG_MVP.md).
ALTER TABLE group_settings ADD COLUMN group_type_id BIGINT REFERENCES group_types(id);

UPDATE group_settings SET group_type_id = (SELECT id FROM group_types WHERE type_name = 'DEFAULT');

ALTER TABLE group_settings ALTER COLUMN group_type_id SET NOT NULL;

ALTER TABLE group_settings DROP COLUMN max_members;

CREATE INDEX idx_group_settings_group_type_id ON group_settings(group_type_id);
