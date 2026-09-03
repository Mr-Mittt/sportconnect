# A22 · Caller-scoped sport-profile reads (drop `{userId}`)

**Status:** `DONE` (2026-09-03)
**Type:** Enhancement (Security)
**Depends on:** none. **Supersedes part of A20** — the owner-only gate on the profile-list
endpoint. A20 is merged; this reworks that endpoint's URL and removes its `principal == {userId}`
check. A20's `getUserProfiles(UUID, boolean)` overload and `?includeInactive=true` behaviour are
kept.
**Filed:** 2026-09-03 — started as the A21 follow-up (A21 § Out of scope named
`GET /api/sports/profiles/user/{userId}/sport/{sportId}` as "the identical remaining public read
gap"). At scoping, the `{userId}` path param on both remaining `user/{userId}` read endpoints
turned out to be redundant — the only sensible answer is "the caller's own" — so the endpoints
should be caller-scoped, not owner-gated.

## What ships

Both sport-profile read endpoints that still take a `{userId}` path param are replaced by
caller-scoped equivalents; the owner is resolved from the JWT principal
(`@AuthenticationPrincipal`), not the path.

| Before | After |
|---|---|
| `GET /api/sports/profiles/user/{userId}` — A20: `@PreAuthorize` + `principal == {userId}` check, `?includeInactive=true` | `GET /api/sports/profiles` — the caller's own profiles; **empty list** when the caller has none; `?includeInactive=true` unchanged |
| `GET /api/sports/profiles/user/{userId}/sport/{sportId}` — public (`security = {}`) | `GET /api/sports/profiles/sport/{sportId}` — the caller's own profile for that sport; **`404`** when the caller has none |

- Both: `@PreAuthorize("hasRole('USER')")`. **No ownership comparison, no `403`** — there is no
  `{userId}` to mismatch, so "not the owner" is not a case.
- `GET /api/sports/profiles` returning `[]` for a caller with no profiles is already
  `getUserProfiles`'s behaviour — no service change.
- `GET /api/sports/profiles/sport/{sportId}` returning `404` (`ResourceNotFoundException`) when the
  caller has no profile for that sport — unchanged `getUserProfileForSport` behaviour.
- Service methods `getUserProfiles(UUID)`, `getUserProfiles(UUID, boolean)` (A20), and
  `getUserProfileForSport(UUID, Long)` are **unchanged** — only the source of the `userId` argument
  moves from the path to the principal in the controller.
- `SecurityConfig`: **remove** the A20 matcher `GET /api/sports/profiles/user/*`; **add**
  `GET /api/sports/profiles` (exact) and `GET /api/sports/profiles/sport/*`, both `.authenticated()`,
  ordered before the `/api/sports/**` permit — anonymous → `401` at the filter chain, consistent
  with A20/A21. A21's `GET /api/sports/profiles/*` matcher stays (covers `/profiles/{profileId}`).

Normal User (`ROLE_USER`) only. Entry points: the two new `GET` paths. Input: `sportId` (single) /
`?includeInactive` (list) + the JWT principal. Output: the caller's own profile data, or an error
status.

## Edge cases

- List, caller has no profiles → `200` with `[]`.
- Single, caller has no profile for `sportId` → `404`.
- Either, profile soft-deleted → omitted (list) / `404` (single) — existing `...AndIsActiveTrue`
  finders.
- Either, sport deactivated → omitted (list) / `404` (single) — existing A6/A7 service gates.
- Anonymous → `401` (new `SecurityConfig` matchers, before the controller).
- Deactivated caller (`isActive = false`) with an unexpired access token → can still call both, the
  same as every authenticated endpoint. Inherits — does not widen — the standing U12
  access-token-window gap. Both are reads of the caller's own non-sensitive data, so **no new
  `isActive` check** is added.

## Consumer census (done at filing; re-confirm at pickup)

- **Cross-module callers of the service methods:** `SessionServiceImpl.discoverSessions` and
  `GroupServiceImpl.getGroupIdsBySportProfiles` call `getUserProfiles(callerId)` **directly** (not
  over HTTP), with the caller's own id. The HTTP path change does not touch them; service
  signatures do not change. **Compatible as-is.**
- **HTTP callers of `GET /api/sports/profiles/user/{userId}/sport/{sportId}`:** none — no client,
  no MSW handler, no other backend module. Only `SportController` + Spock specs.
- **HTTP callers of `GET /api/sports/profiles/user/{userId}`:** the client hooks
  `useRawSportProfilesForUser` / `useSportProfilesForUser` (SportSwitcher, HomeFeed, GroupsPage,
  ProfilePage, FriendsPage, search chips) and the MSW handler
  `http.get('/api/sports/profiles/user/:userId')`. **Correction (pickup 2026-09-03):** A20's
  summary *named* two client follow-ups but recorded them as "filed by the user, not in this PR" —
  and they were never actually filed into `client/docs/BACKLOG_MVP.md`. This census caught that.
  They are now filed: **client `SPORT-10`** (the `isResume` add-sport flow) and **client
  `SPORT-11`** (repoint the self read `/sports/profiles/user/{id}` → `/sports/profiles`, and
  drop/placeholder other-user sport display since the `{userId}` capability is removed). `SPORT-11`
  absorbs the A22 path change and is marked blocked on A22 merging. **Deferred with filed
  follow-up tickets.**
- No client-visible enum, routing key, or event type.

## Out of scope

- `GET /api/sports/profiles/{profileId}` (A21) — already owner-only, unchanged.
- Any endpoint returning **another** user's sport profiles — deliberately removed with the
  `{userId}` param. If a client feature needs other-user sport display, that is a new PII-scoped
  endpoint / ticket (same posture as A20's other-user-display note).
- Any change to the service-layer methods or to `UserSportProfileResponse`.
- The client-side rework — tracked by A20's two client tickets, widened to cover the path change.

## Tests

- `UserSportProfileServiceImplSpec` — service behaviour unchanged; existing `getUserProfiles` /
  `getUserProfileForSport` cases stand. No new service spec.
- Integration (`server/src/test/java/com/sportconnect/integration/`, authorization boundary —
  mandatory):
  - `GET /api/sports/profiles` — authenticated caller with ≥1 profile → `200` + their profiles;
    caller with none → `200` + `[]`; `?includeInactive=true` returns the caller's soft-deleted
    rows (carry the A20 IT cases onto the new path); anonymous → `401`.
  - `GET /api/sports/profiles/sport/{sportId}` — caller with a profile in that sport → `200`;
    caller with none → `404`; anonymous → `401`.
  - Move the A20 owner-only-list IT cases in `SportProfileResumeAndVisibilityIntegrationTest` onto
    the new path; delete the `403`-for-other-user case (the concept no longer exists).

---

## Implementation summary (2026-09-03)

### Approved design

Two production files, one test file. No service, `-api`, DTO, migration, or repository change —
the three service methods (`getUserProfiles(UUID)`, `getUserProfiles(UUID, boolean)`,
`getUserProfileForSport(UUID, Long)`) are untouched; only the controller's *source* of `userId`
moves from a path variable to the JWT principal.

| Layer | Change |
|---|---|
| `SportController.getUserProfiles` (sport-impl) | `@GetMapping("/profiles/user/{userId}")` → `@GetMapping("/profiles")`; `@PathVariable UUID userId` and the `UUID.fromString(callerIdStr).equals(userId)` → `ForbiddenException` guard **both removed** (no path id to mismatch); keeps `@PreAuthorize("hasRole('USER')")` + `@RequestParam(defaultValue="false") boolean includeInactive`; resolves `UUID callerId = UUID.fromString(callerIdStr)` and calls the unchanged `getUserProfiles(callerId, includeInactive)`; `@Operation`/`@ApiResponses` reworded, `403` dropped |
| `SportController.getUserProfileForSport` (sport-impl) | `@GetMapping("/profiles/user/{userId}/sport/{sportId}")` → `@GetMapping("/profiles/sport/{sportId}")`; `@Operation(..., security = {})` marker dropped; `@PathVariable UUID userId` removed; **adds** `@PreAuthorize("hasRole('USER')")` + `@AuthenticationPrincipal String callerIdStr`; calls the unchanged `getUserProfileForSport(UUID.fromString(callerIdStr), sportId)`; `@ApiResponses` gains `401` |
| `SecurityConfig` (auth-impl) | GET matcher list: **removed** `"/api/sports/profiles/user/*"` (A20); **added** `"/api/sports/profiles"` (exact — without it `/api/sports/**` permitAll would make the list endpoint public) and `"/api/sports/profiles/sport/*"` (`/profiles/*`'s single `*` is one segment, does not cover the two-segment `/profiles/sport/{sportId}`); **kept** `"/api/sports/profiles/*"` (A21 get-by-id). Comment block rewritten |

### What was built

Matches the design — no divergence. `ForbiddenException` import stays in `SportController` (still
used by `getProfileById`).

### Key decisions

- **No ownership `403` anywhere in this ticket.** With the `{userId}` param gone there is no
  "not the owner" case for the list or the per-sport read — the principal *is* the scope. The
  positive proof is an IT (`list_authenticated_returnsOnlyTheCallersOwnRows`) that seeds rows for
  two users, authenticates as one, and asserts only that caller's row comes back.
- **Anonymous → `401` via `SecurityConfig`, not `403` via `@PreAuthorize`** — same shape as
  A20/A21. The exact `"/api/sports/profiles"` matcher is load-bearing: `/api/sports/**` stays
  `permitAll`, so without it an anonymous `GET /api/sports/profiles` would reach the method.
- **Per your Phase 1 answer**, the deleted `403`-for-other-user IT slot was replaced by an
  anonymous-`401` assertion on the new list path (not left empty), plus the caller-scoping
  positive test above.
- **`getUserProfileForSport` bad/unknown `sportId`** left to the unchanged service: non-numeric
  path segment → Spring `400` type-mismatch; unknown/absent → `404` (`ResourceNotFoundException`).
  No new sport-exists validation added (Phase 1 decision).

### Consumer census result (re-confirmed at pickup)

- **Service methods** — all three unchanged; `SessionServiceImpl.discoverSessions` and
  `GroupServiceImpl.getGroupIdsBySportProfiles` call them in-process with their own caller id.
  **Compatible as-is.**
- **Backend HTTP callers of either `/profiles/user/...` path** — none (only `SportController` +
  its ITs). No reference in `services/` or `server/src/main`.
- **`SecurityConfig`** — **updated in this change.**
- **Client** — one hook family (`useRawSportProfilesForUser` / `useSportProfilesForUser` /
  `useSportProfiles` / `useMySportProfilesRaw`), the MSW handler
  `http.get('/api/sports/profiles/user/:userId')`, and ~20 `*.test.tsx` stubs; plus genuine
  other-user display in `useFriendsPageData`. A20 *named* two client follow-ups but recorded them
  as "filed by the user, not in this PR" — **they were never filed**. This census caught that and
  filed them: **client `SPORT-10`** (`isResume` add-sport flow) and **client `SPORT-11`** (repoint
  self read to `/sports/profiles`; drop/placeholder other-user sport display), `SPORT-11` marked
  blocked on A22 merging. **Deferred with filed follow-up tickets.**
- No client-visible enum, routing key, or event type.

### Follow-up filed mid-ticket

`common` **C4** — `NoResourceFoundException`/`NoHandlerFoundException` fall through
`GlobalExceptionHandler`'s catch-all → **500** for every unmapped path (should be `404`). Found in
this ticket's Phase 5 live smoke test: the two `/profiles/user/...` paths A22 removed now return
`500` instead of `404`. Pre-existing (any unmapped path 500s), not introduced here, and the census
confirmed those two paths have zero consumers — so filed as its own cross-cutting `common` ticket
rather than widening A22 into the shared exception handler.

**Delta (C4 done 2026-09-03):** C4 was widened at pickup and also fixed path-var type mismatch →
**400** (was 500 via the same catch-all). This ticket's Edge-cases line "non-numeric `sportId` →
Spring `400` type-mismatch" is only actually true from C4 onward; before C4 that case was a 500.

### Verification

- N+1: none — the controller only relocates an argument; no new mapping loop.
- `./gradlew :modules:sport:sport-impl:test` — green (`--rerun-tasks`).
- `./gradlew :modules:auth:auth-impl:test` — green (`--rerun-tasks`).
- `./gradlew :server:test` — full suite green. `SportProfileResumeAndVisibilityIntegrationTest`
  15/15 (8 new/reworked: `list_callerWith{IncludeInactive,outFlag}...`,
  `list_authenticated_returnsOnlyTheCallersOwnRows`, `list_anonymous_is401` on the new path, and
  `getForSport_{callerWithProfile_is200, callerWithoutProfile_is404, readsTheCallersOwn_notAnotherUsers, anonymous_is401}`).
- Live smoke (fresh `bootRun` on the branch, against dev Postgres): anon → `401` on
  `/api/sports/profiles`, `/api/sports/profiles?includeInactive=true`,
  `/api/sports/profiles/sport/1`, `/api/sports/profiles/1`; `/api/sports` still `200` (public);
  authenticated → `200` + `[]` on the list (and with `?includeInactive=true`), `404` on
  `/api/sports/profiles/sport/{id}` with no profile for the caller.

### Delta for the client (SPORT-11)

The removed endpoints are gone as of this change — `GET /api/sports/profiles/user/{userId}` and
`GET /api/sports/profiles/user/{userId}/sport/{sportId}` both 404 (via C4, currently 500). The
replacements are `GET /api/sports/profiles` (self list, `?includeInactive` kept) and
`GET /api/sports/profiles/sport/{sportId}` (self per-sport, `404` when the caller has none). There
is **no** replacement for reading another user's sport profiles — that capability was removed by
design; a new PII-scoped endpoint would be its own backend ticket.
