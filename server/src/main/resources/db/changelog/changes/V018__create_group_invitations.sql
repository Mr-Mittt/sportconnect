-- B1: Member invitation flow
CREATE TABLE group_invitations (
    id          BIGSERIAL    PRIMARY KEY,
    group_id    BIGINT       NOT NULL,
    inviter_id  UUID         NOT NULL,
    invitee_id  UUID         NOT NULL,
    status      VARCHAR(25)  NOT NULL DEFAULT 'pending_owner',
    reviewed_by UUID,
    reviewed_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_group_invitations_group_id   ON group_invitations(group_id);
CREATE INDEX idx_group_invitations_invitee_id ON group_invitations(invitee_id);
