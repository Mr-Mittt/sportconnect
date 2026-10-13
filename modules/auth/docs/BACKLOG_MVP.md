# Auth Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-10-11

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon auth MVP` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A14](MVP/A14_NARROW_JWT_FILTER_CATCH_ALL.md) | Low priority: narrow `JwtAuthenticationFilter`'s catch-all so unexpected failures (DB, claim bugs) surface as a 5xx with an `errorCode` instead of a silent 401 that triggers client refresh churn; found during A11 | `TODO` |
| 2 | [A15](MVP/A15_PER_SESSION_LOGOUT.md) | Per-session logout: a server-generated `sessionId` (not a MAC address, which browsers cannot read) carried in the access token and refresh row, so logging out on one device no longer signs out the others; deactivation, password reset and new `logout-all` keep a per-user watermark; **now also fixes A19** (refresh rotation stamped `revoked_at`, which fed that watermark, so a routine refresh rejected other devices' valid tokens), so the watermark gets a clean source and a migration; client **AUTH-11** filed; **on hold 2026-10-12** while a Keycloak integration is considered (design written, not approved; see the ticket) | `ON HOLD` |
| 3 | [A16](MVP/A16_SERIALIZE_REFRESH_WITH_PLAIN_LOGOUT.md) | Low priority: a refresh racing a plain `logout` is not serialized by the U12 `users` row lock (only `deleteUser` takes it), so a refresh in flight can mint a live token pair just after logout; found during A12 | `TODO` |
| 4 | [A17](MVP/A17_WIRE_VERIFICATION_AND_WELCOME_EMAILS.md) | Wire the verification email into `register` (after commit) and the welcome email into `verify-email`; neither is sent today, A13 only localises them; needs a decision on gating on verified email | `TODO` |
| 5 | [A18](MVP/A18_SESSION_LIST_AND_REVOKE_ONE.md) | Active-session list and revoke-one (`GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`) with display-only `User-Agent`/IP; split out of A15; client **AUTH-12** | `TODO` |
| 6 | [A20](MVP/A20_WEBSOCKET_AND_CHAT_ACCEPT_REVOKED_TOKENS.md) | Security gap, medium: the STOMP `CONNECT` interceptor (notification-impl) and the chat service verify signature and expiry only, so a token that REST rejects as revoked (logout, deactivation, password reset) still opens a socket or chat until it expires; found by the A15 census; do after A15 | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A13](MVP/A13_LOCALISE_VERIFICATION_AND_WELCOME_EMAILS.md) | New standalone `email` module (`email-api` `EmailSender`/`EmailMessage`, `email-impl` async SMTP sender); auth renders the text and picks the language, so the verification and welcome emails now have en/vi bundles beside the reset one (2026-10-11); `resolveLanguage` needs all three bundles; the reset email moved to the new module; the other two are localised but **not wired** (neither was ever sent), filed as **A17**; `EmailModuleIntegrationTest` | `DONE` |
| 2 | [A12](MVP/A12_EVICT_REVOCATION_CACHE_ON_LOGOUT_AND_DEACTIVATION.md) | Logout, deactivation and password reset now evict the cached revocation watermark after commit (2026-10-10): `TokenRevocationChecker.evictAfterCommit` via `CacheGuard`; "never revoked" sentinel cached for 5 s (`app.jwt.revocation-sentinel-ttl`) to bound a request racing a logout; prod lifetime was 24 h; 3 new ITs; **A15**, **A16** filed | `DONE` |
| 3 | [A11](MVP/A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md) | Redis outage no longer takes down authentication (2026-10-09): new shared `common.cache.CacheGuard` (throttled WARN, recovery INFO); `TokenRevocationChecker` falls back to the DB watermark and skips the write-back; `connect-timeout` 1 s; `RedisOutageAuthenticationIntegrationTest`; ticket symptom corrected (401, not 500) | `DONE` |
| 4 | [A10](MVP/A10_WIRE_FORGOT_PASSWORD_TO_RESET_TOKEN_EMAIL.md) | `forgot-password` now issues and emails a reset token (2026-10-09): `UserService.findUserIdByEmail` (deactivated included), one token per user via V078 unique `user_id`, email sent after commit, `reset-password` revokes refresh tokens, expiry in `app.password-reset.expiration-minutes`, link default `:5173`, **reset email in the user's language** (preference, else country default, else `en`; en/vi bundles); `PasswordResetIntegrationTest`; **A12** and **A13** filed | `DONE` |
| 5 | [A9](MVP/A9_REFRESH_INACTIVE_USER_DEAD_BRANCH_AND_404_LEAK.md) | Deactivated accounts (2026-10-09): login answers `ACCOUNT_DEACTIVATED` for correct credentials, new public `POST /api/auth/reactivate` re-activates and logs in, refresh gives the generic 401 instead of a 404; `AccountReactivationIntegrationTest`; client AUTH-10 filed | `DONE` |
| 6 | [A7](MVP/A7_AUDIT_PUBLIC_API_SURFACE_AND_REMOVE_UNUSED_ENDPOINTS.md) | Audit the public API surface (2026-10-08): blanket `permitAll` on `/api/auth/**`, `/api/sports/**` and the hashtag reads replaced by an explicit public list; nothing deleted; `PublicSurfaceAccessIntegrationTest`; INFRA-10 filed | `DONE` |
| 7 | [A8](MVP/A8_STRUCTURED_ERROR_CODES_ON_APIRESPONSE_ERROR.md) | **[Error handling · Phase B]** Auth error-code audit (2026-10-05): 12 sites coded, register duplicate email 400 → 409, codes in `ERROR_CODES.md`, `AuthErrorCodesIntegrationTest` | `DONE` |
| 8 | [A6](MVP/A6_DROP_AUTH_TABLES_USER_ID_FKS.md) | Drop DB-level FKs on auth tables' `user_id` columns (cross-domain, violates domain-scoped-tables rule) | `DONE` |
| 9 | [A4](MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md) | JWT `jti` claim for guaranteed token uniqueness | `DONE` |
| 10 | [A2](MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md) | Refresh token via httpOnly cookie (client epic's BE-1) | `DONE` |
| 11 | [A3](MVP/A3_FIX_LOGOUT_AUTHORIZATION.md) | Fix `/api/auth/logout` authorization (client epic's BE-2) | `DONE` |

---

**Dependencies:**
```
A2 and A3 are independent of each other, but both touch AuthController.java —
consider doing them in the same session.
Both block the new client's auth integration (see client/docs/BACKLOG_MVP.md):
A2 blocks AUTH-3 and AUTH-5; A3 should ship before AUTH-4 reaches production.
A4 has no dependencies — discovered during AUTH-3's manual verification, fixed
alongside it on the same client branch (user decision).
A5 (rate limiting) moved to V1 on 2026-10-08 — see Removed / Deferred.
```

*(Ticket numbering starts at A2 — A1 was moved to `BACKLOG_V1.md`, see Removed / Deferred.)*

---

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A1 · Apply Redis for refresh token storage | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-07-03) — deprioritized to V1 |
| [A19](MVP/A19_REFRESH_ROTATION_POISONS_REVOCATION_WATERMARK.md) · Refresh rotation poisons the revocation watermark | Folded into **A15** (2026-10-11) — user decision; priority lowered to medium after a hand test showed the client's retry recovers (one wasted 401 + one extra refresh per affected device) |
| A5 · Login/registration rate limiting | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-10-08) — user decision: not much user in MVP, need more user first |
