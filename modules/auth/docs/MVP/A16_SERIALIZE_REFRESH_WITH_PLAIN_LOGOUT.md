# A16 · A refresh racing a plain logout is not serialized

**Status:** `TODO`
**Type:** Bug (low priority, narrow race)
**Depends on:** none

**Filed:** 2026-10-10, found while scoping **A12**.

## What

U12 serialized a refresh against *deactivation*: `UserServiceImpl.deleteUser` takes `findByIdForUpdate` and `AuthServiceImpl.refreshToken` takes `getActiveUserForUpdate`, so they run one after the other. A plain `POST /api/auth/logout` takes no such lock. A refresh in flight at the moment of logout can read the refresh token as valid, then mint a new pair after `revokeAllUserTokens` committed, leaving a live session after the user logged out.

## Wanted

Decide at pickup whether `logout` should take the same `users` row lock (same lock order: users row first, refresh_tokens second) or whether the new token pair should be re-checked against the watermark before being returned. Keep the existing lock order to avoid deadlocks.

## Tests

IT that interleaves a logout and a refresh deterministically if a synchronization hook is justified; otherwise reasoning in the write-up, as U12 did.

## Out of scope

Per-session logout (A15); eviction of the Redis watermark (A12, done).
