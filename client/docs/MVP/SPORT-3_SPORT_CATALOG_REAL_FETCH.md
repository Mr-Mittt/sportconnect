# SPORT-3 · Sport catalog — fetch the real `GET /api/sports` list instead of the hardcoded 3-sport config

**Status:** DONE
**Type:** Data layer (real integration)
**Date:** 2026-08-07

## Design (as approved)

1. New `useSportCatalog()` hook (TanStack Query) wrapping `GET /api/sports` (already active-only
   server-side, A5/A6).
2. A synchronous, non-hook-readable store backing `sportIdMap.ts`'s `sportKeyForId`/
   `SPORT_ID_BY_KEY` — needed because those are called from places that can't call a React hook
   (`groupsPageStore.ts`'s `selectGroup` action, most notably).
3. `SPORT_PROFILE_CONFIG` gains a fallback-safe accessor (`getSportProfileConfig`) instead of raw
   `[key]` indexing, so a catalog sport with no bespoke label/icon/ramp entry degrades gracefully.
4. **Open design question flagged at pickup, resolved during Phase 1:** whether `SportKey` stays a
   hand-written literal union or becomes plain `string`, derived from the live catalog. **Chose
   option (b) — `SportKey = string`**, no compile-time closed set. The id↔key map itself is now
   *derived* from the live catalog at runtime (`key = sport.name.toLowerCase()`) rather than
   hand-copied off a migration file.
5. **Full-scope decision (user, at pickup):** migrate every production call site off the static
   config, and reshape MSW/e2e fixtures to match reality — not a "ship the infra, migrate later"
   split.

## What was built

**Core data layer:**
- `shared/types/sport.ts` — `SportKey` → `string`; added `SportResponse` (raw backend shape) and
  `SportCatalogEntry { id, key, name }` (the derived/normalized shape).
- `shared/lib/sportCatalogStore.ts` (new) — plain Zustand store, not persisted, holding
  `{ sports, byId: Map, byKey: Map }`. `setCatalog` is a reference-equality no-op when passed the
  same array reference twice (see "Non-obvious constraints" below — this is load-bearing, not an
  optimization).
- `shared/hooks/useSportCatalog.ts` (new) — the TanStack Query hook.
- `features/feed/sportIdMap.ts` — rewritten. `sportKeyForId`/new `sportIdForKey` (replacing the old
  `SPORT_ID_BY_KEY` object-indexing) now read `sportCatalogStore.getState()` instead of a hardcoded
  `{ football: 5, basketball: 6, tennis: 2 }` table. Same "unknown → `undefined`, don't crash"
  semantics as before, just a different reason `undefined` can happen now (catalog not loaded yet,
  or the id belongs to a sport the live catalog doesn't currently return).
- `shared/lib/sportProfileConfig.ts` — re-curated for Badminton (teal)/Pickleball (coral);
  `ALL_SPORT_KEYS` removed (replaced by the live catalog everywhere it was used);
  `getSportProfileConfig(key)` added, falling back to a title-cased label + neutral gray ramp +
  question-mark icon for any key with no bespoke entry.
- `shared/lib/sportIcons.ts` — added a `tournament` → `IconTournament` mapping (Tabler has no
  dedicated badminton/pickleball icon; `ball-tennis`/`tournament` are the closest racquet/court
  stand-ins, picked for visual distinctness from each other).
- `shared/components/AppShell.tsx` — the one place that calls `useSportCatalog()` and syncs it into
  the store; also gates `<Outlet />` behind `sportCatalog.isLoading` (see the race-condition finding
  below — this is not decorative).
- `shared/components/SportSwitcher.tsx` — `maxSports` prop's doc comment updated to say callers
  should pass the live catalog's size, not rely on the hardcoded default of 3.

**Consumer migration (every real, non-test call site):** `GroupsPage.tsx`, `HomeFeedPage.tsx`,
`MatchesPage.tsx`, `FriendsPage.tsx`, `useGroupsPageData.ts`, `useJoinGroupModalData.ts`,
`useMatchesPageData.ts`, `useCreateSessionModalData.ts`, `CreateGroupModal.tsx`,
`CreateSessionModal.tsx`, `AddSportFields.tsx`, `Feed.tsx`, `useSportProfilesForUser.ts`,
`useGroupBroadcasts.ts` — every `SPORT_ID_BY_KEY[key]` → `sportIdForKey(key)`, every
`SPORT_PROFILE_CONFIG[key]` → `getSportProfileConfig(key)`, every `ALL_SPORT_KEYS` derivation →
`useSportCatalog().data`. `GroupsPage`/`HomeFeedPage`/`MatchesPage` also now pass
`maxSports={sportCatalog.data.length || undefined}` to `SportSwitcher` (see below).

**MSW + e2e fixture reshape (full scope, user decision):** `e2e/mocks/handlers/sport.ts`'s
`mockSportCatalog` → exactly Badminton(1)/Pickleball(3), matching real A6 state.
`e2e/mocks/fixtures.ts` — every sport-tagged fixture (`mockSportProfiles`, `mockGroup`,
`mockOwnedGroup`, `mockPost`/`mockGroupPost`, `mockBasketballPost`, `mockPublicGroup`,
`mockLocation`, `mockSession`, `mockGroupSession`, `mockOwnedGroupSession`,
`mockDiscoverableSession`) remapped onto the 2-sport universe. `mockSportProfiles` shrank from 3
entries (the old "3-sport cap") to 2 (now "every available sport"), since a 3rd distinct sport no
longer exists to hold a profile for. `e2e/mocks/paginatedFeedFixture.ts` remapped its
Badminton/Pickleball split the same way. 10 e2e spec files' assertions (pill names, counts, text)
updated to match — see each spec's own updated comments for the reasoning per file, and
`client/docs/E2E_OVERVIEW.md` (fully re-synced) for the consolidated catalog.

## Key decisions

- **`SportKey = string`, no literal union** — matches the ticket's flagged option (b). The
  compile-time exhaustiveness this gives up was judged less valuable than removing the drift risk
  entirely, especially given the real catalog is now small (2 sports) and expected to change again.
- **`getSportProfileConfig` fallback, not a hard error, for an unmapped sport** — a sport reactivated
  server-side before this config is updated for it should degrade to generic styling, not crash or
  silently vanish.
- **`maxSports` now derived from the live catalog**, not left at the component's hardcoded default
  of 3 — found during MSW/e2e work that with only 2 real sports, the default-3 cap could never
  trigger through normal use (a user literally cannot hold 3 profiles when only 2 sports exist),
  silently breaking the "Add sport is aria-disabled at the cap" behavior. Wired
  `maxSports={sportCatalog.data.length || undefined}` into all 3 pages that render `SportSwitcher`.
- **MSW/e2e fixtures reshaped to match real backend state, full scope** — user decision, made with
  the full cost known upfront (10 spec files + `fixtures.ts` + `paginatedFeedFixture.ts`). Some
  fixture pairs that used to be on 3 distinct sports (e.g. `mockSession`/`mockGroupSession`/
  `mockOwnedGroupSession`, one per sport) now share a sport out of necessity — documented per-fixture
  where this changes a test's exact counts (e.g. home-feed-journey's step 2 matches count: 1 → 2).

## Non-obvious constraints

- **Found mid-implementation, not part of the original design: a real race condition.**
  `sportKeyForId`/`sportIdForKey` read `sportCatalogStore.getState()` — a plain snapshot, not a
  reactive subscription. Any hook/component computing a derived value via these functions inside a
  `useMemo` keyed only on its *own* query data (e.g. `useSportProfilesForUser`'s profile→SportProfile
  mapping) would use whatever the catalog store held at the moment it first ran — if that was before
  `AppShell`'s catalog fetch resolved, the mapping ran against an *empty* store and silently dropped
  every profile, with no re-render ever correcting it (nothing subscribed to the store to trigger
  one). This didn't show up in Vitest (catalog pre-seeded synchronously in `beforeEach`, no real
  async race) but caused 13 real e2e failures and 2 real Vitest App.test.tsx failures once actual
  network timing was involved.
  **Fix:** `AppShell` now gates `<Outlet />` behind `sportCatalog.isLoading`, and calls
  `useSportCatalogStore.getState().setCatalog(sportCatalog.data)` **synchronously in its render
  body** (not a `useEffect`, which would still let the same-commit `<Outlet />` render see a stale
  store) — made safe by a reference-equality no-op guard in `setCatalog` itself, so calling it
  unconditionally every render doesn't spam new object/Map references at reactive subscribers.
