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

**Dependencies:**
```
A2 and A3 are independent of each other, but both touch AuthController.java —
consider doing them in the same session.
Both block the new client's auth integration (see client/docs/BACKLOG_MVP.md):
A2 blocks AUTH-3 and AUTH-5; A3 should ship before AUTH-4 reaches production.
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

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A1 · Apply Redis for refresh token storage | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-07-03) — deprioritized to V1 |
