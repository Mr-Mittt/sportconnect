# A12 · Implementation summary: revoking sessions evicts the cached revocation watermark

**Status:** `DONE` (2026-10-10) · Ticket: [A12](A12_EVICT_REVOCATION_CACHE_ON_LOGOUT_AND_DEACTIVATION.md)

## Design (as approved)

- **Evict after commit, not write-through.** The DB (`refresh_tokens.revoked_at`) stays the only place the watermark is computed; the next request reloads it. Write-through would need the same timestamp computed in two places and could race to an older value in Redis.
- `TokenRevocationChecker.evict(userId)` deletes `auth:revoked-before:<userId>` through `CacheGuard` (a Redis failure is a throttled WARN, never a failed logout).
- `TokenRevocationChecker.evictAfterCommit(userId)` registers a `TransactionSynchronization.afterCommit` (immediate evict if no transaction is active; a rollback never evicts).
- Called from the two places that stamp `revokeAllUserTokens`: `AuthServiceImpl.logout` (which also covers `UserServiceImpl.deleteUser`, deactivation) and `PasswordResetService.resetPassword`.
- **Short-TTL "never revoked" sentinel.** A request that read the DB just before a logout committed can write "never revoked" back just after the eviction. The sentinel now lives `app.jwt.revocation-sentinel-ttl` (default 5000 ms) instead of the access-token lifetime; a real watermark keeps the full TTL (it only moves forward, so it cannot wrongly let a token through).
- No API, DTO, REST or DB change. No client work (no new error code, enum or event).

## What was built

- `TokenRevocationChecker`: `evict`, `evictAfterCommit`, sentinel TTL split; class Javadoc updated.
- `JwtProperties.revocationSentinelTtl` (`long`, default 5000) + `application.yml` entry.
- `AuthServiceImpl`, `PasswordResetService`: new `TokenRevocationChecker` constructor dependency and one `evictAfterCommit` call each. Same module, plain `@Component`, no `@Lazy`; a real context start in `:server:test` confirms wiring.

## Consumer census

`AuthController.logout` and `UserServiceImpl.deleteUser`: compatible as-is. `PasswordResetService.resetPassword`: updated here. `AuthServiceImplSpec`, `PasswordResetServiceSpec`: updated (constructor). Nothing outside auth-impl uses `TokenRevocationChecker`. Client / MSW: unaffected.

## Behaviour notes

- **Production lifetime.** `application-prod.yml` sets `app.jwt.expiration` to 24 h, so before this fix a stale entry could last 24 h in prod, not 1 h.
- **Residual window.** A request in flight during a logout can still leave a stale sentinel for up to 5 s (the TTL). Closing it entirely needs an atomic read+write in Redis; not worth it here.
- **Cost.** A never-revoked user's cache entry now expires every 5 s: at most one extra indexed query per 5 s for that user.
- **Not covered, filed as A16:** a refresh racing a *plain* logout is not serialized by the U12 `users` row lock (only `deleteUser` takes it).
- No divergence from the approved design.

## Tests

- Spock: `TokenRevocationCheckerSpec` (+7: evict, evict failure swallowed, after-commit deferral, no-transaction immediate, rollback no-evict, configurable sentinel TTL; sentinel/watermark TTL expectations updated), `AuthServiceImplSpec`, `PasswordResetServiceSpec` (verify `evictAfterCommit`).
- **IT changes (real Redis, real MockMvc):**
  - `UserDeactivationSessionRevocationIntegrationTest` (+3): deactivation and `POST /api/auth/logout` both reject an access token after an earlier request cached "never revoked"; sentinel TTL is short (1-5 s) and a real watermark gets the full TTL. Confirmed all three fail with the eviction call removed.
  - `PasswordResetIntegrationTest`: `resettingThePassword_revokesRefreshTokens_andAnEarlierAccessToken` now warms the cache first (it used to carefully avoid this gap); header Javadoc updated.
  - `RedisOutageAuthenticationIntegrationTest`: comment only; its existing logout-with-Redis-down test now also covers eviction failure not failing the logout.
- Results: `:modules:auth:auth-impl:test` and `:server:test` green. `bootRun` was not run separately; full-context startup is exercised by `:server:test`.
