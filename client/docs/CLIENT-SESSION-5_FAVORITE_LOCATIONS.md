# CLIENT-SESSION-5 — Favorite locations: heart-toggle + `CreateSessionModal` favorites dropdown

**Status:** DONE (2026-08-04) · **Dependency:** CLIENT-SESSION-2 (the location field it
populates), CLIENT-LOC-1 (`LocationPicker`, already `DONE`) · **Backend contract:**
`modules/location/location-impl/docs/LOC-2_FAVORITE_LOCATIONS.md`

## Scope (approved plan)

A favorite-toggle heart on `LocationPicker`'s search-result rows, wired to the real
favorite-locations backend (`POST`/`DELETE /api/locations/{id}/favorite`,
`GET /api/locations/favorites?sportId=`), plus turning `CreateSessionModal`'s plain "Choose
location" button into a real favorites-aware `DropdownMenu` for the effective sport — with a
trailing "Choose a location…" entry still opening the unchanged `LocationPicker` flow. Dropdown
rows are select-only (user decision) — unfavoriting stays a `LocationPicker`-only action via the
heart icon there.

## The nesting problem — investigated for real, not just avoided

CLIENT-SESSION-2 tried a `DropdownMenu` shell here once already and reverted it after it appeared
to "never open at all" live. This ticket's scope explicitly called for solving that for real. The
investigation (a disposable Playwright harness driving the actual `CreateSessionModal`, not a
synthetic isolation — deleted once concluded) found the true mechanism, which turned out to be
different from the original theory:

- **Not a focus-trap conflict.** Dialog and DropdownMenu (via `@radix-ui/react-menu`) resolve to
  the *same* `@radix-ui/react-focus-scope`/`@radix-ui/react-dismissable-layer` package versions in
  this repo's dependency tree (confirmed by reading `node_modules/.pnpm`), so their focus-scope
  stacks already coordinate correctly. (Radix `Popover` pulls different internal versions —
  unrelated to this bug, not touched.)
- **The real cause:** `DropdownMenu` defaults `modal={true}`, so `DropdownMenuContent` calls the
  same `hideOthers()` (`aria-hidden` + `inert`) mechanism `Dialog` itself uses. Since the menu's
  `Portal` renders as a DOM **sibling** of the Dialog's own portal (both go to `document.body`
  independently, not one nested inside the other), opening the menu marks the *entire parent
  Dialog* — trigger button included — `aria-hidden="true"`. Confirmed directly via
  `page.evaluate` reading the live DOM: `data-aria-hidden="true"` appeared on `[role="dialog"]`
  the instant the menu opened, and `page.getByRole('dialog', ...)` dropped from 1 match to 0. This
  is exactly why it looked like "never opens" during manual/live testing — the dialog effectively
  vanishes from the accessibility tree, so anything role-based (a screen reader, or a test
  assertion) stops seeing it.
- **The fix:** `<DropdownMenu modal={false}>` on the nested menu only. Verified live: open →
  select → menu closes → dialog stays fully interactive → reopen works → Escape dismisses →
  outside-click dismisses. All confirmed via a real browser interaction test before this shipped.

**A second, separate real bug found and fixed along the way:** `shared/ui/button.tsx`'s `Button`
wasn't wrapped in `React.forwardRef`, so `asChild` compositions (any Radix trigger wrapping
`Button`) couldn't get a real DOM ref for Popper to measure. Every *other* `DropdownMenuTrigger`
in this codebase (`TopBar`, `PostCard`) happened to wrap a plain native `<button>` instead of
`Button`, which is why this gap went unnoticed until this ticket tried `asChild` around `Button`
for the first time. Fixed with `React.forwardRef` — benefits any future `asChild` use of `Button`
app-wide, not just this dropdown.

## What was built

**Query keys / hooks** (`features/location/`): `locationKeys.favorites(sportId)`;
`useFavoriteLocations(sportId, enabled)`, `useFavoriteLocation()`, `useUnfavoriteLocation()`
(both mutations take `{ locationId, sportId }` — `sportId` isn't sent to the backend, it's only
used to invalidate the right sport-scoped cache entry on success).

**`LocationPicker.tsx`**: each search-result row is now a `<div>` wrapping the existing
select-button plus a new heart-toggle `<button>` (`stopPropagation` so it never also selects the
row), filled/outline via a `favoriteLocationIds: Set<number>` prop — `LocationResponse` carries no
`isFavorite` flag, so this set is derived client-side from the separate favorites-list query.

