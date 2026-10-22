-- A36: the first Google sign-in may fill an empty avatar_url with the Google picture; this marks that it has been
-- looked at, whatever the outcome (filled, avatar already set, no or unusable picture), so a later Google sign-in
-- never fills again and an avatar removed on purpose stays removed. NULL = no Google sign-in has run the check yet
-- (every existing row, so a user who signed in with Google before this change gets it at their next one).
ALTER TABLE users ADD COLUMN google_avatar_checked_at TIMESTAMP;
