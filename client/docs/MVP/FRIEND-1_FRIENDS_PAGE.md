# FRIEND-1 · Friends page — rail, profile/chat panel, directory search, friend-request actions

**Status:** `DONE` (2026-07-22) · **Type:** Feature · **Design reference:**
`client/design-reference/design-reference-friend.html`

## Origin

Filed while picking up GRP-4 (wire invite-friend search to the real backend): GRP-4's invite flow
requires the invitee already be the inviter's friend, but the client had no way to become anyone's
friend at all — the backend friendship system (`U1`, `modules/user/user-impl`) had shipped long
before this ticket with 8 real endpoints, none of them ever wired to a client UI. GRP-4 was reverted
from `IN PROGRESS` back to `TODO`, and this ticket was inserted ahead of it in the queue.

## Approved design (Phase 3, restated)

- **Types** (`src/features/friends/types.ts`): `FriendUser`, `UserSearchResult`, `FriendRequest`,
  `FriendshipStatus`, `FriendSectionKey`, `FriendRequestRow`, `SelectedPerson` — typed 1:1 against
  `UserResponse`/`UserSearchResponse`/`FriendRequestResponse` (verified against the real Java DTOs,
  not guessed). `PagedApiResponse`/`ApiResponse` reused from `@/features/feed/types`/
  `@/shared/types/api`, following this codebase's existing precedent of centralizing that envelope
  there rather than redefining it per feature.
- **Data layer**: one hook per endpoint under `src/features/friends/hooks/` (`useFriends`,
  `useFriendRequestsReceived`, `useFriendRequestsSent`, `useUserSearch`, `useUserProfile`,
  `useSendFriendRequest`, `useAcceptFriendRequest`, `useDeclineFriendRequest`), composed by the
  page-level orchestration hook `useFriendsPageData` (same role as `useGroupMembersTabData`). A
  gap found during Phase 2 exploration: `useSportProfiles` (SPORT-1) was hardcoded to the current
  authenticated user via `authStore` — extracted its core query/mapping logic into a new
  `useSportProfilesForUser(userId)` in `shared/hooks/`, with `useSportProfiles()` now a thin
  wrapper over it. This lets FRIEND-1 fetch a selected friend/search-result's sports without
  duplicating the `sportId -> SportKey -> SportProfile` mapping a second time. Also added a new
  generic `shared/hooks/useDebouncedValue.ts` (none existed in this codebase before — every prior
  search flow, e.g. `JoinGroupModal`, used explicit-submit, not live debounce).
