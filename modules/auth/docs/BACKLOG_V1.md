# Auth Module — V1 Feature Backlog

**Version:** V1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-10-20  
**Prerequisite:** All MVP tickets in `modules/auth/docs/BACKLOG_MVP.md` must be `DONE` before starting V1.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon auth v1` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | A1 | Apply Redis for refresh token storage | `TODO` |
| 2 | [A5](V1/A5_LOGIN_REGISTRATION_RATE_LIMITING.md) | Login/registration rate limiting — moved from MVP 2026-10-08 (not much user in MVP, need more user first) | `TODO` |
| 3 | [A31](V1/A31_REBUILD_KEYCLOAK_USERS_FROM_APP_DB.md) | Rebuild a Keycloak realm's users from the app DB (same ids, no passwords, "set password" email), after saving federated identity links in an app table; owner request 2026-10-15 | `TODO` |
| 4 | [A22](V1/A22_USERS_WITHOUT_EMAIL_RECOVERY_AND_NOTIFICATION_PATH.md) | Accounts with no email (phone-only, Zalo) have no recovery or notification path: add/verify email later, what password reset and the verification/welcome emails do when `email` is null; depends on the social-login feature; client follow-up to be filed with the decision — moved from MVP 2026-10-20 (phone accounts topic; waits for the phone-OTP delivery decision) | `TODO` |
| 5 | [A34](V1/A34_SOCIAL_PROVIDERS_FACEBOOK_AND_ZALO.md) | Postponed (owner decision 2026-10-18): Facebook (built-in) and Zalo (generic OIDC or extension) providers, split from A29 because the app permissions are hard to get; needs the owner's Facebook and Zalo apps — moved from MVP 2026-10-20 (phone accounts topic; postponed) | `TODO` |
| 6 | [A37](V1/A37_PHONE_VERIFICATION.md) | Phone verification (OTP or Zalo) and `phone_status` `VERIFIED`: the phone half split out of A33 (2026-10-20); waits for the phone-OTP delivery decision | `TODO` |

---

## Tickets

### A1 · Apply Redis for refresh token storage
**Status:** `TODO`  
**Type:** Enhancement  
**Moved from:** `modules/auth/docs/BACKLOG_MVP.md` (2026-07-03) — deprioritized to V1.

Replace the current Postgres-backed `RefreshToken` entity with Redis-backed storage.
Refresh tokens are short-lived, high-frequency data — Redis is a better fit than a relational table.

#### Motivation

- Token lookup on every `/api/auth/refresh` call hits Postgres unnecessarily
- Redis provides O(1) key lookup and automatic TTL expiry at no extra infrastructure cost (Redis is already running for post-impl counters)
- Logout becomes a single `DEL` — no SQL UPDATE needed

#### Design

**Key pattern:** `auth:refresh:{userId}` → token string value  
**TTL:** equal to `app.jwt.refresh-expiration` (currently 7 days = 604800 seconds)

```
Login   → SET auth:refresh:{userId} {token} EX 604800
Refresh → GET auth:refresh:{userId}  (nil = expired or never issued)
Logout  → DEL auth:refresh:{userId}
```

One key per user — issuing a new refresh token overwrites the old one (single active session per user). This is the simplest correct approach; multi-device sessions are out of scope for MVP.

#### What changes

- **Remove:** `RefreshToken` entity, `RefreshTokenRepository`, the `refresh_tokens` Postgres table (Liquibase drop migration)
- **Add:** `StringRedisTemplate` injection into `AuthServiceImpl`; replace all `RefreshToken` repo calls with Redis ops
- **Key namespace:** prefix `auth:refresh:` to avoid collision with `post:*` keys used by post-impl
- **Persistence config:** Redis should run with AOF enabled for the auth namespace so tokens survive a restart (see `documentation/md/REDIS_RESEARCH.MD` for AOF vs RDB tradeoffs)

#### New `AuthServiceImpl` operations

```java
// login / register
stringRedisTemplate.opsForValue().set(
    "auth:refresh:" + userId, refreshToken,
    refreshExpiration, TimeUnit.MILLISECONDS
);

// refresh
String stored = stringRedisTemplate.opsForValue().get("auth:refresh:" + userId);
if (stored == null || !stored.equals(incomingToken)) throw new UnauthorizedException(...);

// logout
stringRedisTemplate.delete("auth:refresh:" + userId);
```

#### Out of scope for MVP

- Multi-device / multi-session support (multiple tokens per user)
- Refresh token rotation (issue new token on each refresh)
- Denylist for early revocation of access tokens

#### Tests

- Update `AuthServiceImplSpec` (Spock): mock `StringRedisTemplate`, verify `set` called on login, `get` on refresh, `delete` on logout
- Integration smoke test: login → refresh → logout → confirm refresh returns 401

---

## Removed / Deferred

*(none yet)*
