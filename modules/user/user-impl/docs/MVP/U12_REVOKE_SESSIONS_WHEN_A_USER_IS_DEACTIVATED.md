# U12 · Revoke sessions when a user is deactivated

**Status:** `TODO`
**Type:** Security Fix
**Scope:** `UserServiceImpl.deleteUser()` (+ new `user-impl` → `auth-api` dependency) for Fix 1;
`JwtAuthenticationFilter`/`SecurityConfig` (`auth-impl`) for Fix 2

**Found while discussing what "delete account" actually does** (2026-08-10 conversation — no
self-service delete exists today; `DELETE /api/users/{userId}` is `ROLE_ADMIN`-only, per U2's
still-open question about whether to add a self-delete path). Traced what deactivation currently
does to a user's live sessions: nothing. `UserServiceImpl.deleteUser()` only sets `is_active =
false` and saves — it never touches `auth-impl`'s token state, and `user-impl` doesn't even
depend on `auth-api` today (confirmed via `build.gradle` — only `user-api` + `common`).

**Current behavior, confirmed by reading the code (not assumed):**
- **Refresh token:** not proactively revoked at deactivation time. It's checked reactively —
  `AuthServiceImpl.refreshToken()` looks up the user and throws `"Account is deactivated"`
  (`AuthServiceImpl.java:137-138`) — but only when the refresh token is next *used*. The token row
  itself sits unrevoked in the DB until then.
- **Access token (JWT):** not checked at all. `JwtAuthenticationFilter.doFilterInternal()` calls
  `jwtTokenService.validateToken(jwt)`, which only checks signature + expiry — no DB lookup, no
  `isActive` recheck, no revocation-list check, on any request. A deactivated user's already-issued
  access token keeps authenticating successfully until it naturally expires (`app.jwt.expiration`,
  currently 1 hour).

**Fix 1 — proactively revoke refresh tokens on deactivation (required for this ticket):**
`AuthService.logout(UUID userId)` (`auth-api`) already does exactly this —
`RefreshTokenRepository.revokeAllUserTokens(userId, now)` — and already accepts an arbitrary
`userId` at the service-interface level (the *controller* restricts it to self via the JWT
principal; the service method itself doesn't). Add `user-impl` → `auth-api` as a new
`implementation project(...)` dependency (no cycle: `auth-api` depends on neither `user-api` nor
`user-impl`), inject `AuthService` into `UserServiceImpl`, and call `authService.logout(userId)`
from `deleteUser()` right after the `isActive = false` save. This closes the "refresh token still
sits valid in the DB" gap — a deactivated user can no longer silently refresh into a new access
token.

**Fix 2 — access-token gap (decide scope at pickup, may be split into its own ticket):**
Closing the up-to-1hr window where an already-issued access token for a deactivated account still
works requires a per-request active-status check, which trades away part of the point of a
stateless JWT (per `KEYCLOAK_VS_CUSTOM_AUTH.md`'s own "stateless JWT can't be revoked easily"
tradeoff). Two options to weigh, don't assume which:
1. A DB lookup per request (`UserService.getUserById()` from the filter) — simplest, but a
   per-request DB hit defeats a chunk of the stateless-JWT performance argument.
2. A Redis-backed deactivated-user set, checked in `JwtAuthenticationFilter` (Redis is already
   wired into the app; A5, the still-`TODO` login-rate-limiting ticket in
   `modules/auth/docs/BACKLOG_MVP.md`, is about to introduce the same kind of per-request Redis
   check for a different purpose — worth coordinating implementation approach/timing with
   whoever picks up A5, not necessarily bundling the two).
Given the added latency/complexity on *every* authenticated request, confirm with the user whether
this is in scope for MVP or an accepted ~1hr-window risk deferred to V1 before implementing Fix 2.

**Fix 1 vs. Fix 2 — not alternatives, they close different gaps (discussed 2026-08-10, in the
context of location-impl's favorite-locations endpoints, which have no `isActive` check today):**
a per-endpoint `isActive` check (e.g. calling `UserService.getUserById()`, which already throws
`ResourceNotFoundException` for a deactivated user via `findByIdAndIsActiveTrue()`, from inside
`favoriteLocation`/`unfavoriteLocation`/etc.) was floated as a quick stopgap for that one module
and explicitly **rejected** in favor of doing Fix 2 properly instead:
- **Fix 1 (revoke on deactivate) stops new access tokens** — cheap (one call at deactivation
  time, zero added latency on normal requests) — but does nothing about an access token the caller
  already holds; that keeps authenticating everywhere until it naturally expires regardless of
  what happens to the refresh token, since the JWT filter never queries the DB.
- **A per-endpoint `isActive` check stops an already-issued access token from working**, but only
  on whichever endpoints someone remembered to patch. Scattering it feature-by-feature (as
  favorite-locations' patch would have done) recreates the exact discipline problem the new
  CLAUDE.md "Account lifecycle" rule (and its wiring into `/feature`/`/workon`/`/implement`) is
  trying to paper over, rather than closing it once. It's strictly weaker than doing Fix 2 as
  originally scoped below.
- **Conclusion:** implement Fix 1 regardless (it's cheap and unconditionally worth doing), and
  implement Fix 2's **option 2 (Redis deny-list in `JwtAuthenticationFilter`)** rather than
  option 1 or a per-endpoint patch — one check, every request, every endpoint, impossible to
  forget on the next feature. No location-impl-specific fix needed; U12 shipping this way closes
  the favorite-locations gap (and every other endpoint's) in one place.

**Open question for implementer — partial index on `users.is_active`?** Confirmed in the same
2026-08-10 conversation: `users` has no index at all (partial or otherwise) on `is_active` today,
unlike `posts`/`comments`/`groups`, which each have a `WHERE is_active = true` partial index. It's
been a non-issue so far because every existing `is_active`-filtered query already rides a more
selective index (PK, or the unique `idx_users_email`/`idx_users_username`). This ticket is the
first thing that could change that calculus:
- If Fix 2 goes with the **DB-lookup-per-request** option, that's a new `is_active` check (via PK,
  so still fine — no index gap introduced) on *every* authenticated request. Not a reason for a
  partial index by itself, but worth naming since it's the first per-request `is_active` read.
- Not needed for Fix 1 (`deleteUser()` reads by PK, not by `is_active`) or the Redis-deny-list
  option for Fix 2 (no DB query at all).
Net: no proven need yet — decide at implementation time whether Fix 2's chosen approach actually
introduces an unindexed `is_active`-only query pattern before adding one speculatively.

**Tests:** `deleteUser()` calls `authService.logout(userId)` exactly once; a refresh attempt with a
token issued before deactivation now fails immediately (not just on the pre-existing
`isActive`-recheck path, since the token itself is revoked first); if Fix 2 is in scope, a request
with a still-unexpired access token for a deactivated user is rejected.

**Out of scope:** the self-service "delete my own account" endpoint itself (U2's still-open
question — a separate product decision); any change to what `deleteUser()` does to the user's
content/social graph (posts, group memberships, sessions — flagged in the same conversation as a
separate, larger gap, not addressed here).

---
