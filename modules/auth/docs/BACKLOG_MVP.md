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

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A5](MVP/A5_LOGIN_REGISTRATION_RATE_LIMITING.md) | Login/registration rate limiting | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A6](MVP/A6_DROP_AUTH_TABLES_USER_ID_FKS.md) | Drop DB-level FKs on auth tables' `user_id` columns (cross-domain, violates domain-scoped-tables rule) | `DONE` |
| 2 | [A4](MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md) | JWT `jti` claim for guaranteed token uniqueness | `DONE` |
| 3 | [A2](MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md) | Refresh token via httpOnly cookie (client epic's BE-1) | `DONE` |
| 4 | [A3](MVP/A3_FIX_LOGOUT_AUTHORIZATION.md) | Fix `/api/auth/logout` authorization (client epic's BE-2) | `DONE` |

---

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

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A1 · Apply Redis for refresh token storage | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-07-03) — deprioritized to V1 |
