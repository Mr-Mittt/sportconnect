-- NTF-8: a notification can carry a short text of its own. Today only the join-request rejection fills it (the host's
-- reason, at most 500 characters like the reject request). Nullable and added without a default: every existing row has
-- no message and keeps none, no data is rewritten.
ALTER TABLE notifications ADD COLUMN message VARCHAR(500);
