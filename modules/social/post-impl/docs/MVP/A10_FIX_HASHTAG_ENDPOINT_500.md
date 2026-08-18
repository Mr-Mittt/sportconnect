# A10 · Fix `GET /api/posts/hashtag/{tag}` — always 500s

**Status:** `DONE` (2026-07-14)
**Type:** Bug Fix
**Scope:** `PostController.getPostsByHashtag()`, plus test-infra fixes surfaced while verifying
(`server/src/test/java/com/sportconnect/integration/PostControllerIntegrationTest.java`,
`server/src/test/resources/schema.sql`)
**Found during:** client ticket FEED-0, verified live against a running backend (2026-07-13).

## Root cause (confirmed, not guessed)

`PostHashtagRepository.findPostsByHashtag`'s `@Query` selects `ph.post` (type `Post`) from a
`PostHashtag ph` root, with its own static `ORDER BY ph.post.lastInteractionAt DESC`.
`PostController.getPostsByHashtag` additionally supplied `@PageableDefault(sort =
"lastInteractionAt", direction = Sort.Direction.DESC)`. Spring Data JPA appends a `Pageable`'s
`Sort` onto the query by resolving the property name against the query's **FROM root alias**
(`ph`, i.e. `PostHashtag`) — not the projected return type (`Post`). `PostHashtag` has no
`lastInteractionAt` field of its own, so Hibernate threw `UnknownPathException` trying to resolve
the dynamically-appended `ph.lastInteractionAt` on every single call, regardless of tag or whether
any post existed.

## Fix

Chose the smaller of the two options the ticket laid out (confirmed safe first): dropped the
conflicting default sort from the controller —

```java
@PageableDefault(size = 20) Pageable pageable
```

— and left `PostHashtagRepository.findPostsByHashtag` untouched; its existing static `ORDER BY`
is now the only ordering source, so nothing gets appended for Spring Data to mis-resolve.

**Confirmed safe before choosing this over restructuring the query:** the client's
`usePostsByHashtag` hook (`client/src/features/feed/hooks/usePostsByHashtag.ts`) only ever sends
`page`/`size` params, never a `sort` override — and `HashtagController`'s other two paginated
endpoints (`/suggest`, `/trending`) already use the same no-default-sort `@PageableDefault(size =
10)` pattern, so this isn't introducing a new convention, just aligning this endpoint with the
existing one.

## Test coverage added — and what it surfaced

No existing Spock coverage caught this because `PostServiceImplSpec` mocks the repository —
the bug lives in Hibernate's query-generation, which only a real `@SpringBootTest` MockMvc call
exercises. Added `PostControllerIntegrationTest.shouldReturnPostsByHashtagWithoutThrowing()`:
creates a real post with a `#hashtag` in its content, then hits `GET /api/posts/hashtag/{tag}` for
real and asserts `200` with the expected post in the response.

**Running this new test surfaced two more, unrelated pre-existing gaps, both fixed here rather
than left for a future session to rediscover independently:**

