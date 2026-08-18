# C3 · Generic transactional-outbox mechanism

**Status:** DONE
**Module:** `modules/common`
**Related:** `documentation/md/vision/NOTIFICATION_MODULE_VISION.md` (origin of this ticket)

## Design (approved plan, restated)

A domain write (e.g. a comment insert) and a durable async event about that write (e.g. publishing
to RabbitMQ) can't commit atomically across two different systems. Publisher confirms and durable
queues protect a message once it's actually published, but not the window between "the DB
transaction committed" and "the publish call was issued" — if the app crashes there, the event is
silently lost with no record it ever existed. The only fix is making the event's existence durable
in the *same* transaction as the domain write (the transactional outbox pattern).

`common` gets the shape and the reusable poll/publish/mark-sent logic, but never a domain's own
outbox table or the RabbitMQ exchange topology:

- `OutboxEvent` (`com.sportconnect.common.outbox`) — `@MappedSuperclass`: `id` (`Long`, `IDENTITY`),
  `eventType` (String, doubles as the routing key, e.g. `post.comment.created`), `payload` (TEXT
  JSON string), `status` (`OutboxEventStatus`: `PENDING`/`SENT`), `attemptCount`/`lastAttemptAt`,
  `createdAt`, `sentAt`. No table of its own — each domain extends it with its own concrete
  `@Entity`/`@Table` in that domain's own outbox-wiring ticket (e.g. `post-impl`'s B7 →
  `post_outbox_events`).
- `OutboxRelay<T extends OutboxEvent>` — a plain class, not a Spring bean. Each domain constructs
  its own instance (from its own `@Scheduled` job class, same shape as `session-impl`'s existing
  `SessionGenerationJob`), supplying a `RabbitTemplate`, an exchange name, a `Supplier<List<T>>` for
  candidate rows, a routing-key resolver, and a `Consumer<T>` to persist status changes. `drain()`
  publishes each still-`PENDING` row (skipping anything the fetcher over-returns that isn't
  `PENDING`, as a safety net) via `rabbitTemplate.invoke(...)` +
  `waitForConfirmsOrDie(timeoutMs)` — marking `SENT` on confirm, leaving `PENDING` with
  `attemptCount` bumped on nack/timeout for the next call to retry.

## What was built

Implemented per the approved plan (three scope decisions locked in with the user before design,
since none were resolved by the ticket text alone):

1. **Real, working RabbitMQ path, not an abstraction deferred to a later ticket.** Added
   `spring-boot-starter-amqp` and `spring-boot-starter-data-jpa` to `modules/common/build.gradle`
   (JPA is new to `common` — this is its first entity). Added a `rabbitmq` service
   (`rabbitmq:3-management-alpine`, ports `5672`/`15672`) to `infra/docker-compose.dev.yml`, and
   `spring.rabbitmq.*` config (`publisher-confirm-type: correlated`, `publisher-returns: true`) to
   `application.yml`/`application-dev.yml`/`application-prod.yml`. No exchange/queue is declared
   anywhere by this ticket — `OutboxRelay` takes the exchange name as a constructor argument;
   naming/declaring `sportconnect.events` stays NTF-2's job per the ticket's explicit
   out-of-scope note.
2. **Per-domain relay instance, not a shared generic poller.** `OutboxRelay` holds no registry and
   `common` never becomes aware of any domain's entity/repository type — matches the existing
   `SessionGenerationJob` precedent (`@Scheduled` job class lives in the domain module,
   `common`/`server` only supply the reusable mechanics + the `@EnableScheduling` toggle).
3. **Attempt tracking now, no backoff logic yet.** `attemptCount`/`lastAttemptAt` are populated on
   every publish attempt (success or failure) so retry visibility exists from day one, even though
   no backoff/dead-letter policy consumes them — deferred for the same reason C2 deferred a caching
   layer: real design work belongs after a real need shows up, not speculatively.

Files:
- `modules/common/src/main/java/com/sportconnect/common/outbox/OutboxEventStatus.java`
- `modules/common/src/main/java/com/sportconnect/common/outbox/OutboxEvent.java`
- `modules/common/src/main/java/com/sportconnect/common/outbox/OutboxRelay.java`
- `modules/common/src/test/groovy/com/sportconnect/common/outbox/OutboxRelaySpec.groovy` — mocks
  `RabbitTemplate`, covers: a `PENDING` row gets published (`convertAndSend` + `waitForConfirmsOrDie`
  called with the right exchange/routing-key/payload) and marked `SENT`; a publish failure
  (`AmqpException` from `invoke()`) leaves the row `PENDING` with `attemptCount` bumped; a `SENT` row
  in the fetched list is never re-published (`0 * rabbitTemplate.invoke(_)`).
