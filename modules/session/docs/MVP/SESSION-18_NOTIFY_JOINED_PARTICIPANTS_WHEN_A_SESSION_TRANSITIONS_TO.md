# SESSION-18 · Notify JOINED participants when a session transitions to ONGOING

**Status:** `DONE`
**Type:** New Feature

**Filed:** 2026-08-17, user request during the NTF-2/SESSION-15/17 work: "add a new session
event/notification, when a session status is updated to ONGOING, notify all JOINED participant
that session will start soon." Scoping got far enough to surface real open questions (below);
implementation deferred, picking this up later starts from here rather than a blank page.

**What's different about this one, structurally, from every event SESSION-15 already built:** all
6 existing events (`session.comment.created`, `session.join_request.created/approved/rejected`,
`session.invitation.created`, `session.participant.joined`) are fired from `SessionServiceImpl`,
inside an HTTP-request-triggered `@Transactional` method, always with a real user `actorId` — the
caller who performed the action. This one is different on both counts:

- **Trigger point is a scheduled job, not a request.** The status flip happens in
  `SessionGenerationService.startOngoingSessions()` (`session-impl/service/`), called by
  `SessionGenerationJob` every 15 minutes (see the cron in that job class). It already batches
  correctly for this: `findSessionsToStart` returns a `Slice<Session>`, the method loops in
  memory (`sessions.forEach(s -> s.setStatus(ONGOING))`) before one `saveAll(sessions)` — real
  `Session` objects are available per-item, so outbox rows can be built in the same loop and
  batched via `saveAll` on the outbox repository, same shape as SESSION-15's `createSession`
  invite loop. `SessionGenerationService` does **not** currently have
  `sessionOutboxEventRepository`/`ObjectMapper` wired in (only `SessionServiceImpl` does) — needs
  adding.
- **No real actor.** A scheduled job transitioned the status — there's no user to attribute the
  event to. Every existing payload DTO and `NotificationService.recordEvent(recipientUserId, type,
  entityType, entityId, actorId)` assumes a real `UUID actorId`. Confirmed by reading
  `NotificationServiceImpl.recordEvent` directly: passing a null `actorId` through today would
  actually NPE — it does `actorIds.add(0, actorId)` on the aggregation's `List<UUID>`, and
  `UuidListConverter.convertToDatabaseColumn` calls `UUID::toString` on every entry, including a
  null one, when persisting. This is a real gap in already-shipped NTF-1 code — every event NTF-1
  was designed against had a human actor; this is the first case that doesn't.

