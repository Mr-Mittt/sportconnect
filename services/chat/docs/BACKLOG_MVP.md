# Chat Service — Feature Backlog

**Version:** MVP v1
**Module:** `services/chat` (Go + Postgres — see `services/chat/CLAUDE.md`)
**Last updated:** 2026-07-27

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session, `DONE` when implemented + verified
- Use `/workon chat mvp` to resume

**Ticket numbering starts at CHAT-5, not CHAT-1** — `CHAT-1..4` already exist as ticket IDs in the
archived PubNub-based plan (`documentation/md/archive/chat/`). Those were never built and are
superseded in full; this backlog continues the same `CHAT-N` module prefix without reusing their
numbers, so a search for e.g. `CHAT-3` doesn't return two unrelated tickets.

**Origin:** the structural scaffold (module layout, schema, cross-service JWT verification, the
Redis Streams sync mechanism, HTTP/WS API surface) was built and live-verified end-to-end before
this backlog existed — see `PROGRESS.md`'s 2026-07-26/27 chat entries and
`services/chat/docs/SYNC_DESIGN.md`. That work is **done**, not a ticket here. What's actually
missing to call the chat *feature* complete — not just the service — is backend test coverage
(the scaffold was proven live but has almost no automated regression coverage) and the entire
client side (`GroupChatTab.tsx`/`FriendChatPanel.tsx` are still local-state mocks, untouched).

**Scope decided for this MVP** (2026-07-27, user decision, amended same day): both group chat and
1:1 direct messages ship, backed by the one already-built schema (`conversations`/`chat_messages`
cover both in one lineage, see `SYNC_DESIGN.md`). Editing/deleting messages, read receipts, typing
indicators, and file attachments were initially filed as deferred `BACKLOG_V1.md` tickets, then
pulled into this MVP the same day (CHAT-13..16 below) — `services/chat/docs/BACKLOG_V1.md` is
currently empty as a result. None of the four were scoped in detail before this move (each still
carries open questions to resolve at pickup, same as when filed) — moving them to MVP is a
priority/sequencing decision, not a design pass; do that work at pickup, not by assuming the
original filing's open questions have already been answered.

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | CHAT-5 | Repository/cache integration tests (DB-backed) | `DONE` |
| 2 | CHAT-6 | WebSocket broadcast + sync resilience tests | `DONE` |
| 3 | CHAT-7 | Chat API client + data hooks scaffold (client) | `DONE` |
| 4 | CHAT-8 | Wire `GroupChatTab` to the real chat service | `DONE` |
| 5 | CHAT-9 | Wire `FriendChatPanel` to the real chat service (1:1 DMs) | `DONE` |
| 6 | CHAT-13 | Editing and deleting messages | `TODO` |
| 7 | CHAT-14 | Read receipts | `TODO` |
| 8 | CHAT-15 | Typing indicators | `TODO` |
| 9 | CHAT-16 | File/image attachments | `TODO` |
| 10 | CHAT-10 | E2E + MSW handlers for chat | `TODO` |
| 11 | CHAT-11 | Hardening — loading/error/sending states, a11y, visual regression | `TODO` |
| 12 | CHAT-12 | QA / acceptance checklist (chat) | `TODO` |

