-- A18: drop user_sport_profiles.preferred_position (added by V003).
--
-- The fixed column was a mistake — "position" is sport-specific (a football position, badminton
-- singles/doubles, nothing at all for running), so it belongs in the per-sport A9 attribute schema,
-- not as a flat scalar next to skill_level / years_of_experience.
--
-- No data migration: the column is nullable free text, the seeded Badminton/Pickleball schemas
-- don't use it, and the app is pre-launch (only dev/test rows exist). The client stopped
-- reading/writing the field in SPORT-8 (merged before this).

ALTER TABLE user_sport_profiles DROP COLUMN IF EXISTS preferred_position;
