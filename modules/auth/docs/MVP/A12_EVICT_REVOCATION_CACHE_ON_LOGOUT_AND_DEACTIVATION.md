# A12 · Revoking a user's sessions must evict the cached revocation watermark

**Status:** `TODO`
**Type:** Bug (security, pre-existing)
**Depends on:** none (touches the same class as `A11`, `TokenRevocationChecker`; do them in one pass if both are picked up together)

**Filed:** 2026-10-09, found while writing the integration test for **A10** (`PasswordResetIntegrationTest`). Root cause confirmed by experiment, not yet fixed; the fix needs sign-off first.

## What

`TokenRevocationChecker` is cache-aside: on a request it reads the user's revocation watermark from Redis (`auth:revoked-before:<userId>`) and, on a miss, loads it from `refresh_tokens.revoked_at` and caches it with a TTL equal to the access-token lifetime (1 hour). For a user who has never been revoked it caches an empty "never revoked" sentinel.

`AuthService.logout(userId)` (`refreshTokenRepository.revokeAllUserTokens`) stamps the database but **never touches the Redis key**. So:

1. The user makes any authenticated request, which caches "never revoked" for up to an hour.
2. They log out, are deactivated (`UserServiceImpl.deleteUser`), or reset their password (A10).
3. Access tokens issued before that moment keep authenticating until the cache entry expires, because the cached sentinel still says "never revoked".

Reproduced in A10's IT: with an authenticated `GET /api/users/me` before the reset, the old access token still returns 200 after it; without that call, it returns 401 as intended. The U12 claim that deactivation revokes the access token holds only when the user had no cached watermark.

## Wanted

Evict (or overwrite with the new watermark) the user's Redis key in the same place the DB revocation is written, after the transaction commits. Decide at pickup: evict after commit (simplest), or write the new watermark through. Keep the DB as the source of truth; a failed eviction must not fail the logout (log a WARN) and should fall under A11's Redis-outage handling.

## Tests

- Spock: `logout` / `deleteUser` evict the key; an eviction failure does not fail the logout.
- IT: authenticate once (populates the cache), log out, deactivate, and reset a password, each time asserting the earlier access token now returns 401. Extend `PasswordResetIntegrationTest` and the A9/U12 tests.

## Out of scope

Redis outage degradation (A11); an `isActive` recheck per request (U12).

## Relation to A11 (added 2026-10-09)

A11 makes the JWT filter's Redis *reads* survive an outage. This ticket adds a Redis *write* (the eviction) on the logout and deactivation path, so it must be guarded the same way: a failed eviction logs a `WARN` and never fails the logout or deactivation (the DB stamp is the source of truth). Pick A12 and A11 up in one pass, A12 first (it is the security bug), and share one guard helper (introduced by whichever lands first; post A19 may already provide one in `common`) rather than writing two.
