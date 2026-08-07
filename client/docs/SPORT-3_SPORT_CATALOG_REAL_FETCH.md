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
