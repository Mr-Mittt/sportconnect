# SPORT-11 · Move sport-profile reads to the caller-scoped endpoints

**Status:** `TODO` · **Type:** Refactor (API contract change) · **Filed:** 2026-09-03 ·
**Origin:** backend **A20** (`DONE`/merged) § "Client follow-ups" item 2 (owner-only gate on the
profile-list read) **+ backend A22** (in progress) which reworks that endpoint's *URL* to be
caller-scoped. A20 named this follow-up but it was never filed here; found and filed during A22's
Phase 1 consumer census. ·
**Depends on:** backend **A22** (`GET /api/sports/profiles`, `GET /api/sports/profiles/sport/{sportId}`,
removal of both `/profiles/user/{userId}` paths). Do not start until A22 has merged — the exact
paths are what this ticket repoints to. ·
**Spec source:** `modules/sport/sport-impl/docs/MVP/A22_CALLER_SCOPED_SPORT_PROFILE_READS.md`,
`modules/sport/sport-impl/docs/MVP/A20_ISRESUME_REACTIVATION_MODE.md` § "Client-visible" → "Breaking"

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
  friend / search result). A20's gate already **403s** these today; A22 removes the capability
  outright ("any endpoint returning another user's sport profiles — deliberately removed").

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

### 2. Other-user sport display — remove or re-gate

- `useFriendsPageData` can no longer fetch a selected person's sport profiles. **MVP decision
  needed (see Open question):** drop the friend-profile sport pills entirely, or hide them behind a
  "coming soon" placeholder until a PII-scoped `GET /api/users/{id}/sports` (or similar) backend
  endpoint is scoped. A22 explicitly leaves that new endpoint unfiled.
- Whichever: `FriendProfilePanel` / the search-result chips must not render a broken/empty sport
  row and must not fire a request that 404s or 403s.

### 3. MSW + tests

- `e2e/mocks/handlers/sport.ts` — replace `http.get('/api/sports/profiles/user/:userId')` with
  `http.get('/api/sports/profiles')` (stateful, same fixture store); add
  `http.get('/api/sports/profiles/sport/:sportId')` only if a test needs it. Drop the
  other-user branch.
- Every `*.test.tsx` URL stub for `/sports/profiles/user/...` (~20: HomeFeed, Groups, Profile,
  Friends, Matches, AppShell) → `/sports/profiles`.

## Edge cases

- Anonymous (no token yet, pre-refresh) → `GET /sports/profiles` 401s; the hook is already gated
  behind `ProtectedRoute`, but confirm it doesn't fire during the refresh-flow bootstrap.
- Caller with no profiles → `200 []` (unchanged shape).
- `?includeInactive=true` still returns the caller's soft-deleted rows (used by SPORT-10).
- Deactivated caller with a live token → still resolves (read of own data); no new check.

## Out of scope

- The `isResume` add-sport flow — **SPORT-10**.
- Building the new other-user sport-display backend endpoint — not filed; this ticket only stops
  the client depending on the removed capability.
- Any change to `UserSportProfileResponse` / `SportProfile` shape.

## Open question (resolve in Phase 1)

Friend-profile sport pills: **drop** for MVP, or **placeholder** pending a future PII-scoped
endpoint? Affects `FriendProfilePanel`, the search-result chips, and `FRIEND-1`'s acceptance
criteria. Flag to the user before implementing.

## Tests

- Vitest — `useSportProfiles` calls `GET /sports/profiles` (no id in the URL); cache write from
  `useAddSportProfile` lands on the `'me'` key and is visible to `useSportProfiles`;
  `useFriendsPageData` no longer requests any `/sports/profiles/...` URL for the selected person.
- Storybook — `FriendProfilePanel` without sport pills (or with the placeholder), per the resolved
  Open question.
- `client/docs/E2E_OVERVIEW.md` — update the catalog for any e2e/visual spec whose URL stubs or
  assertions change (Friends flow at minimum).
