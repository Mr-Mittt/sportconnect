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
  not silently dropped.
- **`pnpm e2e` run in full** (`--project=e2e`, real MSW-backed Playwright server, not the earlier
  live-backend check): caught a real, expected breakage in the pre-existing
  `feed-groups-journey.spec.ts` — step 6 relied on `GroupSpaceSwitcher`'s now-removed "Group options"
  dropdown to reach Create Group. Fixed by clicking "All" first (so `GroupDiscoveryPanel` renders),
  then its "Create Group" button. All 34 e2e specs pass (one transient failure on a full parallel run
  reproduced as pre-existing flakiness in an unrelated Home Feed pagination step — passed cleanly on
  two subsequent full reruns and in isolation, not a regression from this ticket).
  `client/docs/E2E_OVERVIEW.md` updated to describe the new entry point for that step.

## Known follow-ups (not this ticket)

- Visual-regression coverage for `#groups-view` (HF-10a/b-style harness).
- **GRP-2** (blocked on **B7**): extend the Settings tab with `allowMemberPosts`/
  `requirePostApproval`/`allowMemberInvites`/`maxMembers`.
- Real chat backend, whenever that gets scoped — `GroupChatTab`'s UI is the visual target already.
- Minor copy nit: `GroupCoverBanner`/`GroupDiscoveryPanel` both render "N members" unconditionally
  (no singular/plural handling for `memberCount === 1`) — consistent with how this codebase already
  handles similar counts elsewhere (e.g. `UpcomingMatches`'s "N spots left"), not a regression, but
  worth a pass if this becomes a broader pattern to fix.

---

### GRP-1 · Group page restructure — cover banner, Posts/Chat/Settings tabs, inline discovery panel
**Status:** `DONE` (2026-07-20) · **Summary:** `client/docs/GRP-1_GROUP_PAGE_RESTRUCTURE.md` ·
**Type:** Feature · **Dependency:** FEED-4, FEED-5 (`DONE`) ·
**Design reference:** `client/design-reference/design-reference-group-feed.html` — `#groups-view`
section (already reflects the target design; no update needed before starting, unlike a from-scratch
page)

**Origin:** flagged in this file's own deferred-items table (below) — "Group invitations / pinned
posts / ownership transfer UI — belong to a future Groups-page epic." This is that epic's first
ticket.

**Delta (2026-07-20, executed):** `GroupDiscoveryPanel`'s group-card grid (below the Join/Create
buttons, matching the design reference) was briefly dropped mid-implementation after
`App.test.tsx`'s pre-existing FEED-4 integration test caught it duplicating `GroupSpaceSwitcher`'s
pill row exactly (same accessible name, `getByRole` found two ambiguous "Downtown Strikers"
buttons) — then **restored** per explicit correction, since the reference genuinely shows both
controls. Fixed properly instead: each card's accessible name is `Open {groupName}`, distinct from
the switcher pill's bare name. `App.test.tsx` updated to target the specific control each assertion
means to test. Full writeup: `client/docs/GRP-1_GROUP_PAGE_RESTRUCTURE.md`. Also note for **GRP-2**:
no visual-regression harness exists yet for `#groups-view` (unlike Home Feed's HF-10a/b) — out of
scope here, flagged as a follow-up, not silently dropped.

**Decisions (resolved 2026-07-20, at pickup):**
1. **Chat tab: build the reference's interactive UI now**, local state only (matches the reference
   exactly — message bubbles, input, Send). No persistence, since no chat backend exists — show a
   small disclaimer that messages aren't saved. Real chat is a separate future ticket once a
   conversations/messages backend is scoped.
2. **Settings tab is gated, not hidden:**
   - **Member:** can open Settings, **read-only** (all fields displayed, no inputs enabled).
   - **Owner + Admin:** can edit group properties (Privacy toggle) — matches the real
     `PUT /api/groups/{groupId}` owner/admin rule.
   - **Owner only:** a **Delete Group** button, placed at the very bottom of the Settings tab
     content, below everything else (danger-styled, separate from Leave Group). Matches the real
     `DELETE /api/groups/{groupId}` owner-only rule — not in the original design reference, added
     per this decision.
   - Leave Group stays available to any member (owner must transfer ownership first — existing
     backend rule, surface that constraint in the UI if the owner tries to leave).
3. **Notifications toggle: dropped from this ticket.** No backend field exists for a per-user group
   notification preference — not scoped here.
4. **New ticket filed for the settings data gap**: the four `GroupSettings` toggle fields
   (`allowMemberPosts`/`requirePostApproval`/`allowMemberInvites`/`maxMembers`) are real but split
   across a second endpoint (`PUT /api/groups/{groupId}/settings`, owner-only) from the properties
   endpoint the Privacy toggle uses. Rather than wire both endpoints into one tab without confirming
   the contract first, filed **B7** (`modules/social/group-impl/docs/BACKLOG_MVP.md`) to audit/
   confirm the full settings data set and permission enforcement, and **GRP-2** (below, `TODO`,
   blocked on B7) to adapt this Settings tab to include those four fields once B7 lands. **GRP-1
   itself ships Settings with only Privacy + Leave Group + Delete Group** — the unambiguous, already-
   audited real endpoints.

**What the design reference specifies** (`#groups-view`):
- `sport-switcher-groups` + `group-switcher` — horizontal pill rows (sport filter, then "All" +
  each joined group by name), same pattern as Home Feed's `SportSwitcher`.
