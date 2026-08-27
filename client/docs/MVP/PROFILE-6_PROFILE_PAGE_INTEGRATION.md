# PROFILE-6 · `ProfilePage` integration

**Status:** `DONE` (2026-08-27) · **Type:** Component · **Depends on:** `PROFILE-1`, `PROFILE-2`, `PROFILE-3`,
`PROFILE-4`, `PROFILE-5` · **Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

`features/profile/ProfilePage.tsx` — assembles every other `PROFILE-*` component into the real page,
per the design reference's layout:

- `ProfileHeader` (`PROFILE-1`) at the top.
- `SportSwitcher`, wired to the new `profilePageStore` (`PROFILE-0`).
- Rail tabs (Posts / Memories / Settings) switching between `PROFILE-2`/`PROFILE-3`/`PROFILE-4`.
- Right rail: `UpcomingMatches`, `TrendingHashtags`, `GroupBroadcasts` — mounted exactly as Home Feed
  already mounts them, zero new code (design doc §3).
- `PROFILE-5`'s Edit Profile modal, opened from the header.

**Route wiring**: `router.tsx`'s `/profile` swaps from `<ComingSoonPage title="Profile" />` to
`<ProfilePage />`, still inside the existing `AppShell`/`ProtectedRoute` wrapping — no routing/auth
changes needed beyond the one element swap.

## Explicitly out of scope

Any new component logic — this ticket is composition and wiring only. If assembling the page surfaces
a real gap in an already-"shipped" child ticket, split it into its own follow-up rather than growing
this one, same precedent every other page-integration ticket in this backlog (`HF-7`, `GRP-1`,
`FEED-*`) already follows.

## Tests

Vitest/RTL — tab switching renders the right content; `SportSwitcher` changes propagate to Posts/
Settings. Storybook: full-page story per tab. This is also the point where `PROFILE-7`'s visual
regression and `PROFILE-8`'s E2E journey become possible for the first time.

---

## Implementation summary (2026-08-27)

**Built as approved**, with two decisions made explicit at pickup rather than left implicit:

