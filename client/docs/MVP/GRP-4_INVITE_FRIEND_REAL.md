# GRP-4 · Wire invite-friend search to the real backend

**Status:** `DONE` (2026-07-22) · **Type:** Feature · **Dependency:** GRP-3 (`DONE`), FRIEND-1 (`DONE`)

## What shipped

Replaced `InviteFriendModal`'s GRP-3 mock ("Search coming soon.", no network call) with a real,
debounced search against `GET /api/users/search` (U6) wired to `POST
/api/groups/{groupId}/invitations` (B1).

## Scoping decisions (confirmed at pickup)

The ticket was filed "not yet scoped in detail." Three decisions were confirmed before design:

1. **Non-friend search results are dropped entirely**, not shown disabled. `GET /api/users/search`
   doesn't filter by group or friendship at all, and each row already carries `friendshipStatus` for
   free — so a `NONE`/`PENDING_SENT`/`PENDING_RECEIVED` row is filtered out client-side before it can
   ever be shown, rather than rendered with a disabled "Not friends yet" state (an earlier design
   pass proposed the disabled-state option; the user's explicit instruction during implementation
   was to exclude non-friend rows from the list altogether).
2. **Already-a-member / already-invited friends are not filtered out** — they're pushed to the
   **end** of the results list, badged (`"Already a member"` / `"Already invited"`) instead of
   showing an Invite button. Per the same user instruction, sorting (not exclusion) is the
   correct treatment for these two states specifically, distinct from the non-friend exclusion above.
