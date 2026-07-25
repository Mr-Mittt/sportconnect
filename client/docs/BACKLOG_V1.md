# Client — V1 Feature Backlog

**Version:** V1
**Module:** `client`
**Last updated:** 2026-07-26
**Prerequisite:** MVP backlog (`client/docs/BACKLOG_MVP.md`) should be closed, or at least the ticket
that filed an entry here, before picking anything up.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon client v1` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | ANON-1 | Decide and scope anonymous/logged-out post viewing | `TODO` |
| 2 | I18N-1 | Introduce i18n / multi-language UI text support | `TODO` |
| 3 | CHAT-2 | Wire GroupChatTab to real-time PubNub delivery — blocked on CHAT-1 (`modules/social/chat-impl/docs/BACKLOG_V1.md`) | `TODO` |
| 4 | CHAT-4 | Persisted chat history + hardening — blocked on CHAT-3 (`modules/social/chat-impl/docs/BACKLOG_V1.md`) and CHAT-2 | `TODO` |

---

## Tickets

### ANON-1 · Decide and scope anonymous/logged-out post viewing
**Status:** `TODO` · **Type:** Product decision (spans backend + client) · **Filed:** 2026-07-17,
during client ticket FEED-12

#### Origin

FEED-12 (`client/docs/BACKLOG_MVP.md`) adds a URL-addressable post route, `/posts/:postId`, so a
comment thread can be shared as a direct link. Today **every** route in this app sits behind
`ProtectedRoute` — there is no concept of public/anonymous viewing anywhere. An anonymous visitor
clicking a shared `/posts/:postId` link gets the same already-built behavior every other protected
deep link gets: redirected to `/login?redirect=/posts/123`, then bounced back after authenticating
(AUTH-8's step 7 already covers this exact mechanism generically). That's the correct MVP behavior —
`GET /api/posts/{postId}` requires a Bearer JWT today and isn't in `CLAUDE.md`'s public-endpoint
allowlist (`/api/auth/**`, `/api/sports/**`, `GET /api/users/**`) — but whether a shared post should
be viewable **without ever logging in**, the way Twitter/X or Instagram permalinks work, is a genuine
product question nobody has decided yet. This ticket exists to make that decision and scope the
resulting work — **it does not implement anything itself.**

#### Questions to resolve when picked up

1. Should any post be viewable without authentication at all? If yes, gated to `visibility: 'public'`
   only — `'friends'`/`'private'` posts must 404 (not 403) to an anonymous caller, so existence isn't
   leaked. (Note: `visibility: 'friends'` isn't actually enforced anywhere yet per `post-impl`'s own
   `CLAUDE.md` gotcha — "behaves like private" — so in practice this reduces to "public only" until
   that's built.)
2. Read-only (view post + comments, no like/comment controls) or a visible-but-disabled composer with
   a "log in to comment" prompt?
3. Scoped narrowly to single-post permalinks (this ticket's literal trigger), or does the same
   decision extend to public group pages / public profile pages? Recommend scoping narrowly first
   unless there's a clear reason to decide all three at once.
4. Rate-limiting / scraping exposure for a genuinely public, unauthenticated, user-generated-content
   endpoint — no precedent in this codebase; the only public endpoints today are auth, the sport
   catalog, and the user directory, none of which serve per-user content.

#### If the decision is "yes, allow it" — scope of the resulting work

**Backend:**
- A new unauthenticated-safe read path for `GET /api/posts/{postId}` and its `/comments` sibling (or
  relax the existing ones to `permitAll` with an explicit visibility filter inside the service layer —
  don't just flip the security config without the filter, that would leak private/friends posts).
- Update `auth-impl`'s `SecurityConfig` public-endpoint list and `CLAUDE.md`'s own documented list to
  match, so the next person reading either doesn't have to rediscover this.

**Client:**
- `/posts/:postId` needs to stop being unconditionally behind `ProtectedRoute` — likely a route-level
  variant that renders for both authenticated and anonymous callers, rather than a hard redirect.
- `CommentSection`/the composer need a distinct logged-out rendering (hide interactive controls, or a
  disabled state with a "log in to comment" CTA) — today every code path assumes an authenticated
  caller.
- `usePost`/`useComments` (FEED-12) need to tolerate an anonymous caller gracefully (no 401 spray) —
  worth designing FEED-12's version of these hooks with this in mind even before this ticket is
  scheduled, so it isn't a rework later.

#### Out of scope for this filing

- Any actual implementation — this ticket is the decision + scoping pass, not the build.
- Public group/profile pages — only in scope if the decision above explicitly extends there.

#### Tests

Not applicable yet — write these when the ticket is actually scoped into an implementation ticket.

---

### I18N-1 · Introduce i18n / multi-language UI text support
**Status:** `TODO` · **Type:** Infrastructure (Foundation) · **Filed:** 2026-07-21, raised during
GRP-2 scoping then deliberately deferred out of it — GRP-2 is scoped narrowly (Settings tab data
set), and app-wide i18n is a cross-cutting foundation change, not a per-tab feature.

#### Origin

Raised mid-GRP-2 as a "let's add localization" idea, then explicitly deferred by the user to its
own V1 ticket rather than bundled in. Nothing about *which* languages, *how much* of the app, or
*which library* was discussed yet — this ticket is unscoped and needs a proper Phase 1/2/3 pass
(same as any other ticket) when picked up, not just "add react-i18next."

#### Questions to resolve when picked up

1. Which language(s) beyond English, and is there a priority order (drives whether this is a
   single extra locale or a general N-locale framework from day one)?
2. Scope: whole app at once, or one page/feature first (e.g. Settings tab, since that's what
   prompted this) with the rest following incrementally?
3. Library choice — `react-i18next` is the common React default, but confirm against this repo's
   "no second [library category] without a conversation" convention (`client/CLAUDE.md`) before
   adding a new dependency category.
4. Where do translated strings live — JSON files per locale, a translation-management service, or
   something else? Who owns keeping them in sync as new UI copy ships?
5. Does this affect `client/CLAUDE.md`'s testing conventions (Vitest/RTL assertions currently match
   on literal English strings in many places) — a locale switch could break a lot of existing
   tests if not scoped carefully (e.g. test against `data-testid`/roles instead of text where i18n
   lands, or keep tests locale-pinned to English).
6. Any backend-side implication (e.g. does any user-facing string currently originate server-side,
   like validation messages surfaced verbatim) that also needs translation, or is this purely a
   client-rendered-text concern?

#### Out of scope for this filing

- Any actual implementation, library choice, or locale list — this ticket is unscoped, filed only
  to not lose the idea; scoping happens at pickup.

#### Tests

Not applicable yet — write these when the ticket is actually scoped into an implementation ticket.


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