1. **`schema.sql` had no `groups`/`group_members`/`group_roles` tables at all.**
   `PostServiceImpl.getPostsByHashtag` calls `groupService.getGroupIdsForMember(currentUserId)`
   for any authenticated caller (to also include the caller's own `GROUP_POST`s in hashtag
   results) — a real, unmocked cross-domain call in this test. No test in `:server:test` had ever
   exercised a real (non-mocked) `GroupService` call before, so this gap existed silently.
   `GroupControllerTest` (which passed already) is a `@WebMvcTest`-style controller test with the
   service layer mocked, not a real repository round-trip. Added minimal, faithful versions of
   `group_roles` (seeded, matching the real `group_roles` migration's 3 rows), `groups`, and
   `group_members` to `schema.sql`, mirroring the real Liquibase migrations
   (`V007`/`V008`/`V009`, plus `V014`/`V015`'s later `rules`/`schedule`/`sport_id` columns folded
   into the single `CREATE TABLE`, matching how this file already flattens every other table to
   its final shape) — same pattern as A9's `sports` table fix.
2. **The `group_roles` seed `INSERT` broke context reuse across test classes.** The H2 instance
   backing `:server:test` persists across separate `@SpringBootTest` context loads within the same
   suite run (confirmed: `schema.sql` re-executes per context, and a second execution hit a
   `JdbcSQLIntegrityConstraintViolationException` on the seed rows' primary key) — nothing else in
   this file seeds data, so this class of collision never existed before. Switched the seed insert
   to H2's `MERGE INTO ... KEY(id)` (idempotent upsert) instead of a plain `INSERT`.

## Tests

- `./gradlew :modules:social:post-impl:test` — green (no repository/service test changes needed;
  the bug was purely in the controller's `Pageable` default, not in `post-impl`'s own logic).
- `./gradlew :server:test` — 28/28 green, including the new
  `shouldReturnPostsByHashtagWithoutThrowing` test and the pre-existing
  `PostControllerIntegrationTest.shouldCreatePost`.

## Out of scope (unchanged from the ticket)

No change to what data is returned or how it's ordered — same `lastInteractionAt DESC` ordering,
same visibility rules (public `USER_FEED` + caller's-group `GROUP_POST`s). Pure bug fix.

---

**Status:** `DONE` (2026-07-14) · **Summary:** `modules/social/post-impl/docs/MVP/A10_FIX_HASHTAG_ENDPOINT_500.md`
**Type:** Bug Fix
**Scope:** `PostHashtagRepository.findPostsByHashtag`, `PostController.getPostsByHashtag`
**Found during:** client ticket FEED-0, verified live against a running backend (2026-07-13).

`GET /api/posts/hashtag/{tag}` throws `org.hibernate.query.sqm.UnknownPathException` for **every**
call, with or without a leading `#`, with or without any posts existing — confirmed via two live
calls (`%23feed0check` and `feed0check`, both 500). Root cause, read directly from the runtime error
and the repository source:

- `PostHashtagRepository.findPostsByHashtag`'s `@Query` already has its own static
  `ORDER BY ph.post.lastInteractionAt DESC`.
- `PostController.getPostsByHashtag`'s `@PageableDefault(size = 20, sort = "lastInteractionAt",
  direction = Sort.Direction.DESC)` supplies a `Pageable` that ALSO carries a `Sort`.
- Spring Data JPA appends the `Pageable`'s `Sort` properties onto the query as an *additional*
  `ORDER BY` clause, resolved against the query's root entity — which here is `PostHashtag ph`, not
  `Post`. The generated query ends up as `ORDER BY ph.post.lastInteractionAt DESC,
  ph.lastInteractionAt desc` — and `PostHashtag` has no `lastInteractionAt` field of its own (only
  `Post` does, already correctly referenced via `ph.post.lastInteractionAt` in the static clause).
  Hibernate throws immediately trying to resolve the second, dynamically-appended path.

**Why this blocks client work:** `client/docs/BACKLOG_MVP.md`'s FEED-6 (TrendingHashtags, real) and
its `usePostsByHashtag` hook (FEED-0) are typed and wired correctly against the documented contract,
but this endpoint cannot return data at all today — not a data-shape issue like A9, a hard 500 on
every call.

**Fix approach (pick one):**
1. Remove the static `ORDER BY` from the `@Query` and rely solely on the `Pageable`'s `Sort` — but
   the `Sort` property name (`"lastInteractionAt"`) would then need to resolve against `Post` (the
   method's actual return type), not `PostHashtag` (the `FROM` root) — likely needs the query
   restructured to select from `Post` with a `WHERE EXISTS (... PostHashtag ...)` subquery instead of
   `FROM PostHashtag`, so Spring Data's sort-property resolution lines up with the returned type.
2. Keep the static `ORDER BY` and stop the controller from supplying a conflicting default `Sort` for
   this specific endpoint — e.g. a plain `@PageableDefault(size = 20)` with no `sort`, so Spring Data
   has nothing to append. Simpler, smaller diff — verify no other caller depends on
   `getPostsByHashtag`'s pagination honoring a client-supplied sort override before choosing this.

**Tests:** No existing Spock coverage caught this (confirmed no test currently exercises this
endpoint against a real query — add one). Add a `PostServiceImplSpec`/integration test that actually
calls `getPostsByHashtag` end-to-end (not just mocking the repository) so a future regression here
fails a test instead of only surfacing via manual/live verification again.

---
