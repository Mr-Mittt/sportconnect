# CHAT-17 · Verify Keycloak tokens by JWKS instead of the shared HMAC secret

**Status:** `TODO` · **Type:** Auth change · **Depends on:** INFRA-13 · **Gates:** removal of the HS256 path (A28)

**Filed:** 2026-10-14, from the social-login `/feature` census: `internal/auth` accepts HS256/384/512 with a shared secret and the claims `sub`, `email`, `username`, `roles`; Keycloak issues RS256 tokens without them.

## What

Replace the verifier in `services/chat/internal/auth` with a JWKS verifier (cached keys, refresh on an unknown `kid`, issuer and audience checks). The service consumes only `sub` (nothing reads `Roles` or `Username`; drop them from `Claims`). No `is_active` check: the service authorizes from its local sync cache by design, and the 5-min access-token lifetime bounds the exposure. This is the accepted answer to A20 for chat, stated here.

## Out of scope

Syncing `is_active` into the cache (a separate decision if the risk is not accepted); the WebSocket path through Spring (A25).

## Done when

`go build`, `go vet`, `go test ./...` pass, including a test with a locally generated RSA key and a stubbed JWKS (valid, expired, wrong issuer, unknown `kid`); verified against a real token from INFRA-13's Keycloak.
