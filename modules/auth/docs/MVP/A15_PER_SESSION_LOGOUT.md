# A15 · Per-session logout: signing out on one device must not sign out the others

**Status:** `TODO`
**Type:** Feature / behaviour change
**Depends on:** **A12** (same revocation cache; do A12 first so the cache eviction pattern is settled)

**Filed:** 2026-10-10, raised while scoping **A12**.

## What

`AuthService.logout(userId)` calls `refreshTokenRepository.revokeAllUserTokens`, which stamps every refresh token the user has with one `revoked_at`. `TokenRevocationChecker` then rejects every access token issued at or before that moment, so logging out on a phone also logs out the laptop (access token dead at once, refresh token revoked). That is correct for deactivation and password reset, and wrong for a plain "log out".

## Design

**A device's MAC address cannot be the identity.** Browsers and servers cannot read it (it never crosses the first router), mobile OSes hide or randomize it, one machine can hold several independent sessions, and it can be spoofed. Use a server-generated session id.

- Login, register and reactivate create a random `sessionId` (UUID). It is stored on the `refresh_tokens` row; every token in that rotation chain keeps the same id.
- The access token carries it as a claim (next to `jti`); refresh issues the new access token with the same claim.
- `logout` revokes only that session: marks that session's refresh tokens revoked and records the id as revoked.
- Deactivation, password reset and a new explicit "log out everywhere" keep using the existing per-user watermark.
- `JwtAuthenticationFilter` checks both: the user watermark (existing) and a revoked-session check. Cache the revoked session ids in Redis with a TTL of one access-token lifetime, DB as the source of truth, through `CacheGuard`, evicted/written after commit (same pattern as A12/A11).
- Optional, display only: store `User-Agent` and IP on the session row so the client can show "Chrome on Windows, last active 2h ago". Never used as an identity or security check.

## Open decisions at pickup

1. `logout` reads the session id from the access-token claim (already authenticated) rather than the refresh cookie.
2. Tokens issued before this ships have no `sessionId` claim: treat them as belonging to a legacy session that a plain logout still revokes by user watermark, or let them expire (1 hour).
3. Whether the device list (`GET /api/auth/sessions`, revoke-one) is in this ticket or a follow-up.

## Consumer census (to do at pickup, CLAUDE.md § API Change Discipline)

`AuthService.logout` signature (callers: `AuthController`, `UserServiceImpl.deleteUser`, which must keep logging out everywhere); JWT claims (`JwtTokenService`, `StompAuthChannelInterceptor` in notification-impl, chat service's independent JWT verification, `services/chat`); `refresh_tokens` migration; client `logout` call and MSW mocks.

## Client

Filed as client **AUTH-11**.

## Tests

Spock for session-scoped revoke vs revoke-all; IT with two logins for one user: log out one, assert the other's access and refresh token still work and the first's are rejected; deactivation and password reset still kill both.

## Out of scope

Concurrent-session limits; suspicious-login detection; Redis outage handling (A11); the stale-cache gap (A12).
