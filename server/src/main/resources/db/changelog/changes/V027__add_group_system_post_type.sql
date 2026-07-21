-- B9: Group welcome system posts
ALTER TABLE posts DROP CONSTRAINT chk_post_type;
ALTER TABLE posts ADD CONSTRAINT chk_post_type CHECK (post_type IN ('USER_FEED', 'GROUP_POST', 'GROUP_BROADCAST', 'GROUP_SYSTEM'));
