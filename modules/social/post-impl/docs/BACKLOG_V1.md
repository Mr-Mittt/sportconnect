# Post Module — V1 Feature Backlog

**Version:** V1  
**Module:** `modules/social/post-impl`  
**Last updated:** 2026-06-30  
**Prerequisite:** All MVP tickets (A1–A4, B1–B6) must be `DONE` before starting V1.

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon post v1` to resume

---

## IDEA Section — All Deferred from MVP

Everything below was discussed during the Post MVP brainstorm (2026-06-30) and explicitly deferred. Review this section when planning V1 to ensure nothing is missed. Each item becomes one or more tickets once V1 planning begins.

---

### Media Support

**Post media (images + videos)**  
`PostMedia` entity and `post_media` table already exist. MVP posts are text-only. V1 adds full media support:
- Switch from raw `mediaUrls: List<String>` to a presigned S3 URL upload flow (`POST /api/media/upload-url` returns presigned URL + `mediaId`; client uploads directly to S3; server stores resolved URLs)
- Client sends `mediaId` list in `CreatePostRequest` instead of raw URLs
- `mediaType` declared by client (`image` or `video`) — server validates enum
- Max 10 media items per post
- Video: server-side or Lambda-triggered thumbnail generation (store `thumbnailUrl` in `PostMedia`)
- Image: resize to multiple sizes (thumbnail, medium, full) via Lambda on S3 upload event

**Comment image**  
MVP comments are text-only. V1 adds a single image per comment:
- Add `media_url VARCHAR(500)` column to `comments` table (Liquibase migration)
- Add `mediaUrl` field to `CreateCommentRequest` and `CommentResponse`
- Same presigned S3 upload flow as post media
- Image only (no video for comments)

**EXIF metadata strip**  
When images are uploaded, strip EXIF data to remove GPS coordinates, device info, and other privacy-sensitive metadata. Implement as part of the S3 Lambda processing pipeline triggered on upload.

**Async malware scanning**  
After file lands in S3, trigger a Lambda that runs ClamAV (or AWS GuardDuty Malware Protection) on the file. If infected: delete from S3, invalidate the `mediaId` in DB, notify the user. Do NOT block upload — scan runs async after accepting.

---

### Comment Features

**Comment quote**  
Allow a user to quote (reference) an existing comment or reply when writing a new comment:
- Add `quoted_comment_id BIGINT` (nullable, FK → `comments.id`) to `comments` table (Liquibase migration)
- Add `quotedCommentId` to `CreateCommentRequest` (optional)
- `CommentResponse` embeds a `quotedComment` snippet (author + truncated content, max 100 chars)
- If the quoted comment is soft-deleted, show "This comment has been deleted" placeholder
- Either root comments or replies can be quoted
- Validate `quotedCommentId` exists (not necessarily active — show placeholder if deleted)

---

### Post Features

**Post sharing / repost**  
`post_shares` table already exists in V004. MVP deferred all sharing logic:
- **Re-post to own feed** — creates a new `USER_FEED` post referencing the original (`original_post_id` field)
- `POST /api/posts/{postId}/share` — records a share event, returns updated `shareCount`
- `shareCount` in `PostResponse` derived from `COUNT(post_shares WHERE post_id = ?)` (currently always 0)
- Decide: can users share GROUP_POSTs to their personal feed? (TBD during V1 planning)

**Visibility enforcement**  
`visibility` field is stored (`public`, `friends`, `private`) but unenforced in MVP. V1 enforces:
- `public` — visible to everyone in feed, hashtag browse, search
- `friends` — visible only to ACCEPTED friends + the author; filtered out of public feed, search, hashtag results for non-friends
- `private` — author only; never appears in anyone else's feed
- Requires friendship system (MVP B1) to already be in place
- Update all feed and search queries to apply visibility filter based on caller's relationship to the post author

---

### Performance

**Personalized feed caching**  
MVP B2 fetches the personalized feed from DB on every request. At scale (many friends, many groups) this becomes expensive. V1 caches each user's feed:
- On `createPost()`: fan-out the post to each follower/friend's Redis feed list (Sorted Set keyed by `user:{userId}:feed`, score = `last_interaction_at`)
- On feed load: read from Redis Sorted Set; fall back to DB query if cache miss
- Invalidate on `deletePost()`, `likePost()`, `createComment()` (updates `last_interaction_at` score)
- Fan-out is async (publish to Redis Pub/Sub or a queue; a background consumer writes to each friend's feed list)
- Cap feed list at 500 most recent entries per user

---

### Real-Time

**Real-time comments on post detail popup**  
When a user opens a post detail popup, new comments and likes should appear without refreshing:
- **Server:** Spring WebSocket + STOMP. Add `websocket` dependency to `server/build.gradle` (already listed as planned in PROGRESS.md).
- **Broker:** Redis Pub/Sub as the WebSocket message broker (scales across server instances).
- **Topic per post:** `/topic/post/{postId}` — broadcast `CommentResponse` when a new comment is created.
- **Client:** subscribe to `/topic/post/{postId}` on popup open; append incoming comments to the list; unsubscribe on popup close.
- Events to broadcast: `COMMENT_CREATED`, `COMMENT_DELETED`, `LIKE_UPDATED` (with new count).
- Also broadcast `like_count` updates when `likePost()` / `unlikePost()` is called on a post currently being viewed.

---

### Hashtag Display

**Explore / hashtag browse page**  
MVP ticket B5 implements hashtag extraction + trending + suggest + posts-by-hashtag endpoints. The display surface (where users browse/click hashtags) was deferred:
- Decide during V1 planning: dedicated `/explore` page, trending sidebar widget, or inline hashtag feed within the main feed
- Frontend: clicking a `#tag` in post content navigates to `GET /api/posts/hashtag/{tag}` results
- Frontend: trending hashtags widget (calls `GET /api/hashtags/trending`)
- Consider: hashtag following — user follows a hashtag, posts with that tag appear in their feed

