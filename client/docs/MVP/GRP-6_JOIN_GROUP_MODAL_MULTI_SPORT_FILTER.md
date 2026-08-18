# GRP-6 · Join Group modal — multi-select sport filter + grouped results

**Status:** DONE (2026-07-21) · **Type:** Enhancement · **Dependency:** A10
(`modules/social/group-impl/docs/BACKLOG_MVP.md`) · **Supersedes:** GRP-5 (static single-sport
indicator, never built — this ticket's interactive multi-select filter subsumes it)

## Why

User-specified UX enhancement to `JoinGroupModal` (filed 2026-07-21, picked up ahead of GRP-4):
header centering, an interactive multi-select sport filter seeded from page context, and results
grouped into per-sport sections — replacing the plain flat single-sport search that shipped with
FEED-5.

## Design (as approved, including a mid-flight revision)

The approved plan (client/docs/BACKLOG_MVP.md's GRP-6 entry, restated):

1. **Header** — restructure from `flex justify-between` to a 3-column grid
   (`grid-cols-[1fr_auto_1fr]`: spacer / centered title / close button) so the title visually
   centers regardless of the close button's width.
2. **Sport filter pills** — new multi-select pill row, sourced from the current user's own sport
   profiles (same data as `SportSwitcher`, but a separate local pill component — user decision,
   since `SportSwitcher`'s `Pill` is single-select and this needs independent multi-select toggle
   state). Pre-selection: page's active sport tab → just that pill; page on "All" → every one of
   the user's sports. Freely re-toggleable afterward.
3. **Search gating** — no query fires while the search input is empty, including on modal open. A
   deliberate change from FEED-5's original "browse with no query" default.
4. **Multi-sport search execution** — **revised mid-pickup.** The first design pass planned a
   client-side fan-out: one `usePublicGroups` request per selected sport, each section resolving
   independently. Before implementation started, the user reversed this in favor of a real backend
   multi-sport filter instead, trading a small additive backend change (**A10**) for much simpler
   client state — one combined query, one `isLoading`/`isError` pair, no per-section loading/error
   juggling. A10 shipped first (`modules/social/group-impl/docs/MVP/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md`);
   this ticket then built against the real new endpoint.
5. **Grouped results** — group the single flat response by `sportId` (already present per row)
   into ordered sections matching the filter pills, rendered client-side.

## What was built

Matches the (revised) design above, with one additional fix discovered during implementation:

- **`apiClient.ts`** — added `paramsSerializer: { indexes: null }`. Found via a quick Node/axios
  repro *before* writing any component code: axios's default array-param serialization produces
  bracket notation (`?sportIds[]=1&sportIds[]=2`), which Spring's `List<Long> @RequestParam`
  binding does not understand (confirmed live against A10 — only bare repeated keys work). Fixed at
  the shared `apiClient` instance level, not as a per-call workaround, since this is the first
  array-valued query param in the client codebase and any future one would hit the same mismatch.
- **`usePublicGroups.ts`** — `sportId: number | undefined` → `sportIds: number[] | undefined`,
  sent as the new multi-value param. `feedKeys.publicGroups` query key updated to match.
- **`useJoinGroupModalData.ts`** — new signature `(currentUserId, lockedSport: SportKey | null,
  sportProfiles: SportProfile[], isOpen)`. Owns `selectedSports: Set<SportKey>` (+`toggleSport`),
  seeded exactly once per modal open via a `useEffect` guarded by a `seededForOpenRef` (not a plain
  dependency-array effect — the modal stays mounted between opens, only its `Dialog` toggles, so a
  naive `[isOpen, lockedSport, sportProfiles]` effect would silently re-seed and wipe the user's
  in-progress pill choices whenever `sportProfiles`' reference changed for unrelated reasons while
  already open). The query's `enabled` is `isOpen && submittedKeyword !== ''`. New
  `groupedResults: GroupedSearchResults[]` — groups the flat response by `sportId` (via
  `sportKeyForId`), ordered by `selectedSports`' iteration order, skipping sports with zero
  matching rows entirely (there's one combined query now, not an independent per-sport call to
  hang an explicit empty section off of).
- **`JoinGroupModal.tsx`** — 3-column header grid; new `SportFilterPill` and `ResultSection` local
  sub-components, each receiving their icon component as a prop resolved by the caller (matching
  `SportSwitcher`'s `Pill` convention) rather than resolving `getSportIcon()` internally — the
  latter trips `eslint-plugin-react-hooks`'s "components created during render" rule, caught by
  the linter during implementation, not by design review. New props: `sportProfiles`,
  `selectedSports`, `onToggleSport`, `groupedResults` (replaces the old flat `results`).
- **`GroupsPage.tsx`** — passes `data.sportProfiles` into the hook and the modal; `lockedSport`
  (already computed) passed directly instead of pre-resolving to a `sportId` via `SPORT_ID_BY_KEY`
  (that resolution now happens inside the hook, closer to where `SPORT_ID_BY_KEY` is actually
  needed for the query).
- **Tests** — `usePublicGroups.test.tsx` (new `sportIds` param shape, empty-array omission),
  `useJoinGroupModalData.test.tsx` (rewritten: seeding on open for both locked/unlocked cases,
  `toggleSport`, empty-search gating replacing the old "browse on open" test, grouping order),
  `JoinGroupModal.test.tsx`/`.stories.tsx` (pill rendering/toggling, grouped sections, new
  `NoSportSelected`/`SingleSportSelected` stories).

## Accepted behavior change (confirmed, not a regression)

FEED-5's original "browse with no query" default is gone by design. This also affects
`GroupDiscoveryPanel`'s "Join Group" button: if the shared "Group name or invite code" input is
empty when clicked, the modal now opens straight to "No groups found." instead of a browsable
list. Flagged explicitly on the ticket at pickup as an accepted consequence of the search-gating
requirement, not discovered as a surprise during implementation.

## Verification

- `tsc -b`, `eslint .` (full client, not just changed files) — both clean.
- `npx vitest run` — 455/455 passing.
- `storybook build` — clean, no story errors.
- **Live browser verification against a real running backend** (not just MSW/mocked unit tests):
  registered a test user with Football + Tennis sport profiles, created one public group per sport
  under a second user, then drove the actual app in a real browser (Playwright, ad hoc script —
  not a committed spec; no existing e2e coverage touches `JoinGroupModal`, confirmed via grep
  before deciding this was sufficient). Screenshotted and confirmed:
  1. Modal opens with page on "All" → both sport pills pre-selected.
  2. Searching a keyword matching groups in both sports → two correctly-labeled, correctly-grouped
     sections.
  3. Deselecting the Tennis pill and re-searching → Tennis section disappears, Football section
     unaffected.
  4. Clearing the search box and re-searching → "No groups found.", confirming the empty-search
     gate (no stale results shown).
  - A pre-existing, unrelated React ref warning (`Function components cannot be given refs... Did
    you mean to use React.forwardRef()?`, pointing at `DialogOverlay` in the shared `dialog.tsx`)
    appeared in the console during this walkthrough. Confirmed via a second script opening
    `CreateGroupModal` (untouched by this ticket) that the same warning appears there too — this
    predates GRP-6 and is not a regression from this ticket's changes.

## Addendum (2026-07-21) — app-wide Dialog positioning/sizing/header changes

Once GRP-6 itself was verified working, the user drove three more rounds of UI refinement on the
shared `Dialog`/`DialogContent` primitive (`src/shared/ui/dialog.tsx`) — scope grew from
"JoinGroupModal" to every modal in the app, since these are all built on the same shared primitive.
Recorded here rather than as a separate ticket since it was continuous same-session iteration on
this ticket's own header-centering thread, not a new, independently-scoped piece of work.

1. **Fixed position, page-anchored (not viewport-centered).** New shared module
   `src/shared/lib/modalAnchor.ts`: a `ModalAnchorContext`/`ModalAnchorProvider` +
   `useAnchorBottom(ref)` hook that measures a DOM element's viewport-relative bottom edge (via
   `ResizeObserver` + resize/scroll listeners, so it tracks reflow — e.g. `SportSwitcher`'s pills
   wrapping at narrow widths). `HomeFeedPage` wraps its whole render tree in a provider fed by a ref
   on the sport-pill row; `GroupsPage` does the same with a ref wrapping `GroupSpaceSwitcher` +
   the conditionally-rendered `GroupCoverBanner` — one ref covers both anchor cases (group pill row
   when "All", cover banner when a specific group is selected), since `GroupCoverBanner` is simply
   the last child in that wrapper when present. Every `DialogContent` reads this context; `null`
   (any page without a provider) falls back to the original viewport-centered position untouched.
2. **Fixed height — reversed from "all modals" to two specific ones, at 60vh, not 85vh.** The first
   pass made every modal on Home Feed/Groups a flat `h-[85vh]` (explicitly accepting that tiny
   confirm dialogs like `DeleteGroupConfirmDialog` would render as a mostly-empty box — a real
   tradeoff, confirmed with the user before building it). This was superseded before it shipped
   further: fixed height now only applies to `JoinGroupModal` and `CommentSection` (`fixedHeight`
   prop on `DialogContent`, `60vh`), since those are the two whose content amount varies enough to
   want a stable footprint. Every other modal reverted to shrink-to-fit (`max-height`, not `height`)
   — capped at the anchored available space when positioned below an anchor, or a flat `85vh` when
   centered (the original pre-ticket default, unchanged for that fallback case). Fixed height is
   still capped by `min(60vh, available-space-below-anchor)` so it can never overflow past the
   viewport bottom on a short screen or a far-down anchor.
3. **Every modal's header centered**, not just `JoinGroupModal`'s. Extracted a shared
   `DialogHeader` component (`title`, `className`, optional `onCloseClick`) into `dialog.tsx` — the
   same 3-column grid `JoinGroupModal` already had, now reused by `CreateGroupModal`,
   `DeleteGroupConfirmDialog`, `InviteFriendModal`, `SettingsUnsavedChangesDialog`, `AddSportModal`,
   `HashtagPostsModal`, and `UpdateBroadcastConfirmDialog` — all 7 replaced their own hand-rolled
   `flex justify-between` header markup with `<DialogHeader title="…" className="…" />`, and
   `JoinGroupModal` itself was refactored to use it too rather than keeping two implementations of
   the same pattern. **Not applied to `CommentSection`** — its header shows the post author's
   avatar/name/timestamp (+ a sport badge), not a single title, so the shared component's shape
   doesn't fit; it keeps its existing custom header markup unchanged.
4. **Join Group modal's per-sport section labels centered** (`ResultSection`'s header row gained
   `justify-center`), matching the header-centering direction applied everywhere else.

**Test infra fix required:** jsdom (Vitest's test environment) has no `ResizeObserver` — added a
no-op stub in `src/test/setup.ts` (`globalThis.ResizeObserver ??= ResizeObserverStub`), needed for
any component now rendering inside a page that calls `useAnchorBottom`.

**Verification:** `tsc -b`/`eslint .`/`vitest run` (455/455)/`storybook build` all clean after each
of the three rounds. Live-verified in a real browser against the real backend (Playwright, ad hoc,
not committed) across all three anchor contexts — Home Feed's `AddSportModal` positioned under the
sport pill row, Groups "All" `CreateGroupModal`/`JoinGroupModal` positioned under the group pill
row (`JoinGroupModal` additionally confirmed at a visibly fixed 60vh regardless of result count),
and a specific group's `InviteFriendModal` positioned under the cover banner — screenshotted at each
step. Test groups created for this walkthrough were deleted afterward.

---

### GRP-6 · Join Group modal — multi-select sport filter + grouped results
**Status:** `DONE` (2026-07-21, `client/docs/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md`) ·
**Type:** Enhancement · **Dependency:** A10
(`modules/social/group-impl/docs/BACKLOG_MVP.md` — backend, adds `sportIds` multi-value filter to
`GET /api/groups/public`) · **Filed:** 2026-07-21 (user-specified UX enhancement, picked up ahead of
GRP-4 by user decision) · **Supersedes:** GRP-5 (below) — GRP-5's static single-sport indicator is
subsumed by this ticket's interactive multi-select filter; GRP-5 is not built.

**Origin:** same underlying gap GRP-5 found (`JoinGroupModal`'s sport scoping is invisible to the
user), but the user specified a materially richer fix instead of a static indicator: an interactive,
multi-select sport filter — pre-seeded from page context — with results grouped by sport.

**A10 shipped (2026-07-21, `modules/social/group-impl/docs/MVP/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md`)
— no longer blocked.** The first design pass planned a client-side fan-out (one `usePublicGroups`
request per selected sport, each section resolving independently). User decision reversed this in
favor of a real backend multi-sport filter instead — simpler client state (a single query, one
`isLoading`/`isError` pair) at the cost of a small additive backend change, now live: `GET
/api/groups/public?sportIds=1&sportIds=2` (repeated query params, confirmed live-verified in A10).

**What ships:**
- **Header:** center-align `JoinGroupModal`'s header row (currently `flex items-center
  justify-between` in `JoinGroupModal.tsx:52` — title left, close button right). Restructure to a
  3-column layout (e.g. `grid grid-cols-[1fr_auto_1fr]`: empty spacer sized to match the close
  button — center title — close button) so `DialogTitle` visually centers in the header regardless
  of the close button's width, rather than just adding `justify-center` (which would look centered
  only by accident, since the close button isn't mirrored on the left).
- **Sport filter pills:** new multi-select pill row below the header, listing the current user's own
  sport profiles — same data source as `SportSwitcher` (`src/shared/components/SportSwitcher.tsx`)
  for the sport list itself, reusing `getSportIcon()` (`@/shared/lib/sportIcons`) for icon+label
  consistency, but **a separate local pill component** (user decision) — do not extract/reuse
  `SportSwitcher`'s `Pill` sub-component, since that one is single-select
  (`aria-pressed`/exclusive-active semantics) and this needs independent multi-select toggle state
  (`Set<SportKey>`), not a shared implementation. No "All" pill as a distinct filter option here —
  instead:
  - **Pre-selection on open:** if `JoinGroupModal` opens with a `lockedSport` context (page's active
    sport tab is a specific sport, e.g. Basketball), only that sport's pill is pre-selected.
  - If the page's active sport context is "All" (`lockedSport === null`), **all of the user's sport
    pills are pre-selected** by default.
  - The user can freely change the selection after opening (toggle pills on/off) before searching.
- **Search gating:** do NOT run any query — including on modal open — while the search input is
  empty. This changes `usePublicGroups.ts:10-13`'s current documented behavior ("an empty keyword
  still returns a browsable list … doesn't gate on a non-empty search term") — flagging this as an
  intentional behavior change per the user's explicit instruction, not an oversight. Confirm at
  pickup this doesn't break `FEED-5`'s original "browse with no query" acceptance criteria the old
  behavior satisfied; if it does, that's an explicit, accepted regression per this ticket, not a bug.
- **Multi-sport search execution (revised per A10):** `usePublicGroups` takes a `sportIds:
  number[] | undefined` param instead of singular `sportId`, sent as the new multi-value query param
  A10 adds to `GET /api/groups/public`. **One request total**, not one per sport — the flat
  `Page<GroupSearchResponse>` result already carries `sportId` per row (confirmed,
  `GroupSearchResponse.java:14`), so the client groups the single response by `sportId` client-side
  for section rendering. No per-section loading/error state needed — one `isLoading`/`isError` pair
  for the whole modal, same shape every other hook in this codebase already returns.
- **Selecting zero sport pills:** allowed (user decision) — Search stays enabled; if the user
  searches with no sport selected, render the results area's empty state (no sections), same
  visual treatment as a real zero-result search rather than a distinct "select a sport" message,
  unless that reads confusingly at pickup.
- **Grouped results:** render results grouped under one section per sport **present in the
  response** (i.e., per distinct `sportId` actually returned, not necessarily every selected pill —
  a selected sport with zero matches produces no rows and thus no section, since there's only one
  combined query/response now, not an independent per-sport call to hang an explicit empty section
  off of). Section order follows the filter pills' order. Each section's header matches its filter
  pill's styling — icon (via `getSportIcon()`) + sport name.

**Design questions — resolved during implementation:**
- Pill styling mirrors `SportSwitcher`'s `Pill` visually (same active-border treatment) via a
  separate `SportFilterPill` component in `JoinGroupModal.tsx` — not shared code, since
  `SportSwitcher`'s `Pill` is single-select.
- A10's `sportIds` binds via **repeated bare keys** (`?sportIds=1&sportIds=2`), confirmed against
  Spring's default `List<Long> @RequestParam` binding. axios's *default* array serialization uses
  bracket notation (`?sportIds[]=1`) instead, which Spring does not bind correctly — fixed via
  `apiClient`'s new `paramsSerializer: { indexes: null }` (global fix, not a per-call workaround).
- Zero-selected-sports keeps the existing "No groups found." copy — no separate
  sport-selection-aware message; reads fine in practice (verified in a live browser walkthrough).

**Out of scope:**
- Changing `CreateGroupModal`'s existing single-sport locked behavior — untouched by this ticket.
- Sports outside the current user's own profiles (e.g. a 4th sport they don't have a profile for) —
  the filter only ever lists the user's own sports, never the full system sport list.

---
