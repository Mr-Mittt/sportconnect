-- Create group_members table
-- Tracks user membership in groups with their roles

CREATE TABLE group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('group_owner', 'group_admin', 'group_member')),
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_group_user UNIQUE(group_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_group_members_role ON group_members(role);

-- Comments
COMMENT ON TABLE group_members IS 'User membership in groups with role-based access control';
COMMENT ON COLUMN group_members.role IS 'User role: group_owner (1 per group), group_admin (multiple), group_member (default)';
COMMENT ON CONSTRAINT unique_group_user ON group_members IS 'A user can only have one membership record per group';
