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
