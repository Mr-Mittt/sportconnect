-- GROUP-RECUR-1: Structured recurring-session schedule fields, added alongside the existing
-- free-text `schedule` column (kept as owner-editable prose — these new columns are what the
-- session-generation job (SESSION-2) actually reads). All nullable — existing groups get no
-- recurrence config unless the owner opts in.

ALTER TABLE groups ADD COLUMN recurrence_day_of_week VARCHAR(10);
ALTER TABLE groups ADD COLUMN recurrence_time TIME;
ALTER TABLE groups ADD COLUMN recurrence_duration_minutes INTEGER;
ALTER TABLE groups ADD COLUMN recurrence_location_id BIGINT REFERENCES locations(id);

COMMENT ON COLUMN groups.recurrence_location_id IS 'References the shared locations table (LOC-1); validated to match groups.sport_id in updateGroupRecurrence';