- `infra/docker-compose.dev.yml`, `server/src/main/resources/application*.yml` — RabbitMQ dev infra.

## Key decisions

- `RabbitOperations.OperationsCallback<T>`'s actual SAM method is `doInRabbit(RabbitOperations)`,
  not the more descriptively-named method the design draft assumed — caught by the Spock spec
  failing with a `MissingMethodException` on first run; fixed by calling the real method name (a
  non-issue for the production code itself, since the Java lambda in `OutboxRelay.publish()` never
  names the SAM method).
- `OutboxEvent` is `abstract` — it has an `@Id` but no `@Table`, and is never meant to be
  instantiated directly.

## Out of scope (unchanged from ticket)

- Any concrete domain's outbox table or event types — `post-impl` B7, `group-impl` B21,
  `session-impl` SESSION-15, `user-impl` U13.
- The `sportconnect.events` exchange/routing-key topology and its declaration — NTF-2.
- Backoff/dead-letter policy for repeatedly-failing rows — left open, same as the vision doc's
  open questions.

## Verification

- `./gradlew :modules:common:test` — all tests pass, including the 3 new `OutboxRelaySpec` cases.
- `./gradlew build -x test` — full multi-module build compiles clean with the new JPA/AMQP
  dependencies on `common`'s classpath.
- `./gradlew :server:test` — full suite passes, no regressions; confirms `common`'s new JPA entity
  and AMQP autoconfiguration don't break the real Spring context any other module's tests build.
- `docker compose -f infra/docker-compose.dev.yml config` — validates; `docker compose ... up -d`
  brings up the new `rabbitmq` container alongside the existing `postgres`/`redis` ones.
- `./gradlew :server:bootRun` (alternate port, since the dev server was already running on 8080) —
  starts cleanly against the running RabbitMQ container, no connection or context-startup errors.

No divergence from the approved design — implementation matches the design-phase plan exactly.

---

**Status:** `DONE` — see `modules/common/docs/MVP/C3_TRANSACTIONAL_OUTBOX.md`
**Type:** New Feature (Architecture)
**Scope:** One new mapped-superclass + one reusable relay component pattern in `modules/common`
only — no change to any domain module in this ticket; each domain that wants durable async event
publishing builds its own outbox table on top of this shape in its own ticket (see
`modules/notification/docs/BACKLOG_MVP.md`'s NTF-1..3 and the per-domain outbox-wiring tickets:
`post-impl`'s B7, `group-impl`'s B21, `session-impl`'s SESSION-15, `user-impl`'s U13).

**Filed:** 2026-08-16, from the notification-module vision session — full design record, rejected
alternatives, and rationale in `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`.

**Problem:** a domain write (e.g. a comment insert) and a durable async event about that write (e.g.
publishing to RabbitMQ) can't commit atomically across two different systems. Publisher confirms and
durable queues protect a message once it's actually published, but not the window between "the DB
transaction committed" and "the publish call was issued" — if the app crashes there, the event is
silently lost with no record it ever existed. The only fix is making the event's existence durable
in the *same* transaction as the domain write.

**Fix — add the shape, not per-domain logic:** an `OutboxEvent` `@MappedSuperclass` (id, `eventType`,
JSON `payload`, `status` [`PENDING`/`SENT`], `createdAt`, `sentAt`) that each domain extends with its
own concrete entity/table (e.g. `PostOutboxEvent` → `post_outbox_events`, staying inside `post-impl`
per the domain-scoped-tables rule — `common` never owns another domain's outbox data). A reusable
relay component (scheduled poller, or `LISTEN/NOTIFY`) pattern that any domain's outbox repository
can register into: read `PENDING` rows, publish to RabbitMQ with publisher confirms (`correlated`
mode) + a durable queue + persistent delivery mode, mark `SENT` on ack.

Writing the outbox row is an ordinary same-transaction JPA `save()` alongside the domain write — no
Spring `ApplicationEventPublisher`/`@TransactionalEventListener` needed on the producing side; the
relay's own polling cadence is what guarantees "only publish for a transaction that actually
committed," since it only ever reads rows that are already durably there.

**Tests:** a Spock spec against a trivial in-module test double outbox entity, covering: a `PENDING`
row gets published and marked `SENT`; a publish failure (nack/timeout) leaves the row `PENDING` for
retry; already-`SENT` rows are never re-published.

**Out of scope:** any concrete domain's outbox table or event types (each domain's own ticket); the
RabbitMQ topology itself (`sportconnect.events` exchange, routing keys — scoped in
`modules/notification/docs/BACKLOG_MVP.md`'s NTF-2); choosing poller-per-domain vs. one shared
generic poller (left open, see the vision doc's Open Questions).
