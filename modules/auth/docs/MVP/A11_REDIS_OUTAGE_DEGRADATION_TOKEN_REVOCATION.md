# A11 · Redis outage must not take down authentication (token revocation cache)

**Status:** `DONE` (2026-10-09), see [A11_IMPLEMENTATION_SUMMARY.md](A11_IMPLEMENTATION_SUMMARY.md)
**Type:** Enhancement (Architecture)
**Depends on:** none (shares an approach with post `A19`, `modules/social/post-impl/docs/MVP/A19_REDIS_OUTAGE_DEGRADATION.md`; reuse its guard helper if it lands in `common`)

**Filed:** 2026-10-05, from the Redis census done while filing post A19: `StringRedisTemplate` is used in 6 classes across 4 modules, and this one sits on the path of every authenticated request. Tracked with its siblings in `documentation/md/NEXT_TOPICS.md` § Redis resilience.

`TokenRevocationChecker.isRevoked` (called per request from the JWT filter) reads the user's revocation watermark from Redis and, on a miss, loads it from `refreshTokenRepository.findLatestRevocationTimestamp` and writes it back with a TTL equal to the access-token lifetime. Neither Redis call is guarded. With Redis unreachable, the read throws, so every authenticated request fails (500 from the filter chain) even though the database already holds the source of truth.

Wanted: treat Redis as the cache it is. On a Redis read failure, go straight to the DB watermark query; on a write-back failure, skip it; log a `WARN` that Redis could not be reached (rate-limited or once per outage window, since this runs on every request and would otherwise flood the log). **No fail-open decision is needed**: the DB lookup keeps revocation exact, so a revoked or deactivated user's old token is still rejected during an outage. The accepted cost is one DB query per authenticated request while Redis is down; the ticket should state that and decide whether a short in-process cache is worth adding (default: no). Entry point: `JwtAuthenticationFilter` → `TokenRevocationChecker`. A deactivated caller's behavior must be unchanged (their watermark still revokes their tokens), which the tests must pin down. This is not the U12 gap and does not change it.

**Out of scope:** the post/comment caches (post `A19`); the chat-sync stream publishes (already guarded); a revocation-list redesign; Redis HA, alerting or circuit breakers; U12's `isActive` recheck. No client-visible enum or event change.

**Tests:** Spock spec with a `StringRedisTemplate` mock throwing `RedisConnectionFailureException` (watermark comes from the repository, write-back skipped, a revoked token still returns `true`); a `:server` IT through the real filter chain with Redis unreachable: a valid token authenticates (200) and a token minted before a logout is still rejected (401).

## Relation to A12 (added 2026-10-09)

**A12** adds a Redis eviction of the revocation watermark on logout and deactivation. That write needs the same outage guard as the reads here, so do the two in one pass (A12 first, it is the security bug) and share one guard helper.

## Delta (2026-10-09, found at pickup)

The ticket says an outage makes every authenticated request fail with a 500 "from the filter chain". That is not what happens: `JwtAuthenticationFilter` wraps its check in `catch (Exception)`, so the exception from `isRevoked` is logged at ERROR (with a stack trace, per request) and the request continues **unauthenticated**, so protected endpoints answer 401/403. The outcome is the same (every authenticated user locked out, failing closed) but the symptom is a 401 and a log flood, not a 500. Confirmed by running the new IT against the pre-fix code: a valid token gets 401.
