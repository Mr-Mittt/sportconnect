# GRP-11 · GroupCoverBanner placeholder while a pending group selection is loading

**Status:** `DONE` (2026-09-30)
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

**Scope change (2026-09-30, at pickup):** while the pending-selection state is active
(`selectedGroupId !== null`, no matching group, `isGroupsLoading || isGroupsError`), the page body
column also stops rendering `GroupDiscoveryPanel` — nothing replaces it there. Otherwise the panel
would still flash beside the new placeholder, which is the misleading behaviour this ticket exists
to remove. Once the query resolves: match found → banner + tabs; no match (stale id) → discovery
panel, as today.

**Out of scope:**
- The ordinary "no group selected" state (discovery panel) — unaffected, stays exactly as is (also
  for a stale id once the query has resolved).
- Distinguishing loading vs. error visually, and any retry affordance — same as `PROFILE-12`.
- Any other consumer of `data.groups`/`selectedGroup` on this page (the rail, `GroupDiscoveryPanel`)
  — both already receive `isGroupsLoading`/`isGroupsError` directly and are unaffected.

**Tests:** Vitest/RTL — `GroupsPage` shows the placeholder (not the discovery panel, not a blank
banner) when `selectedGroupId` is set via the store before `groupsQuery` resolves, and again on
`groupsQuery` error; unaffected when `selectedGroupId` is `null` from the start.

---

## Implementation summary (2026-09-30)

**Approved design:** a `GroupCoverBannerPlaceholder` fills `GroupCoverBanner`'s slot while
`selectedGroupId !== null && selectedGroup === null && (isGroupsLoading || isGroupsError)` — one state for
loading and error, no retry — showing only what is already known: the sport (ramp + icon, from the store's
persisted `selectedGroupSportId`), a "Loading group…" line and the "All groups" back button as the exit. Per the
pickup scope change, the body column renders nothing in that state instead of `GroupDiscoveryPanel`.

**Built**
- `features/groups/components/GroupCoverBannerPlaceholder.tsx` (+ test, 2-variant story): same card frame, band and
  icon tile as `GroupCoverBanner`; `data-testid="group-cover-banner-placeholder"`.
- `GroupsPage.tsx`: `isSelectionPending` + `pendingSelectionSport` (read from `useGroupsPageStore` directly — the
  hook's own `selectedGroupSportId` is derived from the loaded groups, so it is null while pending); banner slot and
  body ternary (`isSelectionPending ? null : selectedGroup === null ? discovery : tabs`).
- `locales/{en,vi}/groups.json`: `cover.loading`.
- `GroupsPage.test.tsx` (new, 6): placeholder while loading, on error, swap to the real banner on resolve, "All groups"
  exit from the pending state, no placeholder with nothing selected (even while loading), stale id after resolve →
  discovery panel. Confirmed the 3 pending-state cases fail against the pre-change page.

**Diverged from the plan:** none.

**Consumer census:** only `GroupsPage.tsx` changed; `GroupCoverBanner`, `GroupDiscoveryPanel`, `groupsPageStore` and
`useGroupsPageData` untouched — compatible as-is. No backend, enum, or account-lifecycle impact.

**Localization:** one new string, en + vi.
**Tests:** tsc/eslint clean; new + locale Vitest files green (scoped, not the full suite).
**E2E:** scoped `e2e` project (`feed-groups-journey`, `group-settings`, `home-feed-journey`, `locale`, `group-chat`,
`group-invitations`, `group-members`, `a11y`) — 66 passed; full `e2e` project not run (scoped only, per standing
instruction). `E2E_OVERVIEW.md` unchanged (no spec added/changed). Not walked in a browser against the real backend —
the state is transient and covered at page level.
**Visual-regression expectation:** no baselined surface touched (baselines render the resolved state) — no baseline
change expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run locally.
