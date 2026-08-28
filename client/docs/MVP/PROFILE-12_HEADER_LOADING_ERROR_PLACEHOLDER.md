# PROFILE-12 · ProfileHeader placeholder on loading/error

**Status:** `TODO` · **Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-08-28, found while diagnosing a stale-backend incident during backend ticket U11's
rollout (`modules/user/user-impl/docs/MVP/U11_...md`) — the cover image appeared to have vanished
from `/profile`; the real cause was a stale running server, but it surfaced that `ProfilePage.tsx`
has no placeholder or error state for `ProfileHeader` at all.

## What ships

`ProfilePage.tsx` currently gates the entire `ProfileHeader` block behind `profileQuery.data !==
undefined` (`useMyProfile()`, `GET /api/users/me`) — while the query is loading, and again if it
ever errors, `ProfileHeader` doesn't render at all: no cover band, no avatar, no name, just blank
space where the header should be. This ticket makes `ProfileHeader` (or a placeholder variant
`ProfilePage` swaps in) render a static placeholder cover band + avatar + name any time
`profileQuery.data` is undefined, whether that's because the request is still in flight or because
it failed — same placeholder either way, no visual distinction between the two states and no retry
affordance (both decided at filing).

**Who:** Normal User viewing `/profile`.

**Entry point:** `/profile` page load, any time `useMyProfile()` hasn't resolved data yet.

**Inputs/outputs:** input is `profileQuery.isLoading`/`isError`/`data` (already computed in
`ProfilePage.tsx`, nothing new to fetch); output is `ProfileHeader` (or a placeholder standing in
for it) always rendering something in that slot instead of `ProfilePage` omitting it outright.

## Explicitly out of scope

- Distinguishing the loading state from the error state visually (e.g. a shimmer/skeleton vs. a
  static "couldn't load" placeholder) — one placeholder covers both.
- A retry action (re-fetching `profileQuery` from the placeholder) — decided out of scope at filing.
- `EditProfileModal`'s own separate `profileQuery.data !== undefined` guard (`ProfilePage.tsx`) —
  that gates a closed-by-default modal that genuinely needs real data to prefill an edit form, a
  different concern from a page section rendering blank.

## Tests

Vitest/RTL: `ProfilePage` renders the placeholder (not a blank header) when `useMyProfile()` is
`isLoading`, and again when it's `isError` — same MSW-error-injection pattern other hardening
tickets in this backlog use (e.g. `FEED-8`).

---
