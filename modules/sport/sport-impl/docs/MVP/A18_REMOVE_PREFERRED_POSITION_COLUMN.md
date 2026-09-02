# A18 · Remove `user_sport_profiles.preferred_position`

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** none. Coordinate with client **SPORT-8** (removes the field from the profile editor).
**Filed:** 2026-09-02 — user decision: the fixed `preferred_position` column was a mistake. "Position"
is sport-specific (it means something for football, nothing for running, singles/doubles for
badminton), so it belongs in the per-sport attribute schema (A9), not as a flat column sitting
next to `skill_level`/`years_of_experience`.

## What ships

- Liquibase migration dropping `user_sport_profiles.preferred_position` (V003 added it).
- Remove `preferredPosition` from the `UserSportProfile` entity, `CreateUserSportProfileRequest`
  (and its `@Size(max = 100)`), and `UserSportProfileResponse`.
- Remove every `get/setPreferredPosition` in `UserSportProfileServiceImpl` (create, reactivation,
  update null-check block, `toUserSportProfileResponse`).
- Update `server/src/test/resources/schema.sql` if it mirrors the column; fix Spock specs.

No data migration — Badminton/Pickleball schemas don't use it, the column is nullable free text,
and the app is pre-launch. Verify no real rows depend on it at pickup.

## Client-visible

`UserSportProfileResponse` loses a field — a breaking DTO change. Client cleanup is **SPORT-8**,
filed alongside; sequence SPORT-8 first (client stops reading/sending the field) or land them
together, but don't drop the column while the client still references it.

## Out of scope

Adding a "position" attribute to any sport's A9 schema — that's per-sport product content an admin
can add later via ADMIN-2, not this ticket.

## Tests

Existing `UserSportProfileServiceImplSpec` / IT updated to drop the field; a migration smoke check
that the column is gone.
