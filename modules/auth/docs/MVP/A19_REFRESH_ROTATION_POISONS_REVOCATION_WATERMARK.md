# A19 · A token refresh poisons the revocation watermark: valid access tokens are rejected

**Status:** `FOLDED INTO A15` (2026-10-11, user decision) · **Type:** Bug (medium: a wasted 401 and an extra refresh per affected device; not a lockout) · **Depends on:** none; fixed inside **A15**

**Filed:** 2026-10-11, found while designing **A15** by probing real behaviour.
**Folded:** 2026-10-11. A15's per-session design needs a watermark written only by deliberate revocations, which is the whole fix here. One branch, one PR; see A15 § "Scope change: A19 folded in". Priority lowered from high to medium once the real impact was seen (below).

## What happens

`TokenRevocationChecker` takes the watermark as `MAX(refresh_tokens.revoked_at)` for the user ("reject any access token issued at or before this"). But `AuthServiceImpl.refreshToken` rotates by `refreshToken.setRevoked(true)`, which stamps `revoked_at = now` on the old row. So every refresh moves the user's watermark to "now".

Probe (throwaway IT, since deleted): register (device A) and login (device B), then Redis `auth:revoked-before:*` cleared (cold cache), then A refreshes. Result: `refresh=200`, then the **new** access token of A, the old one of A, and device B's access token all answer **401** (`/api/users/me`). With the cache warm all three answer 200, which is why no test caught it: no IT uses a refreshed access token after the cache expires.

## Confirmed by hand (2026-10-11, dev TTL set to 10 minutes)

Device B's access token, still within its 10 minutes, got 401 after device A refreshed; the client then refreshed automatically and carried on. So the bug is real on `master`, and the user-visible impact is **one wasted 401 and one extra refresh per affected device**, not a logout.

Why the retry works: the first request after A's refresh finds no cache entry, computes the watermark from the DB (A's rotation stamp, T1), caches it for the full TTL and rejects B. B's refresh stamps a later T2 but does not evict the cache, so Redis still holds T1 and B's new token (issued after T1) passes. When the cached value expires, the next recompute sees the newest stamp and the cycle repeats once.

Remaining risk: a client that treats a 401 as final (non-browser clients, possibly the STOMP/WebSocket path) does not recover. Not verified.

## Why it is reachable since A12

Before A12 a cached "never revoked" sentinel lived for the whole access-token lifetime and masked the stamp. A12 (merged) shortened the sentinel to 5 s (`app.jwt.revocation-sentinel-ttl`) to bound a stale write-back, so the cache is cold by the time a client refreshes (it refreshes when the access token has expired, and `/refresh` itself never warms or evicts the key). The next authenticated request recomputes the watermark from the rotation stamp, and a token issued before it, or in the same second (`iat` has second precision), is rejected.

## Fix direction (decided: inside A15)

The watermark must come only from deliberate revocations (deactivation, password reset, log out everywhere), not from rotation. Options: a dedicated per-user value (column or table) written by the `revokeAllUserTokens` callers and read by `TokenRevocationChecker`; or stop using `revoked_at` for rotation (a `rotated_at` / replaced-by marker, with `isValid()` updated). A15 picks one at its Phase 3 design. Needs a migration and a backfill decision for existing rows.

## Tests

IT: with a cold cache, refresh then use the new access token (200) and another device's still-valid access token (200); deactivation, password reset and log out everywhere still reject everything issued before them. Carried into A15's test plan.
