-- Create group_members table
-- Tracks user membership in groups with their roles

CREATE TABLE group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES group_roles(id),
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_group_user UNIQUE(group_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_group_members_role_id ON group_members(role_id);
CREATE INDEX idx_group_members_group_role ON group_members(group_id, role_id);

-- Comments
COMMENT ON TABLE group_members IS 'User membership in groups with role-based access control';
COMMENT ON COLUMN group_members.role_id IS 'Reference to group_roles table (owner/admin/member)';
COMMENT ON CONSTRAINT unique_group_user ON group_members IS 'A user can only have one membership record per group';
