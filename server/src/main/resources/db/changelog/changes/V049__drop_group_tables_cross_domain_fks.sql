-- B17: drop cross-domain DB-level FKs on group-impl tables.
-- users/locations belong to user-impl/location-impl, different domains — a DB-level FK is a hard
-- schema coupling that violates "domain-scoped tables" / "cross-domain references use IDs only".
-- All five columns already treat the value as a plain UUID/Long (no @ManyToOne), so this is
-- schema-only: no entity/service/DTO change.
-- Confirmed no code path relies on groups.created_by's ON DELETE CASCADE (the one cascade among
-- these five): user deletion (UserServiceImpl.deleteUser) is a soft delete (isActive = false),
-- never a row delete, so the cascade has never fired. Same precedent as post-impl's V048.

ALTER TABLE groups DROP CONSTRAINT groups_created_by_fkey;
ALTER TABLE groups DROP CONSTRAINT groups_recurrence_location_id_fkey;
ALTER TABLE group_members DROP CONSTRAINT group_members_user_id_fkey;
ALTER TABLE group_join_requests DROP CONSTRAINT group_join_requests_user_id_fkey;
ALTER TABLE group_join_requests DROP CONSTRAINT group_join_requests_reviewed_by_fkey;
