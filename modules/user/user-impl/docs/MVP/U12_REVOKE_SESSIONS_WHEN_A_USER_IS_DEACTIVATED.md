# U12 · Revoke sessions when a user is deactivated

**Status:** `DONE`
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

## Implementation summary (2026-08-28)

**Built both Fix 1 and Fix 2 exactly per the "Conclusion" above**, plus two things that conclusion
didn't anticipate: row-level locking (a real race the original design missed) and a Redis-durability
redesign for Fix 2 (the originally-sketched "write to Redis at logout time" approach had a gap under
its own scenario). Both surfaced from adversarial questioning during design, not from anything found
in code — recorded here in full since they change the shape of what got built.

### Fix 1 — revoke refresh tokens on deactivation

`UserServiceImpl` gained a constructor-injected `AuthService` and now calls
`authService.logout(userId)` (unchanged — already revokes **every** unrevoked refresh token row for
the user in one bulk `UPDATE`, not just the most recent one) right after flipping `isActive`.

### Row locking — closes a real TOCTOU race the original design didn't cover

Walking through what happens if a `refreshToken()` call and a `deleteUser()` call for the same user
land concurrently surfaced a genuine gap: `AuthServiceImpl.refreshToken()`'s active-user check
(`UserService.getUserById()` → `findByIdAndIsActiveTrue`) is a plain, unlocked read. Under Postgres's
default READ COMMITTED isolation, that read only sees whatever's already **committed** — so if it
executes before a concurrent `deleteUser()` transaction commits, it still sees `isActive = true` and
happily mints a **new** access+refresh token pair, timestamped *after* `deleteUser()`'s revoke sweep
already ran (and so never caught by it). This defeats Fix 1 **and** Fix 2 — the new token's `iat`
postdates the revocation watermark, so the deny-list passes it too.

Fixed with proper pessimistic locking, not just "hope the timing doesn't line up":

- `UserRepository.findByIdForUpdate` (`PESSIMISTIC_WRITE` / `SELECT ... FOR UPDATE`) — used by
  `deleteUser()`. Exclusive; held for the whole transaction.
- `UserRepository.findByIdAndIsActiveTrueForShare` (`PESSIMISTIC_READ` / `SELECT ... FOR SHARE`) —
  new `UserService.getActiveUserForUpdate()`, used by `refreshToken()` in place of `getUserById()`.
  Shared (concurrent refreshes for an *active* user never block each other), but blocks against a
  concurrent `PESSIMISTIC_WRITE`.

Critically, a JPA pessimistic lock is held **for the whole transaction**, not released after the
query returns — that's what closes the harder version of this race too: even if a refresh reads
`isActive = true` and then takes a long time doing the rest of its work (generating tokens, inserting
the new row), the lock it's still holding blocks `deleteUser()` from even starting its own write
until the refresh fully commits. There's no window left for a slow refresh's insert to land after a
deactivation's revoke sweep.

**This locking design can deadlock if done carelessly** — also caught by walking through it, not
discovered by a test. `deleteUser()` locks `users` then writes `refresh_tokens`; the original
`refreshToken()` order was the reverse (revoke the old `refresh_tokens` row, *then* check `users`).
Two transactions taking locks in opposite orders on the same two resources is the textbook deadlock
shape. Fixed by reordering `refreshToken()` to lock `users` first, matching `deleteUser()` — both
paths now acquire `users` → `refresh_tokens` in the same order, so a cycle is structurally
impossible, not just unlikely. (Postgres's deadlock detector would have caught the old ordering and
force-failed one side after ~1s — not a hang, but an ugly raw DB error on a security-sensitive path
that's better prevented than tolerated.)

### Fix 2 — access-token deny-list, redesigned around durability

The plan going into implementation was "write a revocation timestamp to Redis at logout time, read
it in the filter." Walking through **"server and Redis both crash right after deactivation, before
anything is durably written"** showed that design has a real gap: if the write to Redis never
happens (or Redis loses it), the deny-list simply doesn't exist for that user, and their held access
token keeps working for the rest of its lifetime — silently reopening exactly the hole Fix 2 exists
to close.

Redesigned as **cache-aside over data Fix 1 already writes durably**, not write-through to Redis:

- `RefreshTokenRepository.findLatestRevocationTimestamp(userId)` — `MAX(revoked_at)` across all of a
  user's refresh token rows. `revokeAllUserTokens` (Fix 1, already called by both a plain logout and
  a deactivation) stamps every row it touches with the same timestamp in one statement — that's
  already a fully durable, ACID-committed watermark, before Redis is ever touched.
- New `TokenRevocationChecker` (`auth-impl`) — `isRevoked(userId, issuedAt)`. Checks Redis first
  (`auth:revoked-before:{userId}`, TTL = access-token lifetime); on a miss (including "Redis lost
  everything"), falls back to the query above and repopulates the cache. **No separate Redis write
  path anywhere** — the durable write already happened as a side effect of Fix 1, so there's nothing
  for a crash to lose. A cache miss just costs one indexed DB query (`idx_refresh_tokens_user_id`),
  only on the request that hits it, not on every request.
- `JwtTokenService` gained `getIssuedAtFromToken()` (the token's `iat`, already set at generation via
  `setIssuedAt(now)`, just never read back before this).
- `JwtAuthenticationFilter`: after `validateToken()` passes, checks `tokenRevocationChecker.isRevoked(...)`;
  if revoked, skips setting `SecurityContextHolder`'s authentication (same "stay unauthenticated"
  shape the filter already had for a cryptographically invalid token — no new exception type).

