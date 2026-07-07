-- A3: Flexible per-sport attributes
ALTER TABLE user_sport_profiles ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
