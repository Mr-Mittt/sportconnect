# A7 · Enforce `isActive` on sport-tagged create paths in group/location/session domains

**Status:** `DONE` (2026-08-20)
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

## Implementation summary (`DONE`, 2026-08-20)

**Status:** `DONE` · **Scope grew substantially during the session** — the ticket as filed was a
three-line business-rule fix; what shipped also fixes a live authorization bug the ticket had
mis-described, reverses two of the ticket's own decisions, and makes three product-level changes the
user decided mid-implementation. Every divergence is listed under *Divergences* below rather than
folded silently into the design.

### The approved plan (Phase 3)

1. Rename `UserSportProfileService.hasProfileForSport` → `hasActiveProfileForActiveSport` and make it
   check both conditions.
2. `GroupServiceImpl.createGroup`: inject `SportService`, check sport-active first with its own
   message, then the profile gate.
3. `LocationServiceImpl.createLocation`: sport-active check via the already-injected `sportService`.
4. `SessionServiceImpl.createSession`: sport-active check on the request-supplied `sportId` only.
5. Fix `SportService.getSportsByIds`' Javadoc, which falsely claimed inactive ids were filtered.
6. File the profile re-add bug as a separate ticket.
7. Caller `isActive` documented as an inherited U12 gap, not fixed.

### What was actually built

**The bug the ticket got wrong.** A7 described `hasProfileForSport` as "existence-only... a plain
`existsByUserIdAndSportId`" and treated that as by-design. It was not: the `sport-api` Javadoc said
*"Check if user has an **active** profile for a given sport"*, `LocationServiceImpl.favoriteLocation`'s
own error string said *"You need an **active** profile"*, and `LocationService`'s Javadoc said the
same. Three places documented a behaviour the one-line implementation never had. Two consequences
were live in production code:

- **A soft-deleted profile kept granting access.** `deleteProfile` only flips `isActive`;
  `existsByUserIdAndSportId` matched the row regardless. A user who deleted their Badminton profile
  could still create Badminton groups and favourite Badminton locations, indefinitely.
- **A profile survived its sport's deactivation** as an access grant, which is the gap the ticket was
  actually filed for.

Renamed to `hasActiveProfileForActiveSport` — the name now states both conditions, which is the
whole point: the old name is *why* the missing checks went unnoticed against three contradicting docs.
Backed by a new `existsByUserIdAndSportIdAndIsActiveTrue` plus an active-sport check.

**Inactive sport ⇒ Not Found (user decision).** Rather than each call site fetching a sport and
testing a flag, a deactivated sport is now indistinguishable from a missing one everywhere on the
write path. `SportService.getSportById` was renamed **`requireActiveSportById`** and made
active-only, so unknown and deactivated both throw `ResourceNotFoundException` (404). The `require`
prefix is deliberate and came out of review: the user twice read a `get*` call as a plain fetch and
missed that it enforces something. `get` promises a value; the throw is invisible at the call site.
`getSportsByIds` became **`getActiveSportsByIds`** for the same honesty reason once the cache made
it active-only. This is honest from the
client's side: `GET /api/sports` only ever returned active sports, so a 400 about a sport the caller
was never offered described nothing real.

**`SportLookupCache` is active-only (user decision).** The cache now loads
`findByIsActiveTrue()` and is named `getActiveSportsById()`. A deactivated sport disappears from the
app by default rather than by each caller remembering to filter. The one genuine need for inactive
rows is admin, so `getAllSports()` (the `ROLE_ADMIN` "includes inactive" listing) **bypasses the
cache entirely** and reads the repository — it neither reads nor populates it, asserted by a test.
`updateSport`/`deleteSport` already went straight to the repository, so admin reactivation still
works.

**Profiles under a deactivated sport are hidden, not labelled (user decision).** `getUserProfiles`
previously fell back to a `"Unknown"` sport name; it now filters those profiles out entirely.
`getProfileById` and `getUserProfileForSport` 404 for the same reason, so a client cannot deep-link
to a profile the list omits. Rows are untouched in the table — reactivating the sport restores them.

**The max-3-profiles cap was removed (user decision).** A product limit with no technical driver.
Note this invalidates A4's recorded reasoning that `getUserProfiles`' batched sport lookup "was never
a real N+1 scaling risk" because the list was bounded to ≤3 — that Javadoc is corrected; the batching
is now load-bearing rather than merely tidy.

**Re-adding a deleted profile now reactivates the row.** `(user_id, sport_id)` is `UNIQUE` (V003)
and `deleteProfile` soft-deletes, so the old row both blocked a fresh insert *and* satisfied the old
unfiltered duplicate check — deleting a profile locked the user out of that sport permanently, in
both directions. `createProfile` now reactivates and repopulates the row entirely from the request,
so a re-add behaves like a first-time create that happens to keep its id. Only a currently-*active*
profile is rejected as a duplicate.

**Sport lookups moved onto the cache.** `UserSportProfileServiceImpl` was hitting `sportRepository`
directly for every sport lookup even though A4/A5 had already routed `getUserProfiles` through
`SportService` *specifically* to get cache benefit. All four now go through `SportService`; the
boolean-not-throw case in `hasActiveProfileForActiveSport` reads `SportLookupCache` directly. The
`SportRepository` dependency was dropped from the class entirely.

**Session gating corrected.** The ticket said to check "the request-supplied-`sportId` branch". That
is wrong: the *group* branch also honours `request.getSportId()` when present, falling back to the
group's sport only when absent. Branching on `sessionType` would let a caller-supplied inactive sport
through on a group session, so the check is gated on `request.getSportId() != null` instead.

