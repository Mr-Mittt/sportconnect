# CHAT-7 · Chat API client + data hooks scaffold — implementation summary

**Status:** `DONE` (2026-07-27) · **Type:** Feature (Foundation, client)

## What this ticket was

The first client-side ticket to touch `services/chat` — a small chat-scoped API client plus
`useGroupChatData`/`useDirectChatData` data hooks, wrapping the chat service's already-live REST +
WebSocket API (`README.md` §7) behind this repo's standard `{ data, isLoading, isError }` hook
shape. No component wiring — `GroupChatTab.tsx`/`FriendChatPanel.tsx` stay local-state mocks until
CHAT-8/CHAT-9.

## Approved design (Phase 3, restated)

- **Backend, small and scoped:** the WS route (`GET /conversations/{id}/ws`) needed a way to
  authenticate a browser's native `WebSocket`, which cannot set an `Authorization` header during
  the handshake. Add `Verifier.MiddlewareWS` (header first, falls back to a `?token=` query param),
  applied only to that one route — REST routes stay header-only.
- **Infra fix:** `vite.config.ts`'s `/api/chat` proxy entry, converted from the string shorthand to
  the object form with `ws: true`, since the shorthand doesn't proxy WebSocket upgrades.
- **Client:**
  - Refactor `apiClient.ts` into a shared `createAuthenticatedClient(baseURL)` factory so a second
    backend gets the same auth-attach + 401-silent-refresh-and-retry behavior without duplicating
    it.
  - `client/src/features/chat/`: `types.ts`, `chatApiClient.ts` (the new client + a
    `buildChatWebSocketUrl` helper), `queryKeys.ts`, `useChatConversation.ts` (shared internal
    hook), `useGroupChatData.ts`/`useDirectChatData.ts` (thin wrappers).
  - WS auth: JWT as a `?token=` query param (user decision, after a security tradeoff discussion —
    see below).
  - Reconnect policy: auto-retry with capped exponential backoff, refetching history on reconnect
    to fill any gap (user decision).

## What was actually built

Matches the approved design, plus one significant addition the design didn't anticipate (see
"Divergence from the approved design" below).

### Backend — `services/chat/internal/auth/auth.go`

- `Verifier.middleware(next, allowQueryToken)` is the shared implementation behind both
  `Middleware` (REST routes, header-only) and the new `MiddlewareWS` (WS route only, header first,
  `?token=` fallback). `internal/api/router.go`'s WS route now uses `MiddlewareWS`.
- `Parse` now accepts `HS256`, `HS384`, and `HS512` (previously `HS256` only) — see the divergence
  section below for why this was necessary.
- New tests: `auth_test.go` — 9 cases covering both middlewares' header/query-param/precedence
  behavior, plus a table-driven test confirming all three HMAC-SHA variants verify correctly
  against the same secret.

### Infra — `client/vite.config.ts`

`/api/chat`'s proxy entry converted to `{ target, changeOrigin: true, ws: true }`.

### Client — `client/src/app/apiClient.ts`

- New `createAuthenticatedClient(baseURL)` factory (attaches `attachAuthHeader`, wires
  `handleResponseError` for 401-retry). `apiClient` is now `createAuthenticatedClient('/api')`.
- `handleResponseError(error, client = apiClient)` gained an optional second parameter — which
  client instance the original request replays against after a refresh. Existing callers/tests
  (which never pass a second argument) are unaffected; `refreshAccessToken` itself is unchanged and
  always goes through the monolith's `apiClient`, regardless of which client's request 401'd.

### Client — `client/src/features/chat/` (new)

