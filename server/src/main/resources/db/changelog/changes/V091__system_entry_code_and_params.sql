-- SESSION-GL-63: a server-written entry (a session system comment, the group welcome post) carries a stable code and its
-- params next to its English text, so the client can show it in the user's language. Both columns are nullable: an entry
-- written before this change has no code and keeps showing its stored text (no backfill, owner's decision).
ALTER TABLE comments ADD COLUMN system_code VARCHAR(40);
ALTER TABLE comments ADD COLUMN system_params JSONB;
ALTER TABLE posts ADD COLUMN system_code VARCHAR(40);
ALTER TABLE posts ADD COLUMN system_params JSONB;
