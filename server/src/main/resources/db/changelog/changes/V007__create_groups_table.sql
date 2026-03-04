-- Create groups table
-- A group is a community/club where members share posts and moments

CREATE TABLE groups (
    id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    avatar_url VARCHAR(500),
    cover_url VARCHAR(500),
    is_private BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_groups_group_name ON groups(group_name);
CREATE INDEX idx_groups_created_by ON groups(created_by);
CREATE INDEX idx_groups_is_active ON groups(is_active);

-- Comments
COMMENT ON TABLE groups IS 'Groups/clubs where users can share posts and moments';
COMMENT ON COLUMN groups.group_name IS 'Unique identifier name for the group';
COMMENT ON COLUMN groups.is_private IS 'If true, group is invite-only';
COMMENT ON COLUMN groups.created_by IS 'User who created the group (becomes group_owner)';
