-- SESSION-6: join-approval workflow + invite-friends-at-creation.
-- auto_approve backfills existing sessions to true (preserves today's instant-join behavior for
-- them); the column default then flips to false so NEW sessions default to the client's
-- unchecked "Auto approve join request" checkbox. The actual value on every future insert is
-- always set explicitly by SessionServiceImpl (via the entity's @Builder.Default) - the DB
-- default is a backstop, not the source of truth, same as capacity/feeType in V040.
ALTER TABLE sessions ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sessions ALTER COLUMN auto_approve SET DEFAULT false;

-- REQUESTED/INVITED added to session_participants.status (Java enum ParticipantStatus, no DB
-- CHECK constraint - same as the existing JOINED/LEFT values). No new column needed for either -
-- INVITED is set directly at row-creation time for CreateSessionRequest.inviteeIds entries.
ALTER TABLE session_participants ADD COLUMN reject_reason VARCHAR(500);
