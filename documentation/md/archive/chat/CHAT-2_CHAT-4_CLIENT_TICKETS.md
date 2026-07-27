# Client chat tickets — CHAT-2, CHAT-4 (ARCHIVED)

**ARCHIVED 2026-07-26 (user decision):** extracted from `client/docs/BACKLOG_V1.md` in full, superseded
by a fresh chat re-plan. Neither ticket had any code written — `GroupChatTab.tsx` still ships as
GRP-1's local-state-only mock. Kept for historical context only; do not pick these up.

Origin backlog: `client/docs/BACKLOG_V1.md`. Companion backend tickets (CHAT-1, CHAT-3):
`documentation/md/archive/chat/CHAT-1_CHAT-3_BACKEND_BACKLOG.md`. Decision doc:
`documentation/md/archive/chat/CHAT_SERVICE_INTEGRATION.md`.

---

## Implementation Order (as it appeared in the live backlog)

| # | Ticket | Title | Status |
|---|---|---|---|
| 3 | CHAT-2 | Wire GroupChatTab to real-time PubNub delivery — blocked on CHAT-1 (`modules/social/chat-impl/docs/BACKLOG_V1.md`) | `TODO` |
| 4 | CHAT-4 | Persisted chat history + hardening — blocked on CHAT-3 (`modules/social/chat-impl/docs/BACKLOG_V1.md`) and CHAT-2 | `TODO` |

---

### CHAT-2 · Wire GroupChatTab to real-time PubNub delivery
**Status:** `TODO` · **Type:** Feature · **Dependency:** CHAT-1
(`modules/social/chat-impl/docs/BACKLOG_V1.md`, backend)
**Spec:** `documentation/md/CHAT_SERVICE_INTEGRATION.md` — the decision doc, not an epic doc; this
ticket (like GRP-3/GRP-5) has no pre-existing mockup spec beyond what `GroupChatTab.tsx` already is.

**Filed:** 2026-07-22, alongside FRIEND-1's DM lineage · **Moved to V1:** 2026-07-26 (user decision,
along with CHAT-1/CHAT-3/CHAT-4) — no MVP ticket depends on it; `GroupChatTab.tsx` already ships
(GRP-1) as a local-state-only mock with an explicit "not saved" disclaimer, sufficient for MVP.

**Origin:** `GroupChatTab.tsx` shipped in GRP-1 as a local-state-only UI matching
`design-reference-group-feed.html`'s Chat tab exactly, with an explicit "not saved" disclaimer —
GRP-1's decision #1 filed real chat as "a separate future ticket once a conversations/messages
backend is scoped." `documentation/md/CHAT_SERVICE_INTEGRATION.md` is that scoping; this ticket is
the client half of its first slice.

