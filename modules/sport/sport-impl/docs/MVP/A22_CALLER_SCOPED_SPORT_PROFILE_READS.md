# A22 · Caller-scoped sport-profile reads (drop `{userId}`)

**Status:** `TODO`
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
  `http.get('/api/sports/profiles/user/:userId')`. A20 already recorded these break under its
  owner-only gate and filed **2 client tickets** (repoint the self hook; drop / re-gate other-user
  sport display). Those two tickets now also absorb the **path change**
  (`/sports/profiles` instead of `/sports/profiles/user/${userId}`); no additional client ticket
  needed.
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
