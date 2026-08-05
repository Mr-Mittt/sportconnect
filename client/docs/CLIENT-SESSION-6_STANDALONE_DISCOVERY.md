# CLIENT-SESSION-6 — Standalone session discover, real "Join a match" browse UI

**Status:** DONE (2026-08-05)

## Scope

The backlog's original one-line spec ("a browse/discover UI — modal or dedicated view, TBD at
design time — listing joinable standalone sessions via `GET /api/sessions/discover`, repointing
`UpcomingMatches`'s `onJoinMatch`") turned out to need real scoping before implementation, for two
reasons found at pickup:

1. The backlog's own dependency note ("CLIENT-SESSION-2 — the `onJoinMatch` prop it introduces")
   was stale. `onJoinMatch` doesn't exist yet — that prop belongs to **CLIENT-SESSION-7** (rail CTA
   + create-session hook extraction), still `TODO`. There was no rail entry point to repoint.
2. The user had already redesigned `/matches`'s layout by hand (exported from a separate design
   tool as `client/design-reference/design-reference-matches.html`, built from a real API snapshot
   of the live page taken during scoping) and wanted that layout implemented directly, rather than
   the "modal or dedicated view" the backlog left open.

## Decisions made during scoping

- **Entry point:** the Discover surface lives on `/matches` itself, not behind a rail CTA — CLIENT-
  SESSION-7 (still `TODO`) owns wiring the Home Feed/Groups/Friends rail's own "Join a match" CTA to
  a real destination; this ticket doesn't block on it.
- **Scope size:** full rebuild of `MatchesPage`'s layout (not an additive surface next to the old
  single list) — the old CLIENT-SESSION-1 single merged list is retired.
- **Layout, from the user's design export:** two panels side by side (stacked below `md`/768px) —
  a left **Discover** grid (search bar + inert Date/Time/Location filter pills + session cards) and
  a right, collapsible **"My sessions"** panel (calendar-day-grouped, each date group independently
  collapsible, a chevron toggle between the two panels that also reflows the Discover grid from
  2 to 3 columns when the right panel is hidden).
- **What backs "My sessions":** everything the caller created, manages via a group, or has joined —
  **any** status, folded into one date-grouped list (not split into separate upcoming/history
  sections). Confirmed explicitly with the user after the design export implied Scheduled/Ongoing
  had nowhere left to render once Discover became discover-only.
- **Search dropdown ("Sessions"/"Location"/"Gear"):** kept as a visual affordance per the user's
  export, but only "Sessions" is wired (client-side title/location substring filter). "Location"/
  "Gear" render `disabled` — this app has no gear/equipment or location-search domain yet
  (`client/CLAUDE.md`'s phase roadmap).
- **Filter pills (Date/Time/Location):** rendered `aria-disabled`, no logic — explicitly deferred by
  the user pending a real design for what each one opens.
- **Sort order:** date groups sort **descending** (a further-future day sorts above a nearer one),
  matching the user's own design export exactly rather than silently "fixing" it to soonest-first.
  Flagged to the user as an easy follow-up change if it turns out to read wrong in practice.

## Backend change: `GET /api/sessions/joined`'s `status` param is now optional

The original SESSION-4 spec required `status` and explicitly punted on an "all statuses" mode. The
"My sessions" panel needs the caller's whole joined history/upcoming in one date-grouped list, and
a 4-call fan-out (one per `SessionStatus`) was the alternative — the user asked to check whether
that could become one call instead. It's a small, backward-compatible additive change:

- `SessionRepository` gained `findJoinedSessions(userId, joinedStatus, pageable)` (same as
  `findJoinedSessionsByStatus` minus the `status =` predicate) alongside the existing method.
- `SessionServiceImpl.getJoinedSessions` branches on `status != null`.
- `SessionController`'s `@RequestParam SessionStatus status` became `required = false`.
- Existing callers passing a status are completely unaffected — verified via the existing Spock
  test plus a new one for the null-status path (`:modules:session:session-impl:test`, `:server:test`
  both green). See `modules/session/docs/SESSION-4_STANDALONE_DISCOVERY.md`'s "Out of scope /
  follow-ups" section for the full delta note on the backend side.

## What was built

**Backend** (`modules/session`):
- `SessionRepository.findJoinedSessions` (new), `SessionServiceImpl.getJoinedSessions` (branches on
  null), `SessionController.getJoinedSessions`'s `status` param now optional. Spock coverage for
  both the given-status and null-status paths.

**Client** (`client/src/features/session/`):
- `hooks/useDiscoverSessions.ts` — wraps `GET /sessions/discover?sportId=`.
- `hooks/useJoinedSessions.ts` — wraps `GET /sessions/joined` (no status — every status in one call).
- `groupSessionsByDate.ts` — `dedupeSessionsById` (keeps first occurrence; needed because a
  standalone session I created is legitimately in both `mine` and `joined`, since `createSession`
  auto-JOINs the creator) and `groupSessionsByDate` (calendar-day buckets, descending, "Today"
  label special-case). Pure functions, unit-tested directly (no rendering).
- `components/SessionDateGroup.tsx` — one collapsible date-header + session-card-list block for the
  "My sessions" panel, reusing the existing `SessionListCard` (no new card component needed — the
  user's design export's card markup is nearly pixel-identical to the one CLIENT-SESSION-1 already
  built).
- `useMatchesPageData.ts` — restructured: `discoverSessions` (server-filtered by sportId, then
  client-side-filtered by the search box) and `mySessionDateGroups` (dedup-merge of `mine` + one
  `useGroupSessionsForGroups` call per group + the new single `useJoinedSessions` call, then grouped)
  replace the old single `sessions` list. New local UI state: `searchText`/`searchMode`,
  `isHistoryPanelCollapsed`, `collapsedDateKeys`.
- `MatchesPage.tsx` — two-panel layout per the design export; `SportSwitcher` and "Create session"
  stay unchanged above it. Discover panel's search input filters live (no submit button — the
  export's search icon button was dropped since there's no async submit step to trigger). Empty
  states: "No sessions to discover for this sport yet." / "No sessions match your search." (Discover),
  "You haven't created or joined any sessions yet." (My sessions).
