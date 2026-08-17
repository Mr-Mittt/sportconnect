# Notification Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/notification` (new — `notification-api` + `notification-impl`)
**Last updated:** 2026-08-16

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

Design record: `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`. Ticket IDs use the `NTF-`
prefix, distinct from the `NOTIF-<n>` numbering used in `documentation/md/NOTIFICATION_USE_CASES.md`
(that file tracks candidate "should this notify" questions across the whole app; `NTF-` tracks this
module's own implementation work).

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | NTF-1 | Module scaffolding — entity, aggregation logic, read REST endpoints | `DONE` |
| 2 | NTF-2 | RabbitMQ consumer — `sportconnect.events` exchange, recipient resolution | `DONE` |
| 3 | NTF-3 | STOMP-over-RabbitMQ live delivery to the client | `DONE` |

---

## NTF-1 — Module scaffolding
**Status:** `DONE` — see `modules/notification/docs/NTF-1_MODULE_SCAFFOLDING.md`
**Type:** New Feature
**Depends on:** `C3` (`modules/common` — generic transactional-outbox mechanism)

**Delta (2026-08-17):** the Tests line below ("read endpoints reject a deactivated caller") was
scoped out before implementation, confirmed with the user — no endpoint anywhere in this app does
an explicit `isActive` re-check today (CLAUDE.md's U12 gap), and NTF-1 inherits that same gap
rather than being the first module to close it. What actually shipped instead:
`NotificationAccessGateIntegrationTest` (owner/non-owner/nonexistent/unauthenticated coverage for
`markAsRead`'s ownership gate). `entityId` also ended up a plain `String`, not implied by this
ticket's original text — `Post`/`Group`/`Session` use `Long` ids, `FriendRequest`/`Friendship` use
`UUID`, so a typed FK-like column wasn't viable across the entity types this can point at.

New `notification-api` (service interface + read-side DTOs) and `notification-impl` modules,
following the existing `-api`/`-impl` split convention.

**`Notification` entity** — replaces the dead `V005` `notifications` table (zero owning code today;
FKs reference `users(id)` directly, violating the ID-only cross-domain rule; `type`/`entity_type`
hardcoded to a stale enum). New migration drops the old table and creates a domain-owned
replacement:

- `id`, `recipientUserId` (UUID, no FK), `type`, `entityType`, `entityId` (ID-only, no FK)
- `actorIds` (bounded list, last 3 — the "X, Y and N others" data), `actorCount`
- `isRead` (boolean), `createdAt`, `updatedAt`

**Aggregation logic:** upsert keyed on `(recipientUserId, type, entityType, entityId)` where
`isRead = false` — bump `actorCount`/`actorIds`/`updatedAt` on a match; insert a new row otherwise.
Marking a row read closes that aggregation group; the next matching event starts a fresh row.

**Endpoints** (`ApiResponse<T>`, `ROLE_USER`, same `isActive` gating as every other authenticated
endpoint):
```
GET  /api/notifications                paginated, newest first
GET  /api/notifications/unread-count
PUT  /api/notifications/{id}/read
```

**Tests:** aggregation upsert (unread match bumps existing row; read row + new event starts a new
row); pagination/ordering. ~~read endpoints reject a deactivated caller~~ — see Delta above.

---

## NTF-2 — RabbitMQ consumer
**Status:** `DONE` — see `modules/notification/docs/NTF-2_RABBITMQ_CONSUMER.md`
**Type:** New Feature
**Depends on:** NTF-1

**Delta (2026-08-17):** scoped to session events only before implementation, confirmed with the
user — only `session-impl`'s SESSION-15 has a real producer; `post.*`/`group.*`/
`user.friend_request.*` consumption is deferred to follow-on tickets once `post-impl` B7,
`group-impl` B21, `user-impl` U13 ship real producers, matching the vision doc's session > post >
group > friend rollout priority. Also added, not in the original text: a `processed_messages`
dedup table (RabbitMQ redelivery would otherwise double-count an aggregation) and a
`SessionService.getParticipantIdsByStatuses` status gate (no fan-out notifications for a
`CANCELLED`/`COMPLETED` session).

One topic exchange, `sportconnect.events`, routing keys shaped `<domain>.<entity>.<action>`.
`notification-impl` declares its own durable queue bound to the patterns it cares about (e.g.
`post.*.created`, `group.join_request.*`, `session.*`, `user.friend_request.*`), consumed via
`@RabbitListener`. ~~(Shipped: `session.*.*` only — see Delta above.)~~

**Recipient resolution per event type:**
- Post like / comment on your post: post owner.
- Comment on a post you've also commented on: `{post owner} ∪ {distinct prior commenters} −
  {new commenter}` — needs a new `PostService.getDistinctCommenterIds(postId)` batch method on
  `post-api` (No-N+1 convention: one batch call, not a per-comment lookup).
- Group/session join-request/invite events, friend-request events: the single relevant counterpart
  (owner/admin, requester, invitee, inviter) as scoped in
  `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`.

Event payload DTOs live in each producing domain's own `-api` module (e.g. `CommentCreatedEvent` in
`post-api`) — `notification-impl` depends on each domain's `-api` to deserialize, same
cross-domain-via-`-api`-only rule as everywhere else in this codebase.

**Tests:** consumer upserts correctly per event type; recipient-set resolution for the
thread-participant case (dedup, excludes the new commenter); malformed/unroutable message handling.

---

## NTF-3 — STOMP-over-RabbitMQ live delivery
**Status:** `DONE` — see `modules/notification/docs/NTF-3_STOMP_LIVE_DELIVERY.md`
**Type:** New Feature
**Depends on:** NTF-2

**Delta (2026-08-17):** scope explicitly confirmed as *web, in-app, connected-session* delivery
only, after a mid-ticket architecture discussion — see
`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`'s hybrid-delivery decision and
`PROGRESS.md` §2.7 for the full rationale. STOMP-over-WebSocket structurally cannot reach a
backgrounded/closed mobile app (iOS forbids background WebSocket sessions outright; Android's Doze
mode is similarly hostile) — this is **not** a gap this ticket needs to close, and STOMP is not
meant to become a mobile solution. Mobile push notifications stay a separate, future,
not-yet-scoped ticket built on Firebase Cloud Messaging once the Phase 4-5 mobile phase starts, per
the vision doc's now-updated Client delivery bullet and its Open Questions section.

Spring WebSocket STOMP support in broker-relay mode, pointed at RabbitMQ's STOMP plugin instead of
the in-memory broker. Per-user delivery via Spring's `/user/queue/notifications` destination
convention — a separate exchange/purpose from `sportconnect.events`.

**New dev-infra requirement:** enable the `rabbitmq_stomp` plugin on the RabbitMQ image in
`infra/docker-compose.dev.yml` (not on by default).

**Tests:** integration test verifying a consumed event results in a STOMP frame on the recipient's
subscribed destination; client reconnect behavior is a `CLIENT-NOTIF-1` concern, not this ticket's.