**Dependencies:**
```
CHAT-5, CHAT-6 — independent of everything else. The backend they test already works (live-verified
  2026-07-27); these are regression-coverage tickets, not blockers to client work starting.
CHAT-7 → CHAT-8, CHAT-9 (both client wiring tickets share the same API client/hook foundation)
CHAT-8 ∥ CHAT-9 — no code dependency between them (group chat and direct messages are independent
  UI surfaces once CHAT-7 exists), but sequenced group-first above: GroupChatTab has the
  longer-standing design reference (design-reference-group-feed.html, since GRP-1) and was the
  original CHAT-1..4 plan's sequencing precedent — pick up CHAT-9 first only if there's a specific
  reason to prioritize direct messages instead.
CHAT-8, CHAT-9 → CHAT-13, CHAT-14, CHAT-15, CHAT-16 — each of these four builds on top of basic
  send/receive existing on both surfaces; each needs its own Phase 1/2/3 scoping pass at pickup
  (per root CLAUDE.md's ticket-writing convention) since none were designed in detail before being
  moved here, only filed with open questions. No dependency among the four themselves — pick up in
  any order.
CHAT-8, CHAT-9, CHAT-13, CHAT-14, CHAT-15, CHAT-16 → CHAT-10 → CHAT-11 → CHAT-12 (E2E/hardening/QA
  now needs to cover the full feature set, not just basic messaging — sequenced last for that
  reason, same "wire → test → harden → QA" shape every other client feature in this repo's
  backlogs already follows)
```

---

## Tickets

### CHAT-5 · Repository/cache integration tests (DB-backed)
**Status:** `DONE` (2026-07-27) · **Type:** Testing (backend) · **Dependency:** none ·
**Summary:** `services/chat/docs/CHAT-5_REPOSITORY_CACHE_INTEGRATION_TESTS.md`

**Origin:** the structural scaffold's `conversation.Repository`, `message.Repository`, and
`sync.CacheStore` all have real, hand-written SQL, but the only tests that exist
(`conversation_test.go`, `message_test.go`) cover pure validation logic (`dmKey`, content-length
checks) — none of the actual queries have ever run under an automated test, only through the one
manual live-verification session recorded in `PROGRESS.md`.

**What ships:**
- `internal/conversation`: tests for `GetOrCreateGroupConversation`/`GetOrCreateDirectConversation`
  (idempotent — calling twice returns the same row, not a duplicate), `IsActiveParticipant`,
  `AuthorizeByID`'s three outcomes (group member, direct friend, neither).
- `internal/message`: tests for `Insert` + `Page`'s keyset pagination (insert N messages, confirm
  `before`/`limit` return the expected slice and ordering), `withSender`'s batched resolution
  against `user_profiles_cache` (assert exactly one query regardless of page size — same N+1
  discipline this repo already enforces Java-side, per `CLAUDE.md`).
- `internal/sync`: tests for every `CacheStore` upsert/delete method (`UpsertGroupMember` twice
  with a changed role actually updates, not duplicates; `RemoveGroupMembersByGroup` clears every
  row for that group; `UpsertFriendship`/`RemoveFriendship` both write/clear both directions).
- Per `services/chat/CLAUDE.md`'s testing convention: run against the real dev Postgres
  (`sportconnect_chat_dev` via the dev compose stack), not a hand-rolled mock — these are
  DB-touching by nature and a mock repository would just test the mock.
- A `.github/workflows/chat-ci.yml`, this service's first CI pipeline (there is none today —
  only `server-ci.yml` and `client-ci.yml` exist). Trigger on `services/chat/**` path changes,
  mirroring `server-ci.yml`'s shape: `actions/setup-go`, then `go build ./...`, `go vet ./...`,
  `go test ./...`. Unlike `server-ci.yml` (H2 + Testcontainers), this service's new DB-backed
  tests need a real Postgres, so the workflow needs a `postgres:` service container (with PostGIS
  if any cache table needs it, plain `postgres:` image otherwise) and the migrations applied
  before `go test ./...` runs.

**Acceptance criteria:**
- `go test ./...` green, including these new DB-backed tests, against a running dev Postgres.
- Each test cleans up its own rows (or runs in a transaction rolled back at the end) — tests must
  not depend on run order or leave state for the next run.
- `chat-ci.yml` green on a PR touching `services/chat/**`, running build + vet + test against a
  Postgres service container in the workflow (not just documented as a local manual step).

