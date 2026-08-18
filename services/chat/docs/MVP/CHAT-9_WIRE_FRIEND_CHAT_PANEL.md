# CHAT-9 · Wire `FriendChatPanel` to the real chat service (1:1 DMs) — implementation summary

**Status:** `DONE` (2026-07-27) · **Type:** Feature (client)

## What this ticket was

Swap `FriendChatPanel.tsx`'s local-state-only mock for CHAT-7's `useDirectChatData(userId)`, so 1:1
direct messages are real, persisted, and deliver live over the chat service's WebSocket — the same
treatment CHAT-8 gave `GroupChatTab`, applied to the Friends page's chat panel.

## Approved design (Phase 3, restated)

Directly reused CHAT-8's shape, since this ticket is structurally the same problem on a different
surface:

- Same container/presentational split CHAT-8 introduced (`GroupChatTab`/`GroupChatTabView`): a thin
  `FriendChatPanel` container calling `useDirectChatData(userId)`, and a new presentational
  `FriendChatPanelView` taking all data/callbacks as plain props — for the same reason (no existing
  infrastructure in this repo mocks a real network+WebSocket-backed hook in Storybook, and
  `FriendChatPanel` needs to own the hook call directly so its mount/unmount, driven by
  `FriendsPage`'s `key={selectedPerson.id}` + conditional render, drives the WebSocket
  connect/disconnect).
- Props become `{ userId: string; currentUserId: string }`, replacing the old
  `otherPersonFirstName` — same reasoning as CHAT-8: real messages carry `senderId`/
  `senderFullName`, so `isOwn` and the other-bubble label come from the message itself.
- **Friends-only gate:** per the ticket's own instruction ("the backend already enforces this ...
  this ticket just needs the client to render that sanely, not re-implement the check"), no
  client-side pre-check against `selectedPerson.friendshipStatus` — always call the hook and let the
  server's real 403 (`conversation.ErrNotFriends`) drive the existing `isError` state, sharing the
  exact same generic "Couldn't load this conversation." copy the loading-failure path already uses.
  Kept deliberately generic rather than distinguishing "not friends" from "other error," matching
  CHAT-8's precedent and avoiding a second, client-side source of truth for who's allowed to chat
  with whom.
- Older-history pagination needed no new hook work — `useChatConversation`'s
  `loadOlderMessages`/`hasOlderMessages`/etc. already exist since CHAT-8 and are shared by both
  `useGroupChatData` and `useDirectChatData`.

## What was actually built

