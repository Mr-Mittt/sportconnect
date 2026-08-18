# SPORT-1 · Sport switcher (real)

**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0, HF-2, AUTH phase ·
**Spec:** `client/docs/BACKLOG_MVP.md` § SPORT-1 (new ticket, not in either epic — no epic covers it
since `SportController` shipped after both epics were written)

## What was built

De-mocked `useSportProfiles()` against the real `GET /api/sports/profiles/user/{userId}`. Same
`{ data, isLoading, isError }` shape as before — `HomeFeedPage`, `GroupsPage`, and `SportSwitcher`
were not touched.

**Mapping layer:** `UserSportProfileResponse` → `SportProfile` reuses `sportIdMap.ts`'s
`sportKeyForId()` (the same temporary `sportId`↔`SportKey` bridge FEED-1/FEED-4 already use for
posts/groups) rather than inventing a second id↔key table — this is also what keeps the acceptance
criteria's "sport keys stay consistent with what the posts API returns" true by construction.
`label`/`icon`/`colorRamp` come from a new static `SPORT_PROFILE_CONFIG` object
(`shared/lib/sportProfileConfig.ts`), keyed by `SportKey` — not from the backend's `sportName`/
`iconUrl` — per the ticket's own instruction to reuse sport-impl's A3 static-config approach rather
than a backend-driven mapping. Inactive profiles (`isActive: false`) and profiles whose `sportId`
has no `SportKey` mapping yet (e.g. Badminton) are silently dropped, not surfaced as an error.

**Bug found and fixed along the way:** `UpcomingMatches.tsx` indexed `sportsByKey[match.sport]`
unconditionally — safe under the old mock (always exactly 3 profiles, matching every mock match's
sport), but a real user can have 0–3 profiles that don't necessarily cover every mock match's sport.
Fixed to the same "resolve to `undefined`, render without the badge, don't crash" pattern
`PostCard`/`Feed.tsx` already use for an unresolved `SportProfile`. Directly required by SPORT-1's
own acceptance criterion ("a user with zero sport profiles doesn't break the page").

