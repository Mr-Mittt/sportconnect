# A9 · Fix `PostResponse` never populating `userFullName`/`sportName`/`shareCount`

**Status:** DONE (2026-07-13) · **Type:** Bug Fix · **Scope:** `PostServiceImpl.mapToResponse()` and its 10 call sites, plus a new cross-domain batch method on `sport-api`/`sport-impl`

## What this ticket does

`PostServiceImpl.mapToResponse()` never called `.userFullName(...)`, `.userAvatarUrl(...)`,
`.sportName(...)`, or `.shareCount(...)` on the `PostResponse` builder — all four fields always
serialized as `null`. Found and verified live (not just from reading code) while implementing the
client's FEED-0 ticket. Blocks FEED-1 (needs the author's name/avatar to render a feed) and any
sport-badge rendering on a post card.

## Approved design (Phase 3)

1. **New cross-domain capability**: `SportService.getSportsByIds(List<Long>): Map<Long, SportResponse>`
   added to `sport-api`, implemented in `sport-impl` via `sportRepository.findAllById(...)` (same
   "missing ids simply absent from the map" contract as `UserService.getUsersByIds`, which already
   existed).
2. **`post-impl/build.gradle`**: add `implementation project(':modules:sport:sport-api')` — this
   module had no dependency on the sport domain at all before this ticket.
3. **`PostServiceImpl`**: add `UserService`/`SportService` constructor fields; make `mapToResponse` a
   pure mapper (no cross-domain calls inside it) taking two new pre-resolved maps
   (`Map<UUID, UserResponse> usersById`, `Map<Long, SportResponse> sportsById`); add two batch
   helpers (`getUsersForPosts`, `getSportsForPosts`) mirroring the existing `getHashtagsForPosts`
   shape; update all 10 call sites — 6 paginated/batch methods build the maps once per page/batch,
   4 single-item methods (`createPost`, `getPostById`, `updatePost`, `updateBroadcastEndTime`) call
   the same batch helpers with a singleton `List.of(post)`, reusing `CommentServiceImpl.mapToResponse`'s
   established convention (even single-item lookups route through the batch method, not a second
   direct-call code path) rather than inventing a new pattern.
4. **Fallback behavior**: `userFullName` falls back to `"Unknown User"` when the author isn't found
   — identical string and reasoning to `CommentServiceImpl`'s existing fallback, kept consistent
   across both mappers rather than picking a different placeholder. `sportName` is `null` when
   `sportId` is null or doesn't resolve (no fallback string needed — the client already types this
   field nullable). `shareCount` is hardcoded `0L` — real sharing logic is out of scope, deferred to
   V1's `C6` ticket; this only fixes the field being `null` instead of a number.
5. **Tests**: update `PostServiceImplSpec`'s `@Subject` constructor and add `Mock()` fields for
   `UserService`/`SportService`, with default `>> [:]` stubs in `setup()` so all pre-existing tests
   keep passing unchanged (none of them asserted on these fields before — that's *why* the bug
   shipped silently). New cases assert the fields actually populate, the "Unknown User" fallback,
   the null-sportId-stays-null case, and `shareCount == 0`. Also added two new `SportServiceImplSpec`
   cases for `getSportsByIds` (found + missing-id cases).

## What was built

Matches the approved design exactly — no divergence during implementation.

## Follow-up filed during design review (not part of this ticket)

The user's own review flagged, correctly: sport data is effectively static at runtime (~12 seeded
rows, admin-only CRUD) — hitting Postgres for `getSportsByIds` on every single feed-page load across
every user is unnecessary DB load for near-immutable data. Filed as
`modules/sport/sport-impl/docs/BACKLOG_MVP.md` · **A5** ("Cache sport lookups") rather than building
caching into this bug-fix ticket — A9 ships with a plain, correct, uncached batch call; caching is a
deliberate, separately-scoped follow-up (needs its own decision on cache manager/eviction strategy).

## Verification

- `./gradlew :modules:social:post-impl:test`: all tests pass, including 5 new A9 cases.
- `./gradlew :modules:sport:sport-impl:test`: all tests pass, including 2 new `getSportsByIds` cases.
- `./gradlew build -x test`: whole server compiles clean (confirms no other module referenced the
  old `mapToResponse` signature or old `PostServiceImpl` constructor).
- N+1 check: `getUsersForPosts`/`getSportsForPosts` are called exactly once per page/batch, before
  the `.map()` — the `.map()` closures only do in-memory `Map.get()` lookups, no new per-item DB or
  cross-domain calls introduced.
- Live-backend verification (`./gradlew :server:bootRun` against the local dev Postgres/Redis):
  registered a real user, created a post with `sportId=1` — response now shows
  `"userFullName":"A9 QA Tester"`, `"sportName":"Badminton"`, `"shareCount":0` (all were `null`
  before this fix). Confirmed on both the single-item path (`POST /api/posts`, `GET /api/posts/{id}`)
  and the batched/paginated path (`GET /api/posts/feed`). Confirmed a post with no `sportId` still
  returns `"sportName":null` without erroring (no accidental `NullPointerException` from the new
  `sportsById.get(post.getSportId())` call when `sportId` itself is null — guarded before the map
  lookup, not after).
