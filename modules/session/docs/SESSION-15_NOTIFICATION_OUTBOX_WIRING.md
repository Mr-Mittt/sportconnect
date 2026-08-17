# SESSION-15 · Notification outbox wiring

**Status:** DONE
**Module:** `modules/session`
**Related:** C3 (`modules/common` — generic transactional-outbox mechanism,
`modules/common/docs/C3_TRANSACTIONAL_OUTBOX.md`), `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`

## Design (approved plan, restated)

An outbox row is written, in the same transaction as the triggering write, for six session events:
new session comment, join request received, join request approved, join request rejected, session
invite sent, and a new participant joins. Routing keys: `session.comment.created`,
`session.join_request.created`, `session.join_request.approved`, `session.join_request.rejected`,
`session.invitation.created`, `session.participant.joined`.

Three scope decisions were locked in with the user before design, none resolved by the ticket's
original text alone:

1. **The relay is in scope, not just row-writing.** `SessionOutboxRelayJob` (`@Scheduled`,
   session-impl, same shape as the existing `SessionGenerationJob`) actually drains
   `session_outbox_events` and publishes to RabbitMQ — chosen specifically so the pipeline could
   be verified against a real running broker now, rather than rows accumulating `PENDING` until
   some later ticket added a relay. This was itself a downstream consequence of an earlier
   decision this session: build the producer (SESSION-15) before the consumer (NTF-2), since a
   consumer with nothing real to consume can only be verified with hand-crafted test messages.
2. **SESSION-15 declares the `sportconnect.events` topic exchange itself** (`SessionOutboxRabbitConfig`)
   — C3 explicitly scoped *declaring* it to NTF-2, but nothing blocks a producer from declaring it
   first (idempotent); NTF-2 will just bind its own durable queue to this same exchange later.
3. **Payload design is asymmetric by design.** Single-recipient events (join-request
   created/approved/rejected, invitation created) bake `recipientUserId` directly into the payload
   — session-impl already knows it unambiguously at write time. Fan-out events (comment created,
   participant joined) never bake in a recipient — the participant set is resolved at consume time
   by a future `session-api` batch method NTF-2 will add, mirroring `post-api`'s
   `getDistinctCommenterIds` precedent for the identical shape of problem.

**A 6th event not in the ticket's original text** (`session.participant.joined`) was added
mid-session — the user caught that notifying other participants when someone new joins was never
captured anywhere, including `documentation/md/NOTIFICATION_USE_CASES.md`. Fired from
`approveParticipant` (always — `requireRequestedParticipant` guarantees a `REQUESTED`→`JOINED`
transition) and from `joinSession` (only on a genuine non-`JOINED`→`JOINED` transition, covering
both the auto-approve direct-join path and the `INVITED`→accept path).

## What was built

- `V054__create_session_outbox_events.sql` — `session_outbox_events` table, `OutboxEvent`'s shape,
  no FKs.
- `session-api`'s new `com.sportconnect.session.api.event` package — 6 payload DTOs
  (`SessionCommentCreatedEvent`, `SessionJoinRequestCreatedEvent`, `SessionJoinRequestApprovedEvent`,
  `SessionJoinRequestRejectedEvent`, `SessionInvitationCreatedEvent`, `SessionParticipantJoinedEvent`) —
  in `-api`, not `-impl`, per NTF-2's own stated precedent ("event payload DTOs live in each
  producing domain's own `-api` module... `notification-impl` depends on each domain's `-api` to
  deserialize").
- `session-impl`: `SessionOutboxEvent extends OutboxEvent`, `SessionOutboxEventRepository`
  (`findTop50ByStatusOrderByCreatedAtAsc`), `SessionOutboxRabbitConfig` (declares the durable
  `sportconnect.events` `TopicExchange`), `SessionOutboxRelayJob` (`@Scheduled(fixedDelay = 10000)`,
  constructs an `OutboxRelay<SessionOutboxEvent>` each tick).
