# A21 · Owner-only gate on `GET /api/sports/profiles/{profileId}`

**Status:** `DONE` (2026-09-03)
**Type:** Enhancement (Security)
**Depends on:** — (independent; sits next to A20's owner-only gate on the *list* endpoint)
**Filed:** 2026-09-03, as the direct follow-up A20 deferred — A20 § "Out of scope" left
`GET /profiles/{profileId}` public (`security = {}`) while making the list endpoint owner-only. Same
data (`skillLevel`, `bio`, `yearsOfExperience`, `preferredPosition`, gear `attributes`), so the
same reasoning applies: reading a user's sport profile by id should require being that user.

## Consumer census (CLAUDE.md § API Change Discipline)

`GET /api/sports/profiles/{profileId}` → `SportController.getProfileById` →
`UserSportProfileService.getProfileById(Long)`. Contract change is **auth only** — response shape
unchanged.

| Consumer | Verdict |
|---|---|
| `SportController.getProfileById` — the endpoint, `security = {}` | **updated here** |
| `UserSportProfileService.getProfileById(Long)` — service method | **compatible as-is** — only the controller calls it; signature + semantics unchanged, auth enforced at the controller |
| `SecurityConfig` A20 matcher `GET /api/sports/profiles/user/*` | **does not cover** `/profiles/{id}` (no `user/` segment) → **updated here**: widen to also match `GET /api/sports/profiles/*` so anonymous → `401` at the filter chain, not `403` from `@PreAuthorize` |
| `SportProfileAttributeWriteIntegrationTest.java:122` — `GET /api/sports/profiles/{id}` after a PUT | **compatible as-is** — runs under `authenticateAs(userId)`, `userId` owns the profile; re-run to confirm |
| `SportProfileResumeAndVisibilityIntegrationTest.java:156` — `GET` after resume | **compatible as-is** — `authenticateAs(ownerId)`, profile owned by `ownerId` |
| Client — `PUT /sports/profiles/{profileId}` (`useUpdateSportProfile`, PROFILE-4) | **compatible as-is** — different HTTP method; `updateProfile` already owner-gated (A2) |
| Client — **`GET` a single sport profile by id** | **none exists** — client reads sport profiles only via `GET /sports/profiles/user/{userId}` (`useSportProfilesForUser`); no hook, no MSW `http.get` for the singular path |

**Bottom line:** no client and no cross-module backend consumer reads this GET. Only two ITs, both
already owner-authenticated. Low risk.

## What ships

**1. Owner-only gate on `SportController.getProfileById`:**
- `@PreAuthorize("hasRole('USER')")`
- `@AuthenticationPrincipal String callerIdStr`
- after the service fetch, if `response.getUserId()` != caller → `ForbiddenException` (`403`)
- drop `security = {}`; add `401` / `403` to `@ApiResponses`

Fetch-then-authorize — the "gate a single-item path after fetching the entity" pattern
(CLAUDE.md § Resource access). `404` still wins for a missing / soft-deleted profile (the fetch
throws `ResourceNotFoundException` before the ownership check).

**2. `SecurityConfig` (auth-impl):** widen the existing A20 GET matcher to
`.requestMatchers(HttpMethod.GET, "/api/sports/profiles/*", "/api/sports/profiles/user/*").authenticated()`.
Single `*` = exactly one path segment, so the still-public
`GET /profiles/user/{userId}/sport/{sportId}` (3 segments after `profiles/`) is **not** caught.

**3. Service — unchanged.**

## Edge cases

- Missing / soft-deleted profile → `404` (unchanged; thrown before the ownership check).
- Authenticated non-owner → `403` (`ForbiddenException`).
- Anonymous → `401` (new `SecurityConfig` matcher rejects at the filter chain via
  `jwtAuthenticationEntryPoint`, before the controller).
- Profile under a since-deactivated sport → `404` (unchanged A7 gate in `getProfileById`).

## Account lifecycle

Public → authenticated (`hasRole('USER')`) read of the caller's **own** data. Inherits — does not
widen — the standing U12 access-token-window gap (a deactivated user with an unexpired token can
still call it, like every authenticated endpoint). No new `isActive` check.

## Client-visible

- `GET /api/sports/profiles/{profileId}` is now owner-only (`401` anonymous, `403` non-owner). No
  client code calls it today, so **no client ticket required** — noted here in case a future client
  feature wants a "view another user's single sport profile" flow (it would need a PII-scoped public
  variant, same as A20's other-user-display note).
- No enum / event-type change.

## Out of scope

- `GET /api/sports/profiles/user/{userId}/sport/{sportId}` (`getUserProfileForSport`) — the
  **identical** remaining public read gap. Left for a follow-up (or fold in if picked up together);
  A21 is scoped to `getProfileById` as filed.
- Any change to `getProfileById`'s service logic or response shape.
- A public PII-scoped variant for viewing another user's profile — not needed until a client
  feature asks for it.

## Tests

- **Integration** (`server/src/test/java/com/sportconnect/integration/`, authorization boundary —
  mandatory): add to `SportProfileResumeAndVisibilityIntegrationTest` (or a focused new class) —
  - owner `GET /api/sports/profiles/{id}` → `200`;
  - a different authenticated user → `403`;
  - anonymous → `401`;
  - missing id (still, as owner) → `404`.
- Re-run `SportProfileAttributeWriteIntegrationTest` — its post-PUT `GET` at line 122 must stay
  `200` (caller owns the profile).
- No new Spock case needed — `getProfileById`'s service behaviour is unchanged and already covered.

---

## Implementation summary (2026-09-03)

### Approved design

Two files, exactly as scoped above. No service, DTO, migration, or repository change.

| Layer | Change |
|---|---|
| `SportController.getProfileById` (sport-impl) | `@PreAuthorize("hasRole('USER')")` + `@AuthenticationPrincipal String callerIdStr`; after the service fetch, `UUID.fromString(callerIdStr).equals(response.getUserId())` else `ForbiddenException` ("You can only view your own sport profile"); `security = {}` dropped; `@Operation`/`@ApiResponses` updated (200/401/403/404) |
| `SecurityConfig` (auth-impl) | the A20 GET matcher widened from one path to two — `.requestMatchers(HttpMethod.GET, "/api/sports/profiles/*", "/api/sports/profiles/user/*").authenticated()`. Each single `*` = one segment, so `GET /api/sports/profiles/user/{userId}/sport/{sportId}` (3 segments after `profiles/`) stays public |

### What was built

Matches the design — no divergence. The ownership check reuses A20's `getUserProfiles` shape
(`UUID.fromString(principal).equals(...)` → `ForbiddenException`), the only difference being the id
comes from the fetched `UserSportProfileResponse.getUserId()` rather than a path variable
(fetch-then-authorize).

### Key decisions

- **`404` before `403`.** `getProfileById` throws `ResourceNotFoundException` for a missing /
  soft-deleted / dead-sport profile before the controller can compare ownership, so a non-owner
  gets `404` (not `403`) for an id that isn't theirs *and* doesn't exist — they can't enumerate
  valid ids. An id that exists but isn't theirs → `403`.
- **Anonymous → `401` via `SecurityConfig`, not `403` via `@PreAuthorize`** — same reasoning and
  same fix shape as A20 (`/api/sports/**` stays `permitAll`, so without a filter-chain matcher an
  anonymous call reaches the method and `GlobalExceptionHandler` maps the denial to `403`).
- **`getUserProfileForSport` left alone** — identical remaining gap, out of scope for A21 as filed;
  a follow-up should close it the same way (its path is 3 segments after `profiles/`, so it needs
  its own matcher — `/api/sports/profiles/user/*/sport/*` or similar — plus the controller check).

### Consumer census result (from the ticket body, confirmed)

No client code and no cross-module backend code reads `GET /api/sports/profiles/{profileId}`. The
only consumers were two integration tests, both already owner-authenticated — both stayed green.

### Tests

- `SportProfileResumeAndVisibilityIntegrationTest` — 4 new cases: owner `200`, other user `403`,
  anonymous `401`, missing id `404`.
- `SportProfileAttributeWriteIntegrationTest` — unchanged; its post-PUT `GET` stays `200` (owner).
- Green: `:modules:sport:sport-impl:test`, `:modules:auth:auth-impl:test`, `:server:test`.
