-- SESSION-28: idx_sessions_group_id and idx_session_participants_session_id are fully redundant
-- with unique_group_session_start (group_id, scheduled_start) and unique_session_user (session_id,
-- user_id) respectively -- both unique constraint indexes already exist (since V031/V032, SESSION-1)
-- with the dropped column as their leading column, so Postgres can serve any single-column lookup
-- on group_id/session_id from the composite unique index's leftmost prefix exactly as well as the
-- dedicated single-column index would. Two btree structures were being maintained on every
-- insert/update for the same query coverage one already provides.
--
-- idx_sessions_created_by and idx_sessions_location_id were also reviewed (created_by has had no
-- equality-filter consumer since SESSION-27 removed getSessionsCreatedByUser/GET /sessions/mine;
-- location_id has no filtering consumer found by grep) -- kept for now, not dropped in this
-- changeset, pending separate confirmation (e.g. pg_stat_user_indexes on the real dev/prod DB)
-- before removing something that might have an undiscovered consumer.

DROP INDEX idx_sessions_group_id;
DROP INDEX idx_session_participants_session_id;
