# A11 · Implementation summary: authentication survives a Redis outage

**Status:** `DONE` (2026-10-09). Ticket: [A11](A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md).

## Approved design

- A shared guard `CacheGuard` in `modules/common`: `read(what, supplier, fallback)` and `run(what, runnable)` treat a `DataAccessException` as "the cache is unavailable" (read returns the fallback, write is skipped); anything else propagates. One `WARN` per minute per label, no stack trace; one `INFO` when the cache is available again. Not a circuit breaker.
- `TokenRevocationChecker` routes its Redis read and its write-back through the guard. When the read fails it answers from the DB watermark and skips the write-back.
- Cost accepted: one indexed DB query per authenticated request while Redis is down; no in-process cache.
- Revocation stays exact, so a revoked or deactivated user is still rejected during an outage; a deactivated caller's behaviour is unchanged.
- Timeouts so a blackholed Redis cannot hang requests.

## What was built

| Area | Change |
|---|---|
| `common` | `com.sportconnect.common.cache.CacheGuard` (new `@Component`; package-private constructor takes a `Clock` for tests). Uses only Spring's data-access exceptions, so `common` gains no Redis dependency. |
| `auth-impl` | `TokenRevocationChecker` takes the guard; read via `cacheGuard.read(..., CACHE_UNAVAILABLE)`, write-back via `cacheGuard.run`; the DB lookup is a private `loadWatermark`. Class Javadoc documents the outage behaviour. |
| Config | `application.yml`: `spring.data.redis.connect-timeout: ${REDIS_CONNECT_TIMEOUT:1000ms}`. |

## Divergence from the approved design

1. **Timeouts.** I told you the Redis timeouts were unset (Lettuce's 60 s default) and proposed 500 ms and 1 s. That was wrong: `spring.data.redis.timeout: 2000ms` was already configured; only `connect-timeout` was missing (Lettuce default 10 s). I added `connect-timeout` (1 s) and left the 2 s command timeout unchanged, so a blackholed Redis costs up to about 1 s per request on connect (a refused connection is immediate). Lowering the command timeout is still an option if that proves too slow.
2. **Ticket symptom.** The ticket says every authenticated request fails with a 500. In fact `JwtAuthenticationFilter` swallows the exception, logs it at ERROR with a stack trace per request, and the request goes on unauthenticated (401/403). Recorded as a Delta on the ticket.

## Key decisions and constraints

- A failed read skips the write-back so a down Redis costs one failing call per request, not two.
- `CACHE_UNAVAILABLE` is a marker string that cannot collide with a stored value (stored values are `""` or a decimal epoch-millis string).
- Only `DataAccessException` is swallowed: a programming error inside a guarded call still surfaces (pinned by a spec).
- The WARN throttle is per label and per guard instance (a singleton), so post `A19` and auth `A12` share the machinery but each call site keeps its own label and rate limit.

## Consumer census

| Consumer | Verdict |
|---|---|
| `JwtAuthenticationFilter` (calls `isRevoked`) | compatible as-is; `isRevoked`'s contract is unchanged |
| `TokenRevocationChecker` constructor | `TokenRevocationCheckerSpec` updated here; no other construction site |
| `UserDeactivationSessionRevocationIntegrationTest` (real Redis) | compatible; re-run green in the full suite |
| `client/` | not affected |
| Post `A19`, auth `A12` | notes added: both reuse `CacheGuard` |

## Tests

- Spock: `CacheGuardSpec` (new, 7): result on success, fallback on a Redis failure, write skipped, a non-Redis exception propagates, one WARN per minute with no stack trace, separate labels, one INFO on recovery. `TokenRevocationCheckerSpec` (+4): DB watermark when the read fails (a pre-revocation token is still rejected, a fresh one allowed), no write-back attempted after a failed read, a failed write-back still answers correctly, a non-Redis failure is not swallowed.
- **IT changes:** added `RedisOutageAuthenticationIntegrationTest` (4 cases, extends `BaseIT` with the Redis port pointed at a closed port, no container): a valid token still authenticates (200); a token issued before `AuthService.logout` is rejected (401); a deactivated user's token is rejected (401); no token stays 401. Checked against the pre-fix `TokenRevocationChecker`: the valid-token case fails there with 401, so the test catches the original bug. The other three are 401 before the fix too, so they pin that revocation stays exact rather than prove the fix.
- Not done: `./gradlew :server:bootRun` against a real stopped Redis; the IT with an unreachable port stands in for it.
- Results: `:modules:common:test` and `:modules:auth:auth-impl:test` green. `:server:test` full run: 558 tests, 6 failed, all in `SessionEventsConsumerIntegrationTest` with a RabbitMQ `AmqpIOException`; that class passes when run alone. This is the same class that failed once in A10's first full run, before any A11 code, so it predates this ticket. It has now failed in 2 of the last 3 full runs.

## Follow-ups

- Post `A19` (reuse `CacheGuard` for ~10 sites) and auth `A12` (guard the eviction) are noted and unchanged in status.
- **auth A14** (filed, low priority): narrow `JwtAuthenticationFilter`'s catch-all so unexpected failures surface as a 5xx instead of a silent 401; this is the catch that turned the outage into 401s.
- The recurring `SessionEventsConsumerIntegrationTest` full-suite flake is not yet ticketed (see the hand-off note).
