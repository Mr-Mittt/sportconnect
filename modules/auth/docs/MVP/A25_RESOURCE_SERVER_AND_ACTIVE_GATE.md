# A25 · Validate Keycloak tokens (JWKS) and gate every request on `is_active`

**Status:** `TODO` · **Type:** Feature / security · **Depends on:** INFRA-13, U23 · **Gates:** A26, A28

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
