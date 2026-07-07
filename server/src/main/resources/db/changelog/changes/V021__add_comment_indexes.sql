-- B4: Redis comment preview cache — indexes to support DB fallback queries
-- Partial indexes on is_active = true only, since all queries filter by active rows

CREATE INDEX idx_comments_post_active_created
    ON comments(post_id, created_at DESC)
    WHERE is_active = true;

CREATE INDEX idx_comments_parent_active
    ON comments(parent_comment_id, created_at ASC)
    WHERE is_active = true;
