# CLIENT-SESSION-23 · "My sessions" → Upcoming/History split, SessionCard polish, completion favorites

**Status:** `TODO`
**Type:** Client feature
**Depends on:** backend **SESSION-27** (`modules/session/docs/BACKLOG_MVP.md`) — hard, for the
"Upcoming sessions"/"History" scope only (items 2-4 below). Items 1 and 5 have no backend
dependency and can be built first if this ticket is picked up before SESSION-27 ships.
**Filed:** 2026-09-15, user request — bundled with the SESSION-27 backend work as one client
follow-up (user decision: keep as one ticket rather than split by dependency, unlike this repo's
usual precedent for mixed-dependency scopes, e.g. CLIENT-SESSION-2's 3/4/5/6 split). Reworks
CLIENT-SESSION-20's single "My sessions" panel (still `DONE`, shipped, not broken — just being
superseded by a clearer two-section design) and closes a real bug found while verifying
CLIENT-SESSION-21: `useUpcomingMatches.ts`'s client-side status filter
(`status === 'SCHEDULED' || status === 'ONGOING'`) never included `PREPARING`, so a `PREPARING`
session never appeared in the `UpcomingMatches` rail on Home Feed/Groups/Friends/Profile.

## Scope

1. **`SessionCard` polish** (shared component — every surface: Matches page list/grid, Discover,
   the `UpcomingMatches` rail):
   - The participation action button row sticks to the **bottom** of the card regardless of how
     much content is above it (title/location/fee/etc. of varying length today leaves the button
     row at inconsistent heights across cards in the same list/grid).
   - The location line renders on a **single line**, truncated with an ellipsis if it doesn't fit
     — no wrapping to a second line.

2. **"My sessions" → two independent sections** on the Matches page, replacing the single "My
   sessions" label/panel (CLIENT-SESSION-6/20):
   - **"Upcoming sessions"** — backed by `GET /api/sessions/upcoming` (SESSION-27), page size 20,
     server-sorted soonest-first. Retains the existing day-group headers ("Today" / "Sep 20, 2026")
     above clusters of cards (user decision) — reuse `groupSessionsByDate.ts`'s day-grouping logic,
     trimmed to a single zone now that "history" is no longer date-grouped client-side (see below).
     "Load more" at the end of the list fetches the next page once the server response says more
     exist — reuse the existing `useInfiniteQuery` pagination pattern already used elsewhere
     (`useComments.ts`, `usePersonalFeed.ts`), not a new mechanism.
   - **"History"** — backed by `GET /api/sessions/history?dateCount=20` (SESSION-27's per-date-list
     shape). Renders one **collapsed row per distinct date** in the format `<date> (<count>)` (e.g.
     "Sep 14, 2026 (2)", "Today (1)" using the same "Today" special-case `groupSessionsByDate.ts`
     already has) — collapsed by default. Expanding a date row lazily fetches that date's session
     list via `GET /api/sessions/history?date=<date>` (paginated 20 at a time; a nested "Load more"
     inside the expanded row if that single date has more than 20 sessions — an edge case, but
     SESSION-27 paginates this endpoint too so it's supported). A "Load more" button after the last
     date row pages further back via SESSION-27's `before` cursor, fetching the next 20 distinct
     history dates.
   - `useMatchesPageData.ts`'s current `mine` + `joined` + per-group-session fan-out/merge
     (`useMySessions`, `useJoinedSessions`, `useGroupSessionsForGroups`, `dedupeSessionsById`) is
     replaced entirely by the two new endpoints — `/upcoming` already covers standalone and
     group-linked sessions in one call, so the per-group fan-out goes away completely.
     `groupSessionsByDate.ts`'s dual active/history zone split (CLIENT-SESSION-20) is retired in
     favor of the new two-section, two-endpoint model; `SessionDateGroup.tsx` may need reshaping or
     replacing to fit the new single-zone-plus-collapsed-history-rows shape.

3. **`UpcomingMatches` rail migration** (`useUpcomingMatches.ts` — Home Feed/Groups/Friends/Profile):
   moves onto `GET /api/sessions/upcoming` too, dropping its own `useUserGroups` + per-group
   fan-out + `useMySessions` merge and its client-side `SCHEDULED`/`ONGOING`-only filter. This is
   what actually closes the `PREPARING`-missing-from-the-rail bug — the new endpoint's own status
   filter (`PREPARING`/`SCHEDULED`/`ONGOING`) already covers it, so there's no separate client-side
   filter left to get wrong. `UpcomingMatches`' own `maxVisible` cap still applies on top, same as
   today.

4. **`SessionPreparingCompletion` gains a favorites dropdown** for its location control — today it's
   a plain "Choose location"/"Change location" button that always opens the full `LocationPicker`
   dialog directly. Match `CreateSessionModal`'s existing `LocationFavoritesDropdown` pattern
   instead (a `DropdownMenu` listing favorite locations as quick-pick items, with a trailing
   "Choose a location…" item that opens the full picker) — `useSessionDetailModalData.ts` already
   wires real favorites data (`useFavoriteLocations`/`useFavoriteLocation`/`useUnfavoriteLocation`)
   into `completionLocationPicker` for this exact purpose (CLIENT-SESSION-21), it's just not
   surfaced through a dropdown yet. Extract `LocationFavoritesDropdown` out of
   `CreateSessionModal.tsx` into its own file (same "extract for reuse" precedent as
   `FeeTypeFields.tsx`, CLIENT-SESSION-21) so both components share one implementation.

**Who:** Normal User — the Matches page and every page hosting the `UpcomingMatches` rail.

**Entry point:** `/matches` page ("Upcoming sessions"/"History" sections), and
`HomeFeedPage`/`GroupsPage`/`FriendsPage`/`ProfilePage` (the rail).

**Edge cases:**
- A date with more than 20 history sessions on it — nested "Load more" inside that expanded row
  (see Scope item 2).
- Collapsing a previously-expanded history date row and re-expanding it — re-fetch is fine
  (TanStack Query cache makes this a no-op network-wise unless stale), no special state needed.
- Zero upcoming sessions / zero history — each section renders its own empty state, independent of
  the other (one can be empty while the other has content).
- `UpcomingMatches`' `maxVisible` cap combined with the new endpoint's own pagination — the rail
  only ever requests one page sized to (or larger than) `maxVisible`, no "load more" needed there
  (unchanged from today).

**Out of scope:**
- Group-owner/admin "sessions I manage but haven't personally joined" visibility — real gap,
  flagged in SESSION-27, not solved by either ticket.
- `REQUESTED`-status sessions in "Upcoming sessions" — SESSION-27 deliberately excludes them.
- Any change to `SessionDiscoverPanel`/`SessionDiscoverModal` (`/discover`) — unrelated endpoint,
  untouched by this ticket.
- Visual redesign of the `SessionCard` beyond the two specific fixes in item 1.

**Tests:** Vitest for the new "Upcoming sessions"/"History" section components (collapsed/expanded
history row states, load-more at both levels, empty states for each section independently);
`SessionCard` sticky-button + location-truncation regression coverage (Storybook states +
component test); `useUpcomingMatches.test.ts` update proving a `PREPARING` session now appears
(the regression test for the bug this ticket closes); MSW handlers for
`/api/sessions/upcoming`/`/api/sessions/history` (both `date` and `dateCount` shapes) replacing the
now-removed `/api/sessions/mine` mock; `matches-journey.spec.ts` updated for the new section
labels/structure plus a new step covering history date expand → load more → collapse;
visual-regression baselines for the Matches page and rail will change (expected, regenerate via
`/updatebaseline`).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
