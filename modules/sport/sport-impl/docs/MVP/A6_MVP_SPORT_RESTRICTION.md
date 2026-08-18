# A6 · MVP sport restriction — deactivate all sports except Badminton & Pickleball

**Status:** DONE
**Module:** `modules/sport/sport-impl`
**Date:** 2026-08-07

## Design

Plan as approved before implementation:

- **Migration:** a data-only Liquibase changeSet (`V043__deactivate_non_mvp_sports.sql`) — a plain
  `UPDATE sports SET is_active = false WHERE name NOT IN ('Badminton', 'Pickleball')`. No explicit
  `<rollback>` block (user decision at pickup): every deactivated row's prior value was `true`, so
  reversing this is a trivially symmetric one-line `UPDATE` if ever needed, not worth Liquibase's
  rollback machinery for a raw SQL changeSet it can't auto-generate a rollback for anyway.
- **Audit every `Sport`/`SportResponse` read path** against this module's own documented gotcha
  ("no global `isActive` filter — always call the correct method explicitly"), before writing any
  code:

  | Call site | Filters `isActive`? | Correct behavior | Action |
  |---|---|---|---|
  | `getAllActiveSports()` / `getSportsByCategory()` (public catalog) | Yes | Public catalog only ever shows active sports | None — already correct |
  | `getAllSports()` (`ROLE_ADMIN`) | No (by design) | Admin needs to see inactive sports to manage/reactivate them | None — already correct |
  | `getSportById()` / `getSportsByIds()` | No (by design, A5) | An existing profile referencing a now-deactivated sport must keep resolving a real name | None — already correct |
  | `UserSportProfileServiceImpl.createProfile()` | **No — existence-only** | Creating a *new* profile for a deactivated sport must be rejected | **Fixed** |
  | `getProfileById` / `getUserProfileForSport` / `updateProfile()` | No | Same reasoning as `getSportById` — must keep displaying an existing profile | None — already correct |

- **Fix:** `createProfile()` gains an active check, placed right after the existing existence check
  and before the max-3-profiles check (fail on the more specific business rule first, matching the
  method's existing check ordering) — `BadRequestException` if `!sport.getIsActive()`, same exception
  type already used for "already exists" and "max 3 profiles" in this method.
- **Deploy-time consequence flagged, not fixed here:** A5's `SportLookupCache` has no TTL
  (evict-on-write only). A plain SQL `UPDATE` against the `sports` table — which is exactly what this
  migration is — bypasses `SportServiceImpl.updateSport()` entirely, so it will **not** evict the
  in-process cache. The running app needs a restart after this migration applies (or the deploy
  happens to restart the app anyway, which is the normal case for a Liquibase-gated boot).

## What was built

- New migration `server/src/main/resources/db/changelog/changes/V043__deactivate_non_mvp_sports.sql`,
  registered in `db.changelog-master.xml`.
- `UserSportProfileServiceImpl.createProfile()`:
  ```java
  Sport sport = sportRepository.findById(request.getSportId())
          .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", request.getSportId()));

  if (!sport.getIsActive()) {
      throw new BadRequestException("Sport '" + sport.getName() + "' is not currently active");
  }

  // ...existing max-3-profiles / duplicate checks unchanged
  ```
- Javadoc added to `createProfile()` covering the new check and explicitly cross-referencing why
  `getSportById`/`getSportsByIds` stay unfiltered (so a future reader doesn't "fix" that as an
  inconsistency).
- No change to `SportServiceImpl`, `SportController`, or any other `UserSportProfileServiceImpl`
  method — confirmed via grep that `createProfile()` is the only place a `UserSportProfile` is ever
  created (`profileRepository.save()` has exactly one call site outside `updateProfile`/
  `deleteProfile`, neither of which touches `sportId`), so there's no second bypass path.

## Key decisions

- **Only `createProfile()` is gated, not every `Sport` read.** An MVP-scale deactivation of 10 of 12
  sports is exactly the scenario the "existing profiles must keep resolving a name" behavior exists
  for — a user with a pre-existing Tennis or Soccer profile must keep seeing "Tennis"/"Soccer" on
  their profile, not `"Unknown"` or a broken page, purely because the sport was turned off after they
  joined it.
- **No explicit Liquibase rollback block** — confirmed with the user before implementing; the inverse
  is a one-line `UPDATE`, not worth modeling as a formal rollback for a changeSet Liquibase can't
  auto-generate one for regardless.

## Non-obvious constraints

- **A5's no-TTL cache + this migration's out-of-band `UPDATE`** — the two tickets interact in a way
  neither, alone, would surface: A5 made "evict on every write" a *sufficient* invalidation strategy
  only because every write path funnels through `SportServiceImpl` (which calls
  `sportLookupCache.evictAll()`). This migration is the first write to `sports` that happens outside
  that path entirely (a Liquibase-run `UPDATE`, not a `PUT /api/sports/{id}` call), so the cache-miss
  guarantee A5 relied on doesn't hold for it. Not a bug in either ticket — just a reminder that
  "evict-on-write" is a claim about the *service's* write surface, not the table's.

## Tests

- `UserSportProfileServiceImplSpec`: new test `"createProfile should throw exception when sport is
  inactive"` — `sportRepository.findById` returns a `Sport` built with `.isActive(false)`, asserts
  `BadRequestException`, `0 *` on both `profileRepository.findByUserIdAndIsActiveTrue` and
  `profileRepository.save` (fails before either is reached). Existing `createProfile` tests
  (success / oversized attributes / already-exists) all build `Sport` via `Sport.builder()` without
  an explicit `.isActive(...)` — confirmed the entity's `@Builder.Default private Boolean isActive =
  true` means those were never at risk of the new check, no changes needed to them.

**Run:** `./gradlew :modules:sport:sport-impl:test` — all passing (47 specs, up from 46 in A5).
`./gradlew :server:test` — passing, full app context loads cleanly.

**Live-verified against real Postgres + a running server** (`./gradlew :server:bootRun`):
- After the migration ran: `SELECT id, name, is_active FROM sports ORDER BY id` confirmed exactly
  Badminton (1) and Pickleball (3) at `is_active = true`, all 10 others `false`.
- `GET /api/sports` returned exactly those 2 sports (public catalog, unaffected code path, sanity
  check that A5's cache picked up the migration correctly on a fresh app start).
- `POST /api/sports/profiles` with `sportId: 5` (Soccer, now inactive) → `400`, `"Sport 'Soccer' is
  not currently active"`.
- `POST /api/sports/profiles` with `sportId: 1` (Badminton, active) → `201`, profile created
  normally.
- Test user and profile cleaned up from the dev database after verification.

---

**Status:** `DONE` (2026-08-07) · **Summary:** `modules/sport/sport-impl/docs/MVP/A6_MVP_SPORT_RESTRICTION.md`
**Type:** Data migration + Bug Fix (business rule enforcement)
**Scope:** New Liquibase migration + `UserSportProfileServiceImpl.java` (+ possibly `SportController.java`
docs/tests). No `SportServiceImpl.java` change needed — see audit below.

**User decision (2026-08-07):** for MVP launch, only **Badminton** and **Pickleball** stay active; all
other seeded sports (Soccer, Tennis, Table Tennis, Basketball, Volleyball, Gym/Fitness, Swimming,
Running, Cycling, Yoga) are deactivated (`is_active = false`), not deleted — same soft-delete
mechanism `deleteSport()` already uses. Ids per `sportIdMap.ts`'s documented INSERT order
(`V003__create_sports_tables.sql`): Badminton=1, Pickleball=3 stay active; 2, 4–12 go inactive.

**1. Liquibase migration** (`server/src/main/resources/db/changelog/changes/`, next sequential —
`V043__...sql`, registered in `db.changelog-master.xml`):
```sql
UPDATE sports SET is_active = false WHERE name NOT IN ('Badminton', 'Pickleball');
```
Data-only migration, no schema change. Since `A5`'s `SportLookupCache` has no TTL (evict-on-write
only), a plain SQL `UPDATE` bypassing `SportServiceImpl.updateSport()` **will not** evict the
in-process cache — the app must be restarted after this migration runs (or a one-off admin
`PUT /api/sports/{id}` call per row, which does evict). Call this out explicitly at deploy time; it
is not a bug in A5, just a consequence of an out-of-band data change against a cache with no TTL.

