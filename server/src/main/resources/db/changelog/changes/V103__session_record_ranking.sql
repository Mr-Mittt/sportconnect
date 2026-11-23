-- SESSION-72: ranking games. A record is proposed as a ranking game by a JOINED participant and confirmed by every
-- player named in it; the game then counts toward the region and country boards of its venue (SESSION-53).
--
-- On the record itself (plain columns, no jsonb):
--   ranking_requested_by / ranking_requested_at  set once when someone proposes it; null for a normal game.
--   revision                                     starts at 1 and is raised by every update that changes the record's
--                                                data. A confirmation counts only while its revision equals the
--                                                record's, so an edit makes confirmations stale with no write to them.
--
-- One confirmation row per player per record (at most the number of players in the game, 4 for badminton doubles).
-- record_id is a same-domain FK, so deleting a record deletes its confirmations. user_id is a user id only (no FK:
-- cross-domain ids only). No index beyond the primary key: reads are always "the confirmations of these record ids".

ALTER TABLE session_records ADD COLUMN ranking_requested_by UUID;
ALTER TABLE session_records ADD COLUMN ranking_requested_at TIMESTAMPTZ;
ALTER TABLE session_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE session_record_verifications (
    record_id BIGINT NOT NULL REFERENCES session_records (id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    revision INTEGER NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (record_id, user_id)
);
