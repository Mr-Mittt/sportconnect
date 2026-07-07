# Redis Research — Session Notes

**Date:** 2026-07-01  
**Context:** Evaluated how Redis is currently used in SportConnect and how it should evolve into the auth module and eventual microservice architecture.

---

## 1. What is pub/sub?

**Q:** What is Redis pub/sub?

**A:** Pub/sub (publish/subscribe) is a messaging pattern where producers publish events to a channel and any number of consumers subscribe to receive them — without the producer knowing who is listening.

Redis has a built-in pub/sub engine. Relevant future use case for SportConnect: when a user posts, `post-impl` publishes a `"new_post"` event to a Redis channel. A future `notification-impl` module subscribes and sends push notifications — without `post-impl` importing anything from `notification-impl`.

**Status:** Not currently used. Noted as a clean cross-domain side-effect pattern for future phases.

---

## 2. Should we use Redis for refresh token storage?

**Q:** Should we use Redis instead of Postgres for refresh tokens?

**Concern:** The current `RefreshToken` entity stores tokens in Postgres. Every `/api/auth/refresh` call hits the database. Redis is already running.

**A:** Yes — Redis is a better fit for refresh tokens. Tradeoffs:

| | Postgres (`refresh_tokens` table) | Redis |
|---|---|---|
| Lookup speed | Slower (disk + index) | O(1) memory lookup |
| Natural expiry | Requires cleanup job | Built-in TTL — auto-deletes |
| Early revocation (logout) | SQL UPDATE | `DEL` key — instant |
| Durability | Durable by default | Volatile unless AOF enabled |
| Simplicity now | Already working | Requires wiring `StringRedisTemplate` |

**Decision:** Migrate in MVP ticket A1. Keep Postgres for now; it is correct and working. Redis migration is a targeted enhancement, not a blocker.

---

## 3. Shared Redis port vs. separate instances

**Q:** If auth-impl uses Redis, does it open a new port or share the same one as post-impl?

**A:** Shares the same connection pool. Spring Boot creates a single `LettuceConnectionFactory` bean for the whole JVM. Every module that injects `StringRedisTemplate` gets the same underlying Lettuce pool — no separate port per module.

**Concern:** Key naming collisions between modules.

**Resolution:** Enforce domain-scoped key prefixes:

| Module | Key prefix |
|---|---|
| auth-impl (future) | `auth:refresh:{userId}` |
| post-impl (current) | `post:{id}:likes`, `post:{id}:comments` |
| post-impl (current) | `comment:{id}:likes`, `comment:{id}:replies` |

---

## 4. Redis in a microservice architecture

**Q:** In a future microservice setup, should each service have its own Redis?

**A:** Usually no — share a Redis cluster, with namespace or logical database isolation.

| Pattern | How | When to use |
|---|---|---|
| Shared cluster + namespace prefixes | `auth:`, `post:`, etc. | Default — simple and cheap |
| Logical databases | `SELECT 1` for auth, `SELECT 2` for posts | Small teams, single Redis instance |
| Separate Redis per service | Fully isolated instances | Different eviction policies or strict compliance isolation |

**Recommendation for SportConnect:** Shared cluster + namespace prefixes. Only split if a service needs a different eviction policy (e.g., caching service needs `allkeys-lru`; token store needs `noeviction`).

---

## 5. TTL-based expiry and the denylist pattern

**Q:** What is "TTL-based early revocation needs a denylist"?

**TTL (Time To Live):** Redis can attach an expiry to any key. When the time runs out, Redis auto-deletes it. Natural expiry is handled for free.

**The early revocation problem:** TTL alone handles natural expiry, but what if a user logs out before the token expires? The token must be invalidated immediately, not when the TTL runs out.

**Two options:**
- **Delete the key on logout** (`DEL auth:refresh:{userId}`) — clean and instant. Works when one token per user is stored under a predictable key.
- **Denylist** — needed when you cannot find the key to delete (e.g., token IS the key and you don't track which tokens belong to which user). Maintain `SADD auth:denylist:revoked {token}` and check it on every refresh. Denylist entries carry a TTL equal to the original token expiry so they self-clean.

**For SportConnect:** The simple `DEL` on logout works. Store `auth:refresh:{userId}` → token. No denylist needed at MVP scale.

---

## 6. AOF vs RDB — Redis persistence modes

**Q:** What are AOF and RDB?

By default Redis is in-memory only. If the process crashes, all data is lost. Two persistence options:

**RDB (Redis Database Snapshot)**
- Point-in-time snapshot written to a `.rdb` file periodically (e.g., every 5 minutes if ≥100 keys changed)
- Fast restore on restart
- Data loss window = time since last snapshot

**AOF (Append-Only File)**
- Every write command is appended to a log file as it happens
- On restart, Redis replays the log to reconstruct state
- Near-zero data loss (configurable: fsync every second or every write)
- File grows over time; Redis compacts it automatically

| Data | Recommended mode |
|---|---|
| Like / comment counts (`post-impl`) | RDB or none — stale counts self-correct from Postgres |
| Refresh tokens (`auth-impl`, future) | AOF — cannot afford to lose active sessions |

---

## 7. Stale cache after RDB restore

**Q:** If Redis restores a snapshot and like counts are outdated, how does the system correct itself?

**Problem:** Snapshot says a post has 50 likes. Redis goes down. 10 more likes come in — written to Postgres. Redis restarts with the snapshot: Redis says 50, Postgres says 60. The cache-aside pattern returns 50 (stale key exists, no miss triggered).

**Fix: Add TTL to every count key**

When populating the cache, set a TTL (e.g., 1 hour):
```java
stringRedisTemplate.opsForValue().set(key, String.valueOf(count), 1, TimeUnit.HOURS);
```

After Redis restarts, stale snapshot keys expire within the TTL window. The next read misses, falls through to Postgres, and repopulates with the correct value. No special startup logic needed.

**Alternatives:**
- Flush `post:*` keys on application startup (Option B)
- Disable RDB for the counts database entirely (`save ""`) if using separate Redis instances per concern (Option C)

**Recommendation:** Add TTL on count keys (Option A) — least invasive, self-healing.

---

## Current Redis State in SportConnect

| Aspect | Status |
|---|---|
| Connection | `localhost:6379`, no password, Lettuce auto-configured |
| Dependency declared | `server`, `auth-impl`, `post-impl` build.gradle |
| Actually used | `post-impl` only (like/comment counters) |
| Auth refresh tokens | Postgres (`refresh_tokens` table) — Redis migration is ticket A1 |
| Pub/sub | Not used |
| Persistence config | Default (no explicit RDB/AOF config) |
| Key namespacing | `post:*`, `comment:*` — no collisions yet; auth prefix reserved as `auth:*` |
