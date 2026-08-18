# A7 · Enforce `isActive` on sport-tagged create paths in group/location/session domains

**Status:** `TODO`
**Type:** Bug Fix (business rule enforcement)
**Scope:** `modules/social/group-impl` (`GroupServiceImpl.createGroup`), `modules/location/location-impl`
(`LocationServiceImpl.createLocation`), `modules/session/session-impl` (`SessionServiceImpl.createSession`)
— no `sport-impl` code changes; this module's own `SportService` contract already exposes what's needed.

**Found while** discussing A6's read/write split with the user, generalized beyond `sport-impl` itself:
A6 fixed the one gap inside this module (`UserSportProfileServiceImpl.createProfile` didn't check
`isActive`), but never audited whether *other* domains that tag their own entities with a `sportId`
have the same gap. They do. A read-only survey across `group`, `location`, and `session` confirmed
none of them call anything active-status-related on either read or write:

| Domain | Write path | Currently checks `isActive`? |
|---|---|---|
| `group` | `GroupServiceImpl.createGroup` | No — validates via `userSportProfileService.hasProfileForSport(userId, sportId)`, which is existence-only (a plain `existsByUserIdAndSportId`); doesn't import `SportService` at all |
| `location` | `LocationServiceImpl.createLocation` | No — doesn't even check the sport exists; `SportService` is only imported for `getSportsByIds` name enrichment |
| `session` | `SessionServiceImpl.createSession` | No — only cross-checks the request's `sportId` against the chosen `Location`'s `sportId`; `SportService` is only imported for `sportName` enrichment |

`hasProfileForSport` cannot substitute for an active check: a profile created while a sport was still
active still satisfies it after that sport is later deactivated, so a user could keep creating new
groups/sessions/locations under a sport MVP has turned off, indefinitely.

**Decided policy (same split A6 already established — do not re-litigate):**
- **Read paths stay unfiltered.** `getUserGroups`, `searchLocations`, `discoverSessions`, etc. must keep
  resolving `sportId` unconditionally, exactly like `SportService.getSportById`/`getSportsByIds` already
  do — a group/session/location created while a sport was active must keep working after that sport is
  later deactivated. **No changes to any read path in this ticket.**
- **Write/create paths validate.** Same pattern as `UserSportProfileServiceImpl.createProfile` (A6):
  fetch the sport via `SportService.getSportById(sportId)`, `orElseThrow` if missing (if the call site
  doesn't already 404 on a bad id), then `if (!sport.getIsActive()) throw new BadRequestException(...)`.

**Fix approach, per domain:**
- **`group`:** add `SportService` as a new `sport-api`-only dependency to `GroupServiceImpl` (not
  currently imported); check `isActive` in `createGroup`, alongside (not instead of) the existing
  `hasProfileForSport` check.
- **`location`:** `SportService` is already imported (for `getSportsByIds`); add an `isActive` check
  in `createLocation` using the same dependency, no new cross-domain wiring needed.
- **`session`:** `SportService` is already imported (for `sportName` enrichment); add an `isActive`
  check in `createSession`, but only for the request-supplied-`sportId` branch — the group-inherited
  branch is covered transitively once `group`'s fix lands (a group can no longer be created against an
  inactive sport, so nothing can inherit one from it going forward; a group created before this ticket
  against a sport later deactivated is a pre-existing-data case, same as any other read-path entity —
  out of scope, not silently broken).

**Out of scope:** any change to read/list/discover paths in any of the three domains; retroactively
handling groups/sessions/locations that already exist against a sport deactivated before this ticket
ships (same "existing data keeps working" policy as A6's `getSportById`); adding a new
`SportService.isSportActive(Long)` convenience method — `getSportById(id).isActive()` is a one-line
check and doesn't need a dedicated method for 3 call sites.

**Tests:** one Spock case per domain — create (group/location/session) against a deactivated sport
throws `BadRequestException`; create against an active sport still succeeds (regression guard); no
downstream write (`*Repository.save(_)`) on the rejected path.

---
