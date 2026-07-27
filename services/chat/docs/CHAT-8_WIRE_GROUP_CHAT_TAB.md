# CHAT-8 · Wire `GroupChatTab` to the real chat service — implementation summary

**Status:** `DONE` (2026-07-27) · **Type:** Feature (client)

## What this ticket was

Swap `GroupChatTab.tsx`'s local-state-only mock for CHAT-7's `useGroupChatData(groupId)`, so group
chat is real, persisted, and delivers live over the chat service's WebSocket — the wiring the
component's "Group chat isn't built yet" disclaimer had always been deferring to.

## Approved design (Phase 3, restated)

- `GroupChatTab` itself calls `useGroupChatData(groupId)` directly — a deliberate exception to this
  repo's usual "page owns the data hook, component stays presentational" convention
  (`GroupMembersTab`, `CommentSection`). Justified because `GroupsPage` already only mounts this
  component while the Chat tab is the active tab (conditional render) and remounts it on group
  switch (`key={selectedGroup.id}`) — the same mount/unmount lifecycle CHAT-7's hook needs to
  connect/disconnect its WebSocket. Lifting the hook call to `GroupsPage` would keep the WebSocket
  open even while looking at other tabs.
- Props become `{ groupId: number; currentUserId: string }`, replacing the old
  `currentUserFirstName` — real messages carry `senderId`/`senderFullName` now, so `isOwn` is
  computed from `message.senderId === currentUserId` and the other-bubble label comes from the
  message itself, not a fixed prop.