- **`types.ts`** — `Conversation`, `ChatMessage` (1:1 against `README.md` §7's documented JSON
  shapes — this service doesn't use the shared `ApiResponse<T>` envelope), and a client-only
  `ConnectionStatus` type (`'connecting' | 'open' | 'reconnecting' | 'closed'`).
- **`chatApiClient.ts`** — `chatApiClient = createAuthenticatedClient('/api/chat')`, plus
  `buildChatWebSocketUrl(conversationId)`, which reads the access token from `useAuthStore` and
  builds a `ws(s)://` URL relative to the current page's origin with `?token=` appended.
- **`queryKeys.ts`** — `chatKeys.conversation.group/direct`, `chatKeys.messages`.
- **`useChatConversation.ts`** — the shared hook behind both public hooks:
  - Opens the conversation via `useQuery` (`retry: false` — a 403 is terminal, not transient;
    `staleTime: Infinity` — opening is idempotent server-side, nothing to re-derive once known).
  - Fetches the latest page of history via `useQuery`, enabled once the conversation id is known;
    reverses the backend's newest-first order for a top-to-bottom transcript.
  - Manages the WebSocket lifecycle directly with the native `WebSocket` API (no client library —
    matches the server's plain `coder/websocket`, no framework on either side): connects when the
    conversation id becomes available, reconnects with capped exponential backoff
    (1s → 2s → … → 30s cap) on an unexpected close, refetches history on a successful reconnect,
    tears down cleanly on unmount.
  - `sendMessage` is a `useMutation` posting to `POST /conversations/{id}/messages`.
  - Both the mutation's response and every WebSocket-pushed message funnel through the same
    id-deduped merge into the TanStack Query cache (`chatKeys.messages(id)`) — necessary because
    the backend broadcasts a sent message back to *every* connection on the conversation, including
    the sender's own, so the REST response and the WS push can both deliver the same message.
  - Returns `{ data, isLoading, isError, error, sendMessage, isSending, connectionStatus }`.
- **`useGroupChatData.ts`** / **`useDirectChatData.ts`** — thin wrappers supplying the right
  "open" endpoint and query key.

### Tests

- `services/chat/internal/auth/auth_test.go` (Go, new, 9 cases, no DB/Redis needed — pure
  handler-level tests per this service's own testing convention for non-DB-touching logic).
- `client/src/features/chat/chatApiClient.test.ts` — baseURL/credentials, `buildChatWebSocketUrl`'s
  token-query-param behavior.
- `client/src/features/chat/useChatConversation.test.tsx` — 5 cases against a hand-rolled fake
  `WebSocket` class (no new dependency; matches this repo's "don't add a dependency that isn't
  earning its place" posture for a single test file): opens + loads history + connects; merges an
  incoming WS message; doesn't duplicate a sent message the WS echoes back; surfaces `isError` on a
  403; reconnects with backoff and refetches history.

## Divergence from the approved design

The approved design assumed "backend already live and stable, no changes expected" (the ticket's
own stated dependency). Two things forced backend/infra changes beyond the anticipated
`MiddlewareWS` addition:

1. **The `vite.config.ts` fix** was flagged during design (not a surprise at implementation time).
2. **The JWT algorithm bug was not anticipated at all**, and is the significant one. While doing the
   ticket's own required live verification (register a real user, open a real conversation, confirm
   a real WebSocket receives a real broadcast message), every real monolith-issued token was
   rejected with `401 invalid token` — including on the plain REST `POST /conversations/open/group/
   {id}`, nothing WS-specific. Root cause: JJWT 0.12.x's `Jwts.builder().signWith(key)` (the
   monolith's `JwtTokenServiceImpl` call site) auto-selects the strongest HMAC-SHA variant the
   *key's byte length* supports, not a fixed algorithm — the real dev `JWT_SECRET` (69 bytes) is
   long enough to produce **HS512** tokens, confirmed by decoding a real token's header
   (`{"alg":"HS512"}`). `internal/auth.Verifier.Parse` had hardcoded `jwt.WithValidMethods([]string
   {"HS256"})` since the service was first scaffolded — meaning the chat service's JWT verification
   had **never actually worked against a real monolith-issued token** in this dev environment. Only
   this package's own Go tests (which always mint their own HS256 test tokens) masked it, and
   whatever "live-verified end-to-end" checks CHAT-5/CHAT-6 or the original scaffold session did
   either predate this secret reaching its current length or didn't exercise a code path that
   required real signature verification against a live-issued token.

   Fixed by widening the accepted algorithms to `HS256`, `HS384`, `HS512` — all three verify
   correctly against the same secret bytes, so this is exactly as secure as accepting one. Flagged
   to the user before fixing (this is a materially larger finding than "add a query-param
   fallback"), user asked to fix it as part of this ticket. Documented in `README.md` §6.1 and §8,
   and in `PROGRESS.md`.

Everything else matches the approved design as stated — WS auth via query param and auto-retry
reconnect were both explicit user decisions made during Phase 1/3, not changed during
implementation.

## Verification

- `go build ./...`, `go vet ./...`, `go test ./...` — all green, against the real dev Postgres +
  Redis (dev compose stack), both before and after the JWT algorithm fix.
- Client: `tsc -b`, `eslint .`, `pnpm vitest run` — all green (95 test files / 538 tests passing
  across the whole client, not just this ticket's additions).
- **Live end-to-end verification** (the ticket's acceptance criterion): against the real running
  monolith (`:8080`) and chat service (`:8081`), registered a throwaway user, created a sport
  profile + group, opened the group's chat conversation, opened two independent WebSocket
  connections authenticated via the `?token=` query param with the user's real (HS512) access
  token, sent a message over the REST endpoint, and confirmed **both** connections received the
  broadcast. Note: `senderFullName` came back as an empty string on the broadcast payload — almost
  certainly `user_profiles_cache` not yet having synced for a user created seconds earlier in the
  same script run (an async Redis Stream sync race, not a bug this ticket introduced or needs to
  fix); worth a glance if CHAT-8/CHAT-9 see the same on a freshly-created account.

## Known follow-ups (not this ticket's scope)

- `GroupChatTab.tsx`/`FriendChatPanel.tsx` wiring — `CHAT-8`/`CHAT-9`.
- The `senderFullName` empty-string observation above, if it turns out to recur beyond
  brand-new-account timing.

---

**Status:** `DONE` (2026-07-27) · **Type:** Feature (Foundation, client) · **Dependency:** none
(backend was assumed already live and stable — see Delta below, this turned out to be only
partially true) · **Summary:**
`services/chat/docs/MVP/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`
**Spec:** `services/chat/README.md` §7 (full API reference) — the DTOs/endpoints this ticket wraps
already exist and are documented there; this ticket is client-side only.

**Origin:** first client ticket to touch `services/chat` at all. Per `client/CLAUDE.md`'s data
layer convention, every feature's data access goes through a `use<Feature>Data()`-shaped hook
wrapping TanStack Query — chat needs its own small API client (pointed at the chat service's base
URL, not Spring's) before any hook can exist.

**What ships:**
- `client/src/features/chat/` (new): `types.ts` (TS models 1:1 against
  `services/chat/README.md`'s documented response shapes — `Conversation`, `Message`), a chat
  API client module analogous to the existing `apiClient` but targeting `/api/chat` (the
  `VITE_CHAT_PROXY_TARGET`-proxied path already wired in `vite.config.ts`), reusing the same
  in-memory access token the rest of the app already holds — no separate login/token flow.
- `useGroupChatData(groupId)` / `useDirectChatData(userId)`: open-or-create the conversation
  (`POST /conversations/open/group/{groupId}` / `.../open/direct/{userId}`), fetch history
  (`GET /conversations/{id}/messages`), expose `sendMessage`, and manage the WebSocket connection
  (`GET /conversations/{id}/ws`) for real-time push — connect when the tab/panel becomes active,
  disconnect on unmount/deselect, same lifecycle `GroupsPage.tsx`'s `key={selectedGroup.id}`
  remount already gives `GroupChatTab` today.
- Returns the same `{ data, isLoading, isError }` shape (plus `sendMessage`) every other real-data
  hook in this app already returns, per `client/CLAUDE.md`.

**Open decision to resolve at pickup:** WebSocket reconnection policy (retry with backoff on drop,
or surface a "disconnected" state and require the user to reopen the tab) — not specified anywhere
yet, needs a decision here since both CHAT-8 and CHAT-9 depend on whatever this hook does.

**Acceptance criteria:**
- Hook(s) build and typecheck against the real running chat service (manually verified, not just
  against a mock) — open a conversation, send a message, see it via a second browser tab's
  WebSocket connection, matching the same live-verification bar `PROGRESS.md`'s backend entries
  already held themselves to.
- No component wiring yet — that's CHAT-8/CHAT-9.

**Delta (WebSocket auth, resolved at pickup):** browsers' native `WebSocket` can't set an
`Authorization` header during the handshake, so `GET /conversations/{id}/ws` needed a fallback —
added `Verifier.MiddlewareWS` (header first, `?token=` query param second, scoped to this one
route). User chose the raw query-param token over a `Sec-WebSocket-Protocol` subprotocol or a
short-lived single-use ticket endpoint, after a security tradeoff discussion. `vite.config.ts`'s
`/api/chat` proxy entry also needed `ws: true` (the string-shorthand form doesn't proxy WebSocket
upgrades) — full detail:
`services/chat/docs/MVP/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`.

**Delta (real bug found during required live verification, not a pre-existing-and-known gap):** the
chat service's JWT verification had never actually worked against a real monolith-issued token in
this dev environment — `internal/auth.Verifier.Parse` only accepted `HS256`, but JJWT 0.12.x's
`signWith(key)` (the monolith's own signing call site) auto-selects the strongest HMAC-SHA variant
the key's byte length supports, and the real dev `JWT_SECRET` is long enough to produce HS512
tokens. Only this package's own tests (which mint HS256 tokens themselves) masked it. Fixed by
widening accepted algorithms to HS256/HS384/HS512 (same secret bytes, equally secure). User asked
for this to be fixed as part of this ticket rather than filed separately. Full detail + how it was
confirmed: `services/chat/docs/MVP/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`.

---
