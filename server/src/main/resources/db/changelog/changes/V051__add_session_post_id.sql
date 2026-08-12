-- SESSION-10: every Session gets a companion SESSION_POST (post-impl) created synchronously at
-- session-creation time, used as the comment-thread anchor for SessionDetailModal. Existing dev
-- sessions predate this and have no companion post — no data worth preserving (dev-only), so this
-- truncates rather than backfilling, same precedent as V016's "TRUNCATE posts CASCADE".
-- posts.id is a different domain's id (post-impl) — no DB-level FK, per "cross-domain references
-- are IDs only" / SESSION-11's precedent of dropping cross-domain FKs on this same table.
TRUNCATE TABLE sessions, session_participants CASCADE;

ALTER TABLE sessions ADD COLUMN post_id BIGINT NOT NULL;
ALTER TABLE sessions ADD CONSTRAINT uq_sessions_post_id UNIQUE (post_id);
