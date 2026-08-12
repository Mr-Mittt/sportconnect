-- SESSION-10/A17: session posts (comment-thread anchor for a Session, never shown in any feed)
ALTER TABLE posts DROP CONSTRAINT chk_post_type;
ALTER TABLE posts ADD CONSTRAINT chk_post_type CHECK (post_type IN ('USER_FEED', 'GROUP_POST', 'GROUP_BROADCAST', 'GROUP_SYSTEM', 'SESSION_POST'));
