# U15 · `activeSportIds` on `UserInfoResponse`

**Status:** `DONE` (2026-09-04)
**Module:** `modules/user/user-impl`
**Type:** Enhancement (API — additive field + new cross-domain read)
**Filed:** 2026-09-04 — during client **SPORT-11** Phase 1 (user decision). Filed immediately per
CLAUDE.md § API Change Discipline ("file any follow-up ticket the moment it comes out").
**Blocks:** client **SPORT-11** (rewires the friend-profile sport pills onto this field).
**Depends on:** none. Backend **A22** already shipped the caller-scoped sport-profile reads and
deliberately removed the ability to read *another* user's sport profiles.

## Why

A22 removed `GET /api/sports/profiles/user/{userId}` because it leaked a non-owner's full
sport-profile data (skill level, years of experience, preferred position, free-form attributes) to
any authenticated caller. But the client's `FriendProfilePanel` only ever used it for one thing: a
row of **sport name + icon chips** for the selected friend / search result — and the client already
resolves sport name and icon locally from `sportIdMap` (`sportKeyForId`, `sportIconUrlForId`). All
it actually needs from the server is **which sports that user has an active profile for** — a list
of `sportId`s, no profile detail.

`FriendProfilePanel` already fetches `useUserInfo(selectedPersonId)` →
`GET /api/users/{userId}` → `UserInfoResponse` (the PII-free subset from U11). Adding the sport-id
list there means no second request and no new endpoint.

## What ships

### 1. `UserInfoResponse` gains `activeSportIds`

```java
private List<Long> activeSportIds;   // sport ids the user holds an ACTIVE UserSportProfile for; never null, [] when none
```

- Order unspecified — `getUserProfiles(UUID)` gives no ordering guarantee and the client sorts
  for display; no server-side `sorted()`.
- Never `null` — an empty list when the user has no active sport profiles.
- No other field added — **not** skill level, years, position, or attributes. Those are exactly
  what A22 removed and must not come back on a non-owner read.

### 2. Populate it via a cross-domain `sport-api` call

- `user-impl` gains a dependency on **`sport-api`** (interface + DTO only — ID-only, no `-impl`
  import, same pattern as `session-impl` / `group-impl` already use). Add to
  `modules/user/user-impl/build.gradle`.
- Call `UserSportProfileService.getUserProfiles(UUID userId)` — the **active-only** single-arg
  overload (unchanged by A20/A22) — and map `.getSportId()`.
- Wiring: `UserInfoResponse.of(UserResponse)` is a pure static factory with no Spring access, so
  the cross-domain call happens in `UserController` (or a thin `UserService` method) and is passed
  in — e.g. a `UserInfoResponse.of(UserResponse user, List<Long> activeSportIds)` overload. All
  three lookup endpoints (`GET /api/users/{userId}`, `/email/{email}`, `/username/{username}`) get
  the same treatment.
- **N+1 check:** `UserInfoResponse` is returned only by these three *single-user* endpoints today
  (no batch `getUsersByIds` path returns it), so one extra `getUserProfiles` call per request is
  fine. If a batch `UserInfoResponse` path is ever added, it needs a batch sport-ids lookup — note
  this on that future ticket, don't pre-build it here.

### 3. `UserResponse` (the caller's own full profile, `GET /api/users/me`)

Out of scope — `/me` returns `UserResponse`, not `UserInfoResponse`, and the caller reads their own
sports from `GET /api/sports/profiles` (A22). Only add `activeSportIds` to `UserResponse` too if a
concrete need turns up; this ticket doesn't.

## Edge cases

- User has no active sport profiles → `activeSportIds: []`.
- User has a soft-deleted profile only → excluded (the single-arg `getUserProfiles` is active-only).
- A sport that was deactivated app-wide (A6/A7) → already excluded by `getUserProfiles`'s own
  dead-sport filter, so it won't appear.
- Deactivated caller (`isActive = false`) with a live token → same standing U12 gap as every
  authenticated endpoint; this is a read of non-sensitive data (sport ids), so **no new `isActive`
  check** is added — consistent with A22's posture.
- Target user deactivated → `GET /api/users/{userId}` behaviour is unchanged by this ticket
  (whatever it does today for a deactivated target, it still does); `activeSportIds` just reflects
  their profiles.

## Consumer census (do at pickup)

Additive field on a shared DTO — every existing reader stays compatible, but the mirrors must learn
about it:

- **Backend:** `grep` `UserInfoResponse` across all modules. Today only `user-impl` builds it (3
  controller endpoints) and `UserInfoResponse.of` is the only factory. No other backend module
  consumes it. Any `user-impl` Spock/IT that asserts the exact `UserInfoResponse` shape (field
  count, JSON body) needs the new field.
- **Client:** FRIEND-2's `useUserInfo` hook + its TS type mirror (`UserInfoResponse` shape in
  `client/src`), the MSW handler for `GET /api/users/:userId` (+ `/email`, `/username` if mocked),
  and any `*.test.tsx` asserting the user-info body. The client rewire itself is **SPORT-11** —
  list it there, not as a separate client ticket.
- **`:server:test` H2 schema:** no DB change (this reads `user_sport_profiles` via the sport
  service, which the schema already has from sport ITs) — no `schema.sql` addition expected.

## Out of scope

- Any profile *detail* on a non-owner read (skill/years/position/attributes) — permanently removed
  by A22.
- `UserResponse.activeSportIds` (`/me`) — see §3.
- A batch `UserInfoResponse` endpoint — doesn't exist; if added later it carries its own
  batch-lookup requirement.
