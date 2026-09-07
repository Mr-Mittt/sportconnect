-- SESSION-23: per-session structured attributes — the session-side counterpart of
-- user_sport_profiles.attributes (V025). Values a caller submits on create/update are filtered
-- against the sport's session attribute schema (A17's sports.session_attributes_schema, V062)
-- with replace semantics before being stored here; the schema itself is validated in the
-- application layer, JSONB gives structural validity only.
--
-- Nullable with NO default: a NULL means "this session carries no attributes", the correct state
-- for every existing row, so there is no backfill and no data migration (pre-launch).

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS attributes JSONB;
