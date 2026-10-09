# A5 · Login/registration rate limiting

**Status:** `TODO`
**Type:** Enhancement (Security)
**Moved from:** `BACKLOG_MVP.md` (2026-10-08) — user decision: not much user in MVP, need more user first, so rate limiting is deprioritized to V1. Nothing in MVP depends on it (the client ticket that would surface the rate-limit error was never filed; AUTH-6 says to file it once A5 ships).
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

**Also covers `POST /api/auth/reactivate` (added by A9, 2026-10-09):** it verifies a password exactly like login, so it is as open to guessing as login and needs the same per-IP limit (share the login counter or add its own).

**Tests:** 6th login attempt within the window → 429, not delegated to `AuthService`; window reset
after TTL expires allows a subsequent attempt; registration and password-reset counters are
independent of the login counter and of each other; a successful login does not reset the counter
early (only the TTL does) unless the design doc's intent is otherwise — confirm against
`AUTHENTICATION_DESIGN.md` at implementation time.

**Client impact:** once this ships, file the client ticket AUTH-6 flagged but didn't build — a
`useLogin`/`useRegister` error-message branch that recognizes the 429 shape and shows a
distinguishable message instead of falling through to the generic error string.

---

## Added 2026-10-09 (from A10): cover `POST /api/auth/forgot-password`

A10 made `forgot-password` send real email. It is a public endpoint that triggers mail for any address, so it needs a limit per IP and per target email (a user must not be able to flood someone's inbox). Until this ticket ships it has none; the MVP accepted that because there is little traffic. Include this endpoint in the rate-limiting scope here.
