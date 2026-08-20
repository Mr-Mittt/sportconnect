-- A8: drop the cross-domain DB-level FK on user_sport_profiles.user_id.
-- users belongs to user-impl, a different domain — a DB-level FK is a hard schema coupling that
-- violates "domain-scoped tables" / "cross-domain references use IDs only". UserSportProfile.userId
-- is already a plain UUID field (no @ManyToOne), so this is schema-only: no entity/service/DTO change.
-- Confirmed no code path relies on this ON DELETE CASCADE: user deletion (UserServiceImpl.deleteUser)
-- is a soft delete (isActive = false) and there is no userRepository.delete/deleteById caller
-- anywhere in the repo, so the cascade has never fired. Same precedent as V048 (post) / V049 (group).
-- user_sport_profiles.sport_id is intentionally left in place — sports is this module's own table.

ALTER TABLE user_sport_profiles DROP CONSTRAINT user_sport_profiles_user_id_fkey;