**`CreateSessionModal.tsx`**: new `LocationFavoritesDropdown` sub-component — a real
`<DropdownMenu modal={false}>` listing favorite locations for the effective sport (select-only,
"No favorites yet." empty state), with a trailing "Choose a location…" item opening the unchanged
picker flow. A new `onEffectiveSportChange` callback fires on every effective-sportId change
(including on mount, for a pre-selected sport) so the parent can scope the favorites query without
lifting the Sport field itself out of this component's own local state (preserving its documented
"owns its own transient form state" precedent).

**`useMatchesPageData.ts`**: owns the favorites query/mutations at the page level (consistent with
this codebase's "zero leaf components call query hooks directly" convention — confirmed by
grepping the whole client before deciding this), scoped by a `createFormSportId` state that's now
kept in sync by both `onEffectiveSportChangeForCreate` (fires continuously as the form's Sport
field changes) and the pre-existing `onOpenLocationPickerForCreate` (fires once, when the picker
opens) — same single source of truth feeds both `LocationFavoritesDropdown`'s query and
`useLocationPickerData`'s `sportId` param. The favorite fields are merged into the same
`locationPickerForCreate` prop bundle already assembled for `LocationPicker`.

**MSW** (`e2e/mocks/handlers/locations.ts`): favorite/unfavorite/favorites-list handlers, plus a
real routing bug found and fixed during Phase 5 verification — `GET /api/locations/favorites` was
registered *after* `GET /api/locations/:locationId`, and MSW matches handlers in registration
order, so `:locationId` (which matches any single path segment, including the literal string
"favorites") intercepted every favorites-list request first. This surfaced as a permanently stuck
"Loading…" in the dropdown (TanStack Query's default retry backoff kept retrying the wrong,
404-ing handler) — caught by actually running the e2e spec, not assumed. Fixed by moving the
favorites-list handler before the `:locationId` one.

## Verification

- `tsc -b --noEmit`: clean.
- `pnpm lint`: clean (2 pre-existing unrelated warnings in `SessionStartTimePicker.tsx`).
- `pnpm exec vitest run`: full suite passes, including new coverage for `LocationPicker`'s
  heart-toggle (calls `onToggleFavorite` without also selecting the row, reflects the
  favorited/pending states) and `CreateSessionModal`'s favorites dropdown (lists favorites, empty
  state, selecting a favorite calls `onSelectLocation`, "Choose a location…" still opens the
  picker, `onEffectiveSportChange` fires on mount and on every Sport change).
- `pnpm build` and `pnpm build-storybook`: both succeed (new stories: `LocationPicker`'s
  `SearchWithAFavorite`; `CreateSessionModal`'s `NoFavoriteLocationsYet`, plus its default/other
  stories now exercise a populated dropdown).
- `pnpm e2e`: all 49 tests pass, including `matches-journey.spec.ts`'s new step 8 (favorite a
  location live via the heart, confirm it appears in the dropdown, select it from there) — two
  pre-existing, unrelated flakes (`a11y.spec.ts`'s Groups Members-tab scan, `feed-groups-journey.spec.ts`'s
  "Load more" pagination) reproduced only under the full 49-test parallel run and passed cleanly
  in isolation, confirming they're parallel-run flakes, not regressions from this ticket's changes
  (including the app-wide `Button` `forwardRef` change).
- `pnpm test:visual`: 18 failures, all the same pre-existing Windows-vs-Linux font-rendering noise
  (9 `home-feed-*`, 9 `post-modal-*`) already documented since HF-12 — none of this ticket's files
  touch Home Feed or post-modal rendering, and the `Button` ref change produces no visible output
  difference (same DOM/className, only a forwarded ref added).
- `client/docs/E2E_OVERVIEW.md` updated: `matches-journey.spec.ts`'s entry (§6) and directory
  listing (§3) reflect the new step 8 and step 6's changed interaction (the trigger now opens a
  dropdown, not the picker directly).

## Real bugs found and fixed (not in the original plan)

1. `Button` missing `React.forwardRef` — app-wide fix, unblocks any future `asChild` composition.
2. `GET /api/locations/favorites` vs `GET /api/locations/:locationId` MSW route-ordering
   collision — e2e-mock-only, doesn't affect the real backend (Spring's routing has no equivalent
   ambiguity), but was actively breaking this ticket's own e2e coverage until fixed.

## Out of scope

No unfavorite affordance inside the dropdown (user decision — dropdown rows are select-only).
No cap on favorites (matches LOC-2's own explicit MVP decision). No favorite-count-per-location
display (LOC-2 doesn't expose one).