---

## Implementation Order

*(C1–C10 below are still at the IDEA stage, order TBD. C11 is fully specified and ready to start.)*

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | C11 | Migrate Post/Comment/Hashtag ids to Snowflake IDs | `TODO` |
| 2 | C1 | Presigned S3 upload flow | `IDEA` |
| 3 | C2 | Post media (images + video) | `IDEA` |
| 4 | C3 | Comment image | `IDEA` |
| 5 | C4 | Comment quote | `IDEA` |
| 6 | C5 | Visibility enforcement | `IDEA` |
| 7 | C6 | Post sharing / repost | `IDEA` |
| 8 | C7 | Real-time comments (WebSocket) | `IDEA` |
| 9 | C8 | Personalized feed caching (Redis fan-out) | `IDEA` |
| 10 | C9 | EXIF strip + async malware scan | `IDEA` |
| 11 | C10 | Hashtag explore / browse page | `IDEA` |

---

## Tickets

*(C1–C10: to be written with full detail during V1 planning. Reference the IDEA section above for scope and design decisions already made.)*

### C11 · Migrate Post/Comment/Hashtag ids to Snowflake IDs
**Status:** `TODO` · **Type:** Enhancement (Architecture) · **Filed:** 2026-07-13, during client ticket FEED-0
**Companion ticket:** `modules/social/group-impl/docs/BACKLOG_V1.md` · A1 (Group/GroupMember — same generator, separate module)

#### Motivation

`Post`, `Comment`, `Hashtag` (and `PostMedia`/`PostLike`/`PostHashtag`/`CommentLike`) currently use
`@GeneratedValue(strategy = GenerationType.IDENTITY)` / Postgres `BIGSERIAL` — plain sequential
auto-increment. Two real costs of this, surfaced while scoping the client's FEED-0 ticket:

1. **Enumerable ids.** A sequential `postId`/`commentId` lets an authenticated caller infer content
   volume/growth by incrementing (access itself is still permission-gated by existing
   membership/ownership checks — this is an information-disclosure concern, not an authorization
   bypass).
2. **Not safely mergeable across independent generators.** This repo is explicitly
   "monolith-first, microservice-ready" (root `CLAUDE.md`) — if `post`/`group` are ever extracted
   into separate services, two independent auto-increment sequences can collide. Snowflake IDs
   (time + worker-id + sequence, packed into a 64-bit `long`) are collision-free across independent
   generators with no coordination, while staying wire-compatible with the existing `BIGINT` columns
   and every existing FK (`post_id`, `comment_id` etc. — confirmed via the migration changelogs,
   all already `BIGINT`, so **no column-type or FK changes needed anywhere**).

`User` already uses a UUID id (`GenerationType.UUID`) — that split (identity/security-sensitive →
UUID, high-volume content → sequential) was inherited from the earliest migrations (V001 vs. V004+)
with no documented rationale anywhere in the repo (checked `PROGRESS.md`, `documentation/md/`,
module docs, session logs) — this ticket doesn't touch `User`, only the sequential side.

#### Design

**New shared component — lives in `modules/common`, not `post-impl`,** since both this ticket and
the companion Group ticket need the exact same generator (cross-cutting utility, same reasoning
`ApiResponse<T>` and the shared exception types already live in `common`, not duplicated per
domain). This ticket builds it; the Group companion ticket reuses it as-is.

