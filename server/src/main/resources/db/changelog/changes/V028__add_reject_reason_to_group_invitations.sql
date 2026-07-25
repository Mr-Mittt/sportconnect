-- B13: Persist a rejection reason on invitee-declined invitations
ALTER TABLE group_invitations ADD COLUMN reject_reason TEXT;

COMMENT ON COLUMN group_invitations.reject_reason IS 'Optional reason the invitee gave when rejecting (status=declined_by_user)';