This also transparently covers a **plain user-initiated logout**, not just deactivation — since both
call the same `AuthService.logout()`, and the deny-list is sourced from `refresh_tokens.revoked_at`
regardless of which caller set it. A logged-out user's held access token now stops authenticating
immediately too, closing a second, separate latent gap (previously, logout only revoked refresh
tokens; the access token you were holding kept working until it naturally expired) that this
mechanism happened to close for free.

### A circular bean dependency, found only at `:server:test` time

`UserServiceImpl` now depends on `AuthService`; `AuthServiceImpl` already depended on `UserService`.
No cycle at the **Gradle module** level (`auth-api` depends on neither `user-api` nor `user-impl`,
confirmed before writing any code) — but a real cycle at the **Spring bean** level, since both
concrete `-impl` beans live in the same application context and now depend on each other's
interface. `./gradlew :modules:user:user-impl:test`/`:modules:auth:auth-impl:test` (collaborators
mocked) couldn't see this at all; only `:server:test`'s real context wiring surfaced it
(`BeanCurrentlyInCreationException`) — exactly the class of gap CLAUDE.md's testing convention
flags module-level Spock specs as unable to catch.

Fixed the same way `GroupServiceImpl` already solved the identical problem with `PostService`:
explicit constructor (not `@RequiredArgsConstructor`) with `@Lazy` on `authService`. It's only used
for one call in `deleteUser()`, so deferring its resolution to first use is exactly right — `@Lazy`
on a field isn't reliably copied onto a Lombok-generated constructor parameter without a
`lombok.config` entry this repo doesn't have, so (matching `GroupServiceImpl`'s own precedent) the
constructor is spelled out by hand instead.

### Left as pre-existing behavior, not fixed here

`AuthServiceImpl.refreshToken()`'s `if (!user.getIsActive())` check has been dead code since before
this ticket (`getUserById`/now `getActiveUserForUpdate` both filter `isActive = true` in the query
itself, so a deactivated user's read throws `ResourceNotFoundException` — mapped to 404 — before that
line is ever reached). A refresh attempt for a deactivated account therefore returns 404 ("User not
found") today, not the 401 ("Account is deactivated") the dead code implies. Noticed while touching
this exact block; left unchanged since it wasn't part of the agreed scope for this ticket.

### Tests

- `UserServiceImplSpec`: `deleteUser()` uses `findByIdForUpdate` and calls `authService.logout()`
  exactly once; `getActiveUserForUpdate()` mirrors `getUserById()`'s two cases via the locked query.
- `AuthServiceImplSpec`: `refreshToken()` updated to stub `getActiveUserForUpdate` instead of
  `getUserById`.
- `JwtTokenServiceImplSpec`: new case for `getIssuedAtFromToken()`.
- `TokenRevocationCheckerSpec` (new): cache hit (never-revoked and revoked-with-watermark cases via
  a `where:` table), cache miss falling back to the DB and repopulating Redis (both the
  "found a revocation" and "never revoked, caches the sentinel" cases).
- `JwtAuthenticationFilterSpec`: existing "sets authentication" cases updated to stub
  `getIssuedAtFromToken`/`isRevoked(...) >> false`; new case for a revoked token producing no
  authentication.
- New `UserDeactivationSessionRevocationIntegrationTest` (`server/.../integration`, real `MockMvc` +
  real `UserServiceImpl.deleteUser()` + real Redis via `RedisTestContainerBase`) — 4 cases: an active
  user's access token still works (regression guard); deactivation makes a pre-existing refresh
  token fail immediately; deactivation rejects an already-issued access token via the deny-list; the
  same rejection still holds when the Redis cache entry is explicitly deleted first (proves the
  Postgres fallback, not just the happy path). Added `refresh_tokens` to the H2 test schema (mirrors
  `V002__create_auth_tables.sql`; needed `CREATE INDEX IF NOT EXISTS` since the file's other tables
  had never needed a standalone secondary index before, so the non-idempotent form had never been
  exercised across Spring's multiple cached test contexts). Added `testImplementation
  project(':modules:user:user-api')` to `server/build.gradle`, same pattern as the existing
  `auth-api`/`sport-api` entries — needed to call `UserServiceImpl` (which implements `UserService`)
  directly rather than through the admin-only REST endpoint, since the endpoint's own authorization
  wiring isn't what this ticket is testing.
- **Not covered by an automated test**: the concurrent-transaction race the locking closes (a
  refresh racing a deactivation for the same user). Reliably reproducing that exact interleaving
  needs an artificial synchronization hook (e.g. a `CountDownLatch` inside the service method) this
  codebase doesn't have — the fix is verified by the row-locking design/reasoning above, not by a
  deterministic test, same "verification gap, named explicitly" precedent as A3's JSONB mapping.

### Verification

`:modules:user:user-impl:test` and `:modules:auth:auth-impl:test` both green. `:server:test` — full
suite, 135/135 passing (including the 4 new IT cases; also caught and fixed the circular-bean
dependency and the `CREATE INDEX` non-idempotency along the way, both invisible to module-level
tests). No N+1 introduced — every new/changed lookup is single-row, no repository calls inside a
loop or `.map()`.

---
