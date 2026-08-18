# CHAT-15 · Typing indicators

**Status:** `DONE` (2026-07-28) · **Type:** Feature (client + chat service) · **Dependency:** CHAT-8,
CHAT-9

## Origin

Filed 2026-07-27 as one of four unscoped tickets (CHAT-13..16) moved into `BACKLOG_MVP.md` the same
day, each carrying open questions to resolve at pickup rather than a finished design. CHAT-14 (read
receipts) was picked up first, then moved back out to `BACKLOG_V1.md` before being scoped (2026-07-28,
user decision) — see that file. CHAT-15 was picked up next.

## Decisions resolved at pickup (2026-07-28, user)

1. **Persistence:** none. Pure in-memory relay through the existing `internal/ws.Hub` — no new
   Postgres table, no Redis key. Typing state lives only as long as the WebSocket connections do.
2. **Debounce/timeout:** client-driven. The compose input sends a start signal on the first keystroke
   after being idle, then a stop signal after 5s of no further keystrokes (or immediately on send/
   blur) — no server-side timer.
3. **Group display:** name(s) up to a cap of two, then a count — "Jordan is typing…", "Jordan and
   Alex are typing…", "3 people are typing…".
4. **Self-echo:** never — a typing signal is relayed to every *other* connection on the conversation,
   never back to the sender's own (including their other tabs of the same conversation).
5. **Privacy opt-out:** out of scope for this ticket (no new settings/schema).

## What was built

### Backend (`services/chat`)

- `internal/ws/hub.go`: `Client` gained a `UserID` field; `Hub.Join` takes it. New
  `Hub.BroadcastExcept(conversationID, excludeUserID, payload)` — `Broadcast` (used by message send/
  edit/delete, which deliberately echoes to the sender) is untouched.
- `internal/api/responses.go`: a sibling `wsTypingEvent{Type: "USER_TYPING", Typing: typingBody}`
  envelope, deliberately not folded into the existing `wsEvent`/`MESSAGE_*` envelope (unrelated
  payload shape).
- `internal/api/handlers.go`: new `POST /conversations/{id}/typing` handler — reuses
  `Conversations.AuthorizeByID` (the same membership/friendship gate every other handler already
  uses), resolves the caller's display name via the existing `Cache.UserProfiles` batch call, then
  `Hub.BroadcastExcept`. No persistence, no `message` package involvement. Responds `204`.
- `Dependencies` gained a `Cache *sync.CacheStore` field (already constructed in `main.go`, just not
  previously threaded through to the API layer).
- Test: `TestWebSocketBroadcast_TypingIndicatorExcludesSender` in `websocket_integration_test.go` —
  same real-router/real-WebSocket-clients style CHAT-6 introduced. Proves the event reaches a genuinely
  different second participant, never the sender's own connection, and that a non-member still gets a
  plain `403`.

### Client

- `types.ts`: `TypingEventPayload`, and `ChatWebSocketEvent` widened to a union including
  `{type: 'USER_TYPING', typing: TypingEventPayload}`.
- New `client/src/features/chat/typingLabel.ts`: `formatTypingLabel(users)` — the "name(s), then
  count" formatting, shared by both views (a 1:1 DM only ever hits the single-name case in practice,
  but the logic is identical, so it's one function, not two copies).
- `useChatConversation.ts`: on a `USER_TYPING` frame, upserts/removes the sender in a `typingUsers`
  array (deduped by `userId`), with a per-user ~8s client-side expiry timer as a safety net for a
  dropped stop signal or a sender disconnecting mid-typing (this feature has no persistence to
  reconcile against later). Exposes `typingUsers: {userId, displayName}[]` and
  `sendTyping(isTyping: boolean): void` (fire-and-forget POST, failures silently ignored — an ephemeral
  signal has no user-visible consequence worth surfacing).
- `GroupChatTabView.tsx` / `FriendChatPanelView.tsx`: the compose input's `onChange` calls
  `sendTyping(true)` once per idle→typing transition and restarts a 5s idle timer that calls
  `sendTyping(false)`; also stops immediately on send, blur, and unmount. Renders the typing label
  (via `formatTypingLabel`, filtering out the caller's own id defensively even though the server
  already excludes it) above the compose box.
