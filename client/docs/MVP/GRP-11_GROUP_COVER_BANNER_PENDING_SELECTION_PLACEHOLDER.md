# GRP-11 · GroupCoverBanner placeholder while a pending group selection is loading

**Status:** `TODO`
**Type:** Bug Fix
**Depends on:** none
**Filed:** 2026-08-28, found alongside `PROFILE-12` while checking whether `/profile`'s
loading/error blank-header gap also applies to Groups' `GroupCoverBanner`.

`GroupsPage.tsx` derives `selectedGroup = data.groups.find(...) ?? null`, and `data.groups` is
`groupsQuery.data?.content ?? []` — an empty array both while the groups query is loading and if it
errors. `GroupCoverBanner` is gated behind `{selectedGroup !== null && <GroupCoverBanner .../>}`, so
it silently renders nothing whenever `selectedGroup` is `null` for *either* reason.

Unlike `/profile` (`PROFILE-12`), `selectedGroup === null` is not purely a loading/error signal here
— it's also the correct, expected state when no group is selected yet (the discovery panel is meant
to show instead). The real gap is a specific, reachable sub-case: `selectedGroupId` can be set to a
real, non-null id **before** `groupsQuery` has resolved — most concretely via Home Feed's
`goToGroup` (`HomeFeedPage.tsx`), which calls `groupsPageStore`'s `selectGroup(groupId, sportId)`
directly, before `GroupsPage` has even mounted its own `useGroupsPageData()`. In that window, the
page shows the discovery panel (the "nothing selected" UI) instead of any indication that a specific
group is about to load, then snaps to the real banner once `groupsQuery` resolves — a misleading
flash, not just a blank gap.

This ticket makes `GroupCoverBanner`'s slot show a placeholder specifically when `selectedGroupId !==
null` but `selectedGroup === null` because `isGroupsLoading`/`isGroupsError` (already computed by
`useGroupsPageData`, already wired into the rail and `GroupDiscoveryPanel`) say the groups list
hasn't resolved — not whenever there's simply no selection. Same "one placeholder for both loading
and error, no retry affordance" scope decision `PROFILE-12` made, applied here too for consistency.

**Who:** Normal User navigating to a specific group — either directly on `/groups`, or handed off
from Home Feed via `goToGroup`.

**Entry point:** `/groups` page load/navigation whenever `selectedGroupId` is already set but
`groupsQuery` hasn't resolved yet.

**Out of scope:**
- The ordinary "no group selected" state (discovery panel) — unaffected, stays exactly as is.
- Distinguishing loading vs. error visually, and any retry affordance — same as `PROFILE-12`.
- Any other consumer of `data.groups`/`selectedGroup` on this page (the rail, `GroupDiscoveryPanel`)
  — both already receive `isGroupsLoading`/`isGroupsError` directly and are unaffected.

**Tests:** Vitest/RTL — `GroupsPage` shows the placeholder (not the discovery panel, not a blank
banner) when `selectedGroupId` is set via the store before `groupsQuery` resolves, and again on
`groupsQuery` error; unaffected when `selectedGroupId` is `null` from the start.

---