- **`client/src/features/friends/components/FriendChatPanelView.tsx`** (new) — presentational,
  effectively `GroupChatTabView` adapted for this surface: `h-full` layout (matching the panel's
  existing fixed 50/50 vertical split with `FriendProfilePanel`, not `GroupChatTabView`'s `h-105`),
  "Message…"/`aria-label="Message"` placeholder text (matching the original mock's copy), error copy
  reworded to "Couldn't load this conversation." (covers both a real failure and the friends-only
  gate). Same scroll-anchoring `useLayoutEffect`, same `useInfiniteScrollSentinel`-driven "Load
  earlier messages" affordance as CHAT-8.
- **`client/src/features/friends/components/FriendChatPanel.tsx`** (rewritten) — thin container:
  `useDirectChatData(userId)` → `FriendChatPanelView`.
- **`client/src/features/friends/FriendsPage.tsx`**: added a `useAuthStore` import (this page hadn't
  needed the current user's id before), call site updated to
  `<FriendChatPanel userId={selectedPerson.id} currentUserId={user.id} />` (still inside the
  existing `key={selectedPerson.id}` wrapper), and the page's own doc comment corrected — it
  previously described `FriendChatPanel` as having "local mock message list per person," no longer
  true.
- Old `FriendChatPanel.stories.tsx` removed (superseded by `FriendChatPanelView.stories.tsx`, same
  states as `GroupChatTabView.stories.tsx`: Loading, Error, Empty, Populated, HasOlderMessages,
  LoadingOlderMessages, LoadOlderMessagesError, Sending).
- Tests: `FriendChatPanelView.test.tsx` (all visual/interaction states, plain props, no mocking —
  mirrors `GroupChatTabView.test.tsx` exactly), `FriendChatPanel.test.tsx` (one container smoke test
  proving `userId` wires through to the right `open/direct/{userId}` call).

No changes needed to `useChatConversation.ts`/`useDirectChatData.ts` themselves — both already
existed and already supported everything this ticket needed.

## Verification

- `tsc -b`, `eslint .` — clean.
- `pnpm vitest run` — full suite green: **97 test files / 560 tests** (up from CHAT-8's 96/550).
- **Live verification through the real dev proxy (`localhost:5173`), not direct to `:8081`** — per
  the binding note CHAT-8 left for this ticket, after that ticket's own proxy-prefix bug was found
  via manual browser testing:
  - Registered three users (A, B, C). A and B become real friends (send + accept via the monolith's
    `/api/users/friends/requests` flow); C stays a stranger to A.
  - **Friends-only gate, through the proxy:** C attempting `POST /api/chat/conversations/open/
    direct/{A}` → `403`, correctly blocked.
  - **Real friends, through the proxy:** B opening the same conversation with A → `200`.
  - **Real-time delivery, through the proxy:** A's WebSocket (`ws://localhost:5173/api/chat/
    conversations/{id}/ws?token=...`) received B's REST-sent message.
  - **Pagination, through the proxy:** 56 total messages sent (1 + 55 more), `GET .../messages?
    limit=50` returned the newest 50, `?before=<oldest id>&limit=50` returned the remaining 6 —
    confirming the same page-1/page-2 mechanics CHAT-8 verified for groups also work correctly for
    direct conversations through the actual browser-facing path this time, not just direct to the
    service.
- **Not verified this session, same limitation as CHAT-8:** no browser tooling was connected, so the
  actual rendered UI in a live browser (visual pass against `design-reference-friend.html`, a real
  two-browser-session check via clicking through the app rather than raw HTTP/WS calls) was not
  performed. The underlying mechanics those checks would exercise are live-verified above, including
  through the real proxy this time — what's specifically unverified is the React rendering itself
  and Storybook's actual visual output.

## Known follow-ups (not this ticket's scope)

- The manual two-session browser check + Storybook visual pass noted above.
- CHAT-8's own outstanding manual browser check (never closed out after the proxy fix) — worth doing
  both together in one pass.
- Next up per `docs/BACKLOG_MVP.md`: `CHAT-13` (edit/delete), `CHAT-14` (read receipts), `CHAT-15`
  (typing indicators), `CHAT-16` (attachments) — each still needs its own Phase 1/2/3 scoping pass at
  pickup, unscoped beyond the open questions already filed.

---

**Status:** `DONE` (2026-07-27) · **Type:** Feature (client) · **Dependency:** CHAT-7 ·
**Summary:** `services/chat/docs/MVP/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md`
**Spec:** `client/design-reference/design-reference-friend.html`'s chat panel (already the
implemented reference)

**Origin:** `FriendChatPanel.tsx` has shipped since FRIEND-1 as a local-state-only mock, filed at
the time as "real wiring is DM-1/DM-2" — that lineage was archived along with the PubNub plan; this
ticket is its replacement, now backed by the same chat service `GroupChatTab` uses instead of a
separate 1:1-only backend.

**What ships:**
- Same treatment as CHAT-8: swap local state for `useDirectChatData(selectedUserId)` (CHAT-7),
  remove the "Direct messaging isn't built yet" disclaimer, loading/error states.
- Confirm the friends-only gate: opening a chat with someone who isn't (or is no longer) a friend
  must fail cleanly (the backend already enforces this via `friendships_cache` —
  `conversation.ErrNotFriends` — this ticket just needs the client to render that sanely, not
  re-implement the check).

**Acceptance criteria:**
- Same as CHAT-8's, applied to the friends panel: real-time delivery across two sessions, real
  persisted history on reopen, clean UI behavior when the friendship gate fails.

**Delta (structural, same as CHAT-8):** applied CHAT-8's container/presentational split here too —
`FriendChatPanel` (thin container, calls `useDirectChatData`) + new `FriendChatPanelView`
(presentational, everything visual). Same reason: no Storybook infra for a real network+WebSocket
hook, and the panel needs to own the hook call so `FriendsPage`'s `key={selectedPerson.id}` remount
drives the WebSocket lifecycle.

**Delta (verification, applying CHAT-8's lesson):** live-verified through the real dev proxy
(`localhost:5173`), not direct to the chat service — three users registered, two made real friends
via the monolith's request/accept flow, a third left a stranger; the stranger's `open/direct/{id}`
correctly `403`s through the proxy, the real friend's succeeds, a WebSocket opened through the proxy
receives a REST-sent message, and pagination (56 messages, 50/6 split) works through the proxy too.
Not verified this session (no browser tooling connected, same gap as CHAT-8): the actual rendered UI
in a live browser. Full detail: `services/chat/docs/MVP/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md`.

---
