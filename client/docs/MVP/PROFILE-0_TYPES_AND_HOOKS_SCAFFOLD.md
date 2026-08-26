# PROFILE-0 · Types + data hooks scaffold

**Status:** `TODO` · **Type:** Component · **Depends on:** none ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

New feature folder `client/src/features/profile/` with the types and hooks every other `PROFILE-*`
ticket builds on — same "scaffold first" role `HF-0`/`FEED-0`/`AUTH-0`/`MSW-0` played for their pages.

**`types.ts`** — `MAX_BIO_LENGTH = 500` (mirrors the real `UpdateProfileRequest.bio` `@Size(max=500)`
constraint, same "constant sourced from the actual backend annotation" convention as
`MAX_POST_LENGTH`/`MAX_COMMENT_LENGTH` in `features/feed/types.ts`).

**`useMyProfile()`** — first fetch of the *full* `UserResponse` for the logged-in user
(`GET /api/users/{userId}`, called with `useAuthStore`'s own user id). `useAuthStore`'s `User` is
only a thin login-projection (no `bio`/`city`/`coverUrl`); this is genuinely new, not a rename of an
existing hook. Returns `{ data, isLoading, isError }` per the data-layer convention.

**`useMySportProfilesRaw()`** (or similarly named) — the *raw* `UserSportProfileResponse[]` for the
logged-in user (`id`, `attributes`, `skillLevel`, `yearsOfExperience`, `preferredPosition`, all
present). `useSportProfilesForUser` (existing) intentionally maps down to the display-only
`SportProfile` and drops these fields — this is a sibling hook, not a change to that one, since
`SportSwitcher` and other existing callers still want the mapped shape.

**`useUserPosts(userId)`** — wraps `GET /api/posts/user/{userId}` (paginated), returns
`{ data, isLoading, isError, hasMore, fetchMore }` or equivalent, matching whatever shape
`usePersonalizedFeed`/`useGroupPosts` already establish for a paginated post list.

**`profilePageStore.ts`** (`client/src/app/`) — hand-written Zustand store for this page's active
`SportSwitcher` pill, same shape as `homeFeedStore.ts`/`groupsPageStore.ts`
(`create(persist((set) => ({ activeSport: 'all', setActiveSport }), { name: 'profile-page-storage',
storage: createJSONStorage(() => sessionStorage) }))`). No shared factory exists for this — confirmed
by reading all three existing per-page stores, they're independently hand-written by design (see
`client/CLAUDE.md`'s 2026-07-25 note on why a single shared `activeSport` was reverted).

## Explicitly out of scope

No components, no page. Nothing here is wired to a UI yet — `PROFILE-1`/`PROFILE-2`/`PROFILE-3`/
`PROFILE-4`/`PROFILE-5` consume these.

## Tests

Vitest: each hook's `{ data, isLoading, isError }` shape against a mocked `apiClient` response,
matching the existing test pattern for `useSportCatalog`/`useSportProfilesForUser`.

---

## Implementation summary (2026-08-26)

**Built as approved**, with two corrections found at pickup (both verified against the real backend
before building, per this codebase's own convention — see `client/docs/BACKLOG_MVP.md`'s Reality
check precedent) and one scope addition made mid-ticket (user decision):

**`client/src/features/profile/`:**
- `types.ts` — `MAX_BIO_LENGTH = 500` + a new `UserResponse` interface, 1:1 with the (now-fixed)
  backend DTO of the same name.
- `queryKeys.ts` — `profileKeys` (`myProfile(userId)`, `myPosts()`), same convention as
  `feedKeys`/`friendKeys`.
- `useMyProfile()` — `GET /api/users/{userId}` with the caller's own id (`useAuthStore`).
- `useMySportProfilesRaw()` — thin wrapper over a new shared `useRawSportProfilesForUser(userId)`
  (extracted from `shared/hooks/useSportProfilesForUser.ts`, which now delegates to it), so the raw
  and SPORT-1-mapped queries share one cache entry per user instead of fetching twice.
- `useMyPosts()` — **not** `useUserPosts(userId)` as originally specced. Verified against the real
  `PostController` at pickup: there is no `GET /api/posts/user/{userId}`; the only "my posts"
  endpoint is `GET /api/posts/mine`, which derives the caller from the auth principal and takes no
  id param. Since this page is "own profile only" (`PROFILE_PAGE_DESIGN.md` §1) anyway, an
  arbitrary-user variant was never actually needed — `useMyPosts()` matches the real contract and
  the real scope exactly. **Delta for whoever reads the original epic/design text**: any reference
  to `useUserPosts(userId)` for this page means `useMyPosts()`.
- `useUserProfile(userId)` — **relocated** here from `features/friends/hooks/` (unchanged
  behavior/type/query key — still returns `FriendUser`, still keyed under `friendKeys.profile`).
  It's a generic "look up any user's public profile by id" concern, not friends-specific, and
  `/profile`'s own hooks need the same endpoint. `useFriendsPageData.ts` updated to import it from
  the new location.
- No `useUserPosts`/`hooks/` subfolder — every hook sits flat at the feature root, matching
  `home-feed`'s/`feed`'s page-data hooks rather than `friends`'/`groups`' nested `hooks/` style.

**`client/src/app/profilePageStore.ts`** — built exactly as specced, byte-for-byte the same shape as
`homeFeedStore.ts`.

**Backend fix (scope addition, user decision):** `UserResponse` (`modules/user/user-api`) was
missing `city`/`country` — `UserServiceImpl.toUserResponse()` (`modules/user/user-impl`) persisted
both via `updateProfile` but never mapped them back onto any GET response, since the DTO itself
never declared the fields. Confirmed via a sibling mapper (`searchUsers()`'s `UserSearchResponse`
does map them correctly) that this was a one-mapper oversight, not a deliberate omission. Fixed by
adding the two fields to `UserResponse` and mapping them in `toUserResponse()`; extended the
existing "toUserResponse should correctly map user with location" Spock case rather than adding a
new one. **Interacts with U11** (`modules/user/user-impl/docs/MVP/U11_...md`, `TODO`, not picked up
here) — U11 plans to narrow `GET /api/users/{userId}` (and its email/username siblings, all public
and unauthenticated) to a safe subset that already excludes `city`/`country`, so this fix grows that
endpoint's PII surface by two low-sensitivity fields only until U11 ships; U11's own doc now has a
2026-08-26 note recording this, confirming no rework is needed there. A genuinely self-only
`GET /api/users/me`-style endpoint (U11's own "flagged future gap" for exactly this Profile-page
scenario) was considered and deliberately **not** built here — out of scope for a scaffold ticket,
and `GET /api/users/{userId}` with the caller's own id works today; revisit if/when U11 is picked up.

**Follow-ups filed (user decision):** Friends borrowing `useUserProfile` (typed to its own narrower
`FriendUser`, off an endpoint now conceptually owned by a different feature) is real coupling this
ticket didn't want to resolve inline. Filed **U14** (backend,
`modules/user/user-impl/docs/BACKLOG_MVP.md`) and **FRIEND-2** (client,
`client/docs/BACKLOG_MVP.md`) to give Friends its own purpose-built contract — both explicitly
scoped to resolve against U11 first rather than duplicate its design.

**Verification:** new Vitest coverage for every hook and the store (`useMyProfile.test.tsx`,
`useMySportProfilesRaw.test.tsx`, `useMyPosts.test.tsx`, `profilePageStore.test.ts`); full client
suite green (`pnpm vitest run`), `tsc -b` clean, `pnpm lint` clean (2 pre-existing warnings in an
unrelated file, not touched here); backend `:modules:user:user-impl:test` and full `:server:test`
both green. No browser walkthrough — this ticket ships no UI (explicitly out of scope, confirmed
above), nothing to click through yet.
