# Cursor Pagination for Feed-Shaped Endpoints

**Status:** Decided — design ready, implementation ticketed (`modules/social/post-impl/docs/BACKLOG_V1.md` · C12)
**Filed:** 2026-07-13, during a design discussion following client ticket FEED-0 and backend ticket C11
**Depends on:** C11 (`modules/social/post-impl/docs/BACKLOG_V1.md`) — Snowflake ID migration, must ship first

## Problem

Four of `post-impl`'s feed-shaped read endpoints — `GET /api/posts/feed`, `/mine`, `/broadcast`,
`/hashtag/{tag}`, `/group/{groupId}` — return Spring Data's `Page<PostResponse>`, backed by
`Pageable` (`PageRequest.of(page, size)`, i.e. `OFFSET n LIMIT size`). This is the wrong shape for
an infinite-scroll feed, for three concrete reasons:

1. **A `COUNT(*)` query on every request.** `Page.getTotalElements()`/`getTotalPages()` forces
   Spring Data to run a second query alongside the real one — on `findPersonalizedFeed`, an
   already-nontrivial join across friends/groups. An infinite-scroll UI never renders "page 7 of
   40," so this cost buys nothing and grows with the table.
2. **Offset pagination drifts under concurrent writes.** If a new post is inserted between two
   scroll fetches — the normal case for a live feed — the `OFFSET` shifts and the client can see a
   duplicate or skip a post entirely on the next fetch. This is a correctness bug, not just a perf
   concern.
3. **`OFFSET` cost grows with scroll depth.** Postgres still scans and discards every skipped row,
   so scrolling deep into a feed gets slower per page — the opposite of what an infinite-scroll UX
   wants.

The client already built around this shape (FEED-0): `PageResponse<T>` in
`client/src/features/feed/types.ts` mirrors `Page<T>`'s JSON exactly, and
`usePersonalFeed`/`useGroupFeed`/`usePostsByHashtag` (`client/src/features/feed/hooks/`) use
TanStack's `useInfiniteQuery` with a numeric `pageParam` and `getNextPageParam()`
(`client/src/features/feed/pagination.ts`) reading `PageResponse.number`/`.last`. That client
plumbing will need to change in lockstep with the backend (see "Client-side impact" below).

## Decision

Replace offset pagination with keyset ("cursor") pagination on the feed-shaped endpoints. Order by
a stable, unique key; the query becomes:

```sql
WHERE (sort_key, id) < (:lastSortKey, :lastId)
ORDER BY sort_key DESC, id DESC
LIMIT :size
```

No `COUNT(*)`, no drift under inserts (a cursor is a position relative to a specific row, not an
offset into a shifting result set), and flat cost per page regardless of scroll depth (an index on
`(sort_key, id)` seeks directly to the cursor position instead of scanning from the start).

## Relationship to C11 (Snowflake IDs) — why this depends on it, not just follows it

C11 migrates `Post`/`Comment`/`Hashtag` ids from `BIGSERIAL` to Snowflake ids
(`timestamp << 22 | workerId << 12 | sequence`), primarily to stop ids from being enumerable. A
Snowflake id is *also* monotonically increasing with creation time by construction — which changes
what the cursor key looks like per endpoint:

- **`/mine`, `/broadcast`, `/hashtag/{tag}`, `/group/{groupId}`** — all order by creation. Once
  C11 ships, `id` alone is a sufficient, collision-free, already-tie-broken cursor key: no separate
  timestamp column needed in the cursor at all.
- **`/feed` (`findPersonalizedFeed`)** — orders by `lastInteractionAt`
  (`PostRepository.java` — updated independently via `updateLastInteractionAt()` whenever a post
  gets a new like/comment), which drifts from creation order. A 2-year-old post bumped today sorts
  first despite having a small/old id. This endpoint needs a **compound cursor**
  `(lastInteractionAt, id)`, with `id` serving only as the tie-breaker for equal timestamps.
  Snowflake doesn't simplify this endpoint's cursor shape — it just makes the tie-breaker
  non-enumerable, same as everywhere else.

To be precise: `BIGSERIAL` is *also* monotonic, so cursor pagination is not literally blocked on
C11 — the dependency is about **sequencing, not feasibility**. If C12 shipped first against
`BIGSERIAL` ids and clients started persisting/bookmarking cursors built from those raw sequential
values, C11 landing afterward would change the meaning and comparability of every already-issued
cursor (old cursors encode a `BIGSERIAL` value; new rows get Snowflake values in a completely
different numeric range/ordering relative to old ones at the migration boundary). Shipping C11
first means C12 is designed against the final id scheme from day one — no transitional cursor
format, no migration-boundary edge case to handle.

## New shared component

`CursorPage<T>` / `CursorPageRequest`, in `modules/common` (same reasoning as `ApiResponse<T>` and
the C11 `SnowflakeIdGenerator` — both consuming endpoints, `post-impl` now, so it lives in the
shared module rather than being duplicated later when another domain needs it):

```java
public record CursorPage<T>(List<T> content, String nextCursor, boolean hasMore) {}
```

`nextCursor` is an opaque, base64-encoded string (not a raw column value) so the client never
parses or constructs it — same "opaque cursor" convention as Twitter/GitHub's APIs. Encoding is an
internal `post-impl` concern (e.g. `id` alone for the four creation-ordered endpoints,
`lastInteractionAt|id` for the feed) and can change without a client-facing contract change, as
long as the string stays opaque.

## Client-side impact — do not skip this note

Mirroring C11's own client-impact note: this is a breaking response-shape change for every
`useInfiniteQuery` hook built in FEED-0.

- `PageResponse<T>` (`client/src/features/feed/types.ts`) → replaced by a `CursorPageResponse<T>`
  matching `CursorPage<T>`'s JSON (`content`/`nextCursor`/`hasMore`).
- `getNextPageParam()` (`client/src/features/feed/pagination.ts`), currently typed
  `PageResponse<T> => number | undefined`, becomes `CursorPageResponse<T> => string | undefined`
  reading `nextCursor`/`hasMore` instead of `number`/`last`. Its dedicated unit test
  (`pagination.test.ts`) gets rewritten against the new shape, not just patched.
  `usePersonalFeed`/`useGroupFeed`/`usePostsByHashtag`/`useActiveBroadcasts`'s `pageParam` becomes
  a cursor string; the initial fetch passes no cursor (first page).
- Any MSW fixture/handler (`e2e/mocks/handlers/feed.ts`) simulating paginated responses needs the
  same shape change.
- File the actual client-side ticket when C12 is scheduled (per the doc convention, in
  `client/docs/BACKLOG_MVP.md` or whichever backlog is open by then) — not built here.

## Scope boundary with group-impl

`group-impl`'s own paginated endpoints (`getUserGroups`, `getGroupMembers`,
`getGroupJoinRequests`, `getGroupInvitations`, etc., all in `GroupController.java`) are bounded,
low-volume lists — members of a group, a user's own join requests — not infinite-scroll feed
surfaces. They keep `Page<T>`/offset pagination; this migration does not touch `group-impl`.

## Out of scope (this decision, not necessarily C12 the ticket)

- Comment pagination (`GET /api/posts/{postId}/comments`) — also offset-based today, but bounded
  per-post volume makes the `COUNT(*)`/offset-drift cost far less pressing than the feed
  endpoints. Candidate for a later, separate ticket if comment volume ever justifies it.
- Redis-backed feed caching (V1 `C8`, `BACKLOG_V1.md`) — orthogonal: caching decides *where* the
  feed is read from, cursor pagination decides *how* a page of it is bounded. Both can land
  independently in either order.