**1. Storybook full-page stories — user decision, diverges from precedent.** Confirmed at pickup
that `HomeFeedPage`/`GroupsPage`/`FriendsPage` (the three prior page-integration tickets) all have
*zero* page-level `.stories.tsx` files — each is covered by a page-level Vitest/RTL test plus
e2e/visual-regression instead. Asked the user explicitly; they chose to add page-level stories
anyway, matching this ticket's literal text. No `msw-storybook-addon` is wired into
`.storybook/` (verified — every existing `.stories.tsx` touching a real data hook is either
presentational/controlled with no internal fetch, like `ProfileHeader`/`EditProfileModal`, or has
no API-backed hook exercised at all, like `AdminLayout`'s stories). `ProfilePage.stories.tsx`
therefore reassigns `apiClient.get` to a fixture-map function at module scope — a new pattern in
this repo, safe here because Storybook renders one story canvas at a time (same "shared module
state is fine" reasoning `AdminLayout.stories.tsx`'s shared `QueryClientProvider` wrapper already
relies on). `Memories`/`Settings` stories use a `play` function (`storybook/test`'s
`userEvent`/`within`, same primitive `TopBar.stories.tsx` already uses) to click into the tab
after mount, since `activeTab` is page-local state with no prop to seed it directly.

**2. No unsaved-Settings-changes guard on sport switch.** `useSportProfileSettingsTabData.ts`'s own
doc comment flags this as explicitly this ticket's call to make ("a page-level 'warn before
switching away' ... would need to wrap `SportSwitcher`'s `onChange` in a guard that checks this
hook's `isDirty` first"). Decided **not** to build one: the ticket's own "Explicitly out of scope"
section rules out new component logic beyond composition/wiring, and a `GRP-2`-style
`useSettingsUnsavedGuard` equivalent would be exactly that — new logic, not wiring. `SportSwitcher`'s
`onChange` calls `profilePageStore.setActiveSport` directly with no guard; switching sport silently
re-seeds the Settings draft (already the hook's own built-in behavior, independent of any guard),
same "reset without asking" baseline `GRP-2`'s guard uses today. Left as a real, known gap for a
future ticket if it turns out to matter in practice — not silently designed around.

**`features/profile/ProfilePage.tsx`** — assembles `SportSwitcher` (`showAllPill={false}`) →
`ProfileHeader` → two-column grid (`ProfileTabs`' vertical rail + active tab content on the left,
`UpcomingMatches`/`TrendingHashtags`/`GroupBroadcasts` on the right) → `EditProfileModal`. `PostsTab`/
`MemoriesTab`/`SportProfileSettingsTab` (`PROFILE-2`/`3`/`4`) needed zero prop wiring — all three
already own their data via their own hooks; this page only picks which one renders. The right rail's
`UpcomingMatches` requires real `onCreateMatch`/`onJoinMatch`/`onParticipationAction` props
(`CLIENT-SESSION-7`/`9`) — "reused exactly as-is" (design doc §3) meant the rail *components and
their own page-agnostic hooks* (`useUpcomingMatches`/`useTrendingHashtags`/`useGroupBroadcasts`),
not that the `CreateSessionModal`/`SessionDiscoverModal`/`SessionDetailModal` stack could be
skipped — every other rail-hosting page (`HomeFeedPage`/`GroupsPage`/`FriendsPage`) wires the same
three modals verbatim, and this page does too, including the `CLIENT-MODAL-1` reset-on-close rule
for both the add-sport gate and the Edit Profile modal's mutation-derived error. `user.id`/
`firstName`/`lastName`/`avatarUrl` come from `useAuthStore` (guaranteed non-null behind
`ProtectedRoute`, same as every other page) rather than `useMyProfile()`'s query, so the session-modal
stack and add-sport flow aren't gated on the profile fetch resolving — only `ProfileHeader`/
`EditProfileModal` (which need the full `UserResponse`) wait on `profileQuery.data`.

**`features/profile/components/ProfileTabs.tsx`** — new component, the vertical rail tab nav
(`design-reference-profile.html`'s `railTabs`: Posts/Memories/Settings). Direct port of `GroupTabs`'
roving-tabindex `role="tablist"` pattern (no Radix Tabs primitive exists in this repo yet) — same
keyboard behavior (arrow up/down, Home/End), same visual treatment.

**`router.tsx`** — `/profile` now renders `<ProfilePage />` instead of `<ComingSoonPage
title="Profile" />`; the now-unused `ComingSoonPage` import was removed from this file (still used
directly by `MemoriesTab.tsx`, unaffected).

**Tests:** `ProfileTabs.test.tsx` (selection/click/arrow-key/order, direct `GroupTabs.test.tsx`
port) + `ProfileTabs.stories.tsx` (Posts/Memories/Settings). `ProfilePage.test.tsx` (2 cases: tab
switching renders Posts/Memories/Settings content including a real `Skill level` select value;
switching the `SportSwitcher` pill re-filters `PostsTab`'s feed and re-seeds `SportProfileSettingsTab`'s
draft — the two "propagate to Posts/Settings" cases the ticket asks for). `ProfilePage.stories.tsx`
(Posts/Memories/Settings, per the decision above).

**Verification:** `tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings in
`SessionStartTimePicker.tsx`), full Vitest suite green (152 files, 1006 tests, no regressions),
`build-storybook` green (new `ProfilePage.stories.tsx`/`ProfileTabs.stories.tsx` chunks emitted with
no errors). The Claude-in-Chrome browser extension was not connected this session (same gap
`PROFILE-0`/`PROFILE-1`/`PROFILE-5` noted) — could not visually confirm the built Storybook stories
or walk `/profile`'s happy path against a running backend in an actual browser. This is a real,
stated gap, not a claimed pass: `PROFILE-7` (responsive/a11y/visual regression) is the ticket that
will produce the first real screenshot-diffed evidence against `design-reference-profile.html`.
