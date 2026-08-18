# NTF-2 · RabbitMQ consumer — `sportconnect.events` exchange, recipient resolution

**Status:** DONE
**Module:** `modules/notification`
**Related:** `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`, SESSION-15
(`modules/session/docs/MVP/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md` — the only real producer this
ticket consumes from)

## Design (approved plan, restated)

The ticket's original text scoped recipient resolution across all 4 producing domains (post,
group, session, friend). Before designing, this was narrowed:

**Scope decision:** session events only. Only `session-impl` (SESSION-15) has a real producer —
`post-impl` B7, `group-impl` B21, `user-impl` U13 are all still `TODO`. Consuming their event types
now would mean creating DTOs in 3 domains' `-api` modules speculatively, verifiable only with
hand-crafted test messages. Matches the vision doc's stated rollout priority (session > post >
group > friend). `post.*`/`group.*`/`user.friend_request.*` consumption becomes follow-on tickets
once those domains ship real producers.

**Duplicate-delivery decision:** build dedup now, not defer it. RabbitMQ redelivery (ack
failure/consumer crash) would otherwise double-count an aggregation (e.g. `actorCount` bumped
twice for one real comment). Implemented via a `processed_messages` marker table keyed by a
deterministic AMQP `messageId` (`routingKey + ":" + outbox row id`, added to `common`'s
`OutboxRelay` — globally unique across every current/future producer since routing keys are
domain-prefixed by convention) and inserted in the *same transaction* as the resulting
`NotificationService.recordEvent` call(s), so a message that's redelivered after only partially
completing rolls back as a unit and gets a clean retry.

**Malformed-message decision:** log and drop (ack), narrowly scoped to deserialization/
unrecognized-routing-key failures only — a permanently malformed message will never succeed no
matter how many redeliveries. A *different* exception raised during actual processing (e.g. a
transient DB error) is deliberately left to propagate, so RabbitMQ's default requeue-and-retry
behavior still applies there — the two failure classes are not conflated under one broad catch.

**Recipient-resolution refinement (made mid-design):** `SessionService.getParticipantIdsByStatuses`
gates on the session's own status — returns empty (no fan-out at all) unless the session is
`SCHEDULED` or `ONGOING`, checked before ever querying participants. A `CANCELLED`/`COMPLETED`
session never triggers a comment/participant-joined notification, even for an event published
before the status changed.

## What was built

**`modules/common`**: `OutboxRelay.publish()` now sets the AMQP `messageId` via a
`MessagePostProcessor` (`routingKey + ":" + event.getId()`) — backward-compatible, no change
needed at the one existing call site (`SessionOutboxRelayJob`). `OutboxRelaySpec`'s 3 existing
tests updated for the new 4-arg `convertAndSend` call; one new test asserts the exact `messageId`
value.

**`session-api`**: `SessionService.getParticipantIdsByStatuses(Long sessionId, List<ParticipantStatus>) → List<UUID>`
— the fan-out primitive, gated on session status as above.

**`session-impl`**: `SessionParticipantRepository.findBySessionIdAndStatusIn`, the interface
implementation.

