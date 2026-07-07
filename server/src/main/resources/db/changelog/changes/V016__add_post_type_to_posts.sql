-- B3: Three post types
-- Delete all existing posts and related data (dev data only)
TRUNCATE TABLE posts CASCADE;

-- Add post_type column
ALTER TABLE posts ADD COLUMN post_type VARCHAR(20) NOT NULL DEFAULT 'USER_FEED';
ALTER TABLE posts ADD CONSTRAINT chk_post_type CHECK (post_type IN ('USER_FEED', 'GROUP_POST', 'GROUP_BROADCAST'));

-- Indexes for feed filtering
CREATE INDEX idx_posts_post_type ON posts(post_type);
CREATE INDEX idx_posts_group_id_post_type ON posts(group_id, post_type) WHERE group_id IS NOT NULL;