**Delta (found at pickup):** transactional per-test isolation (the acceptance criteria's "or runs in
a transaction rolled back at the end") required a small production-code change not spelled out
above: `conversation.Repository`/`message.Repository`/`sync.CacheStore` held a concrete
`*pgxpool.Pool` field, which can't be swapped for an open `pgx.Tx` in tests without an interface in
between. Added `internal/db.Querier`/`TxQuerier` (both already satisfied structurally by
`*pgxpool.Pool` and `pgx.Tx` — same method signatures) and changed the three repositories' field/
constructor types to depend on the interface instead of the concrete pool. No behavior change, no
call-site change in `cmd/chat/main.go`. Full detail:
`services/chat/docs/CHAT-5_REPOSITORY_CACHE_INTEGRATION_TESTS.md`.

**Delta (H2 question, asked and resolved at pickup):** considered and ruled out — H2 is JVM/JDBC-only
and this service's driver (`pgx`) speaks Postgres's wire protocol natively with no JDBC bridge;
`embedded-postgres` (a real-Postgres-binary-per-run library) was also considered as a Docker-free
alternative but not adopted — kept the real dev-compose Postgres locally / `postgres:16-alpine`
service container in CI, no new dependency.

---

### CHAT-6 · WebSocket broadcast + sync resilience tests
**Status:** `DONE` (2026-07-27) · **Type:** Testing (backend) · **Dependency:** none ·
**Summary:** `services/chat/docs/CHAT-6_WEBSOCKET_SYNC_RESILIENCE_TESTS.md`

**Origin:** `internal/ws.Hub` and the WebSocket-accept path in `internal/api/handlers.go` were only
ever confirmed to require auth and exist (a live curl-based check) — never that a second connected
client actually receives a message pushed by a first one, which is the entire point of the
component. Similarly, `internal/sync.Consumer`'s crash-recovery behavior (an unacked entry gets
retried) and `Bootstrapper`'s multi-page pagination (past one page of 500 rows) have never been
exercised at all.

**What ships:**
- WebSocket test: spin up the real router via `httptest.NewServer`, open two `coder/websocket`
  client connections to the same conversation, send a message via the REST endpoint, assert both
  connections receive the pushed payload (and a connection to a *different* conversation does not).
- Sync consumer test: publish a malformed/unhandled event, confirm it's skipped without crashing
  the consumer loop and without acking (a well-formed event after it must still be processed);
  simulate a restart (new `Consumer` against the same consumer group) and confirm a never-acked
  entry gets redelivered.
- Bootstrap pagination test: seed more than one page's worth of rows behind a fake or real
  `/internal/sync/**` responder, confirm the bootstrapper follows `next_cursor` until exhausted
  rather than stopping after the first page.

**Acceptance criteria:**
- `go test ./...` green.
- The WebSocket broadcast test is the one genuinely new piece of test infrastructure this ticket
  needs (a real client dialing back into a real test server) — get this working first, the rest of
  the ticket reuses ordinary table-driven tests.

**Delta (found at pickup):** the "restart... never-acked entry gets redelivered" premise required a
real production fix, not just a test — `Consumer.Run` only ever read with `>`, which Redis never
redelivers to any consumer once an entry has been delivered (confirmed empirically via `redis-cli`
before writing any code). Added `Consumer.reclaimPending` (a single `XREADGROUP ... 0` read at the
top of `Run`, before the main loop) so a same-identity restart genuinely reclaims its own pending
entries now. Also made `Consumer`'s stream/group and `Bootstrapper`'s page size per-instance fields
(defaulting to the real production values — no `main.go` changes) so tests don't touch real shared
Redis/monolith infrastructure. Full detail:
`services/chat/docs/CHAT-6_WEBSOCKET_SYNC_RESILIENCE_TESTS.md`.

