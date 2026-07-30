-- Session gains ONGOING/CANCELLED statuses (application-side enum change, no DB constraint to
-- widen — status is a plain VARCHAR). CANCELLED sessions carry who cancelled them, when, and an
-- optional free-text reason.

ALTER TABLE sessions ADD COLUMN cancel_reason VARCHAR(500);
ALTER TABLE sessions ADD COLUMN cancelled_by UUID REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN cancelled_at TIMESTAMP;

COMMENT ON COLUMN sessions.cancel_reason IS 'Optional free-text reason, set only when status=CANCELLED';
COMMENT ON COLUMN sessions.cancelled_by IS 'Who cancelled the session — the creator (standalone) or an owner/admin (group-linked)';
