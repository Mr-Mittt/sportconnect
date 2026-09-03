# A20 · `isResume` mode on sport-profile reactivation

**Status:** `DONE` (2026-09-03)
**Type:** Enhancement (Architecture)
**Depends on:** **A10** (hard — reuses its `ProfileAttributeFilter.retainDefined` prune; the
request-merge / `null`-delete half of A10's pipeline is deliberately *not* used) · relates to **A7**
(revises its reactivation decision)
**Filed:** 2026-09-03, from the A10 `/workon` Phase 2 discussion — deleting a sport profile and
re-adding it currently wipes everything the user had (A7: "reactivation behaves like a fresh
create"). An attribute map (gear lists, structured records) is real effort to lose on a sport
toggle; the user should be able to choose *resume* vs *start fresh*.

## Background — what A7 does today

`deleteProfile` soft-deletes (`isActive = false`); the row's columns are left intact. `createProfile`
finds that row and **reactivates it by overwriting every field from the request** — `skillLevel`,
`bio`, `preferredPosition`, `yearsOfExperience`, and `attributes` (set to `filter(request)`), so
nothing from the pre-delete profile ghosts back. That was A7's explicit call.

## Scope change — 2026-09-03 (a): `isResume` is pure reactivation

`isResume` is now a **pure reactivation flag, not a merge**. Rationale: the client UX is "we detected
your deactivated profile for this sport — we'll re-activate it" with **no edit form**, so there is no
request data to merge in. This removes the null-check scalar merge and the request-merge half of the
attribute pipeline from the original spec below. Also: `isResume == true` with nothing to resume is
now a **`400`**, not a silent fall-through to fresh create — the flag is a deliberate client choice
made *after* detecting the inactive row, so a mismatch is a real error.

## Scope change — 2026-09-03 (b): deactivated-profile visibility + owner-only list

Added at `/workon` pickup — the resume UX can't work without the client being able to *see* the
soft-deleted profile, and today no read path returns one (all three are `isActiveTrue`-scoped).

**b1. `GET /api/sports/profiles/user/{userId}` gains `?includeInactive=true`** (default `false`).
When `true` the response also includes soft-deleted (`isActive:false`) profiles — every row already
carries `isActive` in `UserSportProfileResponse`, so no DTO change. A profile whose **sport** is
deactivated stays excluded (unchanged A7 filter — it can't be resumed anyway). Backed by a new
`UserSportProfileService.getUserProfiles(UUID userId, boolean includeInactive)` overload; the
existing single-arg `getUserProfiles(UUID)` stays **active-only**, so
`SessionServiceImpl.discoverSessions` and `GroupServiceImpl.getGroupIdsBySportProfiles` (both call
the service directly and expect active-only) are untouched.

**b2. That endpoint becomes owner-only.** Two layers:
- a `SecurityConfig` matcher — `.requestMatchers(HttpMethod.GET, "/api/sports/profiles/user/*")
  .authenticated()` ordered **before** the `/api/sports/**` permit — so an **anonymous** caller is
  rejected by the filter chain (`jwtAuthenticationEntryPoint` → **`401`**) instead of reaching the
  controller. The single `*` matches one path segment, so the still-public
  `/api/sports/profiles/user/{userId}/sport/{sportId}` is not caught.
- `@PreAuthorize("hasRole('USER')")` + a `principal == {userId}` check in the controller
  (`ForbiddenException` → **`403`**) for an authenticated caller asking for someone else's list.

It was previously public (`security = {}`). Rationale: a soft-deleted row is only discoverable if
the API reveals it, and sport-profile data (skill level, bio, years of experience, gear attributes)
is personal enough that listing it by user id should require being that user — same direction U11
took with `/api/users/**`.

**Consequence (client breakage, acknowledged):** `useSportProfilesForUser` /
`useRawSportProfilesForUser` currently call this route for **arbitrary** users — ProfilePage viewing
someone else, FriendsPage, search-result sport chips. Those will start getting `403`. A `client`
ticket must adapt them (drop other-user sport display, or a product decision to add a PII-scoped
public variant later — its own backend ticket, not A20). Filed alongside by the user.

**Not doing in A20:** a replacement public/PII-free sport-profile endpoint for other users;
`GET /profiles/{profileId}` and `GET /profiles/user/{userId}/sport/{sportId}` are left public and
unchanged (only the list endpoint was in scope).

## What ships

**1. `Boolean isResume` on `CreateUserSportProfileRequest`.** Absent / `false` → today's A7
behaviour, unchanged. `true` → pure reactivation of a soft-deleted row; **any scalar/attributes data
in the request body is silently ignored**.

**2. Reactivation branch in `UserSportProfileServiceImpl.createProfile`:**

| | `isResume` absent / `false` (A7, unchanged) | `isResume == true` |
|---|---|---|
| precondition | — | an **inactive** row for `(userId, sportId)` must exist (see edge cases) |
| scalar columns (`skillLevel`, `bio`, `preferredPosition`, `yearsOfExperience`) | replaced from the request (even to `null`) | **kept from the old row verbatim**; request fields ignored |
| `attributes` | `filter(request)` — old map discarded | **`retainDefined(oldMap)`** only — A10's prune (drop keys with no live definition), re-validate the rest, keep `isAvailable:false` values verbatim. **No request merge, no `null`-delete handling.** |
| `isActive` | set `true` | set `true` |

**3. Edge cases:**
- **No row at all** for `(userId, sportId)` and `isResume == true` → **`400`** (e.g.
  `"No deactivated profile to resume for this sport"`). Changed from the original "ignored, fresh
  create".
- **Existing row is currently active** and `isResume == true` → still
  `400 "User already has a profile for sport"`, unchanged — `isResume` never overrides the
  active-duplicate guard.
- **Request body carries scalar / attributes data** alongside `isResume == true` → silently ignored
  (resume restores the old row; there is no merge).
- **`skillLevel` is `@NotNull` today** — a minimal resume body (`{sportId, isResume:true}`) would
  `400` at bean validation before the service runs. So `skillLevel`'s `@NotNull` is replaced by a
  conditional check (`@AssertTrue` cross-field): required only when `isResume` is not `true`. The
  ordinary create path still `400`s on a missing skill level exactly as before.
- Sport-active gate (A6/A7 `requireActiveSportById`) and the size cap
  (`validateAttributesSize` on the pruned result) are unchanged and still run.

**4. `GET /api/sports/profiles/user/{userId}?includeInactive=true`** (scope change b1) — new
`@RequestParam(defaultValue = "false") boolean includeInactive`; new
`UserSportProfileService.getUserProfiles(UUID, boolean)` overload; single-arg overload delegates
with `false` and keeps its active-only contract for the session/group callers.

**5. Owner-only gate on that endpoint** (scope change b2) — `SecurityConfig` matcher
(`GET /api/sports/profiles/user/*` → `authenticated()`, ahead of the `/api/sports/**` permit) so
anonymous → `401`; `@PreAuthorize("hasRole('USER')")` + controller `principal == {userId}` check so
an authenticated non-owner → `403`; drop the `security = {}` marker. Needs an
authorization-boundary integration test per CLAUDE.md.

## Account lifecycle

`createProfile` is an existing authenticated endpoint; `isResume` adds no new endpoint or job. The
sport-active gate already runs. Caller `isActive` is the same pre-existing gap every write path
carries (CLAUDE.md / U12) — not introduced here.

Scope change (b2) turns `GET /profiles/user/{userId}` from public into an authenticated
(`hasRole('USER')`, filter-chain + `@PreAuthorize`) endpoint. It stays a read of the caller's *own*
data, so it inherits — not widens — the standing U12 access-token-window gap: a deactivated user
with an unexpired token could still call it, same as every other authenticated endpoint. No new
`isActive` check is added (read of own non-sensitive data); no mitigation beyond the existing gap is
in scope.

## Client-visible

- **DTO change:** `CreateUserSportProfileRequest` gains `isResume`. The client's add-sport flow
  (`useAddSportProfile` / the Add-sport modal) must set it.
- **New list param:** `GET /api/sports/profiles/user/{userId}` accepts `?includeInactive=true`; the
  resume flow uses it to detect a soft-deleted profile for the chosen sport and show a plain
  "we'll re-activate your existing profile" confirmation (no edit form) before calling
  `createProfile` with `isResume: true`.
- **Breaking:** that endpoint is now **owner-only** — `401` for an anonymous caller, `403` for an
  authenticated caller asking for someone else's list. `useSportProfilesForUser` /
  `useRawSportProfilesForUser` call it for arbitrary users today (ProfilePage, FriendsPage,
  search-result sport chips) — those break and must be adapted.
- **Client tickets to file alongside (by the user):**
  1. resume/fresh confirmation in the add-sport flow, using `?includeInactive=true` + `isResume`;
  2. adapt other-user sport-profile display to the new `403` (drop it, or gate a future PII-scoped
     endpoint).
- No enum mirror involved.

## Out of scope

- The client resume/fresh chooser and the other-user-display adaptation (separate client tickets,
  above).
- Any change to `updateProfile` (that is A10).
- A replacement public / PII-free sport-profile endpoint for *other* users — if product still wants
  other-user sport display after b2, that is its own backend ticket.
- `GET /profiles/{profileId}` and `GET /profiles/user/{userId}/sport/{sportId}` — left public and
  unchanged; only the list endpoint is in scope for the owner-only gate.
- Surfacing soft-deleted profiles anywhere other than the `includeInactive` opt-in on the one list
  endpoint.

## Tests

Revised for scope changes (a) pure reactivation and (b) list visibility + owner-only gate:

### `UserSportProfileServiceImplSpec`

- reactivation with `isResume = true`:
  - all old scalar columns survive **verbatim** even when the request sends different (non-null)
    values — request body is ignored;
  - `attributes` = `retainDefined(old)` only: keys with no live definition are pruned, records
    failing their current definition are dropped, `isAvailable:false` values kept — and the request's
    `attributes` are **not** merged in;
  - `isResume = true` with **no row at all** → `400`;
  - `isResume = true` against a currently **active** row → `400` (existing "already has a profile"
    guard);
  - with `isResume` false / absent the existing
    `"createProfile does not inherit stale values from the deleted profile"` still holds (that test
    gets the resume/fresh split).
- `getUserProfiles(userId, true)` returns active **and** inactive profiles (for still-active sports);
  a profile under a **deactivated** sport is still omitted even with `includeInactive = true`.
- `getUserProfiles(userId, false)` and the single-arg `getUserProfiles(userId)` return active-only —
  regression guard for the session/group callers.

### Integration (`server/src/test/java/com/sportconnect/integration/`)

- **Resume round trip:** `DELETE` a profile, then `POST /api/sports/profiles` with `isResume: true`
  **and** a body carrying different scalar + attribute values; the re-`GET` shows the **old** scalars
  and **old** `attributes` (minus any now-undefined keys), none of the request-body values applied.
  A second `POST` with `isResume: true` for a sport the user has no row for → `400`.
- **Owner-only gate (authorization boundary — mandatory):**
  - owner `GET /api/sports/profiles/user/{ownerId}` → `200`; with `?includeInactive=true` the
    soft-deleted row appears, without it, it does not;
  - a *different* authenticated user → `403` (`ForbiddenException` from the controller ownership
    check);
  - anonymous → `401` (the new `SecurityConfig` matcher rejects it at the filter chain via
    `jwtAuthenticationEntryPoint`, before the controller); assert no `data`.
  - no existing server IT `GET`s this route, so nothing else needed updating.

---

## Implementation summary (2026-09-03)

### Approved design

Entirely inside `modules/sport` plus one line in `auth-impl`'s `SecurityConfig`. No migration, no
entity change, no new repository method (`findByUserId` already existed), no cross-domain import.

| Layer | Change |
|---|---|
| `CreateUserSportProfileRequest` (sport-api) | new `Boolean isResume`; `skillLevel`'s `@NotNull` replaced by an `@AssertTrue`/`@JsonIgnore` cross-field getter `isSkillLevelPresentUnlessResume()` — required unless `isResume == true` |
| `UserSportProfileService` (sport-api) | new overload `getUserProfiles(UUID, boolean includeInactive)`; single-arg Javadoc'd as `= getUserProfiles(userId, false)` |
| `UserSportProfileServiceImpl` (sport-impl) | `createProfile` forks on `isResume` to a new private `resumeProfile(userId, request, sport)` — `findByUserIdAndSportId` → `BadRequestException` if absent, reuse A7's "already has a profile" message if active, else `attributes = retainDefined(stored, schema)` (A10 prune only), `isActive = true`, save; scalars untouched. `getUserProfiles(UUID)` now delegates; the body moved to the 2-arg overload, which swaps `findByUserIdAndIsActiveTrue` ↔ `findByUserId` and leaves the dead-sport filter unchanged |
| `SportController` (sport-impl) | `getUserProfiles` gains `@PreAuthorize("hasRole('USER')")`, `@AuthenticationPrincipal`, `@RequestParam(defaultValue="false") boolean includeInactive`, and a `UUID.fromString(callerIdStr).equals(userId)` guard → `ForbiddenException`; `security = {}` dropped; `createProfile` Swagger text updated |
| `SecurityConfig` (auth-impl) | `.requestMatchers(HttpMethod.GET, "/api/sports/profiles/user/*").authenticated()` inserted before `/api/sports/**` permitAll — anonymous → `401` at the filter chain; single `*` leaves `/user/{id}/sport/{sportId}` public |

### What was built

Matches the approved design. One deviation, at the user's instruction mid-implementation:
**anonymous callers now get `401`, not `403`.** The first cut relied only on method-level
`@PreAuthorize` (which, under the `/api/sports/**` permitAll, maps an anonymous denial to `403` via
`GlobalExceptionHandler`). The user asked for `401`, so a narrow `SecurityConfig` matcher was added
ahead of the permit — same shape as U11's `/api/users/**` tightening. Authenticated non-owner is
still `403` (controller ownership check).

### Key decisions / non-obvious constraints

- **Resume reuses only `ProfileAttributeFilter.retainDefined`**, not A10's `mergeAttributes` — a
  resume has no request map to overlay and no `null`-delete semantics. `retainDefined` alone gives
  "prune undefined keys, keep `isAvailable:false` verbatim, re-validate the rest".
- **Scalars are kept by doing nothing** — `resumeProfile` never touches `skillLevel` / `bio` /
  `preferredPosition` / `yearsOfExperience` on the fetched row, so they persist exactly as they were
  before the soft delete.
- **`skillLevel` validation moved from field to cross-field.** `@NotNull` fires at `@Valid` before
  the service runs, so a minimal resume body (`{sportId, isResume:true}`) would have `400`'d. The
  `@AssertTrue` getter keeps the ordinary-create `400` (now keyed `skillLevelPresentUnlessResume` in
  the field-errors map) while letting a resume through. Service specs bypass `@Valid`, so the
  existing "does not inherit stale values" spec is unaffected.
- **`getUserProfiles(UUID)` deliberately kept active-only.** `SessionServiceImpl.discoverSessions`
  and `GroupServiceImpl.getGroupIdsBySportProfiles` call it directly and treat every returned row as
  an active sport interest — a spec asserts `0 * findByUserId` for both the single-arg and the
  `false` overload to guard that.
- **`/api/sports/profiles/user/*` (single star)** matches exactly one path segment, so the
  still-public `getUserProfileForSport` (`/user/{id}/sport/{sportId}`) is not caught by the new
  auth matcher — verified by the ticket staying green with that endpoint untouched.
- **Anonymous → `401`, authenticated non-owner → `403`** — two different layers (filter chain vs
  controller), deliberately.

### Tests

- `UserSportProfileServiceImplSpec` — 3 new resume cases (scalars kept + attributes pruned + body
  ignored; no-row → `400`; active-row → `400`) and 4 new `getUserProfiles` overload cases (`true`
  returns active+inactive; `true` still drops dead-sport rows; `false` and single-arg both
  active-only). Existing "does not inherit stale values" re-labelled as the `isResume`-absent case.
- `SportProfileResumeAndVisibilityIntegrationTest` (new, `:server:test`) — resume round trip through
  the real JSON column (stored scalars + pruned attributes, request body ignored); `isResume:true`
  with nothing to resume → `400`; ordinary create without `skillLevel` still `400`; owner sees the
  soft-deleted row only with `?includeInactive=true`; authenticated non-owner → `403`; anonymous →
  `401`.
- Green: `:modules:sport:sport-impl:test`, `:modules:auth:auth-impl:test`, full `:server:test`,
  full `./gradlew build`.

### Client follow-ups (filed by the user, not in this PR)

1. Add-sport flow: detect a soft-deleted profile via `?includeInactive=true`, show a plain
   "we'll re-activate your existing profile" confirmation, call `createProfile` with `isResume:true`.
2. Adapt other-user sport-profile display (`useSportProfilesForUser` / ProfilePage / FriendsPage /
   search chips) to the new `401`/`403` on `GET /profiles/user/{userId}`.
