# U13 · Notification outbox wiring — friend request received/accepted

**Status:** `DONE` (2026-08-28)
**Type:** New Feature
**Module:** `modules/user` (+ `modules/notification`, `server`)
**Depends on:** `modules/common`'s C3 (generic transactional-outbox mechanism), `modules/notification` NTF-1/NTF-2 (consumer scaffolding + pattern)

Closes the `// TODO: notify receiver` stub in `UserFriendServiceImpl` (open since U1 — see U1's
"Out of scope for MVP"). From the notification-module vision session
(`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`).

---

## Design (approved plan, restated)

An outbox row is written **in the same transaction as the triggering friend-request write**, then
drained to the `sportconnect.events` RabbitMQ exchange by a `@Scheduled` relay, and consumed by
`modules/notification` into a `Notification` row + live STOMP ping. This is the exact shape
`session-impl`'s SESSION-15 established; U13 is its direct analog for the friend domain.

Three scope decisions were locked in with the user before implementation, none resolved by the
ticket's original text:

1. **The relay is in scope** — `UserOutboxRelayJob` (`@Scheduled(fixedDelay=10000)`, own
   `OutboxRelay<UserOutboxEvent>` per tick) actually drains `user_outbox_events` and publishes,
   rather than rows accumulating `PENDING` until a later ticket adds a relay. Same reasoning as
   SESSION-15.

2. **Notify on *every* transition into `PENDING`, not just a fresh insert.** `friend_requests` has
   `UNIQUE(sender_id, receiver_id)` — one row per directed pair, forever; decline/cancel/unfriend
   only flip `status`. So a re-send after a `DECLINED`/`CANCELLED`/stale-`ACCEPTED` outcome
   *reactivates* the existing row back to `PENDING` (the U9 fix) instead of inserting a new one.
   From the receiver's side a reactivated request is indistinguishable from a first-time one — a
   pending request they now need to act on — so `user.friend_request.created` is written from
   **both** the fresh-insert branch and the reactivation branch of `sendFriendRequest`. Spam is not
   a concern: `NotificationServiceImpl.recordEvent` aggregates by
   `(recipient, type, entityType, entityId)` while unread, so repeat re-sends from the same sender
   collapse into one notification with `actorCount` incrementing.

3. **The consumer side is in scope for this ticket** (unlike `post-impl` B7 / `group-impl` B21,
   whose consumption stays deferred). `modules/notification` gains a real `user.*` queue + binding +
   consumer + processor now. The **client-side** rendering (the `NotificationType` union +
   `getNotificationText` cases) is the one piece deferred — to a `CLIENT-NOTIF-*` follow-on ticket.

**Event / recipient mapping:**

| Routing key | Written from | `actorId` | `recipientUserId` |
|---|---|---|---|
| `user.friend_request.created` | `sendFriendRequest` — fresh insert **and** reactivation branch | sender | receiver |
| `user.friend_request.accepted` | `establishFriendship` — covers explicit `acceptFriendRequest` **and** the U10 crossed-request auto-accept | the accepter (`request.receiverId`) | the original requester (`request.senderId`) |

`declineFriendRequest` / `cancelFriendRequest` / `removeFriend` write nothing — reject stays silent
by explicit product decision.

The crossed-request path was verified to map correctly: there `establishFriendship` is called with
the *reverse* row, whose `senderId` is the person who was waiting (→ recipient) and whose
`receiverId` is the caller who just reciprocated (→ actor).

---

## What was built

### `modules/common`
No changes — `OutboxEvent` / `OutboxEventStatus` / `OutboxRelay<T>` used as-is.

### `modules/user/user-api` — new `com.sportconnect.user.api.event` package
- `FriendRequestCreatedEvent` (`requestId`, `actorId`, `recipientUserId`)
- `FriendRequestAcceptedEvent` (`requestId`, `actorId`, `recipientUserId`)