- Storybook: `OneMemberTyping`/`MultipleMembersTyping` (group), `OtherPersonTyping` (DM).
- Tests: `useChatConversation.test.tsx` (new `triggerTyping` fake-WS helper; upsert/remove/auto-expiry/
  `sendTyping` POST target), both views' `.test.tsx` (label rendering for 0/1/2/3+ typing users,
  self-id filtering, and the start/idle-stop/send-stop debounce behavior using `fireEvent` + fake
  timers — `userEvent.type()` combined with fake timers hung indefinitely in this repo's Vitest setup,
  so the debounce tests drive the input directly via `fireEvent.change`/`fireEvent.click` instead).

## Verification

- **Backend:** `go build ./...`, `go vet ./...`, `go test ./...` — all green, including the new
  integration test, against the real dev Postgres/Redis (`infra/docker-compose.dev.yml`).
- **Client:** `tsc -b`, `eslint`, `vitest run` (full suite, 97 files / 596 tests) — all green.
  `storybook build` also succeeds (catches compile/type errors in the new stories).
- **Not done this session:** a live two-browser-tab manual check through the real Vite dev proxy
  (`localhost:5173`), the bar CHAT-8/CHAT-9 established ("a 'live-verified' claim must say whether it
  went through `:5173` or direct to `:8081`"). No browser tooling was connected this session. The
  proxy risk here is low relative to CHAT-8's own discovered bug (a missing path-prefix `rewrite`
  entirely) — this ticket's new route follows the exact same `/conversations/{id}/...` shape already
  proxied correctly for messages/history/WebSocket — but it hasn't been re-confirmed with a real
  browser. A manual pass (two tabs, two real users, confirm the typing line appears/disappears live
  through `:5173`) is recommended before treating this as fully proven in practice.

---

**Status:** `DONE` (2026-07-28) · **Type:** Feature (client + chat service) · **Dependency:** CHAT-8,
CHAT-9 · **Summary:** `services/chat/docs/MVP/CHAT-15_TYPING_INDICATORS.md`
**Filed:** 2026-07-27, initially as a deferred `BACKLOG_V1.md` ticket, moved into this MVP backlog
the same day (user decision) — not re-scoped in the move.

#### Questions to resolve when picked up

1. This is the one chat feature here that's a poor fit for the existing persistence-first
   architecture — a typing indicator is inherently ephemeral (no `chat_messages` row, nothing that
   belongs in Postgres at all) and is naturally suited to something like a short-TTL Redis key or a
   pure in-memory, per-conversation broadcast over the existing WebSocket hub
   (`internal/ws.Hub`) with no persistence layer involved. Decide which before writing any code —
   defaulting to "add a table" here would be the wrong instinct.
2. Debounce/timeout semantics: how long after the last keystroke before "typing" clears
   automatically (client-driven timeout, server-driven timeout, or both)?
3. Group chat: does this show "Jordan is typing…" (name) or "3 people are typing…" once more than
   one person is — same design-scaling question CHAT-14 raises for read receipts.

#### Out of scope for this filing

Any actual implementation or transport design — needs its own Phase 1/2/3 pass at pickup.

#### Resolved at pickup (2026-07-28, user decisions)

1. **Persistence:** pure in-memory relay through `internal/ws.Hub` — no schema change, no Redis key.
2. **Debounce/timeout:** client-driven — a 5s idle timeout after the last keystroke, plus an
   immediate stop on send/blur. No server-side timer.
3. **Group display:** name(s) up to a cap of two, then a count ("3 people are typing…"). A 1:1 DM
   only ever shows the single-name case.
4. **Self-echo:** never — relayed only to the *other* connections on the conversation, unlike
   message send/edit/delete (which deliberately echo to the sender).
5. **Privacy opt-out:** out of scope for this ticket.

**Delta (verification gap, flagged not hidden):** no browser tooling was connected this session, so
the real two-browser-tab check through the actual Vite dev proxy (`:5173`) — the bar CHAT-8/CHAT-9
established — was not performed. Backend correctness (relay + sender-exclusion + authorization) is
proven by a real router/real-WebSocket-clients integration test; the client's event handling and
debounce logic are proven by unit tests. The new REST route follows the exact already-proxied
`/conversations/{id}/...` shape, so the proxy risk is lower than CHAT-8's own discovered bug (a
missing path-prefix rewrite entirely), but a manual two-tab pass is still recommended before treating
this as fully proven in practice. Full detail: `services/chat/docs/MVP/CHAT-15_TYPING_INDICATORS.md`.

---
