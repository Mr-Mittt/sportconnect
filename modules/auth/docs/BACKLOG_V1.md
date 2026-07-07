# Auth Module — V1 Feature Backlog

**Version:** V1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-07-03  
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