**MSW handlers** (`e2e/mocks/handlers/sport.ts`, new): `GET /sports/profiles/user/:userId` (stateful
fixture, `mockUser` at the 3-sport cap — keeps HF-11's existing "Add sport is aria-disabled at cap"
assertion true), `GET /sports` (catalog; no client type consumes this yet — the add-sport picker is
bounded to the client's own 3 known `SportKey`s, not the full backend catalog), and
`POST /sports/profiles` (stateful — enforces the same duplicate-sport/3-profile-cap 400s as the real
backend, so a created profile actually appears on the next GET).

**"Add sport" flow (scope addition, requested after the initial de-mock landed):** HF-2 left this a
callback-only no-op; SPORT-1 was expanded to wire it for real, since `POST /api/sports/profiles`
already existed and had no other ticket scoped to consume it. New `AddSportModal` (shared, same
"presentational and controlled" shape as `CreateGroupModal`) — sport picker bounded to
`ALL_SPORT_KEYS` minus whatever the user already has (not the full backend catalog, which includes
sports with no client-side label/icon/ramp), skill level (both required, matching
`CreateUserSportProfileRequest`'s own required fields), and an optional years-of-experience field.
Preferred position/bio (also on the backend DTO) are left for a future profile-editing screen — out
of scope for "add a sport profile for the first time." New `useAddSportProfile(userId)` mutation
hook mirrors `useCreateGroup`'s cache-write shape exactly: writes the new profile into
`useSportProfiles`'s query cache immediately (via a new shared `sportProfilesQueryKey` helper so
both hooks agree on the exact key) so the switcher updates without a refetch round trip, then
invalidates in the background for eventual consistency. Wired identically into both `HomeFeedPage`
and `GroupsPage` (same duplication precedent as their existing `sportsByKey` derivation — not
extracted into a shared page hook, since both call sites are only a few lines).

## What was built (files)

| File | Change |
|---|---|
| `shared/lib/sportProfileConfig.ts` | New — static `SportKey` → `{label, icon, colorRamp}` config, plus `ALL_SPORT_KEYS` |
| `shared/hooks/useSportProfiles.ts` | Mock array → real `useQuery` against `GET /sports/profiles/user/{userId}`; exports `sportProfilesQueryKey` |
| `shared/hooks/useSportProfiles.test.tsx` | Rewritten for the real hook (renamed from `.test.ts` — now contains JSX) |
| `shared/hooks/useAddSportProfile.ts` | New — mutation wrapping `POST /sports/profiles`, cache-writes into `useSportProfiles`' query |
| `shared/hooks/useAddSportProfile.test.tsx` | New |
| `shared/components/AddSportModal.tsx` | New — sport/skill-level/years-of-experience form |
| `shared/components/AddSportModal.stories.tsx` | New |
| `shared/components/AddSportModal.test.tsx` | New |
| `shared/types/sport.ts` | Added `UserSportProfileResponse` (1:1 with the backend DTO) |
| `shared/components/UpcomingMatches.tsx` | `sportsByKey[match.sport]` lookup made defensive (bug fix, see above) |
| `shared/components/UpcomingMatches.test.tsx` | New case: unresolved sport renders without a badge, doesn't crash |
| `features/home-feed/HomeFeedPage.tsx` | `onAddSport` wired to `AddSportModal`/`useAddSportProfile` instead of a no-op |
| `features/groups/GroupsPage.tsx` | Same |
| `e2e/mocks/handlers/sport.ts` | New — stateful MSW handlers for all three endpoints (GET profiles, GET catalog, POST profiles) |
| `e2e/mocks/handlers/index.ts` | Registers `sportHandlers` |
| `e2e/mocks/fixtures.ts` | New `mockSportProfiles` fixture (3 profiles, at cap) |
| `e2e/flows/home-feed-journey.spec.ts` | Doc-comment updates only — no assertion changes, still exercises the real cap behavior |
| `features/home-feed/useHomeFeedData.test.tsx` | GET mock updated to also answer the sport-profiles endpoint |
| `features/groups/useGroupsPageData.test.tsx` | Same |
| `features/home-feed/HomeFeedPage.test.tsx` | Same (page-level; also needed a 3-profile fixture to keep the existing at-cap test meaningful) |
| `src/App.test.tsx` | Same, for the assembled-page Home Feed/Groups tests |

## Verified

- `tsc -b --noEmit`: clean.
- `eslint .`: clean.
- `pnpm vitest run`: 62 files / 282 tests, all passing.
- `pnpm exec playwright test --project=e2e`: 29/29 passing, including the full Home Feed journey
  (step 7's at-cap assertion now exercises SPORT-1's real MSW-backed data, not the old mock hook).
- Live-verified against the real running backend (Postgres/Redis via `infra/docker-compose.dev.yml`,
  already up; Spring Boot backend already running on `:8080`) and a real running Vite dev server, in
  two separate passes:
  1. Registered a fresh user via `POST /api/auth/register`, logged in through the actual UI:
     confirmed the zero-profile state renders "All" + "Add sport" only, with the composer/feed
     intact; then created 3 real sport profiles via `POST /api/sports/profiles` (football/basketball/
     tennis) for that user and reloaded — confirmed all 3 pills render with the correct label/icon/
     ramp and "Add sport" is `aria-disabled` at the cap.
  2. Registered a second fresh user and drove the actual `AddSportModal` UI end-to-end three times in
     a row (not the API directly): submit is disabled until a skill level is chosen; adding Basketball
     closes the modal and the pill appears immediately (no reload); reopening excludes Basketball from
     the picker; adding Tennis then Football brings the sport picker down to zero remaining options
     and the real backend's own cap then makes `onAddSport` unreachable (`aria-disabled`) exactly as
     it does for a pre-seeded 3-profile user.
  Screenshots reviewed directly both passes; verification scripts were temporary, uncommitted scratch
  files, deleted after use.

## Deltas for later tickets

- **FEED-8** (integration hardening) still owns `useSportProfiles`'/`useAddSportProfile`'s
  loading/error UI polish — this ticket wired the real query/mutation and a functional error message,
  it didn't add skeleton states (consistent with FEED-1..FEED-7 all deferring that to FEED-8).
- **Preferred position and bio** (on `CreateUserSportProfileRequest`, unused by `AddSportModal`) and
  **editing an existing sport profile** (`PUT /api/sports/profiles/{id}` exists, unused) are both
  explicitly out of scope here — a natural follow-up ticket once a profile-editing screen is scoped.
- **A 4th client-known sport** needs a `SportKey` union member (`shared/types/sport.ts`), a
  `SPORT_PROFILE_CONFIG` entry, and an `ALL_SPORT_KEYS` entry (next ramp: pink, then gray, per
  `client/CLAUDE.md`) — `sportIdMap.ts`'s `SPORT_ID_BY_KEY` also needs the new `sportId` entry, same
  as it would have before this ticket.

---

### SPORT-1 · Sport switcher (real) — new ticket, not in either epic
**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0 (hook conventions), HF-2, AUTH phase ·
**Summary:** `client/docs/SPORT-1_SPORT_SWITCHER_REAL.md`

De-mocks HF-2 now that `SportController` exists (shipped after the epics were written — see
Reality check). Full spec lives here since no epic covers it:

**Endpoints (verified in `modules/sport/sport-impl`):**
- `GET /api/sports/profiles/user/{userId}` — the caller's sport profiles (public GET)
- `GET /api/sports` — active sport catalog (public), for icon/name lookup and the future add-sport flow

**Deliverables:**
- `useSportProfiles()` hook (TanStack Query) replacing the mock sport-profile array behind the
  same `{ data, isLoading, isError }` shape — components untouched, per the data-layer convention.
- Mapping layer `UserSportProfileResponse` → `SportProfile { key, label, icon, colorRamp }`:
  `colorRamp` and icon come from a **static client-side config object** keyed by sport (this exact
  approach was already decided in sport-impl's A3 ticket for sport attributes — reuse it, don't
  invent a backend-driven mapping). Follow `client/CLAUDE.md`'s ramp assignment rules
  (football→teal, basketball→coral, tennis→purple; next: pink, then gray; never blue/green/amber/red).
- MSW handlers for both endpoints (added under MSW-0's structure).
- "Add sport" stays a callback-only entry point in this MVP (the add-sport flow is its own future
  screen), but note `POST /api/sports/profiles` already exists for when that screen is scoped.

**Delta (2026-07-15, scope addition):** the "Add sport" bullet above was superseded mid-ticket —
requested for real, not left a no-op, since `POST /api/sports/profiles` already existed and had
no other ticket scoped to consume it. Built `AddSportModal` (sport + skill level, required; years of
experience, optional — preferred position/bio deferred to a future profile-editing screen) and
`useAddSportProfile()`, wired into both HomeFeedPage and GroupsPage. See the summary doc for detail.

**Acceptance criteria:**
- SportSwitcher renders the real profiles for the logged-in user; a user with 3 profiles sees no
  "Add sport" pill (backend enforces the same cap of 3 active profiles).
- A user with zero sport profiles doesn't break the page — "All" plus "Add sport" renders, feed
  filter still works.
- Sport keys used for feed filtering stay consistent with the `sportId`/`sportName` the posts API
  returns, so HF-3's filter keeps working after both are de-mocked.

**Delta (2026-07-15):** the first bullet above says a user at the cap "sees no 'Add sport' pill" —
superseded by HF-2's own already-approved delta (`aria-disabled` + no-op at the cap, always rendered,
mockup parity). Implemented against HF-2's actual behavior, not this ticket's literal wording, same
resolution as HF-2's delta note itself. Also found and fixed a latent bug in `UpcomingMatches.tsx`
(unconditional `sportsByKey[match.sport]` lookup, safe only under the old always-3-sport mock) —
see the summary doc for detail; directly required by the second acceptance bullet above.
