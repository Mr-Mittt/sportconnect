-- Create group_settings table
-- Stores configurable settings for each group (extensible for future features)

CREATE TABLE group_settings (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT UNIQUE NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    allow_member_posts BOOLEAN DEFAULT true,
    require_post_approval BOOLEAN DEFAULT false,
    allow_member_invites BOOLEAN DEFAULT false,
    max_members INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX idx_group_settings_group_id ON group_settings(group_id);

-- Comments
COMMENT ON TABLE group_settings IS 'Configurable settings for each group (extensible for future features)';
COMMENT ON COLUMN group_settings.allow_member_posts IS 'If false, only admins/owner can create posts';
COMMENT ON COLUMN group_settings.require_post_approval IS 'If true, member posts need admin approval before visible';
COMMENT ON COLUMN group_settings.allow_member_invites IS 'If true, members can invite others to join';
COMMENT ON COLUMN group_settings.max_members IS 'Maximum number of members allowed (null = unlimited)';