**Soft-deleted profiles were still individually reachable** (found by the user during review).
`getUserProfiles` omitted them, but `getProfileById` (`findById`) and `getUserProfileForSport`
(`findByUserIdAndSportId`) both used unfiltered finders and returned them — the same
unfiltered-query family as the original `hasProfileForSport` bug, one method away from it. Both
now use active-scoped finders, as does `updateProfile` (a deleted profile is not editable;
re-adding it goes through `createProfile`'s reactivation path instead). `deleteProfile` and
`createProfile`'s reactivation lookup deliberately keep the unfiltered finders — they need to see
the deleted row.

The same review noted that the sport check in those two getters *read* as a name lookup even
though `requireActiveSportById` throws. It was a working gate but an implicit one: batching it or
reordering it would have removed the check silently. Both call sites now say so in a comment, and
a test asserts the gate fires (`getUserProfileForSport gates on sport status, not just the sport
name`).

**`updateProfile` gated the sport only *after* saving** (found by the user, second review pass).
The profile gate (`findByIdAndIsActiveTrue`) says nothing about the sport — they are independent
conditions — and the sport check sat at the tail of the method where the response name was built.
So for a profile under a deactivated sport, every field was mutated and `save()` was called before
the throw; only `@Transactional` rollback stopped it persisting. **Correct by accident.** Splitting
the transaction, or moving this code, would have turned it into a real write-then-fail. This was also
exactly the implicit-gate anti-pattern documented two methods above, left standing in the one method
that writes. The gate is now hoisted above every mutation, the response name comes from that same
call (so it cannot be dropped as an unused lookup), and a Spock test pins the ordering: `save` is
never reached and the entity is unmutated on the way to the throw.

**One Javadoc was wrong in both directions inside this ticket.** `getSportsByIds`' doc originally
claimed inactive ids were filtered when the code returned them; the plan's step 5 corrected the doc to
match the code; then the active-only cache change inverted the behaviour and made that correction
stale within the same session. It now states the real contract, and — more usefully — the method name
carries it (`getActiveSportsByIds`), so the doc is no longer the only thing asserting it. Same
lesson as the `hasProfileForSport` rename: when a name and a doc disagree, people believe the name.

### Divergences from the approved plan

| Planned | Shipped | Why |
|---|---|---|
| Distinct 400 message per call site | Single 404 via `getActiveSportById` | User decision; one rule, one status, no per-site wording |
| `getSportById` kept for reads | Renamed `requireActiveSportById`, active-only | Follows from the active-only cache; name states behaviour |
| Cache stays full master map | Active-only, admin bypasses it | User decision |
| Reads resolve inactive sports (A6 policy) | Profiles under inactive sports hidden | User decision; **reverses A6's read/write split for profiles** |
| max-3 cap retained | Removed | User decision |
| Re-add filed as its own ticket | Implemented here | The `UNIQUE` constraint makes reactivate the only workable option, so there was no design left to defer |
| "No new `SportService` method" (ticket) | Net: none added — existing one renamed | Briefly added `getActiveSportById` alongside `getSportById`, then collapsed once the cache became active-only |
| `SportService` injected into `GroupServiceImpl` | Yes, as planned | Only new cross-domain dependency |

### Not done, deliberately

- **Caller `isActive`.** These are three authenticated create endpoints, and a deactivated *caller*
  can still reach all of them. Confirmed against `JwtAuthenticationFilter`, which validates signature
  and expiry only. Left as the inherited U12 gap per the user's explicit call — recorded here so the
  next person doesn't assume it was handled.
- **Group / session / location list visibility.** Entities tagged with a deactivated sport still
  appear in their own list endpoints (only their sport *name* stops resolving). Hiding them is a
  larger product decision spanning three domains — a group with real members vanishing is not the
  same call as a profile row disappearing. Raised with the user and left unfiled here.

### Tests

- Spock: `sport-impl` (5 new cases for `hasActiveProfileForActiveSport` including a regression guard
  that the unfiltered query is never used; 3 for reactivation; existing A6 cases updated for the
  404 semantics), `group-impl`, `location-impl`, `session-impl` (one deactivated-sport rejection each,
  plus a group-inherited-sportId case asserting *no* sport lookup happens).
- **Integration** (`server/src/test/java/com/sportconnect/integration/SportActiveGateIntegrationTest`),
  5 cases through real `MockMvc` + real beans + real H2. This class exists because mocks cannot prove
  the two things that actually broke: that `existsByUserIdAndSportIdAndIsActiveTrue` really excludes
  a soft-deleted row at the database level, and that reactivation avoids the `UNIQUE` violation a
  second insert would cause. Required adding `user_sport_profiles`, `group_types` and `group_settings`
  to the hand-maintained H2 mirror (`server/src/test/resources/schema.sql`), including the
  `UNIQUE(user_id, sport_id)` constraint, which is load-bearing for the reactivation case.
- Full `./gradlew test` green.

### Known flaky test, pre-existing and unrelated

`SessionEventsConsumerIntegrationTest` fails intermittently with
`AmqpIOException: java.io.IOException` connecting to its RabbitMQ Testcontainer — observed 4 failures
across 8 full runs, including once after a change that was nothing but an identifier rename, and
passing on retry with byte-identical code. **Initially mis-attributed to this ticket** (a single
clean-tree run passed, which is not sufficient evidence for a flaky test); confirmed unrelated by
same-code re-runs. Filed separately.
