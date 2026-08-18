# U13 · Notification outbox wiring — friend request received/accepted

**Status:** `TODO`
**Type:** New Feature
**Depends on:** `modules/common`'s C3 (generic transactional-outbox mechanism)

**Filed:** 2026-08-16, from the notification-module vision session —
`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`. Closes the `// TODO: notify` stub
left in `UserFriendServiceImpl` since U1 (see U1's "Out of scope for MVP" — "Notification on friend
request received").

New outbox table (built on C3's `OutboxEvent` shape). An outbox row is written, in the same
transaction as the triggering write, for: `sendFriendRequest` (recipient: the receiver),
`acceptFriendRequest` (recipient: the original sender). `declineFriendRequest` deliberately does
**not** publish — reject stays silent, by explicit product decision. Routing keys:
`user.friend_request.created`, `user.friend_request.accepted` (feeding `modules/notification`'s
`sportconnect.events` consumer, NTF-2). Replaces the retired "new follower" concept — `user_follows`
is dead schema, already superseded by this friendship system (U1).

**Out of scope:** the notification consumer/aggregation logic itself (`modules/notification`'s
NTF-2); any UI change (a client ticket, once this and NTF-2/3 exist).

---
