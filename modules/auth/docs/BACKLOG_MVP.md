# Auth Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-07-06

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon auth MVP` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | A2 | Refresh token via httpOnly cookie (client epic's BE-1) | `DONE` |
| 2 | A3 | Fix `/api/auth/logout` authorization (client epic's BE-2) | `DONE` |
| 3 | A4 | JWT `jti` claim for guaranteed token uniqueness | `DONE` |
| 4 | A5 | Login/registration rate limiting | `TODO` |
| 5 | A6 | Drop DB-level FKs on auth tables' `user_id` columns (cross-domain, violates domain-scoped-tables rule) | `DONE` |

**Dependencies:**
```
A2 and A3 are independent of each other, but both touch AuthController.java —
consider doing them in the same session.
Both block the new client's auth integration (see client/docs/BACKLOG_MVP.md):
A2 blocks AUTH-3 and AUTH-5; A3 should ship before AUTH-4 reaches production.
A4 has no dependencies — discovered during AUTH-3's manual verification, fixed
alongside it on the same client branch (user decision).
A5 has no dependencies. It blocks a future client ticket (not yet filed) that
would surface a distinguishable rate-limit error on Login/Register — that
client ticket only makes sense once A5 ships, same relationship A2/A3 had to
AUTH-3/AUTH-5/AUTH-4 before they shipped.
```

*(Ticket numbering starts at A2 — A1 was moved to `BACKLOG_V1.md`, see Removed / Deferred.)*

---

## Tickets

### A2 · Refresh token via httpOnly cookie
**Status:** `DONE` (2026-07-08) · **Summary:** `modules/auth/docs/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md`  
**Type:** Enhancement (Security)  
**Origin:** BE-1 in `client/docs/sporthub-auth-feed-integration-tickets.md` — the new client's auth
design (access token in memory, refresh token never readable by JS) requires this; also specified in
`modules/auth/docs/AUTHENTICATION_DESIGN.md` and `client/CLAUDE.md`.

`POST /api/auth/login`, `/register`, and `/refresh` currently return `refreshToken` in the JSON body
(`AuthResponse`), and `/refresh` reads it from the request body (`RefreshTokenRequest`) — verified
against `AuthController.java` on 2026-07-06. Move the refresh token to an httpOnly cookie:

- On login/register/refresh: set `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict;
  Path=/api/auth; Max-Age={app.jwt.refresh-expiration}` (use `ResponseCookie` +
  `HttpHeaders.SET_COOKIE`) and **remove `refreshToken` from the `AuthResponse` body**.
- `/refresh`: read the token from the cookie (`@CookieValue("refreshToken")`) instead of the body;
  the body-based `RefreshTokenRequest` can be dropped or kept temporarily for backward compatibility
  with the old client — decide at implementation time (the old client is being discarded, so a clean
  break is likely fine).
- `/logout`: clear the cookie (`Max-Age=0`) in addition to the existing revocation.
- `Path=/api/auth` keeps the cookie off every other request; `Secure` requires HTTPS — confirm local
  dev behavior (e.g. `Secure` conditional on profile) rather than silently dropping the flag.
- CORS: if the client is served from a different origin in dev (Vite on :5173 vs API on :8080),
  `allowCredentials(true)` + explicit allowed origin is required for cookies to flow — verify the
  current CORS config during Phase 2 explore.

**DTO change (`auth-api`):** remove `refreshToken` from `AuthResponse` (keep `accessToken`,
`tokenType`, `expiresIn`, `user`).

**Tests:** login/register/refresh set the cookie and omit the token from the body; refresh with a
valid cookie succeeds; refresh with no/invalid cookie → 401; logout clears the cookie.

---

### A3 · Fix `/api/auth/logout` authorization
**Status:** `DONE` (2026-07-08) · **Summary:** `modules/auth/docs/A3_FIX_LOGOUT_AUTHORIZATION.md`  
**Type:** Bug Fix (Security)  
**Origin:** BE-2 in `client/docs/sporthub-auth-feed-integration-tickets.md`.

`logout(@RequestParam UUID userId)` trusts a client-supplied `userId` with no auth check — any
caller who can reach the endpoint can revoke another user's refresh token. Verified still present in
`AuthController.java` on 2026-07-06.

**Fix:** derive the user from the authenticated principal (same `SecurityUtils.extractUserId()` /
`@AuthenticationPrincipal` pattern as post-impl/sport-impl's A1 tickets) and drop the `userId`
request param entirely.

**SecurityConfig check:** `/api/auth/**` is currently public (needed for login/register/refresh).
Logout must instead require an authenticated caller — add an explicit rule for
`POST /api/auth/logout` ahead of the broader `/api/auth/**` permit (same override pattern as
`GET /api/posts/feed` vs the public-GET convention). Verify rule ordering during Phase 2 explore.

**Client impact:** the new client's AUTH-4 ticket calls `POST /api/auth/logout?userId=` per the
current contract — once this ships, the call becomes `POST /api/auth/logout` with only the Bearer
header. Update `client/docs/BACKLOG_MVP.md`'s AUTH-4 note when this lands.

**Tests:** authenticated logout revokes the caller's own token; unauthenticated call → 401; a
supplied `userId` param (if tolerated at all) cannot revoke a different user's session.

---

### A4 · JWT `jti` claim for guaranteed token uniqueness
**Status:** `DONE` (2026-07-09) · **Summary:** `modules/auth/docs/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`
**Type:** Bug Fix
**Origin:** discovered during the client's AUTH-3 (`client/docs/BACKLOG_MVP.md`) manual verification
against the real running backend — not part of that ticket's own scope.

`JwtTokenServiceImpl.generateToken()` built every JWT from entirely deterministic claims (user id,
email, username, roles, `iat`, `exp` — no random component). JWT `iat`/`exp` are second-precision,
so two tokens generated for the same user within the same wall-clock second were byte-identical,
colliding against `refresh_tokens.token`'s `UNIQUE` constraint (500, not caught gracefully).
AUTH-3's automatic on-load `/refresh` call made this newly reachable in ordinary usage (e.g. a
second tab opened right after signing up).

**Fix:** added a `jti` claim (`UUID.randomUUID()`) to `generateToken()` — the standard JWT claim for
exactly this purpose. No DB migration needed.

**Tests:** `JwtTokenServiceImplSpec` — two tokens generated back-to-back for identical user data now
assert `!=`.

---

### A5 · Login/registration rate limiting
**Status:** `TODO`
**Type:** Enhancement (Security)
**Origin:** flagged during the client's AUTH-6 (`client/docs/BACKLOG_MVP.md`) — that ticket's spec
called for "surface the rate-limiting behavior described in the original auth design ... if the
backend enforces it with a distinguishable error." Verified on 2026-07-12: it does not. A repo-wide
search found no rate-limiting filter/interceptor/aspect, no `bucket4j`/`resilience4j` dependency,
and no rate-limit config anywhere. `modules/auth/docs/AUTHENTICATION_DESIGN.md` (lines 609–612)
documents the intended policy but was never implemented; `README_AUTH_SETUP.md` lists it explicitly
under "TODO / Future Enhancements". Today `/api/auth/login` and `/api/auth/register` accept
unlimited attempts.

**Policy** (from `AUTHENTICATION_DESIGN.md`, unchanged by this ticket — implement what's already
specified, don't redesign the numbers):
- Login: 5 attempts / 15 minutes / IP
- Registration: 3 attempts / hour / IP
- Password reset: 3 attempts / hour / email

**Suggested approach:** Redis is already wired into the app (`spring.data.redis` in
`application-dev.yml`, `spring-boot-starter-data-redis` on the classpath) even though it isn't used
for anything auth-related yet (A1's "Redis for refresh token storage" was deferred to V1 — this
ticket doesn't require that, a rate-limit counter is a much smaller, self-contained use of Redis). A
`RedisTemplate`-backed fixed-window counter keyed by `rate-limit:login:{ip}` (or `:register:{ip}`,
`:reset:{email}`) with a TTL matching the window, incremented per attempt, checked before delegating
to `AuthService`, is the standard shape — implement as a filter or a check at the top of the
relevant `AuthController` methods, whichever fits the existing `JwtAuthenticationFilter` pattern
better (decide during Phase 2 explore).

**Response contract this ticket must define and document** (currently doesn't exist — a future
client ticket depends on it): HTTP status (`429 Too Many Requests` is the standard choice), and the
`ApiResponse<null>` body's `message` shape (e.g. `"Too many login attempts. Try again in 12
minutes."` vs. a machine-readable field like `retryAfterSeconds` the client could use for a
countdown instead of parsing the message string — decide which at implementation time, and record
the choice since the client ticket will need it verified, not guessed, same as every other
AuthResponse-shape ticket in this backlog).

**Tests:** 6th login attempt within the window → 429, not delegated to `AuthService`; window reset
after TTL expires allows a subsequent attempt; registration and password-reset counters are
independent of the login counter and of each other; a successful login does not reset the counter
early (only the TTL does) unless the design doc's intent is otherwise — confirm against
`AUTHENTICATION_DESIGN.md` at implementation time.

**Client impact:** once this ships, file the client ticket AUTH-6 flagged but didn't build — a
`useLogin`/`useRegister` error-message branch that recognizes the 429 shape and shows a
distinguishable message instead of falling through to the generic error string.

---

### A6 · Drop DB-level FKs on auth tables' `user_id` columns
**Status:** `DONE` (2026-08-10) · **Summary:** `modules/auth/docs/A6_DROP_AUTH_TABLES_USER_ID_FKS.md`
**Type:** Enhancement (Architecture)
**Filed:** 2026-08-10, as part of a repo-wide sweep for cross-domain DB-level FKs, following the
precedent set by `post-impl`'s A13 (`posts.sport_id`, `TODO`) — same rationale, applied
domain-by-domain.

**Found:** three `auth-impl` tables carry a real Postgres FK across into `users` (owned by
`user-impl`, a different domain):
- `email_verifications.user_id` → `email_verifications_user_id_fkey`
- `password_reset_tokens.user_id` → `password_reset_tokens_user_id_fkey`
- `refresh_tokens.user_id` → `refresh_tokens_user_id_fkey`

All three predate root `CLAUDE.md`'s "cross-domain references use IDs only" rule (added
2026-07-07) — `V002__create_auth_tables.sql` is part of this repo's initial commit
(2026-03-03), same "predates the rule, never retrofitted" story as A13. Confirmed via
`information_schema.table_constraints` against the live `sportconnect_dev` database, not assumed
from the migration file alone (all `ON DELETE CASCADE`, ~55 cross-domain FKs found repo-wide in
the same sweep, tracked as one ticket per owning domain).

**Why it matters:** same as A13 — a DB-level FK is a hard schema coupling that works against
"monolith-first, microservice-ready." Each of these three JPA entities (`EmailVerification`,
`PasswordResetToken`, `RefreshToken`) already stores `userId` as a plain `UUID` field, no
`@ManyToOne` — the application layer already complies; only the schema constraint doesn't.

**Fix approach:**
```sql
ALTER TABLE email_verifications DROP CONSTRAINT email_verifications_user_id_fkey;
ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_user_id_fkey;
ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_user_id_fkey;
```
Confirm the actual constraint names via `\d <table>` before writing the migration (Postgres's
auto-generated name is conventional, not guaranteed). One new Liquibase changeset, next
sequential `Vxxx` file, registered in `db.changelog-master.xml`. No entity/service/DTO change —
purely schema-level, same as A13.

**Verify before/after:** confirm no code path relies on the `ON DELETE CASCADE` behavior
specifically (vs. an explicit cleanup path) — these three tables are all short-lived/token tables
with their own expiry logic; a user hard-delete cascading them away is plausible but unconfirmed,
grep `UserServiceImpl`/`AuthServiceImpl` for any hard-delete-user path before assuming the cascade
is redundant.

**Out of scope:** `users`/`roles`/`user_roles` (all owned by `user-impl` itself — self-referential,
not cross-domain, no FK to remove); any change to `EmailVerification`/`PasswordResetToken`/
`RefreshToken`'s JPA entities or the services that use them.

---

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A1 · Apply Redis for refresh token storage | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-07-03) — deprioritized to V1 |
