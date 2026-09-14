-- SESSION-24: location and fee become optional at session creation — a session missing either
-- now starts PREPARING instead of SCHEDULED until the creator completes them via updateSession.
ALTER TABLE sessions ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN fee_type DROP NOT NULL;
