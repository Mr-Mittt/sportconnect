-- U23 (Keycloak social login): an account may be identified by email, by phone, or by both. A provider such as Zalo
-- often returns no email, so users.email becomes nullable (its UNIQUE constraint stays - Postgres lets any number of
-- NULLs through it), and users.phone_number becomes a second unique identifier stored as E.164 (+84901234567).
--
-- Every existing phone value is cleared first: it was free text ("555-0100", "0901 234 567") that cannot be
-- normalised in SQL, and this is dev data only (owner decision, 2026-10-14). Clearing also guarantees the new UNIQUE
-- constraint cannot fail on duplicates. Every existing row has an email, so the check below holds for all of them.
UPDATE users SET phone_number = NULL;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users ADD CONSTRAINT uq_users_phone_number UNIQUE (phone_number);

ALTER TABLE users ADD CONSTRAINT chk_users_email_or_phone CHECK (email IS NOT NULL OR phone_number IS NOT NULL);
