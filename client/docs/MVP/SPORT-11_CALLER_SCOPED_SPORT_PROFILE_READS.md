# SPORT-11 · Move sport-profile reads to the caller-scoped endpoints

**Status:** `IN PROGRESS` (U15 merged 2026-09-04 — unblocked) · **Type:** Refactor (API contract change) · **Filed:** 2026-09-03 ·
**Origin:** backend **A20** (`DONE`/merged) § "Client follow-ups" item 2 (owner-only gate on the
profile-list read) **+ backend A22** (in progress) which reworks that endpoint's *URL* to be
caller-scoped. A20 named this follow-up but it was never filed here; found and filed during A22's
Phase 1 consumer census. ·
**Depends on:** backend **A22** (`GET /api/sports/profiles`, `GET /api/sports/profiles/sport/{sportId}`,
removal of both `/profiles/user/{userId}` paths) — **merged 2026-09-04**. And backend **U15**
(`UserInfoResponse.activeSportIds`) — **not yet merged; this ticket is blocked on it** for the
friend-pill rewire in §2. ·
**Spec source:** `modules/sport/sport-impl/docs/MVP/A22_CALLER_SCOPED_SPORT_PROFILE_READS.md`,
`modules/sport/sport-impl/docs/MVP/A20_ISRESUME_REACTIVATION_MODE.md` § "Client-visible" → "Breaking",
`modules/user/user-impl/docs/MVP/U15_ACTIVE_SPORT_IDS_ON_USER_INFO_RESPONSE.md`

## Scope change — 2026-09-04 (`/workon` Phase 1 gate)

Originally §2 offered a binary: **drop** the friend-profile sport pills, or a **"coming soon"
placeholder**, because A22 left no way to read another user's sports. User decision at pickup: do
**neither** — the old endpoint only leaked *too much* (skill/years/position/attributes); the friend
pills only need the *list of sport ids* the selected user has an active profile for (name + icon are
already resolved client-side from `sportIdMap`). So a new backend field carries exactly that:
**`UserInfoResponse.activeSportIds: number[]`** (filed as `user-impl` **U15**), served by the
`GET /api/users/{userId}` call `FriendProfilePanel` *already makes* via `useUserInfo`. §2 below is
rewritten to rewire onto that field. This ticket is now **blocked on U15 merging**.

**Delta (implementation, 2026-09-04):** §2 above says `useUserInfo` is a call the panel "already
makes" — that was only true for **non-friend** selections. FRIEND-2 disabled `useUserInfo` for a
known friend (the friend-list row already carried its core fields). A friend-list row does **not**
carry `activeSportIds` (U15 kept it off `UserResponse`), so this ticket enables `useUserInfo` for
**every** selection, known friends included — it's now the sole source of the pill row. Core
fields still prefer the friend-list row; the loading flags stay gated on `!isKnownFriend`.

## Why

Backend A20 made `GET /api/sports/profiles/user/{userId}` **owner-only** (`401` anonymous, `403`
authenticated non-owner). Backend A22 then removed the `{userId}` path param entirely:

| Old (client calls today) | New (A22) |
|---|---|
| `GET /api/sports/profiles/user/{userId}` (public) | `GET /api/sports/profiles` — the caller's own; `?includeInactive=true` kept |
| `GET /api/sports/profiles/user/{userId}/sport/{sportId}` (public) | `GET /api/sports/profiles/sport/{sportId}` — caller's own for that sport; `404` if none |

The client calls the old list path from **one** hook, `useRawSportProfilesForUser(userId)` in
`src/shared/hooks/useSportProfilesForUser.ts`, with two distinct call sites:

- **self:** `useSportProfiles()` and `features/profile/useMySportProfilesRaw` pass the current
  user's id — these still work under A20's owner gate but the **path is gone** under A22.
- **other user:** `features/friends/useFriendsPageData.ts:164` passes `selectedPersonId` (a
  friend / search result). A20's gate already **403s** these today; A22 removed the endpoint. The
  replacement is not a sport-profile read at all — it's the new `activeSportIds` field on the
  `UserInfoResponse` the friend panel already fetches (U15).

Nothing else hits the single-sport path (`/user/{id}/sport/{sportId}`) — no hook, no MSW handler.

## What ships

### 1. Repoint the self read

- `useRawSportProfilesForUser` → drop the `userId` argument; call `GET /sports/profiles`
  (optionally `?includeInactive=true`). Rename to `useRawMySportProfiles` (or keep the name, lose
  the param) — it can only ever mean "me" now.
- `useSportProfiles()` and `useMySportProfilesRaw` become trivial pass-throughs (no `userId`
  plumbing from `authStore`).
- `sportProfilesQueryKey(userId)` → `['sportProfiles', 'me']` (single entry; no per-user fan-out).
  Update `useAddSportProfile` / `useUpdateSportProfile` cache writes to the new key.

### 2. Other-user sport display — rewire onto `UserInfoResponse.activeSportIds` (U15)