- `com.sportconnect.common.id.SnowflakeIdGenerator` — Hibernate 6.3
  (`org.hibernate.id.IdentifierGenerator` custom implementation, confirmed as the running Hibernate
  version via `bootRun` logs). Packs `(timestamp_ms - customEpoch) << 22 | (workerId << 12) |
  sequence`. Worker id hardcoded to `0` for now — this monolith runs as a single instance today, so
  the classic Snowflake multi-writer coordination problem doesn't exist yet; hardcoding it (rather
  than building config-driven worker-id assignment) avoids solving a problem this deployment doesn't
  have. Revisit only when/if this becomes an actual multi-instance deployment.
- Swap `@GeneratedValue(strategy = GenerationType.IDENTITY)` → the new generator on: `Post`,
  `Comment`, `Hashtag` (client-facing, required). Optionally also `PostMedia`, `PostLike`,
  `PostHashtag`, `CommentLike` for full consistency within this module — these are never serialized
  to the client, so this part is a "nice to have for consistency," not required to unblock anything.
- `IDENTITY` relies on the DB assigning the value *after* insert; a Snowflake id must be assigned by
  the app *before* insert. This is a strategy change, not just an annotation swap — the id needs to
  be set on the entity (via the custom generator, wired the standard Hibernate way) before
  `save()`/`persist()`.
- **JSON safety (the part that actually matters for the client):** a real Snowflake value can exceed
  `Number.MAX_SAFE_INTEGER` (2^53-1) within a few years of any chosen epoch — a JS/TS client parsing
  a raw large integer JSON literal silently loses precision. Twitter's own API solves this by also
  emitting an `id_str` field; the simpler fix here is `@JsonSerialize(using =
  com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)` directly on the `Long id` (and
  `postId`, `groupId`, `parentCommentId` etc.) fields in `PostResponse`, `CommentResponse`,
  `HashtagResponse`, `PostMediaResponse` — the id becomes a JSON *string* on the wire, not a number.
  **This must ship in the same PR as the generator swap** — shipping the id-format change without
  the serializer change would silently corrupt ids for any client parsing them as JS numbers.
- No production data exists yet (dev-only MVP) — no backfill/migration script needed.

#### Client-side impact — do not skip this note

The client's FEED-0 ticket (`client/docs/BACKLOG_MVP.md`) types `Post.id`, `Comment.id`/`postId`/
`parentCommentId`, `Hashtag.id` as **`number`**, a deliberate decision to proceed with the simplest
correct type for the *current*, still-`BIGSERIAL` backend — made explicitly aware that this ticket
existing would eventually require revisiting it. **When this ticket ships, a follow-up client
ticket must change those fields from `number` to `string`** (matching the `ToStringSerializer`
change above) and fix every downstream callsite: query-key params (`groupFeed(groupId: number)` →
`string`), MSW fixture literals (`id: 123` → `id: '123'`), any numeric id comparisons/sorts, and
test assertions — across FEED-0 itself and everything built on it by then (FEED-1/2/3/6/8/9,
potentially more). `tsc -b` will surface every callsite mechanically (not a silent-bug risk, just
real churn) — file that follow-up ticket in `client/docs/BACKLOG_MVP.md` (or the next client
version's backlog, if MVP is closed by then) when this one is scheduled, don't fold it in here.

#### Out of scope

- `User`'s UUID id — unaffected, not part of this ticket.
- Config-driven multi-worker-id support — hardcoded `workerId = 0` is correct for the current
  single-instance deployment; revisit only if/when this actually runs as multiple instances.
- The client-side type change itself — tracked as a follow-up client ticket once this ships, not
  built here.
- Backfilling existing rows — no production data exists to backfill.

#### Tests

- Unit test for `SnowflakeIdGenerator` itself (uniqueness under rapid sequential calls within the
  same millisecond, monotonic-ish ordering, fits in a signed 64-bit range).
- Update `PostServiceImplSpec`/`CommentServiceImplSpec`/hashtag specs wherever a literal id value
  (e.g. `1L`) is currently asserted — Snowflake-generated ids won't be small sequential numbers
  starting at 1, so any test relying on that needs to assert against the id the generator actually
  returned, not a hardcoded literal.
- Confirm `PostResponse`/`CommentResponse`/`HashtagResponse` serialize `id` fields as JSON strings
  (integration test hitting a real controller, checking the raw JSON body — not just the
  deserialized Java object, which would hide a missing `@JsonSerialize` annotation).
