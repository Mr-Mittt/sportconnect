-- V023: Add broadcast_end_time to posts for GROUP_BROADCAST auto-expiry (B6)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS broadcast_end_time TIMESTAMP;

CREATE INDEX idx_posts_broadcast_active ON posts(group_id, broadcast_end_time)
    WHERE post_type = 'GROUP_BROADCAST' AND is_active = true;