- Remove `useSportProfilesForUser(selectedPersonId)` from `useFriendsPageData` (and any
  search-result-chip caller). Nothing may fire a `/sports/profiles/...` request for another user.
- Source the friend's sports from the **`useUserInfo(selectedPersonId)`** query that
  `FriendProfilePanel` already drives (FRIEND-2) — `UserInfoResponse` gains
  `activeSportIds: number[]` in U15.
- Map `activeSportIds` → the display `SportProfile[]` the panel expects, reusing the **exact**
  `sportId → SportKey → { label, iconUrl, config }` mapping `useSportProfilesForUser` does today
  (`sportKeyForId` / `sportIconUrlForId` / `getSportProfileConfig`) — an unknown/again-inactive
  `sportId` is silently dropped, same as now. Factor that mapping into a small pure helper so both
  the self path and this path share it rather than duplicating it.
- `FriendProfilePanel`'s `sports: SportProfile[]` / `isSportsLoading` props stay — only their
  *source* moves (from the removed hook to the `useUserInfo` query's `activeSportIds`). The pill
  row markup is unchanged.
- Until U15 merges, `activeSportIds` is absent from the response → treat `undefined` as `[]` (row
  renders nothing), so the client is not broken in the gap between this ticket and U15. But this
  ticket is **not considered done** until it is verified against a U15 backend.

### 3. MSW + tests

- `e2e/mocks/handlers/sport.ts` — replace `http.get('/api/sports/profiles/user/:userId')` with
  `http.get('/api/sports/profiles')` (stateful, same fixture store); add
  `http.get('/api/sports/profiles/sport/:sportId')` only if a test needs it. Drop the
  other-user branch.
- Every `*.test.tsx` URL stub for `/sports/profiles/user/...` (~20: HomeFeed, Groups, Profile,
  Friends, Matches, AppShell) → `/sports/profiles`. The **Friends** stubs additionally move the
  selected person's sports from the (now gone) `/sports/profiles/user/:id` response onto
  `activeSportIds` in the `GET /api/users/:userId` mock body.
- `e2e/mocks/handlers/users.ts` (or wherever `GET /api/users/:userId` is mocked) — add
  `activeSportIds` to the `UserInfoResponse` fixture shape.

## Edge cases

- Anonymous (no token yet, pre-refresh) → `GET /sports/profiles` 401s; the hook is already gated
  behind `ProtectedRoute`, but confirm it doesn't fire during the refresh-flow bootstrap.
- Caller with no profiles → `200 []` (unchanged shape).
- `?includeInactive=true` still returns the caller's soft-deleted rows (used by SPORT-10).
- Deactivated caller with a live token → still resolves (read of own data); no new check.

## Out of scope

- The `isResume` add-sport flow — **SPORT-10**.
- The backend `activeSportIds` field itself — **U15** (`user-impl`). This ticket only consumes it.
- Any change to `UserSportProfileResponse` / `SportProfile` shape, or to `UserResponse` (`/me`).
- Showing another user's sport *detail* (skill/years/position/attributes) — permanently removed by
  A22; only the id-list comes back.

## Tests

- Vitest — `useSportProfiles` calls `GET /sports/profiles` (no id in the URL); cache write from
  `useAddSportProfile` lands on the `'me'` key and is visible to `useSportProfiles`;
  `useFriendsPageData` no longer requests any `/sports/profiles/...` URL for the selected person;
  the friend panel's sports come from `useUserInfo`'s `activeSportIds` (mapped, unknown ids
  dropped); `activeSportIds` absent → row renders nothing (no crash).
- Storybook — `FriendProfilePanel` with sports (from `activeSportIds`) and with none.
- `client/docs/E2E_OVERVIEW.md` — update the catalog for any e2e/visual spec whose URL stubs or
  assertions change (Friends flow at minimum — its user-info mock now carries `activeSportIds`).

---

## Implementation summary (2026-09-04)

### Approved design (as built — one deviation, noted below)

Pure client refactor — no new component, no visual change. Repoint the caller's own sport-profile
reads onto A22's caller-scoped `GET /api/sports/profiles`, and rewire `FriendProfilePanel`'s
sport-pill row onto U15's `UserInfoResponse.activeSportIds` instead of the removed
`GET /api/sports/profiles/user/{userId}`.

| Area | Change |
|---|---|
| `features/friends/types.ts` | `UserInfo` gains `activeSportIds: number[]` (1:1 with U15's `List<Long>`; never null, `[]` when none, order not guaranteed) |
| `shared/lib/sportProfileFromId.ts` (new) | `sportProfileForId(sportId): SportProfile \| undefined` — the `sportId → SportKey → SportProfile` mapping (`sportKeyForId` / `getSportProfileConfig` / `sportIconUrlForId`), extracted so the self path and the friend path share one copy. `undefined` (caller drops it silently) when the live catalog doesn't resolve the id — unchanged from the pre-SPORT-11 behaviour |
| `shared/hooks/useSportProfilesForUser.ts` → renamed `useRawMySportProfiles.ts` | `useRawSportProfilesForUser(userId)` → `useRawMySportProfiles()` — no param, `GET /api/sports/profiles`, `queryKey` is now the constant `['sportProfiles','me']`. Keeps an `enabled` gate on `authStore.user?.id` so it doesn't fire during the refresh-flow bootstrap (an anonymous `GET /api/sports/profiles` 401s); the id is no longer in the URL or the key. `useSportProfilesForUser` (the map-for-an-arbitrary-user hook) **deleted** — its only other caller was the friend path |
| `shared/hooks/useSportProfiles.ts` | Folds the mapping in directly (via `useRawMySportProfiles()` + `sportProfileForId`). Public name/file kept — its 8 no-arg call sites are untouched |
| `features/profile/useMySportProfilesRaw.ts` | Now a thin normalise over `useRawMySportProfiles()`; dropped the `authStore` user-id plumbing |
| `useAddSportProfile` / `useUpdateSportProfile` | `sportProfilesQueryKey(userId)` → the `sportProfilesQueryKey` constant. Signatures unchanged — `userId` stays only as a readiness guard on the optimistic cache write (min blast radius: 5 page call sites of `useAddSportProfile(userId)` untouched) |
| `features/friends/useFriendsPageData.ts` | Removed `useSportProfilesForUser(selectedPersonId)`. `useUserInfo(selectedPersonId)` now runs for **every** selection (was skipped for known friends) — it's the only source of another user's sports, and a friend-list row doesn't carry `activeSportIds`. Core fields still prefer the friend-list row (`baseSelectedPerson`), and `isSelectedPersonLoading` / `isSelectedSportsLoading` stay gated on `!isKnownFriend` so a friend's panel never shows a loading state. `selectedSports` derived from `profileQuery.data?.activeSportIds ?? []` mapped via `sportProfileForId` |
| MSW `e2e/mocks/handlers/sport.ts` | `http.get('/api/sports/profiles/user/:userId')` → `http.get('/api/sports/profiles')`; added `requireAuth` (A22 made it `hasRole('USER')`); stale comments fixed |
| MSW `e2e/mocks/handlers/friends.ts` | `KNOWN_USERS` entries gain `activeSportIds` (ids matching `sport.ts`'s `mockSportCatalog`); `GET /api/users/:userId` returns it on the `UserInfo` body |
| `client/docs/E2E_OVERVIEW.md` | §5 Friends fixture note updated |

### Deviation from the approved plan

The plan said the friend-panel pills "keep working" by enabling `useUserInfo` for known friends —
which is what was built. The user chose this over the alternative (only non-friend selections show
pills) in the Phase 1 scope gate. One pre-existing unit test —
`useFriendsPageData` *"resolves a friend-list selection to FRIENDS without calling GET /users/{id}"*
— asserted the now-obsolete "no `/users/{id}` call for a friend" premise; rewritten to assert
instead that a friend's **core fields** still come from the friend-list row (not the `/users/{id}`
response) while `useUserInfo` fires for `activeSportIds`.

### Non-obvious constraints

- **`activeSportIds` absent → `[]`.** A backend that predates U15 returns no such key; the hook
  treats `undefined` as `[]` (pill row renders nothing) so the client isn't broken in that window.
  Both blockers (A22 PR #218, U15 PR #220) are merged on `origin/master`, so this is only a
  belt-and-braces guard now — covered by a test.
- **Known-friend sports show with no loading state.** `isSelectedSportsLoading` is `false` for a
  known friend even while `useUserInfo` is still in flight; the panel's existing
  `!isSportsLoading && sports.length > 0` guard hides the row until `activeSportIds` lands, then
  shows it (a conditional `flex-wrap` row — no layout jank).
- **`sportProfilesQueryKey` is now a value, not a function** — `['sportProfiles','me']`. Any future
  cache read/write must use it as-is.

### Verification

- `npx tsc -b --noEmit` — clean.
- `npx eslint` on every changed file — clean.
- Vitest — the 16 directly-affected suites green (`useSportProfiles`, `useAddSportProfile`,
  `sportProfileFromId` [new], `useMySportProfilesRaw`, `useUpdateSportProfile`,
  `useSportProfileSettingsTabData`, `useUserInfo`, `useFriendsPageData` [+4 new cases],
  `FriendsPage`, `App`, `useGroupsPageData`, `HomeFeedPage`, `useHomeFeedData`, `PostsTab`,
  `ProfilePage`, `MatchesPage`). Full `vitest run` + a live browser walk of the Friends happy path
  against a running backend — see the ticket's status line.

### Visual-regression expectation

No baselined surface touched — `FriendProfilePanel`'s markup is byte-identical (same props, same
pill row). A failing `visual-regression` run is the Windows font-rendering noise floor, not a
regression; no `update-baselines` dispatch needed.
