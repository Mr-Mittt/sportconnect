# PROFILE-6 · `ProfilePage` integration

**Status:** `TODO` · **Type:** Component · **Depends on:** `PROFILE-1`, `PROFILE-2`, `PROFILE-3`,
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
