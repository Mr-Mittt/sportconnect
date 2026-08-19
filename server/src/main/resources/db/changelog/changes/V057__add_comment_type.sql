-- SESSION-21: system comments in a session's discussion thread. Same shape as B9's V027
-- (GROUP_SYSTEM posts) — a type discriminator so a server-written entry is distinguishable from a
-- user's own comment. Unlike V027, `comments` had no type column at all, so this adds one.
-- DEFAULT 'USER' backfills every existing row; no truncation needed (unlike V051).
ALTER TABLE comments ADD COLUMN comment_type VARCHAR(32) NOT NULL DEFAULT 'USER';
ALTER TABLE comments ADD CONSTRAINT chk_comment_type CHECK (comment_type IN ('USER', 'SESSION_SYSTEM'));