- `SessionServiceImpl` gained `recordOutboxEvent`/`buildOutboxEvent` private helpers (Jackson
  `ObjectMapper`, injected) and 6 call sites: the `createSession` invitee loop, `joinSession`,
  `approveParticipant`, `rejectParticipant`, `createSessionComment`.
- `session-impl/build.gradle` gained `spring-boot-starter-amqp` (not transitively available from
  `common`, which declares it as `implementation`, not `api`).
- `server/src/test/resources/schema.sql` gained a `session_outbox_events` table — required once
  `SessionOutboxEvent` existed as a real JPA entity, or any `@SpringBootTest` (`ddl-auto: validate`)
  would fail to start.
- `SessionServiceImplSpec` — 11 new test cases across all 6 write sites, plus updated constructor
  wiring for the 2 new dependencies.

## Key decisions / bugs found during implementation

- **N+1 self-correction:** the `createSession` invitee loop initially called `recordOutboxEvent`
  (its own individual `save()`) once per invitee inside the `forEach`. Refactored to collect built
  (unsaved) `SessionOutboxEvent`s into a list and persist them via one `saveAll` after the loop —
  matching the exact batching shape the same method already uses for `seedParticipants`.
- **A real, pre-existing latent bug found while wiring `joinSession`:** `SessionParticipant.status`
  carries `@Builder.Default = ParticipantStatus.JOINED`. The original code's brand-new-participant
  fallback (`orElseGet(() -> SessionParticipant.builder()...build())`, no `.status(...)` set) means
  a genuinely-new participant's `.getStatus()` silently reads as `JOINED`, not `null`/absent — first
  caught by two new tests failing with `TooFewInvocationsError`. Fixed by reading `previousStatus`
  from the `Optional<SessionParticipant>` directly, before falling back to the builder, rather than
  from the (possibly builder-defaulted) built object.
- **A second, separate pre-existing bug found (documented, not fixed — out of scope):** the same
  method's `targetStatus` ternary (`participant.getStatus() == INVITED || autoApprove ? JOINED :
  REQUESTED`) never special-cases "caller is already `JOINED`" — an already-`JOINED` caller
  re-invoking `joinSession` on a non-`autoApprove` session gets silently demoted back to
  `REQUESTED`. This predates SESSION-15 and is unrelated to notifications, but it would have
  become newly *visible* through this ticket's own new code (a spurious "your join request was
  received" notification to the organizer). Guarded defensively in the new outbox-firing code only
  (`if (previousStatus != JOINED)` wraps both branches) — the underlying status-recompute bug
  itself was left untouched, genuinely out of scope for this ticket. Worth a separate ticket.

## Out of scope (unchanged from ticket)

The notification consumer/aggregation logic itself (NTF-2) — including the future `session-api`
batch method NTF-2 will need for fan-out recipient resolution; any client/UI change.

## Verification

- `./gradlew :modules:session:session-impl:test` — all tests pass (117 total, 11 new).
- `./gradlew build -x test` — full multi-module build compiles clean.
- `./gradlew :server:test` — full suite passes, no regressions. Log confirms
  `SessionOutboxRelayJob`'s scheduler fires during the full-context test run (same as
  `SessionGenerationJob` already does), attempting a real drain — not just present but active.
- **Live end-to-end verification against the real dev stack** (Postgres + RabbitMQ, both already
  running via `infra/docker-compose.dev.yml`): `./gradlew :server:bootRun` — `V054` applied
  cleanly, `sportconnect.events` confirmed declared via `rabbitmqctl list_exchanges` (durable,
  topic). Registered two real users via `/api/auth/register`, created a real location and a real
  standalone session with one invitee via the actual HTTP API — confirmed via `psql` that a
  `session.invitation.created` row was written with the correct payload and drained to `SENT`
  within the first ~10s relay tick. Then had the invitee call `/join` — confirmed via `psql` that
  this fired exactly `session.participant.joined` (not a spurious `join_request.created`),
  directly verifying the `previousStatus` bug fix in a real running server, not just against mocks.

No divergence from the approved design beyond the two bugs found and handled as described above,
both flagged to the user as they were found rather than fixed silently.