- `group-cover` — a banner header shown only when a specific group is selected: colored band (sport
  ramp), group icon, name, member count, "All groups" back button. New component — nothing like it
  exists in the current `GroupsPage.tsx`.
- Two-column body (`2.1fr 0.9fr`): `group-main` (left) + a **persistent right rail** (Upcoming
  matches / Trending hashtags / Group broadcasts — unaffected by anything happening in `group-main`,
  same widgets as Home Feed's rail).
- `group-main` when "All" is selected — a discovery panel: search input + "Join Group"/"Create
  Group" buttons + a list of group cards (avatar, name, member count) to open. **Replaces** today's
  modal-based `CreateGroupModal`/`JoinGroupModal` flow with an inline panel — a real restructure,
  not just an addition.
- `group-main` when a specific group is selected — an internal vertical tab list (narrow, ~150px,
  icon + label, 3 items) + content pane, nested inside `group-main` itself (the persistent right
  rail above stays outside this tabbed area):
  - **Posts** (default/first tab) — composer + group feed, reusing the same comment-dialog pattern
    (`openDialog`) as Home Feed. Already exists in production (`CreatePostForm` + `Feed`, real
    backend) — the work here is nesting it under a tab, not building it new.
  - **Chat** (second tab) — message bubbles (own messages right-aligned/accent background, others
    left-aligned/neutral background with sender name), input + Send. Fully interactive in the
    reference's vanilla-JS mock, but **there is no chat backend at all** (no `conversations`/
    `messages` tables, no real-time delivery — "designed, not implemented" per `PROGRESS.md`).
    Shipping this as if it works would be misleading (messages wouldn't persist past a refresh) —
    see open decision #1.
  - **Settings** — group name + description, a Privacy toggle (Public/Private pills), and a "Leave
    Group" danger-styled button in the reference. **This ticket adds gating and a Delete Group
    action not shown in the reference** — see decisions #2 and #4 above. Notifications toggle from
    the reference is dropped (decision #3).

**Backend mapping — what's real vs. what needs scoping:**

| Reference element | Backend today | Notes |
|---|---|---|
| Posts tab (composer + feed) | Real, already shipped | Just needs to move under the new tab |
| Group cover banner | Real data (`Group` name/avatar/sportId/member count already fetched) | New component only |
| "All groups" discovery panel | Real (`GET /api/groups/public`, join-request/create endpoints) | New component; replaces the two existing modals |
| Settings → Privacy (Public/Private) | Real — `Group.isPrivate`, settable via `PUT /api/groups/{groupId}` (owner/admin) | Member sees read-only |
| Settings → Leave Group | Real — `DELETE /api/groups/{groupId}/leave` | No client UI exists for this today; owner must transfer ownership first (existing rule) |
| Settings → Delete Group | Real — `DELETE /api/groups/{groupId}` (owner only) | Not in the reference; added per decision #2, bottom of Settings tab |
| Settings → Notifications toggle | **No backend found** — dropped from scope | Decision #3 |
| Settings → `allowMemberPosts`/`requirePostApproval`/`allowMemberInvites`/`maxMembers` | Real but not wired in this ticket | Deferred to **GRP-2**, blocked on **B7**'s audit — decision #4 |
| Chat tab | **No backend at all** | Built as interactive local-state UI per decision #1, with a "not saved" disclaimer |

**What ships:**
- `group-cover` banner component.
- Restructure `group-main` into two states: "All groups" discovery panel and a per-group tabbed
  view.
- Vertical tab control (Posts / Chat / Settings) nested inside `group-main`, narrow (~150px), icon +
  label, following this codebase's existing hand-rolled controlled-component pattern
  (`NavTabs.tsx`/`GroupSpaceSwitcher.tsx` — parent owns active tab, `role="tablist"`/`role="tab"`; no
  Radix Tabs primitive exists yet in `client/src/shared/ui/`).
- **Posts tab**: relocate the existing composer + feed here (real, already shipped — a move, not
  new backend work).
- **Settings tab**: Privacy toggle (owner/admin edit, member read-only), Leave Group (any member),
  Delete Group (owner only, bottom of the tab, danger-styled, separate from Leave Group). No
  Notifications toggle (dropped) and no `GroupSettings` toggle fields (deferred to GRP-2).
- **Chat tab**: interactive local-state UI matching the reference, with a "messages aren't saved"
  disclaimer — no backend.
- **Persistent right rail** stays outside the tabbed area, visible regardless of which tab or
  discovery-panel state is active — matches the reference exactly.

**Acceptance criteria:**
- Layout matches `design-reference-group-feed.html`'s `#groups-view` at 375/768/1280px (extend the
  existing visual-regression harness, same pattern as Home Feed's HF-10a/b).
- "All groups" discovery panel's search/join/create actions call the real endpoints already used by
  the modals being replaced — confirm no functional regression versus today's modal flow.
- Posts tab behaves identically to today's group feed (no regression in like/comment/create-post).
- Settings tab's Privacy toggle, Leave Group, and Delete Group all actually persist/execute via the
  real backend.
- Settings tab gating verified for all three roles: Member (read-only, no Delete button), Admin
  (can edit Privacy, no Delete button), Owner (can edit Privacy, Delete button visible and
  functional, confirms before deleting).
- Chat tab is clearly labeled as not persisting messages (disclaimer visible, not just implied).
- Keyboard-navigable tabs, visible focus states, no new axe violations (extends `a11y.spec.ts`).
- Storybook coverage for the new tab control, cover banner, and discovery panel, including all
  three Settings-tab role states.

---
