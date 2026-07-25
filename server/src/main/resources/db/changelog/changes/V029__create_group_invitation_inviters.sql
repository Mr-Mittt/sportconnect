-- B14: Track every co-inviter on a single group invitation
CREATE TABLE group_invitation_inviters (
    id             BIGSERIAL   PRIMARY KEY,
    invitation_id  BIGINT      NOT NULL REFERENCES group_invitations(id),
    inviter_id     UUID        NOT NULL,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (invitation_id, inviter_id)
);

CREATE INDEX idx_group_invitation_inviters_invitation_id ON group_invitation_inviters(invitation_id);
CREATE INDEX idx_group_invitation_inviters_inviter_id ON group_invitation_inviters(inviter_id);

-- Backfill: every existing invitation's original inviter becomes its first co-inviter row.
INSERT INTO group_invitation_inviters (invitation_id, inviter_id, created_at)
SELECT id, inviter_id, created_at FROM group_invitations;
