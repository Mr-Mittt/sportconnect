-- SESSION-28 Part 2: partial index for the "my sessions"-shaped queries that dominate
-- session_participants access -- discoverSessions, getJoinedSessions/getJoinedSessionsByStatus,
-- getSessionHistory, getSessionHistoryDates all filter this table by (user_id, status = 'JOINED')
-- in a subquery, but only a plain single-column index on user_id existed until now, so Postgres
-- narrowed by user_id then applied status as a residual filter on whatever rows came back.
--
-- Scoped to status = 'JOINED' (not a full (user_id, status) composite) since that's the status
-- nearly every consumer filters on -- same partial-index technique as idx_sessions_scheduled_
-- status_only (V052, SESSION-12). getUpcomingSessions/getUpcomingSessionsByDate's IN (JOINED,
-- INVITED) filter still falls back to the existing plain idx_session_participants_user_id for
-- its INVITED half, which stays untouched -- pending invites per user are typically very few, so
-- that fallback costs little.
--
-- Rows are never deleted from this table (a leave/decline/reject flips status to LEFT rather than
-- removing the row), so a full composite index would grow with every historical status forever;
-- this partial index only ever tracks the live JOINED slice.

CREATE INDEX idx_session_participants_user_id_joined ON session_participants(user_id)
    WHERE status = 'JOINED';