- **Components** (`src/features/friends/components/`): `FriendRail` (search + Add-friend toggle +
  4 collapsible status sections, or Add mode's back-button + results), `FriendProfilePanel` (cover
  strip + avatar + name + plain neutral sport pills + collapsible Achievements + friendshipStatus-
  driven action bar), `FriendChatPanel` (local-state-only mock chat, near-identical to
  `GroupChatTab`'s pre-CHAT-2 shape). `FriendsPage.tsx` assembles all three plus the unchanged right
  rail (Upcoming/Trending/Broadcasts).
- **Page/state wiring**: all rail/search/selection state lives in `useFriendsPageData` (page-local),
  no new Zustand store — nothing here needs cross-page sharing the way `activeSport` does.
- **Tests**: Vitest+RTL for every component + the orchestration hook + the page; Storybook stories
  for every visual state (`FriendRail`'s 4 section states × populated/empty/collapsed + Add mode
  with/without results/searching; `FriendProfilePanel`'s 4 `FriendshipStatus` variants); a new MSW
  handler file + e2e spec + `a11y.spec.ts` extension (ticket's own scope decision, since this covers
  as much surface as GRP-3's Members tab did).

## What was built (matches the approved design; no scope divergence)

- **`src/features/friends/`**: `types.ts`, `queryKeys.ts`, `useFriendsPageData.ts`, `FriendsPage.tsx`,
  `hooks/` (8 files, one per endpoint), `components/` (`FriendRail`, `FriendProfilePanel`,
  `FriendChatPanel`, each with `.stories.tsx` + `.test.tsx`).
- **`shared/hooks/useSportProfilesForUser.ts`** (new) + **`useSportProfiles.ts`** (refactored to
  delegate) — the Phase 2 gap fix described above. `useSportProfiles.test.tsx` (pre-existing)
  continues to pass unchanged since the query key/URL/mapping behavior is identical, just relocated.
- **`shared/hooks/useDebouncedValue.ts`** (new, generic).
- **`router.tsx`**: `/friends` now renders `FriendsPage` instead of `ComingSoonPage`.
- **`e2e/mocks/fixtures.ts`**: `mockFriend` (Priya Shah — same person as `mockComment`'s commenter,
  intentionally reusing the id `priya-shah` for consistency, not a collision), `mockIncomingFriendRequest`
  (Hana Kim → the test user), `mockSentFriendRequest` (the test user → Diego Alvarez),
  `mockSearchResultUser` (Owen Clarke, `friendshipStatus: 'NONE'`, Add-mode-only).
- **`e2e/mocks/handlers/friends.ts`** (new): stateful MSW handlers for all 7 real endpoints, plus a
  small local `KNOWN_USERS` directory the search/profile/accept handlers resolve ids against.
  Registered in `handlers/index.ts` and `mockServer.ts`'s reset cycle.
- **`e2e/flows/friends-journey.spec.ts`** (new, 7 steps) + **`e2e/flows/a11y.spec.ts`** extended (one
  check at 1280px, friend selected — same "one representative state" scoping the Groups-page check
  already uses) + **`client/docs/E2E_OVERVIEW.md`** updated (§3 directory listing, §5 fixtures
  table, §6 catalog for both files).

## Key decisions (confirmed with the user before/during implementation)

- **Online/Blocked always render empty** — no presence system or block/blacklist concept exists
  anywhere in the backend. Every accepted friend renders under **Offline** instead. Same "Coming
  soon"-style placeholder treatment GRP-3 gave its Blacklist section, not a fabricated status.
- **Chat ships as a working local-state mock now**, not a placeholder — per the user's explicit
  instruction ("build the UI same with group chat, no real service for now"). Real wiring is
  out of scope, filed as **DM-1** (backend)/**DM-2** (client), same lineage as CHAT-1/CHAT-2.
- **Achievements starts collapsed** (user decision, mid-session) — reduces empty space for a friend
  with few sports/no bio, since the section body is static "Coming soon" text.
- **Action bar unified on the real `friendshipStatus`**, not a mockup-style `isDirectory` branch —
  the backend's `UserSearchResponse.friendshipStatus` and the pending-request lists already carry
  everything needed; re-deriving a directory-vs-friend distinction client-side would have been
  redundant and less correct (e.g. `sendFriendRequest` 400s "already pending" if re-sent, so gating
  the button on real status matters, not just cosmetic).
- **Declining a request clears the selection** — mirrors the design reference's own behavior
  exactly (`friends = friends.filter(...); selectedFriendId = null;` on decline).

## Non-obvious implementation notes

- `FriendUser.fullName` (and `UserSearchResult.fullName`) is a computed Java getter
  (`getFullName()`), not a stored field — it still serializes as a normal JSON property via Jackson
  bean introspection, same as `Post.userFullName` elsewhere in this codebase. No `bio`/`coverUrl`
  exist on `UserSearchResult` (U6's lighter projection) — `FriendProfilePanel`/`useUserProfile` only
  fetch those for a search-result selection, never for an already-known friend (which already has
  them from `useFriends()`'s full `UserResponse`).
- `useFriendsPageData`'s memoized derivations (`offlineFriends`, `friendRequestRows`,
  `selectedPerson`) depend on `xQuery.data` directly, not a `?? []`-derived local — the derived
  local is a fresh array reference every render when the query is still loading, which would
  otherwise trip `react-hooks/exhaustive-deps` and cause redundant recomputation.
- `GET /api/users/search` 400s below 2 trimmed characters — `useFriendsPageData` gates the query on
  `isAddMode && trimmedDebounced.length >= 2`, so `useUserSearch` is never called below that
  threshold in normal use.
- `UpcomingMatches`'s `sportsByKey` prop is populated from the current user's own real
  `useSportProfiles()` (not left as an empty object) so the right rail's match-card sport badges
  render identically to Home Feed/Groups — a small implementation refinement beyond what the Phase 3
  design text spelled out, not a scope change.
- The reference's friends-view right rail (`renderUpcoming('upcoming-friends')`) is called with no
  sport-filter argument at all — confirmed by reading the reference JS directly — so `FriendsPage`
  passes `activeSport="all"` to `UpcomingMatches` unconditionally; this page has no sport switcher.

## Verification (Phase 5)

- `tsc -b`: clean. `pnpm lint`: clean (fixed one real issue along the way — `useAddSportProfile.ts`/
  `.test.tsx` imported `sportProfilesQueryKey` from the old `useSportProfiles.ts` location; updated
  both to import from the new `useSportProfilesForUser.ts`).
- Vitest: all 89 test files / 487 tests pass, including the pre-existing `useSportProfiles.test.tsx`
  (unchanged behavior confirmed after the refactor).
- `storybook build`: succeeds, all new stories included.
- `pnpm e2e`: all 40 tests pass, including the new `friends-journey.spec.ts` and the new `a11y.spec.ts`
  Friends-page check (zero critical/serious axe violations).
- `pnpm test:visual`: 18 pre-existing failures, all in `app-home-feed.spec.ts`/`app-post-modal.spec.ts`
  — confirmed to be the well-documented Windows-vs-Linux font-rendering noise floor (HF-12 through
  HF-19's own precedent), not a regression: FRIEND-1 never touches Home Feed, `PostCard`,
  `CommentSection`, or the shared `Dialog` primitive, and no new visual-regression harness was in
  this ticket's scope (no `design-reference-friend.html`-based frozen baseline ticket was filed).
- **Live-verified against the real running backend** (not just MSW): registered two real users via
  the actual UI, had one search the real directory for the other (`GET /api/users/search`), send a
  real friend request (`POST /api/users/friends/requests`), had the second user see the real
  incoming request and accept it (`PUT .../accept`), then reloaded both sessions and confirmed each
  saw the other as a real accepted friend with the correct action-bar state (none) and the chat
  panel visible. Zero unexpected console errors — the two 401s observed are the same benign
  pre-login `/auth/refresh` bootstrap check every other page already produces.

## Follow-ups filed (not built here)

- **DM-1** (backend, new) / **DM-2** (client, new) — real direct-message wiring, same lineage as
  CHAT-1/CHAT-2.
- Real-time presence and block/blacklist both remain backend gaps needing their own design pass,
  same treatment this backlog already gives HF-4 (matches) and GRP-3 (blacklist).

## Follow-up (2026-07-25, user-requested): rail state persists across a visit

`query`/`isAddMode`/`selectedPersonId` moved from local `useState` in `useFriendsPageData` into a new
`friendsPageStore` (`src/app/friendsPageStore.ts`) — a small Zustand store persisted to
`sessionStorage`, same convention as the Groups page's `feedSpaceStore`. Leaving the Friends page
(e.g. to Home or Groups) and coming back now restores the rail's mode (friend list vs. directory
search), the search text, and the selected person exactly as left — previously all three reset to
their defaults on every remount, since `FriendsPage` unmounts on route change.

**The underlying lists (friends/requests/search) always refetch fresh on remount** — no extra wiring
needed for that part, since the app's `QueryClient` uses TanStack Query's own default `staleTime: 0`
and the query cache is already shared globally across route changes (not tied to page mount).

**A restored selection that's gone stale clears back to "no selection."** New logic in
`useFriendsPageData`: once the friends/received/sent lists (and, if in Add mode, the search results)
have all settled, if the restored `selectedPersonId` doesn't resolve to anyone in any of them, it's
cleared — rather than silently keeping whatever `useUserProfile` might still separately resolve for
that raw id (that hook fetches by id directly and doesn't know or care whether the person is still a
friend/pending request/search hit). `collapsedSections` (the rail's per-section collapse toggles)
stays local `useState`, not persisted — a transient UI toggle, not part of what was asked to persist.

Tests: new `src/app/friendsPageStore.test.ts` (mirrors `feedSpaceStore.test.ts`'s shape); 3 new cases
in `useFriendsPageData.test.tsx` (restoring a valid persisted selection, clearing an invalid restored
selection once lists settle, keeping a restored Add-mode search selection once the re-run search
confirms it's still there). `pnpm test` 526 green, `tsc -b` clean, lint clean. Not verified against
`pnpm e2e` — the same pre-existing sandbox environment issue noted in GRP-8's summary doc
(`GRP-8_INVITATION_LIFECYCLE_POLISH.md`) blocks a green e2e run in this session.

---

### FRIEND-1 · Friends page — rail, profile/chat panel, directory search, friend-request actions
**Status:** `DONE` (2026-07-22, `client/docs/FRIEND-1_FRIENDS_PAGE.md`) · **Type:** Feature ·
**Dependency:** none blocking — backend `U1` (friendship
system) and `U6` (user search) are both `DONE` (`modules/user/user-impl/docs/BACKLOG_MVP.md`); the
`/friends` route and nav tab already exist (`NavTabs.tsx`/`AppShell.tsx`), currently a
`ComingSoonPage` stub.
**Design reference:** `client/design-reference/design-reference-friend.html` (interactive, same
static-baseline convention as `design-reference-home-feed.html`/`design-reference-group-feed.html`).

**Origin:** filed 2026-07-22 while picking up GRP-4 — GRP-4's invite-to-group flow requires the
invitee already be the inviter's friend (backend `A6`'s `areFriends` gate), but there was no
client-side way to become anyone's friend at all. The backend friendship system (`U1`) has existed
and been `DONE` since before the Home Feed epic even started; nothing in either epic doc ever
scoped a client Friends page against it. Inserted ahead of GRP-4 in the queue (user decision) — see
GRP-4's own delta entry.

**What ships:**
- New `/friends` page replacing the `ComingSoonPage` stub. Right rail (Upcoming/Trending/Group
  broadcasts) is unchanged — same shared components Home Feed and Groups already use.
- Main area is a fixed-width `FriendRail` (left) + flexible `FriendContent` (right), per the design
  reference's `#friend-rail`/`#friend-content` split.
- **FriendRail:**
  - Header row: a shared search input (filters the rendered friend list on every keystroke, no
    debounce — same "no debounce" precedent `GroupMembersTab`'s "find member" input already set)
    plus an icon-only "Add friend" button (`aria-label="Add friend"`) that toggles Add mode. The
    input has a clear ("x") affordance that always returns to the default friend-list view (exits
    Add mode too, per the reference's behavior).
  - Default mode: 4 collapsible, status-grouped sections, each header formatted `{Label} (count)` +
    a chevron toggle: **Online**, **Friend Requests**, **Offline**, **Blocked**. See the presence/
    blocked decisions below for what actually populates each.
  - Add mode: replaces the section list with a left-aligned "← Back to friend list" button + one
    ungrouped results section titled `Matches for "{query}"` / `No users found for "{query}"`,
    sourced from a **debounced** real query against `GET /api/users/search?q=` (U6) — gated on
    trimmed length ≥ 2 (the backend 400s below that: `"Search keyword must be at least 2
    characters"`).
- **FriendContent** (empty state: "Select a friend to view their profile and chat" until a rail row
  is selected). Fixed 50/50 vertical split when a row (friend or search result) is selected:
  - **Top half — profile panel:** cover strip + avatar + name (`GET /api/users/{userId}`, public —
    needed for search-result rows since `U6`'s `UserSearchResponse` doesn't carry `bio`/`coverUrl`;
    friend-list rows already have this from `GET /api/users/friends`'s full `UserResponse`), sport
    pills (`GET /api/sports/profiles/user/{userId}`, public, same endpoint SPORT-1 already wired —
    fetched **only for the selected person**, not every rail row, to avoid N+1 across the whole
    list), a collapsible "Achievements" section — **collapsed by default** (user decision,
    2026-07-22: reduces empty space for a friend with few sports/no bio, since the section's body
    is just static "Coming soon" text with no backend anywhere) — and a docked action bar driven by
    the selected person's real friendship state — not a mockup-style
    `isDirectory` branch, since the backend already tells us this directly:
    - `friendshipStatus === 'NONE'` → "Send a friend request" (enabled) →
      `POST /api/users/friends/requests`. Gating on real status (not always-enabled) matters here:
      re-sending a still-pending request 400s (`"Friend request already pending"`), not idempotent
      like group invitations.
    - `'PENDING_SENT'` (caller sent it) → disabled "Waiting for response".
    - `'PENDING_RECEIVED'` (caller received it) → "Decline" / "Accept" buttons →
      `PUT /api/users/friends/requests/{requestId}/decline` / `/accept`. The `requestId` isn't on
      the search result or `UserResponse` — resolve it by matching the selected person's `userId`
      against the already-loaded `getPendingReceivedRequests()` list (loaded for the rail's Friend
      Requests section — no extra call needed).
    - `'FRIENDS'` → no action bar (matches the reference exactly — accepted friends get none).
  - **Bottom half — chat panel:** local component state only, same precedent as `GroupChatTab`
    before CHAT-2 (message list + input + Send button, a "not saved"-style disclaimer, nothing
    persisted, no backend call at all) — **per user decision, this ships as a working UI now, real
    wiring is a separate follow-up** (filed as DM-1/DM-2, since archived — see
    `documentation/md/archive/chat/DM-1_DM-2_TICKETS.md` — pending a fresh chat re-plan), not a
    placeholder.

**Design decisions resolved before pickup (2026-07-22, user decisions):**
- **Online/Offline:** no presence system exists anywhere in the backend (no heartbeat, session
  tracking, or WebSocket presence — `lastLoginAt` exists but isn't a reliable "online now" signal).
  Ships exactly as the reference shows (both sections render), but **"Online" always renders empty**
  — same permanent "Coming soon"-style placeholder treatment GRP-3 gave its Blacklist section, not a
  fabricated status. Every accepted friend (`GET /api/users/friends`) renders under **Offline**.
- **Blocked:** no block/unblock endpoint, schema, or repository concept exists at all (confirmed,
  same gap class as GRP-3's Blacklist). Ships as a permanent "Coming soon" empty section.
- **Chat:** ships as a fully working local-state mock now (not deferred/placeholder-only) — real
  backend wiring is out of scope for this ticket, filed as DM-1 (backend)/DM-2 (client), since
  archived pending a fresh chat re-plan (`documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`).

**Backend mapping:**

| Piece | Backend | Notes |
|---|---|---|
| Friends list | Real — `GET /api/users/friends` (U1, `DONE`) | Full `UserResponse` (bio/avatarUrl/coverUrl included) |
| Pending requests (sent/received) | Real — `GET /api/users/friends/requests/{sent,received}` (U1) | Merge both into the rail's one "Friend Requests" section; keep each row's direction for the content-pane action bar |
| Send/accept/decline/cancel | Real — `POST /requests`, `PUT /requests/{id}/accept`, `PUT /requests/{id}/decline`, `DELETE /requests/{id}` (U1) | Send 400s "already pending" on a duplicate — gate the button on real status |
| Directory search | Real — `GET /api/users/search?q=` (U6, `DONE`) | 400s under 2 trimmed chars; `friendshipStatus` per row reused directly for the content-pane action bar once selected |
| Sport pills | Real — `GET /api/sports/profiles/user/{userId}` (public) | Selected person only, not every rail row (N+1 avoidance) |
| Full profile (bio/cover) | Real — `GET /api/users/{userId}` (public) | Needed for search-result rows only |
| Online/offline presence | **No backend concept exists** | Online ships permanently empty; all friends render under Offline |
| Block/blacklist | **No backend concept exists** | Same treatment as GRP-3's Blacklist — permanent "Coming soon" |
| Direct-message chat | **No backend concept exists at all** (not even a filed ticket, unlike group chat's CHAT-1) | Ships as local-state mock only; real wiring filed as DM-1/DM-2, since archived (`documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`) pending a fresh chat re-plan |

**Out of scope:**
- Real-time presence/online status — needs its own backend design pass before a follow-up ticket.
- Real direct messaging — filed as DM-1/DM-2, since archived pending a fresh chat re-plan.
- Unfriending (`DELETE /api/users/friends/{friendId}` exists server-side) and blocking — neither
  appears in the reference's action bar; not built here. Flag at pickup if this feels wrong.
- Achievements — permanent "Coming soon", no backend, no follow-up filed.

**Acceptance criteria:**
- `/friends` renders the rail + content two-column layout; right rail unchanged from Home
  Feed/Groups.
- Typing in the rail search filters all four sections' visible rows in place (case-insensitive
  substring on name); each section independently collapsible, header shows `{label} (count)`.
- "Add friend" swaps the section list for "← Back to friend list" + one grouped
  `Matches for "..."`/`No users found for "..."` result section, backed by a debounced real search
  (≥ 2 trimmed chars); the input's "x" and "← Back" both return to the default friend-list view.
- Selecting any rail row (friend or search result) renders the fixed 50/50 content split: profile
  panel (cover/avatar/name/sport pills/collapsible Achievements-coming-soon section, collapsed by
  default/action bar) + chat panel (local mock, disclaimer visible).
- The docked action bar reflects real `friendshipStatus`/pending-request state (Send/Waiting/
  Accept-Decline/nothing) and each action calls its real endpoint, updating both the rail and
  content pane afterward (e.g. accepting a request moves that person from "Friend Requests" into
  "Offline").
- Storybook coverage: `FriendRail` (all 4 section states incl. collapsed/populated/empty, Add mode
  with results/no-results) and the profile-panel action bar (all 4 `friendshipStatus` variants).
- No new axe violations (extends `e2e/flows/a11y.spec.ts`, same convention GRP-3 established for
  the Groups page).

**Executed:** shipped exactly as scoped above — no scope divergence. Found and fixed a real gap
mid-implementation: `useSportProfiles` (SPORT-1) was hardcoded to the current authenticated user,
so a new `useSportProfilesForUser(userId)` was extracted into `shared/hooks/` (existing test
unaffected, same query/URL/mapping just relocated) — reused for both the current user's own sport
badges (right rail's `UpcomingMatches`) and any selected friend/search result's sport pills. Added
`shared/hooks/useDebouncedValue.ts` (new, generic — no debounce hook existed anywhere in this
codebase; every prior search flow, e.g. `JoinGroupModal`, used explicit-submit instead). New MSW
handler (`e2e/mocks/handlers/friends.ts`, stateful) + `friends-journey.spec.ts` (7 steps) +
`a11y.spec.ts` extension, all green; `tsc -b`/`pnpm lint`/Vitest (487 tests)/Storybook build all
clean. **Live-verified against the real running backend** (not just MSW): registered two real
users via the actual UI, one searched the real directory for the other and sent a real friend
request, the other saw and accepted the real incoming request, both reloaded and confirmed the
real accepted-friend state and correct action-bar transitions on both sides.
`pnpm test:visual`'s 18 failures are the pre-existing Windows-vs-Linux font-rendering noise floor
(HF-12..19's precedent) on Home Feed/post-modal baselines — FRIEND-1 touches neither surface, and
no visual-regression harness was in this ticket's own scope. Full writeup:
`client/docs/FRIEND-1_FRIENDS_PAGE.md`.

---

**DM-1/DM-2 archived 2026-07-26** (user decision) — full text moved to
`documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`, folded into the fresh chat re-plan.

---