**Delta (bootstrap test target, user decision):** ships against the real monolith, not an
`httptest.Server` stub — after being shown that forcing real pagination would otherwise need 501+
seeded rows (both the monolith's `MAX_LIMIT` and the Bootstrapper's own hardcoded request limit were
500), the user asked to reduce the page size instead; `Bootstrapper.pageSize` is now test-overridable
(50 in the test), needing only ~5 seeded rows. The test skips (not fails) when
`INTERNAL_SERVICE_SECRET` is unset — `chat-ci.yml` never sets it, so this one test never runs in CI,
by design.

**Delta (`chat-ci.yml`):** added a `redis:7-alpine` service container (CHAT-6's consumer tests need
real Redis, which the workflow didn't have) and a `JWT_SECRET` env value (the WebSocket test needs
one; the workflow didn't set it). Both gaps were only caught by re-simulating the workflow end-to-end
locally (fresh containers, `.env` hidden) — not assumed correct from local `go test` alone.

---

### CHAT-7 · Chat API client + data hooks scaffold (client)
**Status:** `DONE` (2026-07-27) · **Type:** Feature (Foundation, client) · **Dependency:** none
(backend was assumed already live and stable — see Delta below, this turned out to be only
partially true) · **Summary:**
`services/chat/docs/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`
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
`services/chat/docs/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`.

**Delta (real bug found during required live verification, not a pre-existing-and-known gap):** the
chat service's JWT verification had never actually worked against a real monolith-issued token in
this dev environment — `internal/auth.Verifier.Parse` only accepted `HS256`, but JJWT 0.12.x's
`signWith(key)` (the monolith's own signing call site) auto-selects the strongest HMAC-SHA variant
the key's byte length supports, and the real dev `JWT_SECRET` is long enough to produce HS512
tokens. Only this package's own tests (which mint HS256 tokens themselves) masked it. Fixed by
widening accepted algorithms to HS256/HS384/HS512 (same secret bytes, equally secure). User asked
for this to be fixed as part of this ticket rather than filed separately. Full detail + how it was
confirmed: `services/chat/docs/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`.

---

### CHAT-8 · Wire `GroupChatTab` to the real chat service
**Status:** `DONE` (2026-07-27) · **Type:** Feature (client) · **Dependency:** CHAT-7 ·
**Summary:** `services/chat/docs/CHAT-8_WIRE_GROUP_CHAT_TAB.md`
**Spec:** `client/design-reference/design-reference-group-feed.html`'s Chat tab (already the
implemented reference — this ticket is wiring, not new UI design)

**Origin:** `GroupChatTab.tsx` has shipped since GRP-1 as a local-state-only mock with a "Group
chat isn't built yet" disclaimer — this is the ticket that disclaimer was always deferring to.

**What ships:**
- Swap the local `useState` message list for `useGroupChatData(groupId)` (CHAT-7) — the component
  already renders a message list and has a `send()` handler wired to a `Send` button; this is a
  wiring change to an already-built component, not a rewrite.
- Remove the "Group chat isn't built yet" disclaimer.
- Loading state while the conversation opens/history loads; error state if opening fails (e.g. a
  403 if membership changed — surface something sane, don't crash).
- Storybook: update `GroupChatTab.stories.tsx` for the new data-driven states (loading, error,
  populated, sending).

**Acceptance criteria:**
- Sending a message in one browser session appears in a second session with the same group open,
  without a page reload (real WebSocket delivery, not polling).
- Reopening the tab or switching groups and back shows real persisted history, not an empty list.
- `tsc -b`/`eslint`/Vitest all clean.

**Delta (scope addition, user decision):** older chat history (scrolling past the initial 50
messages) was not in this ticket's original acceptance criteria, but added mid-pickup at the user's
request — `useChatConversation` (CHAT-7) switched from `useQuery` to `useInfiniteQuery`, reusing
`Feed.tsx`'s existing `useInfiniteScrollSentinel` pagination pattern rather than a new one. Any
future chat ticket building on `useGroupChatData`/`useDirectChatData` should assume
`hasOlderMessages`/`isLoadingOlderMessages`/`isLoadOlderMessagesError`/`loadOlderMessages()` exist on
the hook's return shape now, not just `{ data, isLoading, isError, sendMessage }`.

**Delta (structural, found at pickup):** no existing infrastructure in this repo mocks a real
network+WebSocket-backed hook inside Storybook (every other tab avoids the problem by having the
*page* own the data hook — the one thing this ticket's WebSocket-lifecycle design explicitly
couldn't do, see the ticket's own design note above). Split `GroupChatTab` into a thin container
(calls `useGroupChatData`) and a new presentational `GroupChatTabView` (everything visual, plain
props) — CHAT-9 will likely want the same split for `FriendChatPanel`. Full detail:
`services/chat/docs/CHAT-8_WIRE_GROUP_CHAT_TAB.md`.

**Delta (verification gap, flagged not hidden):** no browser tooling was connected this session, so
the actual rendered UI and the real two-browser-session delivery check were not performed — only the
underlying HTTP/WebSocket mechanics were live-verified (already proven at CHAT-7, re-confirmed here
at the pagination level). A manual browser pass is recommended before treating this as fully proven
in practice, not just in tests.

**Delta (real bug found via the user's own manual browser check, resolved same day):** exactly the
gap the delta above flagged turned up a real bug on first try — `GroupChatTab` failed immediately
with "Couldn't load this group's chat." Root cause: `vite.config.ts`'s `/api/chat` proxy had no
`rewrite`, so the full `/api/chat/conversations/**` path reached the Go service unchanged, but its
router registers routes with no such prefix — every proxied request 404'd. **Predates CHAT-8**
(present since the proxy entry was first added, at latest CHAT-7) and was masked because every prior
"live verification" in this backlog called the chat service directly at `:8081`, never through
`:5173`'s actual dev proxy — the only path a real browser uses. Fixed
(`rewrite: (path) => path.replace(/^\/api\/chat/, '')`) and re-verified the full open/connect/send/
receive/history flow through the real proxy path this time. **Binding note for CHAT-9 and beyond:**
a "live-verified" claim in this file must say whether it went through `:5173` or direct to `:8081` —
they are not equivalent, and only the former proves the browser-facing path actually works. Full
detail: `services/chat/docs/CHAT-8_WIRE_GROUP_CHAT_TAB.md`.

---

### CHAT-9 · Wire `FriendChatPanel` to the real chat service (1:1 DMs)
**Status:** `DONE` (2026-07-27) · **Type:** Feature (client) · **Dependency:** CHAT-7 ·
**Summary:** `services/chat/docs/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md`
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
in a live browser. Full detail: `services/chat/docs/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md`.

---

### CHAT-13 · Editing and deleting messages
**Status:** `TODO` · **Type:** Feature (unscoped) · **Dependency:** CHAT-8, CHAT-9
**Filed:** 2026-07-27, initially as a deferred `BACKLOG_V1.md` ticket, moved into this MVP backlog
the same day (user decision) — not re-scoped in the move; the open questions below are unchanged.

#### Questions to resolve when picked up

1. Edit: replace content in place (with an "edited" indicator, `edited_at` timestamp) or keep edit
   history? The schema today (`chat_messages`) has no versioning concept at all — this likely needs
   a migration either way (new nullable `edited_at` column at minimum, a separate
   `chat_message_edits` table if history matters).
2. Delete: hard delete the row, or soft-delete (a `deleted_at` column, row stays for audit/id
   stability but renders as "message deleted")? Soft-delete matches this app's existing convention
   elsewhere (`User.isActive`, `Group.isActive`) — likely the right default unless there's a reason
   not to.
3. Who can edit/delete — sender only, or does a group owner/admin get moderation rights over
   others' messages too (mirroring `group_admin`'s existing member-management powers)? The chat
   service's local cache (`group_members_cache.role`) already stores role, but per
   `services/chat/CLAUDE.md`'s documented gap, role changes aren't kept in sync yet — if this
   ticket needs role-aware authorization, that gap needs closing first, not worked around.
4. Real-time propagation: an edit/delete needs to push an update over the existing WebSocket
   broadcast (`internal/ws.Hub`), not just persist — the payload shape for "this message changed"
   vs. "new message" needs defining.
5. Time window: can a message be edited/deleted indefinitely, or only within some window after
   sending (common in chat products to limit confusion in an active conversation)?

#### Out of scope for this filing

Any actual implementation, schema migration, or API design — needs its own Phase 1/2/3 pass at
pickup (per root `CLAUDE.md`'s ticket-writing convention).

---

### CHAT-14 · Read receipts
**Status:** `TODO` · **Type:** Feature (unscoped) · **Dependency:** CHAT-8, CHAT-9
**Filed:** 2026-07-27, initially as a deferred `BACKLOG_V1.md` ticket, moved into this MVP backlog
the same day (user decision) — not re-scoped in the move.

#### Questions to resolve when picked up

1. Per-message ("seen by X, Y") or per-conversation ("read up to message N")? The latter is
   dramatically simpler to store (one `last_read_message_id` per `conversation_participants` row —
   that table already exists and already has a natural place for this column) and is what most
   chat products actually show for group conversations; per-message read state is the more complex,
   Instagram-DM-style option.
2. Does this need a new real-time event (broadcast "user X has read up to message N" over the
   existing WebSocket hub), or is a periodic/on-demand fetch enough?
3. Any privacy control (some products let a user disable sending read receipts while still seeing
   others') — decide if that's in scope at all before designing storage for it.
4. Group chat specifically: showing "seen by 8 of 12 members" doesn't scale visually to large
   groups the same way it does for a 1:1 DM — needs its own design decision, not an assumption that
   1:1 and group read receipts look the same.

#### Out of scope for this filing

Any actual implementation, schema migration, or API design — needs its own Phase 1/2/3 pass at
pickup.

---

### CHAT-15 · Typing indicators
**Status:** `TODO` · **Type:** Feature (unscoped) · **Dependency:** CHAT-8, CHAT-9
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

---

### CHAT-16 · File/image attachments
**Status:** `TODO` · **Type:** Feature (unscoped) · **Dependency:** CHAT-8, CHAT-9
**Filed:** 2026-07-27, initially as a deferred `BACKLOG_V1.md` ticket, moved into this MVP backlog
the same day (user decision) — not re-scoped in the move.

#### Questions to resolve when picked up

1. This app already has a media-upload path elsewhere (post images) — reuse that same upload
   mechanism and only store a URL reference in the chat message payload, per the reasoning already
   recorded in the archived PubNub plan (`documentation/md/archive/chat/CHAT_SERVICE_INTEGRATION.md`)
   when this was first considered and explicitly scoped out. Confirm that upload path still exists
   and works the same way before assuming it's reusable as-is.
2. `chat_messages.content` is `VARCHAR(1000)` with no concept of a non-text payload today — this
   needs either a new nullable `attachment_url`/`attachment_type` column, or a rethink of the
   message shape (e.g. a `type` discriminator: `TEXT` vs `IMAGE` vs `FILE`), which is itself a
   migration and a client-rendering decision, not just a column add.
3. File size/type limits, and whether attachments get scanned/validated the same way any other
   user-uploaded media in this app already is (if that exists) — don't build a second, weaker
   upload path.
4. Storage cost/location — same S3 (or wherever this app already stores post images) or something
   chat-specific? Given this project's stated cost-avoidance posture (`infra/documentation/`), reuse
   existing infrastructure rather than adding a new storage bucket/service.

#### Out of scope for this filing

Any actual implementation, schema migration, or upload-flow design — needs its own Phase 1/2/3
pass at pickup.

---

### CHAT-10 · E2E + MSW handlers for chat
**Status:** `TODO` · **Type:** Testing (client) · **Dependency:** CHAT-8, CHAT-9, CHAT-13, CHAT-14,
CHAT-15, CHAT-16

**Origin:** this repo's E2E convention (`client/CLAUDE.md`) runs entirely against MSW-mocked
`/api/**` calls, never a live backend — but the chat service is a second host
(`/api/chat/**`, proxied separately) with a WebSocket in the mix, which MSW's REST-interception
model doesn't handle the same way `documentation/md/archive/chat/CHAT-2_CHAT-4_CLIENT_TICKETS.md`'s
original CHAT-2 ticket already flagged as an open question before it was archived. Resolve it for
real this time, in this ticket, not as a deferred footnote.

**What ships:**
- MSW handlers for the REST endpoints (`e2e/mocks/handlers/chat.ts`, stateful — mirroring the
  existing `friends.ts` handler's pattern).
- A decision + implementation for the WebSocket piece: either mock the WS client module directly
  in Playwright (inject a fake `WebSocket` that the test controls), or scope E2E coverage to the
  REST-backed send+reload flow only and treat live cross-client delivery as a manual/live-verified
  check (matching how the backend side of this feature was itself verified — see `PROGRESS.md`).
  Record whichever is chosen and why, so the next chat ticket doesn't re-litigate it.
- `e2e/flows/group-chat.spec.ts` and `e2e/flows/direct-chat.spec.ts` (one spec per surface, this
  repo's established one-spec-per-feature convention) — send a message, reload, confirm it
  persisted via the real (mocked) history endpoint; extend to cover whichever of CHAT-13..16
  actually shipped by the time this ticket is picked up (edit/delete, read receipts, typing,
  attachments) rather than testing only the original send/receive flow.
- `client/docs/E2E_OVERVIEW.md` updated (directory listing + per-file test table) per this repo's
  existing convention for every new spec file.

**Acceptance criteria:**
- New specs green under `pnpm e2e`.
- `a11y.spec.ts` extended if either chat surface introduces new violations at whatever breakpoint
  the existing Groups/Friends page checks already cover — extend only if it actually does.

---

### CHAT-11 · Hardening — loading/error/sending states, a11y, visual regression
**Status:** `TODO` · **Type:** Hardening (client) · **Dependency:** CHAT-8, CHAT-9, CHAT-13,
CHAT-14, CHAT-15, CHAT-16

Same shape as every other feature's hardening ticket in this repo's backlogs (e.g. `FEED-8`,
`HF-8`): responsive check at 375/768/1280px, keyboard/focus/screen-reader pass on both chat
surfaces and every new affordance CHAT-13..16 added (edit/delete menu, receipt indicators, typing
state, attachment picker/preview), a "sending" pending state if `useGroupChatData`/
`useDirectChatData` expose one, retry affordance on a failed send/load rather than a dead end.
Full visual-regression baselines only if these changes visibly alter either design reference beyond
what CHAT-8/CHAT-9 already captured in their own Storybook updates.

**Acceptance criteria:**
- No new axe violations on either the Groups or Friends page.
- `pnpm test`/`tsc -b`/`eslint` all clean; visual-regression run if in scope, recorded as
  conditional otherwise (matching this repo's existing "record what could and couldn't be verified"
  convention).

---

### CHAT-12 · QA / acceptance checklist (chat)
**Status:** `TODO` · **Type:** QA · **Dependency:** CHAT-5 through CHAT-11, CHAT-13 through CHAT-16

Full walkthrough checklist before calling the chat feature (not just the service) done — mirrors
`HF-9`/`FEED-9`'s role in their respective epics: manual pass through both chat surfaces (and every
feature CHAT-13..16 added) against the real running backend (not just MSW), confirm every
acceptance criterion across every prior chat ticket is still true together (not just individually,
per-ticket), and a final `PROGRESS.md` entry closing out the epic.
