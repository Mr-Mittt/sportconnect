# Auth Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-10-09

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
| 1 | [A12](MVP/A12_EVICT_REVOCATION_CACHE_ON_LOGOUT_AND_DEACTIVATION.md) | **Security bug, found during A10:** logout, deactivation and password reset stamp the DB but never evict the Redis revocation watermark, so a cached "never revoked" entry keeps pre-revocation access tokens valid for up to an hour; evict after commit | `TODO` |
| 2 | [A13](MVP/A13_LOCALISE_VERIFICATION_AND_WELCOME_EMAILS.md) | Send the verification and welcome emails in the user's language, reusing the resolution and bundles A10 adds for the reset email; split out of A10 | `TODO` |
| 3 | [A14](MVP/A14_NARROW_JWT_FILTER_CATCH_ALL.md) | Low priority: narrow `JwtAuthenticationFilter`'s catch-all so unexpected failures (DB, claim bugs) surface as a 5xx with an `errorCode` instead of a silent 401 that triggers client refresh churn; found during A11 | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A11](MVP/A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md) | Redis outage no longer takes down authentication (2026-10-09): new shared `common.cache.CacheGuard` (throttled WARN, recovery INFO); `TokenRevocationChecker` falls back to the DB watermark and skips the write-back; `connect-timeout` 1 s; `RedisOutageAuthenticationIntegrationTest`; ticket symptom corrected (401, not 500) | `DONE` |
| 2 | [A10](MVP/A10_WIRE_FORGOT_PASSWORD_TO_RESET_TOKEN_EMAIL.md) | `forgot-password` now issues and emails a reset token (2026-10-09): `UserService.findUserIdByEmail` (deactivated included), one token per user via V078 unique `user_id`, email sent after commit, `reset-password` revokes refresh tokens, expiry in `app.password-reset.expiration-minutes`, link default `:5173`, **reset email in the user's language** (preference, else country default, else `en`; en/vi bundles); `PasswordResetIntegrationTest`; **A12** and **A13** filed | `DONE` |
| 3 | [A9](MVP/A9_REFRESH_INACTIVE_USER_DEAD_BRANCH_AND_404_LEAK.md) | Deactivated accounts (2026-10-09): login answers `ACCOUNT_DEACTIVATED` for correct credentials, new public `POST /api/auth/reactivate` re-activates and logs in, refresh gives the generic 401 instead of a 404; `AccountReactivationIntegrationTest`; client AUTH-10 filed | `DONE` |
| 4 | [A7](MVP/A7_AUDIT_PUBLIC_API_SURFACE_AND_REMOVE_UNUSED_ENDPOINTS.md) | Audit the public API surface (2026-10-08): blanket `permitAll` on `/api/auth/**`, `/api/sports/**` and the hashtag reads replaced by an explicit public list; nothing deleted; `PublicSurfaceAccessIntegrationTest`; INFRA-10 filed | `DONE` |
| 5 | [A8](MVP/A8_STRUCTURED_ERROR_CODES_ON_APIRESPONSE_ERROR.md) | **[Error handling · Phase B]** Auth error-code audit (2026-10-05): 12 sites coded, register duplicate email 400 → 409, codes in `ERROR_CODES.md`, `AuthErrorCodesIntegrationTest` | `DONE` |
| 6 | [A6](MVP/A6_DROP_AUTH_TABLES_USER_ID_FKS.md) | Drop DB-level FKs on auth tables' `user_id` columns (cross-domain, violates domain-scoped-tables rule) | `DONE` |
| 7 | [A4](MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md) | JWT `jti` claim for guaranteed token uniqueness | `DONE` |
| 8 | [A2](MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md) | Refresh token via httpOnly cookie (client epic's BE-1) | `DONE` |
| 9 | [A3](MVP/A3_FIX_LOGOUT_AUTHORIZATION.md) | Fix `/api/auth/logout` authorization (client epic's BE-2) | `DONE` |

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
| A5 · Login/registration rate limiting | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-10-08) — user decision: not much user in MVP, need more user first |
