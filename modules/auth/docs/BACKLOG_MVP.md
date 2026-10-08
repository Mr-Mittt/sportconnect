# Auth Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-10-08

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
| 1 | [A9](MVP/A9_REFRESH_INACTIVE_USER_DEAD_BRANCH_AND_404_LEAK.md) | Refresh for an inactive user: dead `ACCOUNT_DEACTIVATED` branch and a 404 that leaks the user id — found during A8, user decision to keep behavior for now | `TODO` |
| 2 | [A10](MVP/A10_WIRE_FORGOT_PASSWORD_TO_RESET_TOKEN_EMAIL.md) | Wire `forgot-password` to issue and email a reset token — it is a placeholder today, so no password reset works end to end; found during CLIENT-ERR-2. Keeps the endpoint A7 would otherwise flag as unused | `TODO` |
| 3 | [A11](MVP/A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md) | Redis outage must not take down authentication — token-revocation cache falls back to the DB watermark with a WARN; found while filing post A19 | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A7](MVP/A7_AUDIT_PUBLIC_API_SURFACE_AND_REMOVE_UNUSED_ENDPOINTS.md) | Audit the public API surface (2026-10-08): blanket `permitAll` on `/api/auth/**`, `/api/sports/**` and the hashtag reads replaced by an explicit public list; nothing deleted; `PublicSurfaceAccessIntegrationTest`; INFRA-10 filed | `DONE` |
| 2 | [A8](MVP/A8_STRUCTURED_ERROR_CODES_ON_APIRESPONSE_ERROR.md) | **[Error handling · Phase B]** Auth error-code audit (2026-10-05): 12 sites coded, register duplicate email 400 → 409, codes in `ERROR_CODES.md`, `AuthErrorCodesIntegrationTest` | `DONE` |
| 3 | [A6](MVP/A6_DROP_AUTH_TABLES_USER_ID_FKS.md) | Drop DB-level FKs on auth tables' `user_id` columns (cross-domain, violates domain-scoped-tables rule) | `DONE` |
| 4 | [A4](MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md) | JWT `jti` claim for guaranteed token uniqueness | `DONE` |
| 5 | [A2](MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md) | Refresh token via httpOnly cookie (client epic's BE-1) | `DONE` |
| 6 | [A3](MVP/A3_FIX_LOGOUT_AUTHORIZATION.md) | Fix `/api/auth/logout` authorization (client epic's BE-2) | `DONE` |

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
