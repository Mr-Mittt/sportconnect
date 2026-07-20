# GRP-1 · Group page restructure — cover banner, Posts/Chat/Settings tabs, inline discovery panel

**Status:** `DONE` (2026-07-20) · **Type:** Feature · **Dependency:** FEED-4, FEED-5 (`DONE`) ·
**Design reference:** `client/design-reference/design-reference-group-feed.html` (`#groups-view`)

## Origin

Flagged in `client/docs/BACKLOG_MVP.md`'s deferred-items table: "Group invitations / pinned posts /
ownership transfer UI — belong to a future Groups-page epic." This is that epic's first ticket.
Scoped through an interactive mockup session before implementation (three placements compared —
above-composer, side-rail, fixed dock — before the user pointed at the checked-in design reference as
the authoritative source, which specifies a different, simpler structure than the mockup exploration
had converged on: Posts/Chat/Settings, not the mockup's 7-tab panel).

## Design (as approved)

`design-reference-group-feed.html`'s `#groups-view`:
- `sport-switcher-groups` + `group-switcher` (unchanged, existing components).
- `group-cover` — new banner shown only when a specific group is selected.
- Two-column body: `group-main` (tabbed per-group view, or the "All groups" discovery state) +
  persistent right rail (Upcoming/Trending/Broadcasts, unaffected by `group-main`'s state).
- `group-main`'s per-group view: a narrow internal vertical tab list (Posts/Chat/Settings) + content.

**Decisions made at pickup, before implementation** (see `client/docs/BACKLOG_MVP.md`'s GRP-1 entry
for the full reasoning):
1. Chat tab built as the reference's interactive local-state UI (not a "coming soon" placeholder),
   with a disclaimer that messages aren't saved — no chat backend exists.
2. Settings tab gated to match the real backend (the reference shows no gating): Member read-only,
   Owner+Admin can edit Privacy, Owner-only Delete Group at the very bottom of the tab.
3. Notifications toggle (in the reference) dropped — no backend field exists.
4. The four `GroupSettings` toggle fields (`allowMemberPosts`/`requirePostApproval`/
   `allowMemberInvites`/`maxMembers`) deliberately **not** wired here — filed **B7**
   (`modules/social/group-impl/docs/BACKLOG_MVP.md`, backend audit of the split settings contract)
   and **GRP-2** (client, blocked on B7) instead of wiring against an unconfirmed contract.

## What was built

**Types** (`client/src/features/feed/types.ts`): `UpdateGroupPayload` (partial update, mirrors
`UpdateGroupRequest` — `groupName`/`description`/`avatarUrl`/`coverUrl`/`isPrivate`/`rules`/
`schedule`, all optional).

**Hooks** (`client/src/features/feed/hooks/`), same pattern as `useCreateGroup` (`apiClient` +
`ApiResponse<T>`, targeted cache write, `feedKeys.all` invalidate on settle):
- `useUpdateGroup(currentUserId)` — `PUT /api/groups/{groupId}`, patches the matching `userGroups`
  cache entry in place.
- `useLeaveGroup(currentUserId)` / `useDeleteGroup(currentUserId)` — `DELETE .../leave` and
  `DELETE /api/groups/{groupId}`; both drop the group from the `userGroups` cache and clear
  `feedSpaceStore.selectedGroupId` back to `null` on success (own-hook selection-clearing means
  `GroupsPage` doesn't have to coordinate this itself).

**Components** (`client/src/features/groups/components/`):
- `GroupCoverBanner` — sport-ramp band, sport icon (falls back to the group's first initial if the
  sport can't be resolved), name, member count, back-to-all button.
- `GroupDiscoveryPanel` — Join/Create entry points, plus a card grid of the user's joined groups
  (sport-filtered) below them, matching the reference — see "What changed during implementation"
  below for why the grid was briefly removed and then restored.
- `GroupTabs` — the vertical Posts/Chat/Settings nav. Hand-rolled controlled component
  (`role="tablist"`/`role="tab"`, parent owns `activeTab`) since no Radix Tabs primitive exists in
  this repo (`client/CLAUDE.md`). Implements real roving-tabindex keyboard nav — arrow keys move
  both the selection *and* DOM focus together (WAI-ARIA tabs pattern), not just the selection.
- `GroupSettingsTab` — Privacy toggle (owner/admin edit, member read-only), Leave Group (disabled for
  the owner, with an explanation), Delete Group (owner-only, bottom, danger-styled).
- `GroupChatTab` — local `useState` message list, no persistence; parent keys it per selected group
  (`key={selectedGroup.id}`) so switching groups resets the chat rather than leaking state across
  groups.
- `DeleteGroupConfirmDialog` — confirm/cancel before firing the irreversible delete.

**Page wiring** (`GroupsPage.tsx`): the composer + `Feed` moved from always-visible-below-the-switcher
into the Posts tab's content. `selectGroupAndShowPosts` wraps every call site that changes
`selectedGroupId` so the per-group tab always resets to Posts on a new selection, instead of a
`useEffect`. `CreateGroupModal`/`JoinGroupModal` are unchanged internally — only their trigger buttons
also live in `GroupDiscoveryPanel` now, alongside `GroupSpaceSwitcher`'s existing entry points (both
kept; not a replacement, see below).

## What changed during implementation

**`GroupDiscoveryPanel`'s group-card grid was removed, then restored — both times for real
reasons, not back-and-forth guessing.** The original design (per the approved plan and the design
reference) had this panel render Join/Create buttons *and* a card grid of the user's joined groups
below them. Live-verified via `App.test.tsx` (the pre-existing FEED-4 integration test), the first
version of this was a real bug: the card grid duplicated `GroupSpaceSwitcher`'s pills with the exact
same accessible name (bare group name, same click-to-select action), so "Downtown Strikers" appeared
as two indistinguishable buttons — `getByRole('button', { name: /Downtown Strikers/ })` matched
both. That was fixed by dropping the grid entirely, but that overcorrected: the design reference
does intentionally show both the switcher pills *and* the card grid — they're not meant to be the
same control. The grid was restored, this time with each card's accessible name set to
`Open {groupName}` instead of the bare name (`GroupDiscoveryPanel.tsx`) — the two controls are now
unambiguous to both assistive tech and tests, while still visually distinct (compact pill vs. a
richer card with avatar + member count), matching the reference's actual intent rather than removing
a feature to dodge a naming collision. `App.test.tsx`'s two affected assertions were updated to
target the specific control each was actually testing (`within(groupFilter)` for the switcher pill;
the card's `Open {name}` label for the panel's own click-to-open path) rather than an ambiguous bare
name.

**`GroupDiscoveryPanel` also gained the shared "Group name or invite code" input** (per the design
reference, initially missed), feeding both buttons — `CreateGroupModal` gained an `initialGroupName`
prop, and `useJoinGroupModalData` gained `openSearch(query)` (sets `inputValue` and the search
keyword from the same argument directly, avoiding a stale-closure bug that `setInputValue` +
`submitSearch()` back-to-back would hit). This surfaced a second real duplication, caught by live
browser verification rather than by any test: `GroupSpaceSwitcher` (built in FEED-4/5, before this
panel existed) has its own zero-state Join/Create dashed pills and a "..." dropdown with the same
two actions once populated — with the panel now handling this comprehensively (and matching the
reference, which never had Join/Create in the switcher at all), **removed `onCreateGroup`/
`onJoinGroup` from `GroupSpaceSwitcherProps` entirely** — it's a pure group selector now. Confirmed
via a real screenshot: a brand-new user used to see four buttons for two actions, stacked directly on
top of each other.

**Cards and the cover banner now render `group.coverUrl`** when set (`Avatar`/`AvatarImage`/
`AvatarFallback` for the card, a plain `<img>` for the banner's full-bleed band — the shared Avatar
primitive doesn't fit a wide band), falling back to the existing sport-ramp treatment otherwise.
Found a real jsdom limitation while adding coverage: Radix's `AvatarImage` never mounts its `<img>`
in jsdom (no real image-load event ever fires there), so that specific path is unit-untestable —
verified instead via Storybook (`WithCoverPhoto` stories, screenshotted in a real headless browser)
rather than writing a unit test that would just assert the permanent fallback state.

## Verification

- `tsc -b` and `eslint .` clean across the whole client, not just the changed files.
- 67 new/updated tests (component + hook), full suite 390/390 passing (`pnpm test`) — including
  `App.test.tsx`'s pre-existing Groups-page integration tests, which is what caught the discovery-panel
  duplication bug above.
- **Live-verified against the real running backend** (`./gradlew :server:bootRun` + `pnpm dev`, not
  MSW): registered a fresh user, added a sport profile, created a real group, and walked all three
  tabs plus the back-to-discovery flow through a Playwright-driven headless browser. Confirmed via
  real API responses (not fixtures) that the owner-role Settings gating renders correctly — editable
  Privacy, disabled Leave with the transfer-ownership explanation, and the Delete Group button — for
  a group actually created by the logged-in user.
- No visual-regression harness added yet for this page (`design-reference-group-feed.html` has no
  frozen-baseline Playwright spec the way Home Feed's HF-10a/b or the post modal's FEED-11 do) — that
  acceptance-criterion item from the original ticket text is **not done**; flagged as a follow-up,
  not silently dropped. `client/docs/E2E_OVERVIEW.md` was not updated since no `e2e/` spec files were
  added or changed in this ticket.

## Known follow-ups (not this ticket)

- Visual-regression coverage for `#groups-view` (HF-10a/b-style harness).
- **GRP-2** (blocked on **B7**): extend the Settings tab with `allowMemberPosts`/
  `requirePostApproval`/`allowMemberInvites`/`maxMembers`.
- Real chat backend, whenever that gets scoped — `GroupChatTab`'s UI is the visual target already.
- Minor copy nit: `GroupCoverBanner`/`GroupDiscoveryPanel` both render "N members" unconditionally
  (no singular/plural handling for `memberCount === 1`) — consistent with how this codebase already
  handles similar counts elsewhere (e.g. `UpcomingMatches`'s "N spots left"), not a regression, but
  worth a pass if this becomes a broader pattern to fix.
