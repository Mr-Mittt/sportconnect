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

*(To be defined when V1 planning begins. Suggested starting point based on dependencies:)*

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | C1 | Presigned S3 upload flow | `IDEA` |
| 2 | C2 | Post media (images + video) | `IDEA` |
| 3 | C3 | Comment image | `IDEA` |
| 4 | C4 | Comment quote | `IDEA` |
| 5 | C5 | Visibility enforcement | `IDEA` |
| 6 | C6 | Post sharing / repost | `IDEA` |
| 7 | C7 | Real-time comments (WebSocket) | `IDEA` |
| 8 | C8 | Personalized feed caching (Redis fan-out) | `IDEA` |
| 9 | C9 | EXIF strip + async malware scan | `IDEA` |
| 10 | C10 | Hashtag explore / browse page | `IDEA` |

---

## Tickets

*(Tickets will be written here with full detail during V1 planning. Reference the IDEA section above for scope and design decisions already made.)*