Both single-recipient (recipient known at write time), mirroring `session-api`'s
`SessionJoinRequestCreatedEvent`. In `-api` so `notification-impl` can deserialize them.

### `modules/user/user-impl`
- **`V060__create_user_outbox_events.sql`** — `user_outbox_events`, identical column set to
  `session_outbox_events`, no FKs. Ships the **partial** index
  `idx_user_outbox_events_pending_created ON (created_at) WHERE status = 'PENDING'` from the start
  (adopts SESSION-17's improvement rather than shipping a full composite index and replacing it).
  Registered in `db.changelog-master.xml` after `V059`.
- `UserOutboxEvent extends OutboxEvent` → `@Table("user_outbox_events")`.
- `UserOutboxEventRepository` — `findTop50ByStatusOrderByCreatedAtAsc`.
- `UserOutboxWriter` (`@Component`) — `record(eventType, payload)`: Jackson-serialize (rethrow
  unchecked on failure — payload types are our own DTOs), `save()` in the **caller's** transaction.
- `UserOutboxRabbitConfig` — constant-only holder for `SPORTCONNECT_EVENTS_EXCHANGE`. **Declares no
  `@Bean`**: `session-impl`'s `SessionOutboxRabbitConfig` already declares that exchange; a second
  same-named bean in the merged `server` context throws `BeanDefinitionOverrideException`.
- `UserOutboxRelayJob` (`@Component`, `@Scheduled(fixedDelay=10000)`) — builds a fresh
  `OutboxRelay<UserOutboxEvent>` each tick. 1:1 with `SessionOutboxRelayJob`.
- `UserFriendServiceImpl` — injects `UserOutboxWriter`; new private `publishFriendRequestCreated`
  helper called from both `sendFriendRequest` branches; `establishFriendship` gains the
  `user.friend_request.accepted` write after the existing `friendship.accepted` Redis-stream publish
  (the two are independent mechanisms — Redis stream = chat cache sync, RabbitMQ outbox =
  notification module).
- `build.gradle` — `+ spring-boot-starter-amqp` (not transitive from `common`, same as SESSION-15
  needed for `session-impl`).

### `modules/notification/notification-impl`
- `ParsedUserEvent` record — `(type, actorId, recipientUserId)`, single-recipient only (no fan-out
  variant, unlike `ParsedSessionEvent`).
- `UserEventsRabbitConfig` (`@Configuration`) — durable queue `notification.events.user` + binding
  to `sportconnect.events` with pattern `user.*.*`. Uses a plain `new TopicExchange(...)` for the
  binding only, not a `@Bean` (same technique/reasoning as `SessionEventsRabbitConfig`).
- `UserEventsConsumer` (`@Component`, `@RabbitListener`) — parses the two routing keys; unparseable
  / unknown key → log + drop (ack).
- `UserEventProcessor` (`@Service`, `@Transactional`) — `insertIfAbsent(messageId)` dedup →
  `recordEvent(recipientUserId, type, "USER", actorId.toString(), actorId)` → publish
  `NotificationLiveUpdateEvent`. Defensive `recipient == actor` skip (mirrors `SessionEventProcessor`;
  unreachable for friend events since self-requests are rejected upstream).
- `build.gradle` — no change (`user-api` + `spring-boot-starter-amqp` already present from NTF-4/NTF-2).

`entityType="USER"`, `entityId` = counterparty user id (= `actorId` for both events).
`NotificationServiceImpl.getNotifications` already no-ops `entityTitle` enrichment for any
non-`"SESSION"` type, so `USER` rows simply carry no title and the client uses the resolved actor
name.

### `server`
- `src/test/resources/schema.sql` — added `user_outbox_events` (H2 mirror; required once
  `UserOutboxEvent` is a real entity or `@SpringBootTest` `ddl-auto: validate` fails).
- New `UserFriendEventsConsumerIntegrationTest extends RabbitMqTestContainerBase` — publishes
  `user.friend_request.created` / `.accepted` straight to the real exchange, asserts a real
  `Notification` row (type, `entityType="USER"`, `entityId=actorId`, `actorIds=[actorId]`); plus a
  redelivery-dedup case.

### Tests
- `UserFriendServiceImplSpec` — constructor updated for the new dependency; +6 cases (fresh
  `created`, reactivation `created`, crossed-request `accepted` (not `created`), already-pending
  writes nothing, `acceptFriendRequest` `accepted` to original sender, `declineFriendRequest`
  writes nothing).
- New `UserOutboxWriterSpec` — serialize+save, and unchecked-rethrow on a serialization failure.
- New `UserEventsConsumerSpec` — 2 dispatch cases + malformed + unknown-key drop.
- New `UserEventProcessorSpec` — dedup insert + `recordEvent` args + live-update publish;
  already-processed skip; self-recipient skip.

---

## Divergence from the approved design

None. Built as designed.

---

## Verification

- `./gradlew :modules:user:user-impl:test` — green.
- `./gradlew :modules:notification:notification-impl:test` — green.
- `./gradlew :modules:common:test` — green.
- `./gradlew build -x test` + `:server:compileTestJava` — full multi-module build + server test
  sources compile clean.
- `./gradlew :server:test` — this ticket's own `UserFriendEventsConsumerIntegrationTest` passes
  **3/3** (in isolation, paired with `SessionEventsConsumerIntegrationTest`, and in the full suite);
  `NotificationStompIntegrationTest` and all non-Docker `@SpringBootTest` ITs green (incl.
  `NotificationAccessGateIntegrationTest`, `UserLookupAccessIntegrationTest` — full merged context
  with all four new beans + updated `schema.sql`). The **only** failures in a full-suite run are 6
  in the pre-existing `SessionEventsConsumerIntegrationTest` (`AmqpIOException: java.io.IOException`)
  — which **pass on their own** and **paired with this ticket's IT** (`10/10`), and flake only under
  full-suite load on this host, where Docker Desktop was visibly unstable (`docker info`:
  "timed out dialing Hyper-V socket"). U13 touches no session code, consumer, or shared bean;
  re-run on a stable Docker host / CI (Linux, no Hyper-V).
- **Live end-to-end against the real dev stack** (`infra/docker-compose.dev.yml` Postgres + RabbitMQ
  + Redis, `./gradlew :server:bootRun`): `V060` applied cleanly. Registered two real users via
  `/api/auth/register`. **Sent** a friend request A→B via `POST /api/users/friends/requests` —
  `psql` confirmed `user_outbox_events` row `user.friend_request.created` drained to `SENT`
  (`attempt_count=1`), payload `actorId`=A / `recipientUserId`=B; a `notifications` row appeared for
  **B** (`type=user.friend_request.created`, `entity_type=USER`, `entity_id`=A, `actor_ids={A}`).
  B then **accepted** via `PUT /api/users/friends/requests/{id}/accept` — `user_outbox_events` row
  `user.friend_request.accepted` drained to `SENT`, payload `actorId`=B / `recipientUserId`=A; a
  `notifications` row appeared for **A** (`type=user.friend_request.accepted`, `entity_type=USER`,
  `entity_id`=B, `actor_ids={B}`). Both directions verified end to end through the real relay +
  exchange + queue + consumer.

---

## Follow-ups filed

- **Client ticket** (`client/docs/MVP/`) — add `user.friend_request.created` / `.accepted` to the
  client's `NotificationType` union + `getNotificationText` cases (+ tests/stories). Until it ships,
  these render the generic "You have a new notification" fallback row (graceful; dev-warns).
- `NOTIFICATION_USE_CASES.md` — `NOTIF-5` added, status `BUILT (U13)`.
- `NOTIF-4` (deactivated recipient still notified?) remains unresolved and out of scope here.