- Loading state ("Loading…") and error state (`role="alert"`, no crash) matching this app's
  established pattern (`GroupMembersTab`'s `Section`).
- Small, ticket-adjacent addition: auto-scroll to bottom on initial load / new message — without it,
  sending a message you can't see land would be a visibly broken experience, not a new feature.
- **Older chat history (user decision, added mid-ticket):** not in the original ticket text (whose
  acceptance criteria only covers "reopening shows persisted history," not "scroll up for more"),
  but the user asked for it explicitly once the gap was raised. Reuses this app's existing
  pagination pattern (`Feed.tsx`'s `useInfiniteScrollSentinel` + always-visible "Load more" button)
  rather than inventing a new one.

## What was actually built

### `client/src/features/chat/useChatConversation.ts` — extended for pagination

- `messagesQuery` switched from a plain `useQuery` to `useInfiniteQuery` (page size 50, matching the
  backend's default `limit`). `getNextPageParam` returns the oldest message id in the last-fetched
  page as the next `before` cursor, or `undefined` (no more pages) once a page comes back shorter
  than the page size.
- Pages are fetched newest-page-first; `messages` (the hook's flattened, exported `data`) is derived
  via `useMemo`: reverse page order, reverse each page's own newest-first contents, yielding one
  oldest-to-newest transcript.
- `mergeMessage` (shared by the send mutation's `onSuccess` and the WebSocket's `onmessage`) now
  operates on the `InfiniteData<ChatMessage[]>` shape — a new message is id-deduped and prepended
  into the *first* page only (the latest page), never touching older pages.
- New returned fields: `hasOlderMessages` (`hasNextPage`), `isLoadingOlderMessages`
  (`isFetchingNextPage`), `isLoadOlderMessagesError` (`isFetchNextPageError`), `loadOlderMessages()`
  (`fetchNextPage()`).

### `client/src/features/groups/components/` — container/presentational split

A new consideration surfaced during implementation, not in the original Phase 3 plan: this
component needed to be drivable by plain props for Storybook and most tests, but there is no
existing infrastructure in this repo for mocking a real network + WebSocket-backed hook inside
Storybook (every other component with this tension avoids it by having the *page* own the hook —
the one thing CHAT-8 can't do, per the design note above). Rather than build fragile
Storybook-level network/WebSocket mocking from scratch, split the component in two:

- **`GroupChatTabView.tsx`** (new) — the presentational half: everything visual and controlled
  (message list, loading/error states, the "Load earlier messages" affordance, the scroll-anchoring
  `useLayoutEffect`, the send input/button), taking all data and callbacks as plain props. This is
  what `GroupChatTabView.stories.tsx` and `GroupChatTabView.test.tsx` actually exercise — fast,
  no mocking required, same shape as every other tab's tests in this app.
- **`GroupChatTab.tsx`** (rewritten) — now a thin container: calls `useGroupChatData(groupId)` and
  renders `GroupChatTabView` with the result. `GroupChatTab.test.tsx` keeps one small smoke test
  (mocked `chatApiClient` + a hand-rolled fake `WebSocket`, same pattern as
  `useChatConversation.test.tsx`) proving the container wires `groupId` through correctly — it does
  not re-test every visual state; that's the View's job.
- Old `GroupChatTab.stories.tsx` removed (superseded by `GroupChatTabView.stories.tsx`).

`GroupChatTabView`'s "Load earlier messages" affordance mirrors `Feed.tsx`'s existing pagination
pattern exactly: a `useInfiniteScrollSentinel`-driven auto-trigger near the top of the scrollable
area, plus an always-rendered manual button/Retry fallback (keyboard/screen-reader reachable,
per that hook's own documented requirement).

### `client/src/features/groups/GroupsPage.tsx`

Call site updated: `<GroupChatTab groupId={selectedGroup.id} currentUserId={user.id} key={selectedGroup.id} />`
replaces the old `currentUserFirstName={user.firstName}`.

### Tests

- `useChatConversation.test.tsx` (CHAT-7's file): existing assertion updated for the new
  `{ params: { limit: 50 } }` request shape; two new tests — `hasOlderMessages` is `false` when the
  first page comes back short, and `loadOlderMessages()` fetches with the correct `before` cursor
  and prepends the older page in the right order.
- `GroupChatTabView.test.tsx` (new): loading, error, empty, own-vs-other bubble rendering, send
  (clears draft), Send disabled while empty/sending/loading/errored, "Load earlier messages"
  shown/hidden by `hasOlderMessages`, its loading and error (Retry) states, and that clicking either
  calls `loadOlderMessages`.
- `GroupChatTab.test.tsx` (rewritten): one smoke test proving the container opens the right
  conversation and renders real data through to the view.

Both new test files needed a hand-rolled `FakeIntersectionObserver` stub (jsdom has none) — same
pattern `Feed.test.tsx` already established for the same underlying hook.

## Verification

- `tsc -b`, `eslint .` — clean.
- `pnpm vitest run` — full suite green: **96 test files / 550 tests** (up from CHAT-7's 95/538).
- **Live verification against the real running monolith + chat service:** registered a user,
  created a group, sent 55 messages (deliberately past the 50-message page size), fetched the
  latest page (matching the "reopen tab" path — 50 messages, newest-first), then fetched the next
  page via `before=<oldest id in page 1>` (matching `loadOlderMessages()` — the remaining 5), and
  confirmed reconstructing both pages via the hook's own merge logic (reverse pages, reverse each
  page, concatenate) yields the exact original 1-to-55 send order.
- **Not verified this session, flagged rather than silently skipped:** no browser tooling was
  available (Claude in Chrome extension was not connected), so the actual rendered `GroupChatTab`
  in a live browser — the real cross-session delivery check ("send in one session, see it in a
  second session's open tab without reload") and a Storybook visual pass against
  `design-reference-group-feed.html` — were **not performed**. The HTTP/WebSocket-level mechanics
  those checks would exercise were already live-verified at CHAT-7 pickup (two raw WebSocket
  connections receiving a broadcast) and again here at the pagination level above; what's
  specifically unverified is the React rendering itself. Recommend a manual pass in a browser
  before considering this fully done in practice: `pnpm dev` (already running), open Groups → a
  group → Chat tab in two browser sessions, send a message in one, confirm it appears in the other
  without reload; separately confirm reopening the tab shows persisted history.

## Post-verification: real bug found via user's manual browser check

The user did the manual browser pass this doc's Verification section recommended, and hit
`GroupChatTab` showing "Couldn't load this group's chat." immediately — a real, previously
undiscovered bug, not a false alarm. Root cause: `vite.config.ts`'s `/api/chat` proxy entry had no
`rewrite`, so it forwarded the full incoming path (`/api/chat/conversations/open/group/{id}`,
`/api/chat/conversations/{id}/messages`, `/api/chat/conversations/{id}/ws`) unchanged to the chat
service — but `internal/api/router.go` registers its routes with **no** `/api/chat` prefix at all
(e.g. `POST /conversations/open/group/{groupId}`). Every proxied request therefore 404'd at the Go
service's own `http.ServeMux`, which has no route matching a path that still starts with
`/api/chat`.

Confirmed directly: `curl -X POST http://localhost:5173/api/chat/conversations/open/group/1` → `404`
(through the proxy) vs. `curl -X POST http://localhost:8081/conversations/open/group/1` → `401`
(direct to the service, same auth-rejected-but-route-matched outcome a fake token should produce) —
proving the route itself was always fine and the proxy was the sole problem.

**This bug predates CHAT-8 entirely** — it was present from whenever this proxy entry was first
added (at latest, CHAT-7) — and was masked in every prior "live verification" (CHAT-7's and this
ticket's own pagination check) because those checks called the chat service directly at
`http://localhost:8081`, never through `http://localhost:5173`'s actual dev proxy, which is the only
path a real browser ever uses. This is exactly the gap this doc's own Verification section flagged
as unperformed ("no browser tooling was available") — and it's precisely the kind of bug that class
of check exists to catch.

**Fix:** added `rewrite: (path) => path.replace(/^\/api\/chat/, '')` to the `/api/chat` proxy entry.
Re-verified end to end through the actual proxy path this time (`fetch`/`WebSocket` against
`localhost:5173`, not `:8081`): open conversation (200), WebSocket connect through the proxy, send a
message (201), the WebSocket receiving it, and a history re-fetch (200) all succeeded.

**Lesson for future chat tickets:** "live-verified" claims in this backlog need to specify whether
they went through the real dev proxy or direct to the service — they are not equivalent, and only
the former actually proves the browser-facing path works. CHAT-9 and later tickets should verify
through `localhost:5173`, not `localhost:8081`, when claiming a live check.

## Known follow-ups (not this ticket's scope)

- The manual two-session browser check (cross-session real-time delivery, Storybook visual pass)
  is still outstanding — the proxy fix above only closes the "can it load at all" gap the user's
  check surfaced; a full two-tab delivery check hasn't been done.
- `FriendChatPanel` wiring — `CHAT-9`. Its own data flow will need the same proxy fix's benefit
  (already fixed at the `vite.config.ts` level, so CHAT-9 doesn't need to repeat this) but should
  still verify through `localhost:5173` per the lesson above, not assume it's fine.