- **Vitest component tests needed the same catalog seeded globally.** ~15 test files' own local
  fixtures (mostly the pre-existing football/basketball/tennis convention, unrelated to real backend
  truth) broke once `sportIdForKey`/`sportKeyForId` stopped being a hardcoded table. Fixed with one
  global `beforeEach` in `src/test/setup.ts` seeding `sportCatalogStore` with that same convention —
  not 15 per-file edits. A few tests asserting exact `getSportProfileConfig` output for
  football/basketball (no longer bespoke-configured sports) had their expected values corrected to
  the real fallback output instead.
- **`App.test.tsx` needed a default `GET /sports` mock**, not per-test — every authenticated page now
  unconditionally calls it (via `AppShell`), including tests that only ever mocked `apiClient.post`
  (auth) and never touched `get` at all.

## Tests

- `pnpm exec tsc -b` — clean.
- `pnpm test` (Vitest) — 793/793 passing (0 failures, after the fixes above).
- `pnpm e2e` (Playwright, `e2e` project) — 49/49 passing (0 failures, after the `AppShell` race fix).
- `pnpm test:visual` (Playwright, `visual-regression` project) — local baselines regenerated
  (`--update-snapshots`); spot-checked 2 of the regenerated PNGs by direct image inspection —
  correct pill labels (Badminton/Pickleball, no leftover Football/Basketball/Tennis), correct
  filtered content, correct rail counts. `home-feed-basketball-*.png` (3 files) removed —
  superseded by `home-feed-pickleball-*.png` (renamed state, not just relabeled).
  **Not yet done, same precedent as HF-13..HF-19:** the committed baselines are Windows-rendered
  locally; the authoritative Linux-rendered set still needs the `client-ci` workflow's
  `update-baselines` manual dispatch run post-merge, same two-step process every prior baseline
  ticket in this backlog used.