- `e2e/mocks/fixtures.ts` — new `mockDiscoverableSession` ("Weekend 5-a-side", standalone, created
  by someone else, Soccer — a sport the e2e test user holds an active profile for). Every other
  session fixture is either self-created or `GROUP_RECURRING`, so without this, Discover would be
  permanently empty in e2e.
- `e2e/mocks/handlers/sessions.ts` — new `GET /sessions/discover`/`GET /sessions/joined` handlers,
  registered **before** the `GET /sessions/:sessionId` catch-all (same route-ordering lesson
  CLIENT-SESSION-5 already found for `/locations/favorites` — `:sessionId` would otherwise swallow
  the literal strings "discover"/"joined" as a bogus id).
- `e2e/flows/matches-journey.spec.ts` — steps 1-8 unchanged in substance (the sessions they target
  now render inside the "My sessions" panel, but the assertions don't care which panel); new step 9
  (discover → join → moves into My sessions) and step 10 (search filter, panel collapse toggle).

## Verification

- Client: `tsc -b` clean, full Vitest suite (768 tests, 115 files) green, ESLint clean (0 errors),
  `build-storybook` succeeds (including the two new `SessionDateGroup` stories).
- Backend: `:modules:session:session-impl:test` and `:server:test` both green.
- E2E: full `e2e` Playwright project (49 tests) green, including the updated `matches-journey.spec.ts`.
- No `visual-regression` impact — the Matches page has never had a visual-regression baseline (only
  Home Feed does, per HF-10a/HF-10b).
- Not verified against the real running backend beyond the Java test suites above (no browser
  automation available this session — the Claude in Chrome extension wasn't connected). The
  `design-reference-matches.html` snapshot used for the layout was itself pulled from the real
  backend's actual response shapes (`GET /api/sessions/mine`, `GET /api/sports/profiles/user/{id}`)
  via direct API calls, so the DTO shapes are verified even though the rendered page wasn't.

## Out of scope / follow-ups

- CLIENT-SESSION-7 (rail CTA + create-session hook extraction) still owns repointing the Home
  Feed/Groups/Friends `UpcomingMatches` rail's "Join a match" CTA at a real destination.
- Date/Time/Location filter pills render but do nothing — needs a real design pass.
- "Location"/"Gear" search modes are disabled placeholders — no location-search or gear/equipment
  domain exists in this app.
- Discover fetches a single page (no "load more"/infinite scroll) — fine for the current low
  session volume, worth revisiting if it grows.
