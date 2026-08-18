# B21 · Notification outbox wiring

**Status:** `TODO`
**Type:** New Feature
**Depends on:** `modules/common`'s C3 (generic transactional-outbox mechanism)

**Filed:** 2026-08-16, from the notification-module vision session —
`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`.

New `group_outbox_events` table (this module's own, built on C3's `OutboxEvent` shape). An outbox
row is written, in the same transaction as the triggering write, for: a join request is received
(recipient: owner/admins), a join request is approved or rejected (recipient: the requester), a
group invitation is sent (recipient: the invitee), an invitation is accepted or declined (recipient:
the inviter). Routing keys: `group.join_request.created`, `group.join_request.approved`,
`group.join_request.rejected`, `group.invitation.created`, `group.invitation.accepted`,
`group.invitation.declined` (feeding `modules/notification`'s `sportconnect.events` consumer,
NTF-2).

**Out of scope:** the notification consumer/aggregation logic itself (`modules/notification`'s
NTF-2); any UI change (a client ticket, once this and NTF-2/3 exist).

---
