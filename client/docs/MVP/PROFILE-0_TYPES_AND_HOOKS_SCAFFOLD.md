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