3. **Auto-run search on open**: the modal is opened from `GroupMembersTab`'s "find member" input via
   `openInviteFriend(query)`; the pre-filled query flows straight into a continuous 300ms debounce
   (same shape as FRIEND-1's Add-mode search) rather than requiring an explicit submit — so the
   search fires automatically ~300ms after open with no extra user action, matching the precedent
   `JoinGroupModal`'s `openSearch` already set for its own pre-fill-and-search flow.

## Design

**Data layer:**
- `useSendGroupInvitation(groupId)` (new, `feed/hooks/`) — wraps `POST
  /groups/{groupId}/invitations`, invalidates only `feedKeys.sentInvitations(groupId)` on success
  (not the blunter `feedKeys.all` some sibling mutations use — creating an invitation touches
  nothing else cached).
- `useInviteFriendModalData(groupId, isOpen, initialQuery)` (new, `groups/`, same page-boundary role
  as `useJoinGroupModalData`) — owns the debounced search input (re-seeded once per open via a
  `seededForOpenRef`, replacing the old `key`-remount trick), composes `useUserSearch` (reused
  directly from `friends/hooks/` — same U6 endpoint, no duplicated hook), and
  `useGroupMembers`/`useSentInvitations`, both **cache-shared** with `GroupMembersTab`'s
  already-active queries (same `feedKeys.groupMembers`/`feedKeys.sentInvitations` query keys — zero
  extra network calls while the Members tab is open). Resolves each search result into one of three
  actions per the decisions above (`friend`/`member`/`invited`), sorted invitable-first, and tracks
  per-row send state (`isSending`, `error`) locally via `onMutate`/`onError`/`onSettled` callbacks —
  a single `useMutation` instance can't represent multiple concurrent in-flight rows on its own
  `isPending`/`error`.

**Component:** `InviteFriendModal.tsx` rewritten to a pure render of `rows: InviteResultRow[]` —
`member`/`invited` rows get a muted badge, `friend` rows get an enabled "Invite" button (disabled
while that row's own send is in flight), and a per-row inline error (`role="alert"`) renders under a
row whose send failed — covering the two 400s that aren't knowable ahead of a click
(`allowMemberInvites` off, capacity full; the not-friends 400 is unreachable in practice since #1
above already filters those rows out).

**Wiring:** `GroupsPage.tsx` drops `inviteFriendOpenCount`'s `key`-remount (the search/error/pending
state now lives in the hook, re-seeded per open the same way `JoinGroupModal` already works) and
passes the hook's fields straight through as props.

## Bug found and fixed: `UserSearchResult.username` is nullable

Live-verifying against the real running backend (see below) surfaced a real, pre-existing type gap:
`UserSearchResult.username` (FRIEND-1's type, `friends/types.ts`) was typed `string`, but
`UserSearchResponse.username` (`modules/user/user-api`) is a plain `String` with no `@NotNull` — a
freshly registered account with no username set returns `username: null` from `GET
/api/users/search`. FRIEND-1 never rendered this field anywhere, so the gap was latent;
`InviteFriendModal` is the first consumer to actually display `@{username}`, so it's the first place
this could have broken (rendering `@null`). Fixed by widening the type to `string | null` and
guarding the render (`user.username !== null && ...`) — not a scope-creep fix, a correctness fix
this ticket's own new code would otherwise have shipped broken.

## Verification

- `pnpm exec tsc -b`, `pnpm lint`, `pnpm exec vitest run` (503 tests) — all clean.
- New `useInviteFriendModalData.test.tsx` (debounce gating, non-friend exclusion, member/invited
  sort-to-end, per-row pending/error isolation) and rewritten `InviteFriendModal.test.tsx`/
  `.stories.tsx` for the new props/row states.
- New MSW handler (`POST /api/groups/:groupId/invitations` in `e2e/mocks/handlers/groups.ts`) —
  simulates the already-a-member 400 and the idempotent already-invited re-invite; the not-friends/
  `allowMemberInvites`-off 400s aren't simulated since the client already filters non-friend results
  out before an invite is reachable in the mocked UI.
- `group-members.spec.ts`'s step 3 rewritten for the real flow (search "priya" → `mockFriend` row →
  Invite → "Already invited"), full `e2e` project re-run (40/40 green). `client/docs/E2E_OVERVIEW.md`
  updated to match (intro fixture note, §5 fixtures reference, §6 test-case table).
- **Live-verified against the real running backend** (not just MSW): registered two fresh users,
  confirmed `GET /api/users/search` returns `friendshipStatus: 'NONE'` pre-friendship and `'FRIENDS'`
  post-friendship; confirmed the exact 400 messages and check order (`allowMemberInvites` off fires
  before the friends-gate, matching `GroupServiceImpl.createInvitation`'s real check order);
  confirmed a successful invite (`201`, exact `GroupInvitation` shape) and a re-invite against the
  same pair return the identical invitation id (idempotent) and appear once in `GET
  .../invitations/sent`.

---

### GRP-4 · Wire invite-friend search to the real backend
**Status:** `DONE` (2026-07-22, `client/docs/GRP-4_INVITE_FRIEND_REAL.md`) · **Type:** Feature ·
**Dependency:** GRP-3 (`DONE`), FRIEND-1 (`DONE`)
**Origin:** filed alongside GRP-3 — the invite-friend modal ships with mocked "coming soon" results
in GRP-3 on purpose, so the modal's UI/UX lands independently of the real search+invite call chain.

**What ships:** replace the modal's mock result state with a real, debounced query against `GET
/api/users/search?q=&page=&size=` (`U6`, `DONE` —
`modules/user/user-impl/docs/MVP/U6_USER_DISCOVERY.md`), and wire each result's "Invite" action to the
existing `POST /api/groups/{groupId}/invitations` (B1, `DONE`) — which already 400s server-side if
the inviter/invitee aren't friends (`A6`'s `UserFriendService.areFriends` gate) or if
`allowMemberInvites` is off for the group. Surface that 400 as an inline per-result error, not a
modal-wide failure. Confirm at pickup whether `U6`'s response already excludes existing
members/already-invited users from results — don't assume either way.

**Delta (2026-07-22, picked up then reverted):** this ticket was briefly started and reverted back
to `TODO` — the user flagged that `B1`'s invite endpoint requires the inviter/invitee to already be
friends (`areFriends` gate), and the client had **no way to become someone's friend at all** at that
point (no Friends page, no send/accept-request UI, despite the backend's `U1` friendship system
being `DONE` since long before). Every non-friend row in this modal's real search results would've
been a dead end. **FRIEND-1** was filed to close that gap and inserted ahead of this ticket in the
queue — now `DONE` (`client/docs/FRIEND-1_FRIENDS_PAGE.md`), so this ticket is unblocked and ready
to pick up for real.

**Delta (2026-07-22, resolved at pickup):** confirmed `U6` does NOT exclude existing
members/already-invited users (no `groupId` param exists on the endpoint at all) — so the client
resolves both client-side against `GroupMembersTab`'s already-loaded members/sentInvitations
queries. **Supersedes this entry's original "surface the 400 as an inline error" framing for the
non-friend case**: non-friend search results are dropped from the list entirely (user decision, not
shown disabled/inline-erroring), since `friendshipStatus` is already known per-row without a click.
Already-a-member/already-invited friends are NOT filtered out — they're sorted to the end of the
list, badged instead of actionable. The inline-per-result-error treatment described above still
applies to the two 400s that aren't knowable ahead of a click (`allowMemberInvites` off, capacity
full). Also fixed a real pre-existing bug found while live-verifying against the backend:
`UserSearchResult.username` (FRIEND-1's type) is nullable in practice, not always a string — widened
the type and guarded the render. Full writeup: `client/docs/GRP-4_INVITE_FRIEND_REAL.md`.

**Found while closing out this ticket (2026-07-23): the invitation lifecycle past "create" is entirely
unwired client-side** — an invitation this ticket sends can never actually be approved or accepted
through the app. Filed as **GRP-7** below, not fixed inline (see that entry for the full gap).

---
