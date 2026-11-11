-- SESSION-46: informational per-gender open slots. Never enforced on join; the app checks
-- male_slots + female_slots <= capacity - initial_slot. NULL = not specified.
ALTER TABLE sessions ADD COLUMN male_slots INTEGER;
ALTER TABLE sessions ADD COLUMN female_slots INTEGER;
ALTER TABLE sessions ADD CONSTRAINT chk_sessions_male_slots CHECK (male_slots IS NULL OR male_slots >= 0);
ALTER TABLE sessions ADD CONSTRAINT chk_sessions_female_slots CHECK (female_slots IS NULL OR female_slots >= 0);
