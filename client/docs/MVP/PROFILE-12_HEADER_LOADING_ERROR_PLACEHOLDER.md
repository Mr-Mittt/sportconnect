# PROFILE-12 · ProfileHeader placeholder on loading/error

**Status:** `DONE` (2026-09-30) · **Type:** Bug Fix · **Depends on:** none ·
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

## Scope decision (2026-09-30, `/workon` pickup, user decision)

The placeholder shows the **real name and initials from the login session** (`authStore.user`,
already in memory on any protected page) over a plain cover band — no handle, bio, location or
"Edit profile" button (those need the profile row). No new copy is needed, so nothing to localize;
if any visible text is added later it ships en + vi (standing rule). Scope otherwise as filed; user
confirmed nothing to add or remove.

## Implementation summary (2026-09-30)

**Approved design:** a `ProfileHeaderPlaceholder` renders in `ProfileHeader`'s slot whenever `useMyProfile()`
has no data (loading *or* error, one state, no retry), showing only what the login session knows — the
name and initials — over a plain cover band, with no handle/bio/region/Edit button.

**Built**
- `shared/components/ProfileHeaderPlaceholder.tsx` (+ test, story): same card frame/cover/avatar layout as
  `ProfileHeader` (so the page doesn't jump when the real header arrives); `data-testid="profile-header-placeholder"`.
- `shared/lib/initialsFor.ts`: `initialsFor` extracted from `ProfileHeader.tsx` (a component file can't export
  a helper without tripping `react-refresh/only-export-components`), imported by both.
- `ProfilePage.tsx`: `profileQuery.data !== undefined ? <ProfileHeader/> : <ProfileHeaderPlaceholder fullName=…/>`
  (name from `authStore.user`).
- `ProfilePage.test.tsx`: +3 (placeholder while pending, placeholder on error, swaps to the real header once
  resolved). `EditProfileModal`'s own data guard untouched (out of scope, as filed).

**Diverged from the plan:** only the `initialsFor` location (lint forced a `shared/lib` file instead of exporting from `ProfileHeader.tsx`).

**Localization:** no new copy — nothing to translate (the name is user data).

**Tests:** tsc/eslint clean; scoped Vitest (`ProfilePage`, `ProfileHeader*`) 23 green.
**E2E:** scoped `e2e` project (`profile-journey`, `a11y`) — 34 passed; full `e2e` project not run (scoped only, per
standing instruction). `E2E_OVERVIEW.md` unchanged (no spec added/changed).
**Visual-regression expectation:** no baselined surface touched (the loaded header is unchanged; baselines render
the resolved state) — no baseline change expected; a failing `visual-regression` run is the Windows noise floor,
not a regression. Not run locally.

## Scope change (2026-09-30, user decision after the placeholder was built, before commit)

Folded in from a live observation: on a page reload, "Join a match" is clickable before the sport
profiles have loaded, so the zero-sport gate ("add a sport first") fires for a user who does have
sports. Root cause: the gates treat "not loaded yet" (and "failed to load") as "zero sports" —
`useSportProfiles` returns `data = []` in both cases. **Added to this ticket:** the zero-sport gates
may only fire once the sport-profiles query has settled successfully; controls that depend on that
data are disabled until then; a failed load shows a retry state instead of the add-sport prompt.
Full-page disabling during load was considered and rejected (over-blocks independent content,
locks the page on failure). Details in the implementation summary below once built.

**Decisions on the folded-in scope (2026-09-30):** on a failed sports load, controls stay disabled and the
add-sport prompt never fires (no retry notice, no new copy); while loading, the disabled controls are
Join a match, Create match and the sport switcher's "+" pill only — independent content stays interactive.

## Implementation summary — Part B: zero-sport gates wait for sports to settle (2026-09-30)

**Approved design:** `useSportProfiles` gains `isReady` (loaded and not failed); the zero-sport gates and the
sports-dependent controls key off it instead of treating `data = []` (which is what both *loading* and *failed*
look like) as "zero sports".

**Built**
- `useSportProfiles` → `isReady`; `useHomeFeedData` re-exposes it as `isSportsReady` (Home Feed has no direct query).
- The page-access auto-prompts on **Profile, Groups and Matches** now require `isReady` (was `!isLoading`, which fired
  on a *failed* load too — a second, separate bug of the same class; the effect deps were switched with the guard).
- `UpcomingMatches` gains optional `isSportsReady` (default `true`) disabling the empty-state **Join/Create match**
  buttons; `SportSwitcher` gains optional `isDisabled` (the "+" pill goes `aria-disabled` and swallows the click, no
  label change). Wired on Home, Groups, Friends (Join/Create only — it has no switcher), Profile, and Matches (switcher pill
  and its own separate "Create session" button, which is not part of `UpcomingMatches`).
- Failed load: controls stay disabled, no prompt, no retry notice, no new copy (user decision). Modals left unchanged —
  unreachable while the list is unknown.

**Diverged from the plan:** none of substance. Groups has no page-level test file, so its (identical) change is covered only by the scoped e2e.

**Tests:** `useSportProfiles` (`isReady` loading/loaded-empty/error), `UpcomingMatches` (disabled/default enabled),
`SportSwitcher` (`isDisabled`), `ProfilePage` (no auto-prompt while pending; none on failure; disabled "+" pill) and
`MatchesPage` (none on failure; disabled "+" pill and Create session button). Mutation-checked: reverting the guard to `isLoading` makes the two
"fails to load" tests fail. tsc/eslint clean; scoped Vitest 105 files / 910 green.
**E2E:** scoped `e2e` (`profile-journey`, `feed-groups-journey`, `matches-journey`, `home-feed-journey`,
`friends-journey`, `a11y`) — 55 passed; full project not run. No spec changed → `E2E_OVERVIEW.md` unchanged.
**Visual-regression expectation:** no baselined surface touched (loaded state identical; controls only differ while
sports load) — no baseline change expected; a failing local run is the Windows noise floor. Not run. Also not walked in
a live browser (MSW-backed e2e only).
