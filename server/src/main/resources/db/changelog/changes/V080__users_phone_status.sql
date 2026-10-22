-- U25: a phone number the user typed that does not parse is no longer refused. It is stored as typed with
-- phone_status INVALID (first sign-in and Account Settings both accept it; the client shows a hint). VALID is a
-- number that parses (stored as E.164), VERIFIED one that a provider or a code check proved (nothing sets it yet).
--
-- phone_status is NULL exactly when phone_number is NULL. Uniqueness and "is an identifier" only apply to usable
-- numbers, so two people who typed the same garbage do not collide and an INVALID phone never satisfies the
-- email-or-phone check.
ALTER TABLE users ADD COLUMN phone_status VARCHAR(10);

-- Every stored phone was normalised by V079 and the code that followed it, so all of them are VALID.
UPDATE users SET phone_status = 'VALID' WHERE phone_number IS NOT NULL;

ALTER TABLE users ADD CONSTRAINT chk_users_phone_status CHECK (
    (phone_number IS NULL AND phone_status IS NULL)
    OR (phone_number IS NOT NULL AND phone_status IS NOT NULL AND phone_status IN ('INVALID', 'VALID', 'VERIFIED'))
);

-- Same name as before so the "duplicate key ... uq_users_phone_number" mapping to PHONE_ALREADY_USED keeps working.
ALTER TABLE users DROP CONSTRAINT uq_users_phone_number;
CREATE UNIQUE INDEX uq_users_phone_number ON users (phone_number) WHERE phone_status <> 'INVALID';

ALTER TABLE users DROP CONSTRAINT chk_users_email_or_phone;
ALTER TABLE users ADD CONSTRAINT chk_users_email_or_phone CHECK (
    email IS NOT NULL OR (phone_number IS NOT NULL AND phone_status <> 'INVALID')
);