**`notification-impl`** (the real new work):
- `V055__create_processed_messages.sql` — the dedup marker table.
- `ProcessedMessage` entity + `ProcessedMessageRepository.insertIfAbsent` — an atomic native
  `INSERT ... ON CONFLICT DO NOTHING`, **not** a plain `save()` + catch
  `DataIntegrityViolationException` (see Key decisions below for why that doesn't work).
- `SessionEventsRabbitConfig` — declares this module's own durable queue
  (`notification.events.session`, pattern `session.*.*`). Does **not** redeclare the
  `sportconnect.events` exchange as a competing `@Bean` — that's `session-impl`'s
  `SessionOutboxRabbitConfig`'s job (found the hard way: two `@Bean TopicExchange
  sportconnectEventsExchange()` methods in the same merged `server` context threw
  `BeanDefinitionOverrideException` on startup, caught by `:server:test`). A local (non-bean)
  `TopicExchange` instance is enough to build this module's `Binding`.
- `SessionEventsConsumer` (`@RabbitListener`) — reads the raw `Message` for its routing key,
  deserializes into the matching one of SESSION-15's 6 event DTOs, dispatches to...
- `SessionEventProcessor` (`@Transactional`) — a **separate bean**, not a private method on the
  consumer: `@Transactional` on a self-invoked method silently never goes through the Spring
  proxy, so the dedup-insert and `recordEvent` call(s) wouldn't actually share one transaction if
  they were both on `SessionEventsConsumer` itself. Inserts the dedup marker first
  (`insertIfAbsent` returning `0` means "already processed," logged and skipped); for single-recipient
  events, skips if `actorId == recipientUserId` (self-notification — reachable for a group-linked
  session's non-auto-joined creator requesting to join their own session); for fan-out events,
  resolves participants via `getParticipantIdsByStatuses` and calls `recordEvent` once per
  recipient excluding the actor.
- `notification-impl/build.gradle` gained `session-api` (main) and, separately, `post-api`
  (test-only — Spock's `Mock(SessionService)` must generate a full mock of the interface,
  including methods returning `post-api`'s `CommentResponse`; `session-api` declares `post-api` as
  `implementation`, not transitive).

**Tests**: `OutboxRelaySpec` (common, updated + 1 new). `SessionServiceImplSpec` — 5 new tests for
`getParticipantIdsByStatuses` (SCHEDULED/ONGOING included, CANCELLED/COMPLETED/nonexistent
excluded without querying participants). `SessionEventProcessorSpec` (new) — single-recipient
recordEvent, self-notification skip, fan-out exclude-actor, dedup skip on duplicate messageId.
`SessionEventsConsumerSpec` (new) — all 6 routing keys dispatch correctly, malformed JSON and
unrecognized routing key both drop cleanly without throwing or calling the processor.

## Key decisions / bugs found during implementation

- **Bean name collision found by `:server:test`, not by module tests.** `SessionOutboxRabbitConfig`
  (session-impl) and the first draft of `SessionEventsRabbitConfig` (notification-impl) both
  declared `@Bean TopicExchange sportconnectEventsExchange()`. Both modules compile and test in
  isolation fine — the collision only exists in the real merged `server` Spring context, where
  both are on the classpath together. This is exactly the scenario CLAUDE.md's testing section
  flags module-level Spock specs as unable to catch (a Spring wiring issue only a real
  `@SpringBootTest` context surfaces) — caught here, not guessed around.
- **Spock's `Mock(SessionService)` needs the full interface resolvable**, including methods that
  return types from `session-api`'s own `implementation`-only dependency on `post-api`. First
  showed up as a Groovy compile error naming `CommentResponse` with no obvious connection to
  anything this ticket touches.
- **The dedup mechanism itself was broken on the first pass — a real bug caught only by the real
  RabbitMQ/Postgres IT test added afterward** (`SessionEventsConsumerIntegrationTest`, at the
  user's explicit request once they asked whether an IT test had been added and the gap was
  surfaced). Two separate, compounding JPA issues, neither visible to a Spock spec mocking the
  repository:
  1. The original dedup write was `processedMessageRepository.saveAndFlush(...)` inside a
     try/catch for `DataIntegrityViolationException`. `ProcessedMessage.messageId` has no
     `@GeneratedValue`, so Spring Data's default "is the id null?" new-entity check always says
     "not new" once the id is set — `save()` routes through `entityManager.merge()` (a silent
     select-then-update) instead of `persist()`, so a genuine duplicate never actually threw; it
     just quietly re-updated the same row, and both "duplicate" events proceeded to call
     `recordEvent`. The redelivery test failed with `actorCount == 2`, not `1`.
  2. Fixing *that* (tried `Persistable.isNew()` forced `true`, forcing `persist()`) surfaced a
     second problem: the resulting constraint violation, even though caught in application code,
     had already marked the surrounding `@Transactional` transaction rollback-only — Spring/JPA
     does this the instant the low-level persistence exception occurs, independent of whether the
     application catches it. The method returned normally (exception "handled"), but the
     transaction then failed to commit with `UnexpectedRollbackException`, crashing the listener
     entirely.

  Fixed by replacing both with `ProcessedMessageRepository.insertIfAbsent` — a native
  `INSERT ... ON CONFLICT DO NOTHING` that never throws at all; a duplicate just returns `0`
  affected rows, checked directly instead of exception-driven. Neither of the two failure modes
  above is observable through a mocked repository — the persist-vs-merge routing and the
  rollback-only transaction behavior are both real JPA/Spring runtime behaviors that only show up
  against a real persistence provider and a real transaction manager.

## Out of scope (unchanged from ticket, refined by the session-only scope decision)

`post.*`/`group.*`/`user.friend_request.*` consumption (new tickets once `post-impl` B7,
`group-impl` B21, `user-impl` U13 ship real producers) — the comment thread-participant case for
posts specifically will need its own `post-api` batch method (`getDistinctCommenterIds`), same
shape as this ticket's `getParticipantIdsByStatuses`. NTF-3's STOMP live delivery.

## Verification

- `./gradlew :modules:common:test`, `:modules:session:session-impl:test`,
  `:modules:notification:notification-impl:test` — all pass.
- `./gradlew build -x test` — full multi-module build compiles clean.
- `./gradlew :server:test` — full suite passes (90 tests, 88 pre-existing + the 2 new real-RabbitMQ
  IT tests below), no regressions. This is what caught the bean-name collision on the first
  attempt, and (via the new IT test) the dedup bugs described above.
- **`SessionEventsConsumerIntegrationTest`** (new, `server/src/test/java/com/sportconnect/integration/`,
  added after the user asked whether IT coverage existed for this ticket) — real end-to-end
  coverage against an actual RabbitMQ broker, not mocked collaborators. Uses a new
  `RabbitMqTestContainerBase` (chained onto the existing `RedisTestContainerBase`, so `BaseIT`
  gets both real dependencies through one inheritance link, same shape/rationale, one-time
  container startup cost for the whole `:server:test` run rather than per test class). Publishes
  directly onto the real exchange (bypassing `SessionOutboxRelayJob`'s outbox-table/`@Scheduled`
  drain — this class tests the consumer side of the wire, not the producer side, which SESSION-15
  already covers) and polls (`awaitility`, new test dependency — the listener runs on a background
  thread) for the resulting `Notification` row. Two cases: a single-recipient event produces a
  correct `Notification`; a message redelivered with the same `messageId` is deduped
  (`actorCount` stays `1`, not `2`) — this second case is what actually caught both JPA bugs above,
  on a real Postgres, not H2 (`:server:test`'s default) or a mock.
- **Live manual end-to-end verification** against the real dev stack (kept as a supplementary
  check, not a substitute for the automated IT test above): confirmed the queue
  (`notification.events.session`) and its binding (`sportconnect.events` → pattern `session.*.*`)
  via `rabbitmqctl list_queues`/`list_bindings`. Registered two real users, created a real
  standalone session with an invite via the actual HTTP API — confirmed via `psql` a real
  `Notification` row was created (correct `recipientUserId`, `type`, `actorIds`) and a matching
  `processed_messages` row. Then had the invitee `/join` — confirmed the fan-out case resolved
  correctly too: recipient was the session creator (the only other `JOINED` participant),
  `actorIds` correctly excluded the joiner (who would otherwise have been included as a
  participant but is excluded as the actor of their own event).

**Divergence from the approved design:** the bean-collision fix was mechanical (exchange declared
once, referenced not redeclared — the design already agreed on this, just needed a working
implementation). The dedup mechanism's actual persistence approach changed from the originally
described "insert, catch the constraint violation" to "atomic `INSERT ... ON CONFLICT DO NOTHING`,
check the row count" — not a design-intent change (dedup-via-unique-constraint was always the
plan), but a real correction to how it's implemented, found only once real IT coverage existed.

---

**Status:** `DONE` — see `modules/notification/docs/MVP/NTF-2_RABBITMQ_CONSUMER.md`
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
