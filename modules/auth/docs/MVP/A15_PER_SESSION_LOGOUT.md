# A15 · Per-session logout: signing out on one device must not sign out the others

**Status:** `SUPERSEDED` (2026-10-16, closed by A28: sessions are Keycloak sessions; see the note at the end)  (was `ON HOLD` since 2026-10-12)
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

## Scope decisions (2026-10-11, at pickup)

- Open decision 1: `logout` reads the `sessionId` from the authenticated principal's access-token claim, not the refresh cookie.
- Open decision 2: tokens without a `sessionId` claim (issued before this ships) are treated as a legacy session; a plain logout from one revokes by the user watermark, as today, so no pre-deploy token survives its owner's logout.
- Open decision 3: the device list (`GET /api/auth/sessions`, revoke-one, `User-Agent`/IP storage) is **out of this ticket**, filed as **A18**; client side filed as **AUTH-12**.
- New in this ticket: `POST /api/auth/logout-all` (authenticated, idempotent) revoking every session via the per-user watermark.

## Scope change: A19 folded in (2026-10-11)

**Why:** while designing this ticket a probe found that the "existing per-user watermark" this design relies on is not sound. `MAX(refresh_tokens.revoked_at)` also moves on every refresh (rotation stamps `revoked_at`), so a routine refresh on one device rejects other devices' still-valid access tokens once the cache is cold. Confirmed by hand on dev with a 10-minute TTL: B got a premature 401, then recovered through the client's retry. Details and probe: `A19_REFRESH_ROTATION_POISONS_REVOCATION_WATERMARK.md` (status `FOLDED INTO A15`, priority lowered to medium). User decision: fix it here, in one branch.

**What changes in this ticket:**
- The per-user watermark is written **only** by deliberate revocations: deactivation, password reset and `logout-all`. Rotation must no longer move it. This **supersedes** every earlier line in this ticket that says "keep using the existing per-user watermark": the watermark keeps its meaning but gets a new, clean source.
- Phase 3 picks between a dedicated per-user value (column or table) and a `rotated_at` / replaced-by marker on the refresh row, and decides the backfill for existing rows. This is a DB change, so it also needs the DB part of the consumer census (entities, `RefreshTokenRepository` JPQL, `findLatestRevocationTimestamp` callers, `server/src/test/resources/schema.sql`).
- Tests added: with a cold cache, refresh then use the new access token (200) and another device's token (200); deactivation, password reset and `logout-all` still reject everything issued before them.

**Unchanged:** a session-scoped logout never touches the user watermark, so it cannot reintroduce the A19 symptom.

## Paused state (2026-10-12)

**Why paused:** the user wants to consider integrating Keycloak before building this. Keycloak has first-class sessions (`sid` claim), per-session and logout-all, an admin/account-console session list (A18), refresh rotation inside the session, and a user "not-before" timestamp, so most of A15, A18 and A19 would be replaced rather than built. What would survive: the client contract (`logout`, `logout-all`, session list) and revocation checks in the resource servers (Spring filter, STOMP, chat; **A20**). Custom auth was chosen over Keycloak on purpose earlier (`modules/auth/docs/KEYCLOAK_VS_CUSTOM_AUTH.md`); that decision is being revisited. If Keycloak is chosen, close A15, A18 and A19 as superseded and keep A20 reshaped (introspection or back-channel logout). If not, resume at Phase 3 below.

**Where the work stands:** Phases 0 to 2 done, scope locked (including A19 folded in), Phase 3 design written but **not approved**. Branch `feature/a15-per-session-logout` holds only uncommitted doc changes; no code was written.

**A19 is real on `master` meanwhile** (confirmed by hand on dev, 10-minute TTL): another device's valid access token gets one wasted 401 after a refresh, and the client's retry recovers. Impact: one extra 401 and one extra refresh per affected device, not a lockout.

**Phase 3 design (proposed, unapproved):**
- New append-only auth table `token_revocations` (`id`, `user_id`, `session_id` nullable, `revoked_at`, `reason`; index `(user_id, revoked_at)`; no cross-domain FKs). A row with a NULL `session_id` is the per-user watermark, written only by deactivation, password reset and `logout-all`; a row with a `session_id` revokes that session. Rotation keeps stamping `refresh_tokens.revoked_at` but nothing reads it as a watermark (the A19 fix). Migration V079; `refresh_tokens.session_id UUID` nullable plus index.
- Backfill: one user-wide row per user from `MAX(refresh_tokens.revoked_at)` (safe direction: at worst one valid pre-deploy token is rejected once).
- Access token gets a `sid` claim (access tokens only). `JwtTokenService` (`-api`): new overload `generateAccessToken(user, sessionId)` and `getSessionIdFromToken`; the old overload stays.
- Login, register and reactivate create the session id (refresh row and claim). Refresh carries it over; a legacy row with none gets a fresh one at its first refresh. Refresh rejects a revoked session with the existing `REFRESH_TOKEN_EXPIRED_OR_REVOKED`.
- `TokenRevocationChecker.isRevoked(userId, issuedAt, sessionId)`: revoked if `iat <= watermark` or `sid` is in the recently revoked set. The same per-user Redis entry holds both (old-format values still parse); same eviction after commit, 5 s "nothing revoked" sentinel, and A11 DB fallback.
- `AuthService`: `logout(userId, sessionId)` (null id = legacy token = revoke everything, as today) and `logoutAll(userId)` replacing `logout(UUID)`; `UserServiceImpl.deleteUser` calls `logoutAll`. Deactivation, password reset and `logout-all` share one private revoke-everything path. New authenticated, idempotent `POST /api/auth/logout-all`; the filter passes the session id to the controller through the authentication details (check first that nothing else reads `getDetails()`).
- Tests: Spock for checker, service, controller, filter, token service and `deleteUser`; new `PerSessionLogoutIntegrationTest` (two logins, cold and warm cache; `logout-all`; legacy token); a permanent A19 regression IT (cold cache, refresh, then the new token and another device's token both 200); updates to the deactivation, password-reset, Redis-outage and public-surface ITs and `schema.sql`.
- **Open decisions when resumed:** (1) rename `logout(UUID)` to `logoutAll(UUID)` (recommended) vs add an overload; (2) backfill from `MAX(revoked_at)` (recommended) vs none; (3) keep the `reason` column.

**Still filed and independent:** A18 (session list), A20 (STOMP/chat ignore revocation), A16, client AUTH-11 and AUTH-12.

---

**Closed by A28 (2026-10-16): superseded by Keycloak.** The design here (a server-generated `sessionId` in the access token and the refresh row, a per-user revocation watermark) solved a problem that no longer exists. Since A25/A26 a session is a Keycloak SSO session: logging out ends that one session (`POST /api/auth/logout` ends the Keycloak session of the refresh-token cookie), other devices keep theirs, an access token lives 5 minutes, and a deactivated user is refused by the A25 gate on the next request. The `refresh_tokens` table, the watermark and `revokeAllUserTokens` are gone (A28, migration V081). A "log out everywhere" action, if wanted, is a Keycloak admin/account-API call and would be a new ticket. The client tickets **AUTH-11** and **AUTH-12** that waited on this are superseded too (client backlog).
