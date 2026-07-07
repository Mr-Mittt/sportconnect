# B2 · Group–Sport Association + UserSpace

**Status:** DONE  
**Date:** 2026-06-29

## What Was Built

- `groups.sport_id` column added via V015 migration (nullable in DB to handle existing rows; enforced at request level via `@NotNull`)
- `CreateGroupRequest` now requires `sportId`
- `GroupResponse` includes `sportId`
- `createGroup` validates that the calling user has an active `UserSportProfile` for the requested sport — cross-domain check through `UserSportProfileService` interface
- `getPublicGroups` accepts an optional `?sportId=` query param to filter by sport
- `UserSportProfileService` gained `hasProfileForSport(UUID, Long)` for boolean validation
- Max-3 active sport profiles per user enforced in `UserSportProfileServiceImpl.createProfile`

## Key Decisions

**UserSpace = UserSportProfile** — `UserSportProfile` already represented the "user's space per sport" concept (unique `userId + sportId`, skill data, active flag). Creating a new `UserSpace` entity would have been redundant. The existing `UserSportProfileService` interface in `sport-api` was the natural cross-domain seam.

**Nullable DB column** — `sport_id BIGINT` is nullable in the migration to avoid breaking existing dev rows. Enforcement is at the application layer (`@NotNull` on DTO), which is the right boundary for a dev environment with pre-existing data.

**`hasProfileForSport` over exception-as-control-flow** — Added `boolean hasProfileForSport(UUID, Long)` to `UserSportProfileService` rather than catching `ResourceNotFoundException` from `getUserProfileForSport`. Cleaner signal, no exception overhead for a normal validation path.

## Non-Obvious Constraints

- `group-impl/build.gradle` needed `implementation project(':modules:sport:sport-api')` added — the cross-domain dependency was previously absent, so sport validation would have been impossible without this.
- 6 pre-existing Spock tests had under-counted mock interactions (`1 *` where the real call count was 2). These were fixed using `_ *` (any count) to avoid false failures that would mask real regressions.
- `GroupRepository.findByIsActiveTrueAndIsPrivateFalseAndSportId` uses Spring Data's derived query — no JPQL needed.