- `client/docs/E2E_OVERVIEW.md` — fully re-synced (fixture reference tables + every affected test
  case's row) to match the reshaped fixtures.
- Live-verified against the real backend (not MSW): `GET /api/sports` confirmed still returning
  exactly `[Badminton, Pickleball]` in the `SportResponse` shape `useSportCatalog()` expects.
  Browser extension wasn't connected in this environment, so no interactive live walkthrough — relied
  instead on the e2e suite (real Chromium via Playwright) and the inspected visual-regression
  screenshots (real rendered output from that same browser) as the "walk the happy path" evidence.

---

### SPORT-3 · Sport catalog — fetch the real `GET /api/sports` list instead of the hardcoded 3-sport config
**Status:** `DONE` (2026-08-07) · **Type:** Data layer (real integration) · **Dependency:** soft — **A6**
(`modules/sport/sport-impl/docs/BACKLOG_MVP.md`, `DONE`) · **Filed:** 2026-08-07 · **Summary:**
`client/docs/SPORT-3_SPORT_CATALOG_REAL_FETCH.md`

**Problem, verified against the actual code (not assumed):** despite SPORT-1's ticket text listing
`GET /api/sports` as an endpoint it would use "for icon/name lookup," nothing in the client actually
calls it — confirmed via a repo-wide grep for the endpoint path. The entire "which sports exist" /
label / icon / color-ramp catalog is `shared/lib/sportProfileConfig.ts`'s hardcoded
`SPORT_PROFILE_CONFIG`/`ALL_SPORT_KEYS` (`['football', 'basketball', 'tennis']`) plus
`features/feed/sportIdMap.ts`'s hand-maintained `SPORT_ID_BY_KEY` (`{ football: 5, basketball: 6,
tennis: 2 }`). Every "add a sport" flow (`AddSportModal`/`AddSportFields`, `CreateSessionModal`,
`SessionDiscoverModal`, the Home Feed / Groups / Matches / Friends page rails) reads from these two
static files, not the server. **This means the client cannot show Badminton or Pickleball at all
today** — neither is in `SportKey`, `SPORT_PROFILE_CONFIG`, or `SPORT_ID_BY_KEY` — which becomes a
hard blocker once **A6** deactivates every other sport server-side, since the client's entire
hardcoded catalog will then reference only inactive sports.

**What ships:**
- A real data hook (`useSportCatalog()` or similar, TanStack Query) wrapping `GET /api/sports` — the
  endpoint is already active-only server-side (`SportServiceImpl.getAllActiveSports()`), so no
  client-side `isActive` filtering is needed; whatever the endpoint returns is the full "sports a
  user can pick" list.
- The catalog becomes the single source of truth for which sports the "Add sport" flow, session
  creation/discovery, and every page-level `availableSports` computation can offer — not a
  hand-maintained array that silently drifts from what the backend actually serves (exactly the
  drift this ticket exists to fix).
- Label/icon/color-ramp stay a **static client-side config** (same precedent as A3/SPORT-2 for
  attributes) keyed by something stable from the server response (`sport.id` or `sport.name`) — this
  part is presentational and doesn't need to come from the backend. What changes is *which sports
  exist and are offered*, not how each one is styled once known.

**Open question for implementer (flag before designing, don't decide silently):** `SportKey` is
currently a hand-written string-literal union threaded through most of `src/features/` and
`src/shared/` (ramp lookups, ids, component prop types, ~40+ call sites per the grep that surfaced
this ticket). Two directions, both viable:
1. **Keep `SportKey` as a literal union**, but generate/validate it against the live catalog at
   startup (extend the union by hand each time a sport is added/removed, same as today, just backed
   by a real fetch instead of a guess) — smaller diff, keeps strong typing on every existing call
   site, but doesn't fully remove the "hardcoded set that can drift from the server" problem, just
   narrows it to a manual sync step.
2. **Derive sport identity from `sportId: number` end-to-end**, dropping the `SportKey` string-literal
   layer and `sportIdMap.ts` entirely, with label/icon/ramp keyed by `sportId` instead — removes the
   drift risk completely, but touches every component currently typed against `SportKey` (a much
   larger diff, and the "Sport color ramps" table in `client/CLAUDE.md` would need rewriting since it
   currently names ramps by sport rather than by id).

Given A6 leaves exactly 2 active sports (Badminton, Pickleball — both currently entirely absent from
the client), either direction requires touching `SPORT_PROFILE_CONFIG` regardless; the open question
is only about how much of the existing `SportKey`-typed surface gets touched along with it. Resolve
in Phase 1/3 of `/workon`, not assumed here.

**Out of scope:** re-theming existing sports' ramps (football/basketball/tennis keep their current
teal/coral/purple assignment wherever they remain referenced); any change to `SportServiceImpl` or
other backend behavior (A6 owns the backend side).

**Delta (2026-08-07, at implementation):** the open `SportKey` question resolved to **option
2 — `SportKey = string`**, derived from the live catalog at runtime (`key = sport.name.toLowerCase()`),
not a hand-extended literal union. The "re-theming out of scope" line above held for football/
basketball/tennis's *specific* colors, but those three sports were dropped from
`SPORT_PROFILE_CONFIG` entirely (not kept as dormant entries) since the live catalog can no longer
reach them — a new `getSportProfileConfig()` fallback covers any sport with no bespoke entry instead
of leaving a hole. Scope grew significantly beyond the original description at pickup (user
decision, full cost surfaced explicitly before proceeding): every production call site was migrated
in this same ticket (not split into a follow-up), and the entire MSW/e2e fixture graph
(`e2e/mocks/fixtures.ts`, `paginatedFeedFixture.ts`, 10 spec files, `E2E_OVERVIEW.md`) was reshaped
from the old football/basketball/tennis universe to the real 2-sport one. A genuine race condition
(not anticipated in the original design) was found and fixed along the way — see the summary doc's
"Non-obvious constraints" section.

---