- **`./gradlew :server:test` (the actual `@SpringBootTest` integration layer) — initially missed,
  caught when explicitly asked "did you verify IT test?" after the first round of verification.**
  Running it surfaced a real failure: `PostControllerIntegrationTest.shouldCreatePost` went
  500 (`org.h2.jdbc.JdbcSQLSyntaxErrorException: Table "sports" not found`). Root cause: the test
  profile's `server/src/test/resources/schema.sql` is a hand-maintained, minimal H2 schema covering
  only what previous tests needed — `sports` was never in it, because nothing before A9 ever queried
  that table directly from a test-scoped code path (`getSportsByIds` is the first). Fixed by adding a
  `sports` table to `schema.sql`, mirroring the real Liquibase migration's shape (`V003__create_sports
  _tables.sql`) but with no seed data, consistent with every other table in that file (populated by
  the tests themselves, not pre-seeded). Re-ran `:server:test` in full afterward — all tests pass,
  not just the one that was failing.

## Key decisions

- **Reused `CommentServiceImpl`'s exact fallback pattern and single-code-path convention** rather
  than inventing a new one for `PostServiceImpl` — same `"Unknown User"` string, same
  batch-even-for-single-item routing.
- **Caching explicitly deferred**, not built speculatively — filed as its own ticket (sport-impl A5)
  per the user's direction during design review, since eviction/cache-manager choice is a real
  design decision that shouldn't be bundled into a bug fix.
- **`shareCount` gets a hardcoded `0`, not real logic** — post-sharing itself remains unimplemented
  (V1's `C6`); this ticket only fixes the field's nullness, consistent with A9's original scope.

---

**Status:** `DONE` (2026-07-13) · **Summary:** `modules/social/post-impl/docs/MVP/A9_POSTRESPONSE_MISSING_FIELDS.md`
**Type:** Bug Fix
**Scope:** `PostServiceImpl.mapToResponse()` (ended up touching all 10 call sites, plus a new
`sport-api`/`sport-impl` batch method and a new `post-impl` Gradle dependency — see summary doc)
**Found during:** client ticket FEED-0 (`client/docs/BACKLOG_MVP.md`), verified live against a
running backend (2026-07-13) — not assumed from reading code alone.

`PostServiceImpl.mapToResponse()` (~line 390) never calls `.userFullName(...)`,
`.userAvatarUrl(...)`, `.sportName(...)`, or `.shareCount(...)` on the `PostResponse.builder()` —
those four fields are simply absent from the builder chain, so they always serialize as `null`
(`shareCount` too, despite being conceptually a count — it's a boxed `Long`, not a primitive, so
it's `null` rather than `0`). Confirmed via three live calls: `POST /api/posts` (create),
`GET /api/posts/{id}`, and `GET /api/posts/feed` all return `"userFullName":null,
"sportName":null,"shareCount":null` for a real post from a user who genuinely has a full name, and
even with `sportId` explicitly set on create.

**Why `userFullName` matters most:** `CommentServiceImpl`'s own mapper (A5, `DONE`) correctly
resolves `userFullName` via `userService.getUserById(...)` — same live-verified test user's comment
came back `"userFullName":"Feed Zero QA"` on the identical account that got `null` from every Post
endpoint. This is a Post-specific gap, not a "the user has no name" data issue, and not something
CommentServiceImpl needs fixing too.

**Why this blocks client work:** `client/docs/BACKLOG_MVP.md`'s FEED-1 (Feed + PostCard, real) needs
`userFullName`/`userAvatarUrl` to render "who posted this" — currently unbuildable against the real
contract without a client-side workaround. `sportName` blocks any sport-badge rendering on a post
card that only has `sportId`. `shareCount` blocks the share-count display placeholder, though
post-impl's own module doc already notes share logic itself is unimplemented (V1 scope, `C6`) — this
ticket is just about the field existing and being non-null (e.g. `0`), independent of whether share
logic itself ships.

**Fix approach:**
- `userFullName`/`userAvatarUrl`: resolve via `userService.getUsersByIds(...)` (already used
  elsewhere in this module per A6/A7's batching convention) — batch across the page in each of the 5
  paginated callers of `mapToResponse` (same shape as A6's hashtag batching), pass the resolved
  `Map<UUID, UserResponse>` into the mapper rather than looking it up per-item inside it.
- `sportName`: resolve via the sport module's `-api` interface (check `modules/sport/sport-api`'s
  service for a `getSportsByIds`/`getSportById`-style batch method; add one if it doesn't exist,
  following the same cross-domain-batch convention).
- `shareCount`: set to `0L` (or the real query if `C6`/post-sharing has landed by the time this is
  picked up) rather than leaving the builder call absent.

**Tests:** Update `PostServiceImplSpec` wherever `mapToResponse`'s output is asserted — add explicit
assertions that `userFullName`/`sportName`/`shareCount` are non-null on a fresh post, not just that
the response builds without error (the bug shipped silently specifically because nothing asserted
these fields were populated).

---