**2. Audit — every place `Sport`/`SportResponse` data is read, checked against whether `isActive`
should gate it (per `sport-impl/CLAUDE.md`'s own gotcha: "There is no global `isActive` filter —
always call the correct method explicitly"):**

| Call site | Currently filters `isActive`? | Correct behavior | Action |
|---|---|---|---|
| `SportServiceImpl.getAllActiveSports()` (`GET /api/sports`, public catalog) | Yes (`filter(Sport::getIsActive)`) | Public catalog must only ever show active sports | None — already correct |
| `SportServiceImpl.getSportsByCategory()` | Yes (`findByCategoryAndIsActiveTrue`) | Same as above | None — already correct |
| `SportServiceImpl.getAllSports()` (`GET /api/sports/all`, `ROLE_ADMIN`) | No (by design) | Admin needs to see inactive sports too, to reactivate them | None — correct as-is, documented |
| `SportServiceImpl.getSportById()` / `getSportsByIds()` | No (by design, per A5's Javadoc: "includes inactive sports, matching the previous unfiltered `findById` behavior") | An **existing** `UserSportProfile` referencing a now-deactivated sport must keep resolving a real name (not silently become `"Unknown"` for a large, deliberate deactivation like this one) | None — correct as-is; would be a regression to filter here, see next row |
| `UserSportProfileServiceImpl.createProfile()` — `sportRepository.findById(sportId)` | **No — existence-only check, does not reject an inactive sport** | Creating a **new** profile for a deactivated sport must be rejected | **Fix required** |
| `UserSportProfileServiceImpl.getProfileById/getUserProfileForSport/updateProfile()` — `sportRepository.findById(...)` | No | Same reasoning as `getSportById` above — an existing profile for a now-inactive sport must keep displaying, not 404/degrade | None — correct as-is |

**The one real gap:** `createProfile()` only checks the sport exists, not that it's active — a user
can currently open a profile for a sport that's been deliberately turned off. Fix:
```java
Sport sport = sportRepository.findById(request.getSportId())
        .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", request.getSportId()));
if (!sport.getIsActive()) {
    throw new BadRequestException("Sport '" + sport.getName() + "' is not currently active");
}
```
Placed right after the existing existence check, before the max-3-profiles check (fail fast on the
more specific business rule first — matches this method's existing check ordering).

**Out of scope:** no change to `getAllSports()`/`getSportById()`/`getSportsByIds()`'s deliberately
unfiltered behavior (would break existing profile display); no UI/copy for "this sport isn't
offered right now" beyond the new 400 — that's the client ticket's concern (see **SPORT-3**,
`client/docs/BACKLOG_MVP.md`).

**Tests:** migration itself isn't unit-tested (data-only Liquibase change, same precedent as other
`UPDATE`-only migrations in this changelog). Spock, `UserSportProfileServiceImplSpec`: `createProfile`
throws `BadRequestException` when `sport.isActive == false`; `createProfile` still succeeds for an
active sport (regression guard); no `0 * profileRepository.save(_)` invocations on the
rejected-inactive-sport path (fails before reaching the profile-creation logic).

---
