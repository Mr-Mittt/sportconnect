ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP DEFAULT now();

UPDATE posts SET last_interaction_at = created_at WHERE last_interaction_at IS NULL;

CREATE INDEX idx_posts_feed ON posts(last_interaction_at DESC) WHERE is_active = true;
