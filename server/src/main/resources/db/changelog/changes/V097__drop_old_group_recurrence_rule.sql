-- GROUP-1: the old single weekly recurrence rule is removed (owner, 2026-11-19: replaced, not migrated).
--
-- Regular group sessions are now generated from the session domain's own configurations (V095, SESSION-GROUP-4) through the
-- queue of V096 (SESSION-GROUP-5); nothing reads these columns any more. Groups that had a rule lose it and the owner sets up
-- new configurations in the group's settings. THIS DROPS DATA and cannot be undone by Liquibase: back up groups and
-- group_settings first if the old rules might ever be wanted (a rollback of the server image does not bring them back).
--
-- groups.recurrence_location_id lost its foreign key in V049; dropping a column drops any index on it.
ALTER TABLE groups DROP COLUMN IF EXISTS recurrence_day_of_week;
ALTER TABLE groups DROP COLUMN IF EXISTS recurrence_time;
ALTER TABLE groups DROP COLUMN IF EXISTS recurrence_duration_minutes;
ALTER TABLE groups DROP COLUMN IF EXISTS recurrence_location_id;
ALTER TABLE groups DROP COLUMN IF EXISTS recurrence_location_note;
ALTER TABLE group_settings DROP COLUMN IF EXISTS auto_generate_sessions;
