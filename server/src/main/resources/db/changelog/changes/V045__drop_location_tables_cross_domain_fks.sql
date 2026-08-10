-- LOC-3: drop cross-domain DB-level FKs on location-impl tables.
-- users belongs to user-impl, a different domain — a DB-level FK is a hard schema
-- coupling that violates "domain-scoped tables" / "cross-domain references use IDs only".
-- Both entities already treat the column as a plain UUID (no @ManyToOne), so this is
-- schema-only: no entity/service/DTO change.
-- Confirmed no code path relies on user_favorite_locations' ON DELETE CASCADE — user
-- deletion is a soft delete (UserServiceImpl.deleteUser sets is_active = false), never a
-- row delete. locations.created_by is NO ACTION, so there was no cascade behavior to lose.

ALTER TABLE locations DROP CONSTRAINT locations_created_by_fkey;
ALTER TABLE user_favorite_locations DROP CONSTRAINT user_favorite_locations_user_id_fkey;
