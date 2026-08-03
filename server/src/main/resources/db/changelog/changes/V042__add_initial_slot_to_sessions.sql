-- CLIENT-SESSION-3 follow-up: "initial slot" — a creator-declared count of participants already
-- accounted for outside the app (e.g. a team the creator brought with them), on top of whatever
-- real SessionParticipant rows exist. Defaults to 0 for every existing row: nobody predating this
-- column had any such value to backfill, matching this repo's precedent (SESSION-5's capacity/
-- fee_type columns) of keeping a NOT NULL DEFAULT rather than leaving it nullable.
ALTER TABLE sessions ADD COLUMN initial_slot INTEGER NOT NULL DEFAULT 0;
