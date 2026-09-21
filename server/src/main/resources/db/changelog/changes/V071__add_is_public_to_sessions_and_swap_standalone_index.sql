-- SESSION-37: Session.isPublic -- a real stored column (not derived at query time from group_id),
-- foundation shared with SESSION-39's SessionCount endpoint. Standalone (group_id IS NULL) ->
-- true, group-linked -> false. Not caller-supplied; SessionServiceImpl.createSession derives it.
-- 3-step NOT NULL add, same pattern as V039's sport_id NOT NULL promotion.
ALTER TABLE sessions ADD COLUMN is_public BOOLEAN;

UPDATE sessions SET is_public = (group_id IS NULL);

ALTER TABLE sessions ALTER COLUMN is_public SET NOT NULL;

-- Index (a) predicate swap (SESSION-37 design doc): idx_sessions_sport_id_standalone's predicate
-- moves from group_id IS NULL to is_public = true -- same column list, same population today,
-- just expressed via the new column so SessionRepository.findDiscoverSessions' query base change
-- (s.groupId IS NULL -> s.isPublic = true) still hits this index. is_public is not added as an
-- indexed column itself -- the partial predicate already guarantees every row here has
-- is_public = true, so indexing it again would waste space for no planner benefit. Postgres can't
-- alter a partial index's predicate in place, so this is drop+recreate, not ALTER INDEX.
DROP INDEX idx_sessions_sport_id_standalone;

CREATE INDEX idx_sessions_sport_id_standalone ON sessions(sport_id, status, scheduled_start)
    WHERE is_public = true;
