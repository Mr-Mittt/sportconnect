# A12 · Remove `PostResponse.sportName`

**Status:** `DONE` (2026-08-10)
**Type:** Enhancement (Efficiency) · Breaking contract change (coordinated backend + client)
**Filed:** 2026-07-25, raised while scoping `group-impl`'s B15 (`modules/social/group-impl/docs/BACKLOG_MVP.md`)

## Background

A9 (`modules/social/post-impl/docs/A9_POSTRESPONSE_MISSING_FIELDS.md`) added `PostResponse.sportName`,
resolved server-side via a batched `SportService.getSportsByIds()` call, because at the time the
client had no other way to turn a post's `sportId` into a display name. B15 later shipped
`GroupInvitationResponse.sportId` *without* an equivalent `sportName` — sports are static reference
data, and by B15's time the client already had `useSportCatalog()` (SPORT-3) fetching
`GET /api/sports` once and caching it. A12 was filed to ask whether that same reasoning now applies
retroactively to A9's `sportName` field, given it's a live, shipped field with a real consumer
(unlike B15's brand-new one) — the ticket's own text set the bar as "confirm the client already
resolves sport locally before touching code."

## What was resolved before any code changed

Traced the actual client rendering path for a post's sport badge:

- `client/src/shared/hooks/useSportCatalog.ts` (SPORT-3) fetches `GET /api/sports` once per session
  and mirrors it into `sportCatalogStore` for synchronous access.
- `client/src/features/feed/sportIdMap.ts`'s `sportKeyForId()` reads that store directly.
- `client/src/shared/components/Feed.tsx:152` resolves each post's badge via
  `sportKeyForId(post.sportId)` — `PostCard`'s `sport` prop is built entirely from `sportId`, never
  from `post.sportName`.
- `client/src/features/feed/types.ts`'s `Post.sportName` field existed in the type but was read
  nowhere; its only comment was stale pre-A9 text ("never populated today, same bug").

Confirmed: `sportName` had been dead weight on the wire since SPORT-3 shipped, well before this
ticket was filed. User decision: remove it now, both sides, in one session — no coordination gap to
worry about since the client provably never depended on it.

## What was built

**Backend (`post-api`/`post-impl`):**
- Removed `PostResponse.sportName` (`modules/social/post-api/.../dto/PostResponse.java`).
- Removed `SportService`/`SportResponse` from `PostServiceImpl` entirely — the `getSportsForPosts()`
  batch-lookup helper (A9's cross-domain call), the `SportService sportService` field, both imports,
  and the `sportsById` parameter/argument threaded through `mapToResponse()` and all 8 of its call
  sites (`createPost`, `getPostById`, `getPostsByIds`, `getUserPosts`, `getPersonalizedFeed`,
  `getGroupPosts`, `getPostsByHashtag`, `getActiveBroadcasts`, `updatePost`,
  `updateBroadcastEndTime`).
- Removed the now-unused `implementation project(':modules:sport:sport-api')` line from
  `post-impl/build.gradle` — confirmed via grep that `PostServiceImpl` was the only production class
  in this module importing `sport-api`.
- `SportService.getSportsByIds()` itself (`sport-api`) is untouched — `location-impl` and
  `session-impl` still call it for their own `sportName` enrichment; only `post-impl`'s usage was
  removed.
- Updated `PostServiceImplSpec.groovy`: removed the `SportService` mock, its constructor arg, its
  `setup()` stub, and the two now-obsolete tests (`"createPost resolves sportName..."`,
  `"createPost leaves sportName null..."`).

**Client (`client/src/features/feed/types.ts` and all references):**
- Removed `Post.sportName` from the `Post` interface; updated the `userFullName`/`shareCount`
  never-populated-bug comment (now fixed, historical) to no longer mention `sportName`; added a note
  on `sportId` documenting it's the only sport reference on the wire by design.
- Swept every `sportName:` reference across the codebase and removed only the ones on an actual
  `Post`-shaped object (identified by neighboring `postType`/`previewComments`/`broadcastEndTime`
  fields) — 21 files across `client/src` plus 2 files under `client/e2e/mocks/`
  (`fixtures.ts`'s `mockPost`/`mockBasketballPost`, `paginatedFeedFixture.ts`'s
  `buildPaginatedFeed()`).
- **Explicitly left untouched:** `sportName` on `Session`, `Location`, and `SportProfile`
  (`UserSportProfileResponse`)-shaped fixtures — those are separate, real DTO fields with active
  consumers (e.g. `SessionListCard.tsx:32`, `UpcomingMatches.tsx:99`,
  `discoverSearch.ts:21` all read `session.sportName`/`match.sportName` directly). Verified each
  ambiguous occurrence's surrounding fields individually before deciding in/out of scope, rather than
  bulk-deleting every `sportName:` line in a file.

## Verification

- `./gradlew :modules:social:post-impl:compileJava :modules:social:post-api:compileJava` — clean;
  `sport-api`/`sport-impl` no longer appear in the task graph, confirming the dependency is actually
  gone, not just unused.
- `./gradlew :modules:social:post-impl:test` — pass.
- `./gradlew :server:test` — pass, including `PostControllerIntegrationTest.shouldCreatePost` and
  `shouldReturnPostsByHashtagWithoutThrowing` (real DB, real Redis).
- `pnpm exec tsc -b` (client) — clean.
- `pnpm test -- --run` (client Vitest) — 793/793 tests pass across 118 files.
- `pnpm exec playwright test --project=e2e` on the 3 flow specs that reference the touched fixtures
  (`a11y.spec.ts`, `feed-groups-journey.spec.ts`, `home-feed-journey.spec.ts`) — 12 failed / 14
  passed, all 12 failures a `page.waitForURL` timeout inside `seedAuthenticatedSession`
  (`e2e/mocks/fixtures.ts:725`, the shared login helper every one of these specs calls first).
  **Confirmed pre-existing and unrelated to this change**: `git stash`ed A12's diff entirely and
  re-ran the identical 3 specs against the untouched pre-A12 code — same 12 failures, same failure
  point, same pass count (14 passed). Restored the stash afterward (`git stash pop`). Root cause is
  environmental (this sandbox's Playwright/mock-server login timing), not a login-adjacent regression
  from touching `Post`-shaped fixtures — nothing in A12's diff touches the auth handler or
  `seedAuthenticatedSession` itself. Not investigated further as out of scope for this ticket; worth
  a separate look if it reproduces outside this sandbox.

## Out of scope

No change to `sportId` itself, `GroupInvitationResponse` (B15 already shipped `sportId`-only, no
`sportName`, untouched here), or any `Session`/`Location`/`SportProfile` DTO — all three have their
own real `sportName` fields with real consumers, confirmed individually, not assumed.
