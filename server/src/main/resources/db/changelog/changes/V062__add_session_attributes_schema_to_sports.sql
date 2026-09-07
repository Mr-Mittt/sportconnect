-- A17: per-sport SESSION attribute schema — a second admin-managed attribute definition tree,
-- parallel to attributes_schema (V059), but describing the attributes a *session* (event) of this
-- sport can carry rather than the attributes on a user's sport profile.
--
-- Nullable with NO default: a NULL schema means "this sport's sessions offer no attributes", the
-- correct state for every existing row, so there is no backfill and no data migration.
-- Deliberately unseeded — an admin fills it in through the client ADMIN-5 editor.
--
-- The document shape (groups tree with #ref / own node kinds + a session-local definitions
-- registry) is validated in the application layer by SessionAttributeSchemaValidator, not by the
-- database: JSONB gives structural validity only.

ALTER TABLE sports ADD COLUMN IF NOT EXISTS session_attributes_schema JSONB;
