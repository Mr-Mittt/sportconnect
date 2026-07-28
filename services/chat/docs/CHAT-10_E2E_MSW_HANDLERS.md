# CHAT-10 · E2E + MSW handlers for chat

**Status:** Done (2026-07-28) · **Module:** `client` (chat-facing e2e coverage) + `services/chat`
(spec-referencing docs only, no Go changes) · **Backlog:** `services/chat/docs/BACKLOG_MVP.md`

## Why this was picked up out of order

The implementation order in `BACKLOG_MVP.md` had CHAT-16 (file/image attachments) ahead of CHAT-10.
CHAT-16 was picked up first; its Phase 1 research found the ticket's core premise false — there is no
working media-upload pipeline anywhere in this app to reuse (post images are a bare URL-string field
with no upload service behind it), making CHAT-16 a materially bigger, still-undecided piece of work.
Rather than block on that, the user chose to swap the two tickets and finish CHAT-10 first. See
`BACKLOG_MVP.md`'s Dependencies-section Delta and CHAT-16's own entry for the full finding.

## Scope (Phase 1, confirmed with user)

- **What:** E2E coverage for both chat surfaces (`GroupChatTab`/`FriendChatPanel`) against a mocked
  chat backend, plus MSW handlers for chat's REST API and a resolution to the WebSocket-vs-MSW gap
  this repo's e2e convention had never covered before (chat is the first WebSocket-backed feature).
- **Feature coverage:** every chat feature shipped to date on both surfaces — CHAT-8/CHAT-9 (send +
  reload-persisted history), CHAT-13 (edit/delete), CHAT-15 (typing indicators). CHAT-16 (attachments)
  isn't shipped, not covered; CHAT-14 (read receipts) is out of MVP scope entirely, not covered.
- **Error/edge states:** explicitly out of scope (user decision) — happy path only. Failed
  send/403 membership/friendship gates are `CHAT-11`'s (hardening) scope.
- **WebSocket strategy:** inject a fake, in-page `WebSocket` (user decision) rather than scoping down
  to REST-only coverage — see Design below for why this was a clean fit here specifically.

## Design (Phase 3, as approved)

1. **Proxy wiring** — `playwright.config.ts`'s `pnpm dev` `webServer` entry gains
   `VITE_CHAT_PROXY_TARGET: MOCK_SERVER_URL`, alongside the existing `VITE_API_PROXY_TARGET`. No
   `vite.config.ts` change: its `/api/chat` proxy already strips the prefix before forwarding
   (`rewrite: (path) => path.replace(/^\/api\/chat/, '')`), so the mock server receives bare paths
   (`/conversations/...`) — the exact shape the real Go router uses, whether the target is the mock
   server or the real chat service.
2. **MSW handlers** — new `e2e/mocks/handlers/chat.ts`, stateful via `createSessionStore` (same
   pattern as `friends.ts`). Routes: `POST /conversations/open/group/:groupId`,
   `POST /conversations/open/direct/:userId`, `GET /conversations/:id/messages` (`limit`/`before`
   keyset pagination), `POST/PATCH/DELETE /conversations/:id/messages(/:messageId)`,
   `POST /conversations/:id/typing`. Responses are raw JSON, **not** wrapped in the monolith's
   `ApiResponse<T>` — chat's `types.ts` documents this as a deliberate difference from every other
   feature's handlers, and the new handler follows it. Conversation ids are assigned deterministically
   starting at `90001` per session (first-and-only conversation opened in each spec), so specs can
   reference the id directly rather than round-tripping to discover it.
3. **Fake WebSocket** (`e2e/mocks/fakeChatSocket.ts`) — the key design decision. `useChatConversation.ts`
   (the shared hook behind both chat surfaces) only ever *receives* over its WebSocket; every mutation
   (send/edit/delete/typing) is plain REST. That makes a fake, in-page `WebSocket` a **complete**
   substitute for a live second client, not a partial one: `installFakeChatSocket(page)` overrides
   `window.WebSocket` via `page.addInitScript` (string form — this repo's e2e tsconfig has no DOM lib,
   same reason `a11y.spec.ts` already uses string-form `page.evaluate`) with a class that fires `onopen`
   immediately, registers itself by conversation id, and no-ops `send()`. `pushChatEvent(page, id, event)`
   then reaches into that registry via `page.evaluate` to invoke `onmessage` with a real
   `ChatWebSocketEvent` payload. The mock server itself needed zero WebSocket support — it had none
   before this ticket and still has none.
