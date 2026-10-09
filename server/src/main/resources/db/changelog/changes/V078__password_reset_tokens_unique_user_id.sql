-- A10: at most one password-reset token per user, enforced by the database. Until now it only held because the
-- service deleted before it inserted, so two concurrent forgot-password requests could leave two live rows.
-- Keep the newest row per user (ties broken by id), then add the constraint. The unique constraint creates its own
-- index on user_id, so the plain V002 index is redundant and is dropped.
DELETE FROM password_reset_tokens older
USING password_reset_tokens newer
WHERE older.user_id = newer.user_id
  AND (older.created_at < newer.created_at
       OR (older.created_at IS NOT DISTINCT FROM newer.created_at AND older.id < newer.id));

ALTER TABLE password_reset_tokens ADD CONSTRAINT uq_password_reset_tokens_user_id UNIQUE (user_id);

DROP INDEX IF EXISTS idx_password_reset_tokens_user_id;
