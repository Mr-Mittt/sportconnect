# A4 · Batch sport lookup in getUserProfiles

**Status:** DONE
**Module:** `modules/sport/sport-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation: collect distinct `sportId`s from the fetched profiles (at
most 3, so this is a tiny batch), one `sportRepository.findAllById(sportIds)` call, build a
`Map<Long, String>` (sportId → name), then map each profile from the pre-resolved map instead of
querying per item.

No divergence — implementation matched the plan exactly.

## What was built

`getUserProfiles(userId)` — previously called `sportRepository.findById(profile.getSportId())`
once per profile inside `.map()`. Now:
```java
List<UserSportProfile> profiles = profileRepository.findByUserIdAndIsActiveTrue(userId);
List<Long> sportIds = profiles.stream().map(UserSportProfile::getSportId).distinct().collect(...);
Map<Long, String> sportNamesById = sportIds.isEmpty()
        ? Map.of()
        : sportRepository.findAllById(sportIds).stream()
                .collect(Collectors.toMap(Sport::getId, Sport::getName));
return profiles.stream()
        .map(profile -> toUserSportProfileResponse(profile,
                sportNamesById.getOrDefault(profile.getSportId(), "Unknown")))
        .collect(Collectors.toList());
```
Guarded for empty input (`Map.of()`, no query) to match the empty-list test's expectation of zero
`findAllById` calls.

## Key decisions

- **Ticketed and fixed purely for cleanliness/consistency, not performance** — per the user's
  explicit choice when this was first flagged. Confirmed at ticketing time (and unchanged by this
  implementation) that `getUserProfiles` can never return more than 3 items, since `createProfile`
  enforces a max-3-active-profiles-per-user rule with no bypass path. This was never a real N+1
  scaling risk, unlike the tickets fixed earlier in the cross-module audit (group-impl A7/A8,
  post-impl A6/A7, user-impl U8).

## Non-obvious constraints

- No change to what data is displayed — same fields/values, same `"Unknown"` fallback for a missing
  sport.
- `sportRepository.findAllById` is a built-in `JpaRepository` method — no new repository method or
  custom query needed, so there's no JPQL-correctness risk to flag for this ticket (unlike A3).

## Tests

Updated `UserSportProfileServiceImplSpec.groovy`:
- `"getUserProfiles should return all active profiles for user"`: mock shifted from 2 separate
  `1 * sportRepository.findById(sportIdN)` calls to `1 * sportRepository.findAllById([sportId1, sportId2])`.
- Added 1 new test: `"getUserProfiles should return an empty list without querying sports when user
  has no profiles"` — asserts `0 * sportRepository.findAllById(_)` for the empty-input guard.

Run: `./gradlew :modules:sport:sport-impl:test` — all pass. `./gradlew
:modules:sport:sport-impl:compileJava` succeeds. `:server:bootRun` reaches the expected
local-Postgres connection failure (no local Postgres in this sandbox) — no risk here regardless,
since `findAllById` is a built-in method with no new query to validate.

---

**Status:** `DONE`  
**Type:** Cleanliness (explicitly NOT a scaling fix — see below)  
**Scope:** `UserSportProfileServiceImpl.java` only

**Found while starting A1**, flagged by this module's own `CLAUDE.md` gotcha ("The service fetches
Sport by ID for each profile in getUserProfiles() — potential N+1 on large lists"). Verified before
ticketing: this is **not actually a scaling risk**, unlike the group-impl A7/A8, post-impl A6/A7, and
user-impl U8 tickets from the recent cross-module N+1 audit. `createProfile()` enforces "a user
cannot have more than 3 active sport profiles" (checked via
`profileRepository.findByUserIdAndIsActiveTrue(userId).size() >= 3` before every save), and confirmed
via `grep` that `profileRepository.save()` has no other call site that could bypass this check — so
`getUserProfiles(userId)` can never return more than 3 items, for any user, ever. This is the same
bounded-by-business-rule shape as group-impl's pinned-posts loops (capped at 3), not the same bug
class as a paginated N+1.

**Current code (`getUserProfiles`, ~lines 74-83):**
```java
public List<UserSportProfileResponse> getUserProfiles(UUID userId) {
    return profileRepository.findByUserIdAndIsActiveTrue(userId).stream()
            .map(profile -> {
                Sport sport = sportRepository.findById(profile.getSportId()).orElse(null);
                String sportName = sport != null ? sport.getName() : "Unknown";
                return toUserSportProfileResponse(profile, sportName);
            })
            .collect(Collectors.toList());
}
```

**Why ticketed anyway:** user's explicit call — ticketed for code cleanliness/consistency with the
batching pattern used elsewhere in the codebase, not because of a performance concern. Treat as
low priority relative to A1–A3.

**Fix approach:** collect distinct `sportId`s from the fetched profiles (at most 3, so this is a
tiny batch), one `sportRepository.findAllById(sportIds)` call, build a `Map<Long, String>`
(sportId → name), then map each profile from the pre-resolved map instead of querying per item —
same shape as the batching helpers added in group-impl/post-impl/user-impl, just applied to a
3-item-max list instead of an unbounded page.

**Out of scope:** no change to what data is displayed — same fields/values, same `"Unknown"`
fallback for a missing sport.

---