4. **Specs** — `e2e/flows/group-chat.spec.ts` and `e2e/flows/direct-chat.spec.ts`, one per surface
   (this repo's one-spec-per-feature convention). Each: empty state → send → reload-persists → edit →
   delete → simulated incoming message via the fake WebSocket (proves real-time push without a
   reload) → simulated typing indicator (start shows, stop clears).

## What shipped (Phase 4)

- `client/e2e/mocks/handlers/chat.ts` (new) + registered in `handlers/index.ts` and
  `mockServer.ts`'s `resetSession`.
- `client/e2e/mocks/fakeChatSocket.ts` (new).
- `client/e2e/flows/group-chat.spec.ts`, `client/e2e/flows/direct-chat.spec.ts` (new).
- `client/playwright.config.ts` — `VITE_CHAT_PROXY_TARGET` added to the `pnpm dev` `webServer` env.
- `client/e2e/flows/friends-journey.spec.ts` — updated its now-stale trailing comment (previously said
  no MSW handler existed for chat yet; points at `direct-chat.spec.ts` instead now).
- `client/docs/E2E_OVERVIEW.md` — §2 (both proxy targets note), §3 (directory listing), §6 (full test
  catalog for both new specs + the conversation-id determinism note), Related docs.

## Verification (Phase 5)

- `pnpm exec tsc -b` — clean.
- `pnpm run lint` — clean.
- `pnpm exec playwright test --project=e2e --grep "chat"` — both new specs pass.
- `pnpm run e2e` (full suite, 48 tests including the two new ones and `friends-journey.spec.ts`) — all
  pass. A stale, non-Playwright-managed Vite dev server (and a second stray instance on `:5174`) was
  found listening before this run — killed per `E2E_OVERVIEW.md`'s own documented gotcha (an already-
  bound `:5173` gets reused by Playwright instead of a fresh instance carrying the new
  `VITE_CHAT_PROXY_TARGET` env var, which would have silently pointed chat requests at a real, absent
  `:8081` service).
- Manual a11y probe (temporary, not committed): both the Groups Chat tab and an active direct-chat
  panel were checked with `@axe-core/playwright` after sending a message — zero critical/serious
  violations on either. `a11y.spec.ts` itself was **not** extended — CHAT-11 (hardening) is the
  ticket that owns the full a11y pass for every affordance CHAT-13/CHAT-15 added (edit/delete menu,
  typing state), per the backlog's own sequencing; this ticket's acceptance criterion ("extend only if
  it actually does" introduce a violation) is satisfied by confirming there's nothing to extend for yet.
- `pnpm test` (Vitest, full unit/component suite) run as a sanity check — this ticket touched no
  `src/` files, only `e2e/**` and config, so no regression was expected; confirmed green.

## Non-obvious constraints for future chat tickets

- Any future e2e spec touching chat should call `installFakeChatSocket(page)` **before**
  `seedAuthenticatedSession` (it must be registered before the app's first navigation).
- The fake socket registry is keyed by conversation id parsed out of the WS URL
  (`/conversations/(\d+)/ws`) — a spec opening more than one conversation in the same test needs to
  track each id separately (none of this ticket's specs needed to).
- `handlers/chat.ts`'s conversation-id counter is per mock-session (reset every test) and starts at
  `90001` — stable only because each existing spec opens exactly one conversation. A future spec
  opening multiple conversations in one test must not assume sequential ids without checking the
  handler's assignment order.
- CHAT-16 (attachments), once scoped, will need this ticket's specs extended (or a third spec) to
  cover the new message shape — flagged in `BACKLOG_MVP.md`'s CHAT-10 entry already.
