-- A6: drop cross-domain DB-level FKs on auth-impl tables' user_id columns.
-- users belongs to user-impl, a different domain — a DB-level FK is a hard schema
-- coupling that violates "domain-scoped tables" / "cross-domain references use IDs only".
-- The JPA layer already treats user_id as a plain UUID (no @ManyToOne) on all three
-- entities, so this is schema-only: no entity/service/DTO change.
-- Confirmed no code path relies on the ON DELETE CASCADE behavior — user deletion is a
-- soft delete (UserServiceImpl.deleteUser sets is_active = false), never a row delete.

ALTER TABLE email_verifications DROP CONSTRAINT email_verifications_user_id_fkey;
ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_user_id_fkey;
ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_user_id_fkey;
