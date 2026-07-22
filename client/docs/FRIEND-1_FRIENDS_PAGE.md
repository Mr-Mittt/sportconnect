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
