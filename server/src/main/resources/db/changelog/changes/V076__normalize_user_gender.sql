-- U20: users.gender becomes a closed set (MALE / FEMALE). It was free text (VARCHAR(20), V001) with no validation,
-- so existing rows can hold anything ("Female", "f", "asdf"). Normalise case- and whitespace-insensitively; a value
-- that maps to neither (including the empty string) becomes NULL - an accepted, explicit loss, free text like "asdf"
-- is not recoverable. The UPDATE is idempotent: re-running leaves already-normalised rows untouched.
UPDATE users
SET gender = CASE UPPER(TRIM(gender))
                 WHEN 'MALE' THEN 'MALE'
                 WHEN 'M' THEN 'MALE'
                 WHEN 'FEMALE' THEN 'FEMALE'
                 WHEN 'F' THEN 'FEMALE'
                 ELSE NULL
    END
WHERE gender IS NOT NULL;

-- Defence in depth: UserServiceImpl.updateProfile is the primary gate (400 with a clear message); this stops any
-- other writer from reintroducing a free-text value. NULL satisfies a CHECK, so "no gender set" stays valid.
ALTER TABLE users ADD CONSTRAINT chk_users_gender CHECK (gender IN ('MALE', 'FEMALE'));