**What ships:**
- `pubnub` npm package added to `client/package.json` (the JS client SDK — headless, no bundled UI
  component; `GroupChatTab.tsx`'s markup is unchanged).
- New `useGroupChatData(groupId, isActive)` hook, `client/src/features/groups/` — same page-level
  orchestration-hook shape as `useGroupMembersTabData`/`useSettingsUnsavedGuard` (data-fetching
  concern lives in a hook, component stays presentational/controlled per `client/CLAUDE.md`).
  Fetches a token from CHAT-1's `GET /api/groups/{groupId}/chat-token` when the Chat tab becomes
  active, calls the PubNub SDK's `subscribe()` on `group-{groupId}-chat`, and `fetchMessages()` for
  the vendor's own short-term (7-day) history to populate the tab on open. Exposes
  `{ messages, sendMessage, isLoading, isError }`.
- `GroupChatTab.tsx`: swap its local `useState` message list for the hook's real data — this is a
  wiring change to an already-built component (it already renders a message list + has a `send()`
  handler wired to a `Send` button), not a rewrite. `GroupsPage.tsx` already remounts this component
  per selected group (`key={selectedGroup.id}`) — that already gives "switching groups resets the
  subscription" for free, no new logic needed there.
- Update the "Group chat isn't built yet" disclaimer copy — messages now persist in PubNub's
  7-day store (not permanently — that's CHAT-4), so the exact wording needs revisiting at pickup
  rather than just deleting it outright.
- `VITE_PUBNUB_PUBLISH_KEY`/`VITE_PUBNUB_SUBSCRIBE_KEY` env vars (standard `VITE_`-prefixed
  build-time config, same convention as `VITE_API_PROXY_TARGET` in `vite.config.ts`) — these are
  meant to ship client-side (unlike the secret key, which stays backend-only and never appears here).

**Open decisions to resolve at pickup:**
1. E2E strategy — PubNub is a separate host, not `/api/**`, so MSW can't intercept it the way every
   other real-data ticket in this backlog does. Either mock the `pubnub` module directly in
   Playwright, or (simpler) defer E2E coverage to CHAT-4, once persisted history gives a stable,
   non-realtime-dependent way to assert message state without needing two live subscribed browser
   contexts.
2. Exact disclaimer copy once messages persist in vendor history but not yet in our own Postgres.

**Acceptance criteria:**
- Sending a message in one browser session appears in a second session subscribed to the same
  group's channel, without a page reload.
- Reopening the Chat tab (or switching groups and back) shows the vendor's recent history, not an
  empty list.
- A non-member of the group (if reachable via the UI at all) never successfully mints a token —
  covered by CHAT-1's backend test, not re-tested here, but the client's error state should render
  sanely if it somehow gets a 400.
- Storybook: extend `GroupChatTab.stories.tsx` with a "sending" state if the hook exposes a pending
  flag.

---

### CHAT-4 · Persisted chat history + hardening
**Status:** `TODO` · **Type:** Hardening · **Dependency:** CHAT-3
(`modules/social/chat-impl/docs/BACKLOG_V1.md`, backend), CHAT-2

**Filed:** 2026-07-22, alongside CHAT-2 · **Moved to V1:** 2026-07-26 (user decision, along with
CHAT-1/CHAT-2/CHAT-3).

**Origin:** filed alongside CHAT-2 — CHAT-2 intentionally ships real-time delivery backed only by
PubNub's own short-term history, so the real-time path lands and is verifiable before persistence is
layered on top (same "smallest shippable slice" sequencing this backlog already uses throughout).

**What ships:**
- `useGroupChatData` swaps its history source from PubNub's `fetchMessages()` to CHAT-3's paginated
  `GET /api/groups/{groupId}/chat/messages` — unlimited retention, our own data, same
  `PageResponse<T>`/`PagedApiResponse<T>` shape every other paginated feature in this app already
  uses (`feed/types.ts`).
- On send: `useGroupChatData`'s `sendMessage` publishes to PubNub for real-time delivery **and**
  calls CHAT-3's `POST /api/groups/{groupId}/chat/messages` to persist — the persistence call is a
  side path, its failure must never block the message from appearing for the sender or from being
  delivered live to other subscribers (matches the architecture doc's diagram exactly).
- Loading/error states for both the token-fetch and history-fetch calls — same
  `isLoading`/`isError`/retry convention FEED-8 established for every other real-data hook in this
  app, applied here for the first time to chat.
- Remove the "Group chat isn't built yet" disclaimer from `GroupChatTab.tsx` for real — messages
  now persist permanently.
- E2E: new `e2e/flows/group-chat.spec.ts` (mirrors `group-members.spec.ts`'s one-spec-per-feature
  precedent) — send a message, reload, confirm it's still there via the real persisted-history
  endpoint. Realtime cross-client delivery (two browser contexts both subscribed, actually exercising
  PubNub's fan-out) is a stretch goal, not a hard requirement for this ticket — MSW can't simulate a
  real vendor's realtime fan-out, so that would need a real (free-tier) PubNub sandbox key wired into
  CI; a call to make at pickup, not assumed here.
- `client/docs/E2E_OVERVIEW.md` updated to match (directory listing, new spec's test table) — same
  convention GRP-3 already followed. `a11y.spec.ts` — confirm the Chat tab doesn't introduce new
  violations at whatever breakpoint the existing Groups-page check already covers (GRP-3's baseline);
  extend only if it does.

**Acceptance criteria:**
- Message history survives a full page reload (sourced from our Postgres, not the browser's live
  subscription state).
- A persistence-call failure (simulated) does not prevent the message from appearing for the sender
  or being delivered live to another subscribed client.
- `./gradlew :server:test` green (confirms CHAT-3's backend didn't regress), full Vitest +
  `tsc -b`/`eslint` + Storybook build + Playwright `e2e` project green — same bar every ticket in
  this backlog already holds itself to.
