-- Add group-related fields to posts table
-- Allows posts to be associated with groups and adds visibility control

-- Add group_id column (nullable - posts can be personal or group posts)
ALTER TABLE posts ADD COLUMN group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE;

-- Add is_hidden column for admin post moderation
ALTER TABLE posts ADD COLUMN is_hidden BOOLEAN DEFAULT false NOT NULL;

-- Add is_system_post column for automatic admin action posts
ALTER TABLE posts ADD COLUMN is_system_post BOOLEAN DEFAULT false NOT NULL;

-- Add system_action_type for categorizing system posts
ALTER TABLE posts ADD COLUMN system_action_type VARCHAR(50);

-- Indexes for performance
CREATE INDEX idx_posts_group_id ON posts(group_id);
CREATE INDEX idx_posts_is_hidden ON posts(is_hidden);
CREATE INDEX idx_posts_is_system_post ON posts(is_system_post);
CREATE INDEX idx_posts_group_id_is_hidden ON posts(group_id, is_hidden) WHERE group_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN posts.group_id IS 'If set, this post belongs to a group; if null, it is a personal post';
COMMENT ON COLUMN posts.is_hidden IS 'If true, post is hidden by group admin (only admins can see it)';
COMMENT ON COLUMN posts.is_system_post IS 'If true, post was automatically created for admin actions';
COMMENT ON COLUMN posts.system_action_type IS 'Type of system action: member_joined, member_removed, role_changed, post_hidden, post_unhidden, settings_updated, etc.';
