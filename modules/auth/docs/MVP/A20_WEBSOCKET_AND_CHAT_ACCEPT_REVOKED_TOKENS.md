# A20 · WebSocket (STOMP) and the chat service accept access tokens that REST rejects as revoked

**Status:** `TODO` · **Type:** Security gap (medium) · **Depends on:** none; best done after **A15**, which settles how revocation is stored

**Filed:** 2026-10-11, found by the consumer census of **A15** (per-session logout).

## What happens

`JwtAuthenticationFilter` (REST) rejects an access token when `TokenRevocationChecker` says it was issued at or before the user's revocation watermark (U12). Two other places verify the same JWT and never ask:

- `StompAuthChannelInterceptor` (notification-impl): on `CONNECT` it checks signature and expiry only (`validateToken`, `isTokenExpired`), then trusts `sub`.
- `services/chat` (Go, `internal/auth/auth.go`): checks signature and expiry only, by design (independent verification, no call back to the monolith).

So after a logout, a deactivation or a password reset, a token that REST now rejects can still open a notification socket or use chat until it expires (1 h dev, 24 h prod). Neither path is covered by A12's cache eviction because neither reads the cache.

A15 does not change this: a per-session logout would be just as invisible to both paths as the per-user watermark is today.

## Scope to decide at pickup

- STOMP (same JVM): inject the revocation check through `auth-api` (a new method on an `-api` interface, not an import from `auth-impl`) and run it on `CONNECT`. Also decide what happens to an already-open socket when its session is revoked (disconnect, or accept until the next reconnect).
- Chat service: needs a revocation signal without a synchronous call per request (the chat boundary rule in `services/chat/docs/SYNC_DESIGN.md`): for example a revocation event on the existing one-directional sync stream plus a small cache table, or a short-lived token for the socket. This is its own design question.
- Whether to accept the gap for MVP and only document it (the STOMP interceptor's Javadoc already accepts the deactivation window as a known risk).

## Tests

IT: log out (or deactivate), then a STOMP `CONNECT` with the old token is rejected. Chat: decided with the design.

## Out of scope

Redesigning the chat auth model; refresh-token handling.

**Delta (2026-10-16, CHAT-17):** the chat half is answered: the chat service now verifies Keycloak RS256 tokens by JWKS and deliberately does no `is_active` or revocation check; a deactivated user keeps chat access for at most the 5-minute token life, accepted. Only the STOMP interceptor half remains for A28/A25. Syncing `is_active` into the chat cache is a separate decision, not filed.
