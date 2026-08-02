-- SESSION-4: sportId has been required at the application layer for every session-creation
-- path since SESSION-1 (required for standalone, inherited from the group for group-linked) -
-- promote that invariant to the schema, and add the composite partial index the discover query
-- needs (sport_id + status + scheduled_start, scoped to standalone sessions). Bundles SESSION-7,
-- whose exact index shape was deliberately deferred until this query existed.
ALTER TABLE sessions ALTER COLUMN sport_id SET NOT NULL;

CREATE INDEX idx_sessions_sport_id_standalone ON sessions(sport_id, status, scheduled_start)
    WHERE group_id IS NULL;
