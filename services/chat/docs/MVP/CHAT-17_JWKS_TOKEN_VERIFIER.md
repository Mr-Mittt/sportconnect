# CHAT-17 · Verify Keycloak tokens by JWKS instead of the shared HMAC secret

**Status:** `DONE` (2026-10-16) · **Type:** Auth change · **Depends on:** INFRA-13 · **Gates:** removal of the HS256 path (A28)

**Filed:** 2026-10-14, from the social-login `/feature` census: `internal/auth` accepts HS256/384/512 with a shared secret and the claims `sub`, `email`, `username`, `roles`; Keycloak issues RS256 tokens without them.

## What

Replace the verifier in `services/chat/internal/auth` with a JWKS verifier (cached keys, refresh on an unknown `kid`, issuer and audience checks). The service consumes only `sub` (nothing reads `Roles` or `Username`; drop them from `Claims`). No `is_active` check: the service authorizes from its local sync cache by design, and the 5-min access-token lifetime bounds the exposure. This is the accepted answer to A20 for chat, stated here.

## Scope addition (2026-10-16, user)

Two defects found while verifying this ticket are fixed in the same change instead of waiting: **CHAT-18** (an unknown conversation id answers 500, should be 403) and **CHAT-19** (the chat service default port `:8081` is Keycloak's port in dev). Their ticket files stay as the record of each defect and are marked `DONE` with a pointer here; the fix is described in the implementation summary below.

## Out of scope

Syncing `is_active` into the cache (a separate decision if the risk is not accepted); the WebSocket path through Spring (A25).

## Done when

`go build`, `go vet`, `go test ./...` pass, including a test with a locally generated RSA key and a stubbed JWKS (valid, expired, wrong issuer, unknown `kid`); verified against a real token from INFRA-13's Keycloak.

---

## Implementation summary (2026-10-16)

**Design as approved.** `internal/auth` verifies Keycloak access tokens locally: RS256 only, against the realm JWKS, with issuer, the `sportconnect-api` audience and a required `exp` checked. No dependency was added (`golang-jwt` plus stdlib JWKS parsing). Only `sub` is read; `Claims` is now just `jwt.RegisteredClaims` (`Email`, `Username`, `Roles` were never used outside the package).

**Key cache.**
- Keys are cached by `kid`. The first fetch happens on the first token, not at startup, so the service starts with Keycloak down (the Spring side is lazy the same way).
- An unknown `kid` triggers one refetch, serialised behind a mutex and rate-limited to once per `MinRefetchInterval` (30 s), counted from the last attempt whether it succeeded or not. Twenty bogus `kid`s in a window cost one fetch, and an outage is retried at most once per window.
- A failed refetch keeps the cached keys, so tokens for known keys keep working through a Keycloak outage. A successful refetch replaces the set, so a key Keycloak stopped publishing stops verifying.
- Consequence to know: if Keycloak is down at the first token, requests get 401 until the window passes and a fetch succeeds (at most ~30 s after Keycloak is back).

**Config.** `JWT_SECRET` is gone (config, `.env`, `.env.example`, `chat-ci.yml`, README, CLAUDE.md, GO_MUST_KNOW). New: `KEYCLOAK_ISSUER_URI` (default `http://localhost:8081/realms/sportconnect`) and `KEYCLOAK_JWK_SET_URI` (default `<issuer>/protocol/openid-connect/certs`), the monolith's names. The audience is a constant in `main.go`.

**A20 for chat, stated.** No `is_active` check: the service authorizes from its local sync cache, and the 5-minute token life bounds the exposure. A deactivated user can keep using chat for at most that long. Syncing `is_active` into the cache stays a separate decision (not filed; file it if the risk stops being accepted). The WebSocket path through Spring is A25's, untouched.

**Consumer census.** REST and WebSocket behaviour for clients is unchanged (a bad token is still `401 invalid token`; the `?token=` fallback is still WebSocket-only), so the client and its MSW mocks are compatible as-is. The only contract that changed is the environment (`JWT_SECRET` removed): updated in this change everywhere listed above; no deployment config exists yet (INFRA-14).

**Tests** (`go test ./...` needs no running Keycloak; DB-backed packages need the dev Postgres, as before).
- New `internal/auth/authtest`: a stub Keycloak (generated RSA key, JWKS `httptest` server, key add/remove, outage switch, fetch counter, token minter).
- `internal/auth/auth_test.go` rewritten (package `auth_test`): the seven middleware tests kept; valid token; 12 rejected tokens (expired, no `exp`, wrong issuer, wrong audience, no audience, no `sub`, signed by another key under a known `kid`, unknown `kid`, garbage, HS256, `alg: none`, no `kid` header); cached after one fetch; no fetch at construction; rotated key picked up (and refused inside the rate window); refetch rate limit; outage keeps cached keys; outage at first use recovers; rotated-out key refused after a refresh. The HS384/HS512 test is deleted with the HMAC path.
- `internal/api/websocket_integration_test.go`: now mints real RS256 tokens from the stub instead of reading `JWT_SECRET`.
- Result: `go build ./...`, `go vet ./...`, `go test ./...` all green (auth, api, conversation, message, sync).

**Verified against the real dev stack.** Logged in through the themed Keycloak page (PKCE) as a dev user, exchanged the code, and called the chat service started with the `.env` (no `JWT_SECRET`): the real token header is `RS256` with a `kid`, `iss` is the realm URL, `aud` is the string `sportconnect-api` (a string, not an array; `golang-jwt` handles both), life 300 s. Results: real token → passes auth (reaches the handler), no token → 401, token with its last character changed → 401, HS256-shaped token → 401, WebSocket route with the token as `?token=` → passes auth. The service ran on `:8090` and was stopped afterwards.

**Folded in (scope addition above), both found during the real-stack check:**
- **CHAT-18, cause and fix.** A conversation id with no row made `Repository.GetByID` return the raw `pgx.ErrNoRows`; `writeError` had no case for it, so every conversation-scoped route (history, send, edit, delete, typing, WebSocket) answered `500 internal_error`. Reproduced first by a failing test on all six routes. `GetByID` now returns a new `conversation.ErrConversationNotFound`, and `writeError` maps it to **403** with the same wording a non-member gets, so a caller cannot tell which ids exist (ids are sequential, so a 404 would have been an existence oracle). Tests: `TestConversationRoutes_UnknownConversationIsForbidden` (six routes, real Postgres through the real router) and `TestAuthorizeByID_UnknownConversation`.
- **CHAT-19, fix.** The chat default `CHAT_HTTP_ADDR` is now `:8090` (`:8081` is the dev Keycloak since INFRA-13): `config.go`, `.env.example`, `Dockerfile` `EXPOSE`, the Vite `/api/chat` proxy default, README, CLAUDE.md, GO_MUST_KNOW, `E2E_OVERVIEW.md`, the Playwright comment and the INFRA-7 local-port note. Playwright still sets `VITE_CHAT_PROXY_TARGET` to its mock server, so e2e is unaffected. Checked live: Keycloak answers on `:8081` and chat on `:8090` at the same time, with no `CHAT_HTTP_ADDR` set. A developer already running `pnpm dev` must restart it to pick up the new proxy default (or set `VITE_CHAT_PROXY_TARGET`); a `services/chat/.env` that sets `CHAT_HTTP_ADDR=:8081` explicitly needs that line removed. Production (INFRA-14) decides its own port; the image now exposes 8090.
- **Ports registry (requested with this fix).** New `infra/documentation/PORTS.md` lists every dev, test-harness and container port (collected from Compose, the Vite/Playwright/Storybook configs, the e2e scripts and the Spring/chat defaults), with the rules for picking one (check the list, check the machine, stay out of the Windows dynamic ranges, one default in one place) and a free band, 8091 to 8099, for the next service. Root `CLAUDE.md` points to it from the Dev environment section.
- Client: the 403 category is the one a non-member already got, so no client change.

**Unblocks:** A28 (auth) can drop the HS256 path and the old token endpoints; chat no longer depends on a secret shared with the monolith.

**E2E / visual regression:** not applicable, no client change.
