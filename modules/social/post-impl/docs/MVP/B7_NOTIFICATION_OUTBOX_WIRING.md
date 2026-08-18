# B7 · Notification outbox wiring

**Status:** `TODO`
**Type:** New Feature
**Depends on:** `modules/common`'s C3 (generic transactional-outbox mechanism)

**Filed:** 2026-08-16, from the notification-module vision session —
`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`.

New `post_outbox_events` table (this module's own, built on C3's `OutboxEvent` shape). An outbox row
is written, in the same transaction as the triggering write, for: a post gets liked, a post gets a
new comment, a comment gets a reply. Routing keys: `post.like.created`, `post.comment.created`,
`post.comment.replied` (feeding `modules/notification`'s `sportconnect.events` consumer, NTF-2).

**New cross-domain read method (`post-api`):** `getDistinctCommenterIds(postId)` — batch lookup of
every distinct user who has commented on a post, used by `notification-impl` to resolve the
thread-participant recipient set (`{post owner} ∪ {distinct prior commenters} − {new commenter}`)
without a per-comment N+1 call.

**Out of scope:** the notification consumer/aggregation logic itself (`modules/notification`'s
NTF-2); "new follower" notifications — `user_follows` is dead schema, not wired to anything here.

**Dependencies:**
```
A1 → A2, A3, B1
B1 → B2
A5: no hard dependency (can run any time)
All others: no hard dependency (can run in parallel after A1)
```

---
