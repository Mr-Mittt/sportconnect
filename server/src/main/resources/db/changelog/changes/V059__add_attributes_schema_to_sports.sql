-- A9: per-sport attribute schema — the admin-managed, server-side definition of which attributes
-- a sport offers. Replaces A3's plan of a static client-side config, so the key set can be
-- validated on write and managed at runtime rather than needing a client deploy per sport.
--
-- Nullable with NO default: a NULL schema means "this sport offers no attributes", which is the
-- correct state for every existing row, so there is no backfill and no data migration.
-- Deliberately unseeded — Badminton and Pickleball stay NULL until an admin fills them in through
-- client ADMIN-2. Seeding real attribute trees here would bake product content into a migration,
-- which is far harder to change later than a row an admin can edit.
--
-- The document shape (version/groups/attributes tree) is validated in the application layer, not
-- by the database: see SportAttributeSchemaValidator. JSONB gives structural validity only.

ALTER TABLE sports ADD COLUMN IF NOT EXISTS attributes_schema JSONB;