- The client rewire — **SPORT-11**.

## Tests

- `UserServiceImplSpec` / controller spec — `activeSportIds` reflects the mocked
  `UserSportProfileService.getUserProfiles(id)` result (mapped sport ids, sorted); `[]` when the
  user has none; the field is present on all three lookup endpoints.
- Integration (`server/src/test/java/.../integration/`, in `UserLookupAccessIntegrationTest`) —
  `GET /api/users/{userId}` (and the email / username siblings) for a user with 2 active sport
  profiles + 1 soft-deleted → body carries exactly the 2 active sport ids (assert **membership**,
  not positional order — `getUserProfiles` gives no order guarantee); a second user with none →
  `[]`. Real cross-domain `user-impl → sport-impl` wiring through the Spring context is the point
  (a Spock unit test with `getUserProfiles` mocked can't prove the new `build.gradle` dependency
  resolves and the bean injects).

---

## Implementation summary (2026-09-04)

### Approved design (as built — no divergence)

`modules/common`-style additive change, contained to `user-api` + `user-impl`. No migration,
entity, repository, DB, or `SecurityConfig` change.

| Layer | Change |
|---|---|
| `user-impl/build.gradle` | `+ implementation project(':modules:sport:sport-api')` — first `user-impl → sport-api` edge; `sport-api` depends only on `:modules:common`, so no cycle |
| `UserInfoResponse` (`user-api`) | `+ private List<Long> activeSportIds` (Javadoc'd "never null, `[]` when none, order not guaranteed"). `of(UserResponse, List<Long>)` builder overload — copies to `List.of()` when null so the invariant always holds. 1-arg `of(UserResponse)` kept, delegates with `List.of()` |
| `UserService` (`user-api`) | `+ UserInfoResponse toPublicUserInfo(UserResponse user)` — takes the already-resolved `UserResponse` (not an id) so the by-email / by-username controller paths pay no second user read |
| `UserServiceImpl` | explicit constructor gains `UserSportProfileService` (plain param, **not** `@Lazy` — sport doesn't depend on user, no cycle). `toPublicUserInfo` = `getUserProfiles(user.getId()).stream().map(getSportId).distinct().toList()` → `UserInfoResponse.of(user, ids)`. `@Transactional(readOnly = true)`. **No `sorted()`** (reviewer call — `getUserProfiles` gives no order guarantee, client sorts for display); `distinct()` is defensive only |
| `UserController` | all 3 lookup endpoints: `UserInfoResponse.of(userService.getUserById(id))` → `userService.toPublicUserInfo(userService.getUserById(id))` (and the email / username siblings). `@Operation` text for `/{userId}` notes `activeSportIds` |

### Key decisions

- **`toPublicUserInfo(UserResponse)`, not `getPublicUserInfoBy{Id,Email,Username}`** — one `-api`
  method instead of three, and no double DB read on the two cold key-lookup paths. The controller
  resolves the `UserResponse` as it already did, then enriches.
- **Cross-domain call lives in `UserServiceImpl`, not the controller** — no controller in this
  codebase makes a cross-domain `-api` call (`SessionController`/`GroupController` inject only their
  own domain's service); kept that.
- **`activeSportIds` never null** — enforced in `UserInfoResponse.of`, not left to callers.
- **Active-only** — `getUserProfiles(UUID)` single-arg overload (unchanged by A20/A22) already
  excludes soft-deleted profiles and app-deactivated sports; the IT proves the soft-deleted third
  profile does not appear.

### Consumer census result (from the ticket body, confirmed at implementation)

- Backend: only `user-impl` builds `UserInfoResponse` (3 endpoints) — **updated here**. No other
  backend module reads it (`auth-impl` uses `UserResponse`). `UserLookupAccessIntegrationTest`
  asserted the safe subset with no `activeSportIds` clause → was compatible, **updated here** to
  assert the new field on all 3 endpoints + a `[]` case. `UserServiceImplSpec` **updated here**
  (mock the new dep + 4 new cases).
- Client: `features/friends/types.ts` mirror, `useUserInfo`, `e2e/mocks/handlers/friends.ts`
  `GET /api/users/:userId`, `useFriendsPageData.test` — **deferred to client SPORT-11** (filed,
  already rescoped to consume `activeSportIds`). Additive optional array → U15 shipping first does
  not break the client.
- DB / migrations: none.

### Verification

- N+1: none — one `getUserProfiles` call per single-user request; the 3 endpoints are not batch.
- `./gradlew :modules:user:user-impl:test` — green; `UserServiceImplSpec` 58/58 (4 new
  `toPublicUserInfo` cases: maps + sorts-not-required membership, `[]` when none, de-dupes,
  1-arg `of` yields `[]`).
- `./gradlew :server:test` — full suite green. `UserLookupAccessIntegrationTest` 11/11 — the 3
  `returnsSafeSubsetOnly` tests now also assert `activeSportIds` membership `(badminton, pickleball)`
  with the soft-deleted third profile excluded, + a new `[]`-for-a-user-with-no-profiles case.
  Real `user-impl → sport-impl` bean wiring + H2 `user_sport_profiles` round trip.
- Live smoke (`bootRun`, real Postgres): `GET /api/users/{targetId}` as another caller →
  `activeSportIds:[1,3]` for a target with 2 profiles, PII fields absent; `GET /api/users/{callerId}`
  for a profile-less user → `activeSportIds:[]`.

### Follow-on

Client **SPORT-11** stays blocked until this merges, then rewires the friend-profile sport pills
onto `UserInfoResponse.activeSportIds` (its §2, rescoped 2026-09-04).
