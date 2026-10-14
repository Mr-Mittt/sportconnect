# A25 · Validate Keycloak tokens (JWKS) and gate every request on `is_active`

**Status:** `DONE` (2026-10-14) · **Type:** Feature / security · **Depends on:** INFRA-13, U23 · **Gates:** A26, A28

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md`).

## What

- Spring resource server: RS256 validation against Keycloak's JWKS (issuer, audience, expiry), replacing `JwtTokenServiceImpl`'s HS256 minting. The `JwtTokenService` interface stays so `StompAuthChannelInterceptor` keeps working.
- `sub` is `users.id`. Roles come from our database, not a claim.
- **The active gate:** one cached lookup per request through a new `UserService` method (`{isActive, roles}` for a user id): Redis, short TTL, evicted on deactivate and reactivate, DB fallback via `CacheGuard` (the A11 pattern). It replaces `TokenRevocationChecker`. An unprovisioned `sub`, or an inactive user, is a 401. This also closes the `JwtAuthenticationFilter` half of **U12** and gives A20 one enforcement point.
- Account lifecycle: every authenticated path now passes the gate; state the deactivated-caller behaviour in the tests.
- Keep the filter's catch-all narrow (A14).

## Out of scope

The callback and session endpoints (A26); retiring the old tables and endpoints (A28); the chat service (CHAT-17).

## Done when

IT through MockMvc with a locally generated RSA key and a stubbed JWKS: valid, expired, wrong issuer, wrong audience, unprovisioned `sub`, deactivated user, deactivate-then-reactivate cache eviction, Redis down. `:server:test` green.

## Implementation summary (2026-10-14)

### Scope decision (Phase 1)

"Keycloak only": the backend stops accepting its own HS256 tokens in this ticket. Consequence, accepted by the owner: **until A26 (the Keycloak callback) merges, login and register in dev return a token nothing accepts**, so the client cannot sign in; the ITs that used those tokens were moved to Keycloak-style tokens. A26 replaces login; A28 deletes the legacy mint.

### Design as approved, and what was built

| Piece | Built |
|---|---|
| Verification | `KeycloakJwtConfig`: a `NimbusJwtDecoder` on `app.keycloak.jwk-set-uri`, RS256 only, validators for `exp`/`nbf`, exact issuer (`app.keycloak.issuer-uri`) and an `aud` containing `sportconnect-api`. Keys are fetched lazily, so the app boots with Keycloak down. Dependency: `spring-security-oauth2-jose` only. |
| Gate | `UserService.getAccessState(UUID) -> Optional<UserAccessState{isActive, roles}>` (user-api). `UserServiceImpl` reads `UserAccessStateCache` (Redis, `CacheGuard`, TTL `app.user.access-state-ttl` = 60 s, format `1\|USER,ADMIN`) and falls back to the DB; an unknown user is not cached. `deactivate()` and `reactivateUserByEmail()` evict after commit. |
| Filter | `JwtAuthenticationFilter`: decode, `sub` as UUID, gate; authenticates with `ROLE_<name>` from the database and the `sub` string as principal (unchanged for controllers). Roles in a token are ignored. |
| A14 | The catch-all is gone. A bad token or unusable `sub` is anonymous (401). If the key set cannot be fetched the request is marked and `JwtAuthenticationEntryPoint` answers **503 `SERVICE_UNAVAILABLE`**; if the user lookup fails, **500 `INTERNAL_ERROR`**. A public endpoint with a stale token still works. Both codes already exist, so no new `errorCode`, no client work. |
| `JwtTokenService` | The reading methods now go through the decoder, so `StompAuthChannelInterceptor` accepts exactly what REST accepts and is unchanged. `getAuthoritiesFromToken` is always empty, `getEmailFromToken` may be null. `generate*` (HS256) stays until A26/A28. |
| Removed | `TokenRevocationChecker` and its spec, `RefreshTokenRepository.findLatestRevocationTimestamp`, `JwtProperties.revocationSentinelTtl`, the two `evictAfterCommit` calls in `AuthServiceImpl.logout` and `PasswordResetService.completeReset`. |

### Divergences from the plan / things found

- **A real startup cycle**, caught only by the IT (as CLAUDE.md predicts): `SecurityConfig` -> filter -> `UserService` -> `PasswordEncoder` (defined in `SecurityConfig`). Fixed with `@Lazy UserService` in an explicit filter constructor.
- **Roles from the database exposed a test assumption**: the old ITs built users with no role rows and relied on the token's `roles` claim. `BaseIT.createUserWithRoles` now creates real role rows.
- **`UserServiceImpl` got a new constructor argument** (the cache); `UserServiceImplSpec` and `UserIdentifiersSpec` construct it by hand and were updated.
- The 503 for an unreachable key set replaces the "401" said in Phase 1; the owner approved the plan with it.

### Behaviour changes to know about

- A **logout or password reset no longer invalidates an access token** (that was a watermark on `refresh_tokens`). The token now dies by its 5-minute Keycloak lifetime; A26 (logout proxy ends the Keycloak session) and A28 (reset in Keycloak) own the rest. The refresh tokens are still revoked.
- A **deactivation takes effect on the next request**, and a reactivation just as fast, because the gate follows `users.is_active`, not the token. The race where a reader repopulates the cache with the old "active" state right after the eviction is bounded by the 60 s TTL.
- A token issued before a deactivation works again once the account is reactivated (the gate has no per-token memory).
- Role changes made by SQL show after at most the TTL.
- `GET /api/users/me` for a user that is cached active but was deactivated behind the cache's back (raw SQL) answers 404 until the TTL passes, then 401; the real deactivation paths evict.

### Verification

- `:modules:auth:auth-impl:test` and `:modules:user:user-impl:test` green (specs: filter 9, token service 9, new `UserAccessStateSpec` 6).
- `:server:test`: **600 tests, 0 failures**.
- **Against a real Keycloak 26.4** (dev stack, throwaway users created through the admin API, real Authorization Code + PKCE tokens; all removed afterwards): a phone-only user (no email) with a matching `users` row got 200 on `/api/users/me`; a valid token whose `sub` has no row, a tampered signature and no token got 401; after setting `is_active = false` behind the cache the endpoint answered 404 (cached state, as expected) and 401 once the 60 s TTL passed. `bootRun` started cleanly and was stopped.

### IT changes

| File | Change |
|---|---|
| `TestKeycloak` (new, test support) | RSA key + JDK `HttpServer` serving the JWKS; a token builder (issuer, audience, lifetime, forged key, unknown `kid`, role claim). |
| `BaseIT` | `@DynamicPropertySource` pointing `app.keycloak.*` at `TestKeycloak`; `bearer(userId)`, `accessTokenOf(MvcResult)`, `createUserWithRoles(active, roles...)`. |
| `KeycloakResourceServerIntegrationTest` (new, 15) | valid; expired; wrong issuer; wrong audience; forged signature; legacy HS256; unprovisioned `sub`; deactivated user; no token; public endpoint ignores a bad token; role claim ignored; DB role honoured (admin endpoint); key set down -> 503 `SERVICE_UNAVAILABLE`; public endpoint still works with it down; an already cached key keeps working. |
| `UserDeactivationSessionRevocationIntegrationTest` (rewritten, 7) | active works; refresh tokens revoked on deactivation; already issued token rejected; rejected even after the active state was cached (eviction); deactivate-then-reactivate works at once; DB fallback on an empty cache; cached state has a TTL <= 60 s. |
| `RedisOutageAuthenticationIntegrationTest` (rewritten, 3) | a valid token still authenticates and a deactivated user is still refused while Redis is unreachable. |
| `AccountReactivation`, `SelfDeactivation`, `PasswordReset`, `UserIdentifierConstraints`, `NotificationStomp` ITs | tokens now come from `TestKeycloak`; the reactivation test no longer asserts the pre-deactivation token stays dead; the password-reset test now asserts only that refresh tokens are revoked. |

### Follow-ups

None new to file: CHAT-17 (chat's HS256), A26 (callback, logout/refresh proxy), A28 (delete the legacy HS256 mint, `JwtProperties.secret`, and the `refresh_tokens` revocation; noted on A28) and A20 (STOMP stays without an `isActive` recheck) already exist.