**Decided so far:**
- Routing key: `session.status.started` (3 segments — matches the existing
  `notification.events.session` queue's `session.*.*` binding with no binding change needed).
- Recipients: all `JOINED` participants — the existing `SessionService.getParticipantIdsByStatuses
  (sessionId, [JOINED])` (built for `session.participant.joined`'s fan-out) already gates on
  `session.status IN (SCHEDULED, ONGOING)`, and by the time the consumer processes this event the
  session's status is already `ONGOING` (set before the outbox row's transaction commits) — no
  session-api change needed, this event reuses that method as-is.
- `entityType` = `"SESSION"`, `entityId` = `sessionId.toString()`, consistent with every other
  session event.

**Open questions — not yet resolved:**
1. **How should the no-actor case actually be represented and handled**, end to end? Surfaced but
   not settled: does the new payload DTO (e.g. `SessionStatusStartedEvent`) simply have no
   `actorId` field at all (unlike the other 6), with the consumer calling either a new
   `NotificationService` overload or passing a null actor into a `recordEvent` that's been fixed
   to skip the `actorIds` append when null (still bumping `actorCount`)? Or is there a different
   shape intended — the user raised "should we put sessionId here?" without confirming which of
   two different spots that meant (the payload DTO's own fields, vs. literally substituting
   `sessionId` for `actorId` in `NotificationService.recordEvent`'s signature, which is a `UUID`
   today and would need a real type/meaning change if so) before the conversation moved to filing
   this ticket instead. Needs a real answer before implementing — this is the crux of the whole
   ticket, everything else is straightforward reuse of existing pieces.
2. **Does fixing `NotificationServiceImpl.recordEvent`'s null-actor handling belong in this
   ticket, or is it prerequisite work against already-shipped NTF-1 code that should be scoped
   (and tested) on its own first?** Leaning toward "part of this ticket" (it's small, and this is
   the first and only caller that needs it) but not decided.
3. **Shared outbox-writing helper or duplicated?** `SessionServiceImpl` already has a private
   `recordOutboxEvent`/`buildOutboxEvent` pair (SESSION-15). `SessionGenerationService` will need
   the identical logic. Extract a small shared component both services use, or duplicate the ~10
   lines (matching this codebase's general "three similar lines is better than a premature
   abstraction" preference, per `CLAUDE.md`)? Not decided.
4. **Branch/bundling** — deferred along with everything else; whichever branch is active when this
   is picked up, confirm with the user rather than assuming (per the existing "confirm branch
   before implementing" convention this session has followed throughout).

**Out of scope (same as every other session event ticket):** the notification consumer's
aggregation/display logic beyond what's needed to not crash on a null actor; any client/UI change.

---

## Implementation

**Open questions, resolved:**
1. **No-actor shape:** `SessionStatusStartedEvent` (`session-api`) carries only `sessionId` — no
   `actorId` field at all, unlike every other session event DTO. `ParsedSessionEvent`'s `actorId`
   was already a nullable `UUID`, so `SessionEventsConsumer`'s new `session.status.started` parse
   case passes a literal `null` straight through `ParsedSessionEvent.fanOut(...)`.
   `NotificationServiceImpl.recordEvent` got a small guard — the `actorIds` list mutation is
   skipped when `actorId == null`, but `actorCount` still increments unconditionally.
   `SessionEventProcessor`'s existing recipient filter (`!recipientId.equals(event.actorId())`)
   needed **no change** — confirmed `recipientId.equals(null)` is always `false`, so a null actor
   never wrongly filters out a real recipient.
2. **Fix scope:** the `recordEvent` null-actor guard shipped as part of this ticket (small,
   isolated, and this is the only caller that will ever pass a null `actorId`).
3. **Shared vs. duplicated outbox writer:** extracted `SessionOutboxWriter` (new
   `session.service` class, `@Component`) — `record()` (build-and-save) and `build()`
   (build-only, for batch callers). Both `SessionServiceImpl` and `SessionGenerationService`
   inject it. `SessionServiceImpl`'s previously-private `recordOutboxEvent`/`buildOutboxEvent`
   pair (SESSION-15) was deleted in favor of delegating to this shared component — its
   `ObjectMapper` field is gone (no longer used directly), `SessionOutboxEventRepository` stays
   (still used directly for `createSession`'s invite-batch `saveAll`).
4. **Branch:** handled by `/workon`'s own Phase 0 (started from `master`, new branch created) —
   no separate confirmation needed since the "confirm before implementing" case only applies when
   *not* starting from `master`.

**What was built:**
- `SessionGenerationService.startOngoingSessions`: after flipping each batch's sessions to
  `ONGOING` and `saveAll`-ing them, builds one `SessionStatusStartedEvent` outbox row per session
  via `sessionOutboxWriter.build(...)`, then `sessionOutboxEventRepository.saveAll(...)` — same
  transaction, same batching shape as SESSION-15's invite loop in `createSession`.
- `SessionEventsConsumer`: new `case "session.status.started"`, fan-out scoped to `JOINED` only
  (reuses the existing `PARTICIPANT_JOINED_RECIPIENT_STATUSES` constant — same recipient set
  `session.participant.joined` already uses).
- No migration (reuses the existing `session_outbox_events` table and `session.*.*` queue
  binding — 3-segment routing key already matches), no controller, no security config, no client
  change.

**Test coverage added:** `SessionGenerationServiceSpec` (outbox row written per started session,
none written when nothing starts), `NotificationServiceImplSpec` (null-actorId `recordEvent` —
fresh row and existing-row cases, actor list untouched, `actorCount` still increments, no NPE),
`SessionEventsConsumerSpec` (routing-key dispatch), `SessionEventProcessorSpec` (fan-out with a
null actor notifies every resolved recipient, none wrongly filtered out).

**Test-suite blast radius (flagged and approved before implementing):** extracting
`SessionOutboxWriter` out from under `SessionServiceImpl` touched ~11 existing
`SessionServiceImplSpec` outbox-assertion tests — mechanically converted from asserting on
`sessionOutboxEventRepository.save(...)` + `objectMapper.readValue(...)`-decoded payload strings,
to asserting directly on the mocked `sessionOutboxWriter.record(eventType, payload)` interaction's
typed payload object (no JSON round-trip needed at the test seam anymore — a net simplification,
not just a mechanical rename).

**Docs updated:** `NotificationService.recordEvent`'s Javadoc (`notification-api`) and
`NotificationServiceImpl.recordEvent`'s Javadoc note the null-actor case;
`modules/session/session-impl/CLAUDE.md`'s Key Classes table updated for `SessionOutboxWriter`
and `SessionGenerationService`'s new outbox-writing behavior.

**Follow-up IT test (user-prompted, "do we have enough IT?"):** the Spock coverage above all mocks
`NotificationRepository`, so none of it actually exercises the real
`UuidListConverter.convertToDatabaseColumn` path that was the source of the original NPE risk —
only a real Hibernate/DB round trip proves that. Added
`SessionEventsConsumerIntegrationTest.sessionStatusStartedEvent_consumedOverRealRabbitMq_notifiesJoinedParticipantWithNoActor`
(`server/src/test/java/com/sportconnect/integration/`), same real-RabbitMQ-testcontainer pattern as
that class's two existing tests: inserts a real `Session` + `JOINED` `SessionParticipant` via
repositories, publishes a real `session.status.started` message onto the exchange, and asserts a
real `Notification` row lands with empty `actorIds`, `actorCount == 1`, no exception. This also
gives the new routing key itself real exchange/queue/binding coverage, which the class's own
Javadoc notes is exactly the class of bug the mocked Spock specs can't catch. Verified locally with
`DOCKER_HOST=npipe:////./pipe/docker_engine` set (this machine's Testcontainers/Rancher Desktop
named-pipe detection gap — documented in `server/README.md`'s Troubleshooting section, not new).
