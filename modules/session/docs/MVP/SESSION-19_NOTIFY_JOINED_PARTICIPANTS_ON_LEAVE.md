# SESSION-19 · Notify JOINED participants when a participant leaves

**Status:** `DONE`
**Type:** New Feature
**Depends on:** none (reuses NTF-1/NTF-2/C3 infrastructure SESSION-15 already wired up)
**Filed:** 2026-08-18, user request while reviewing session notification coverage — mirrors
`SESSION-18`'s "notify JOINED participants" pattern but for a participant leaving rather than a
status transition. Not previously logged in `documentation/md/NOTIFICATION_USE_CASES.md` — added
there as `NOTIF-2`, `CONFIRMED`, alongside this filing.

Fires a new outbox event (`session.participant.left`, same shape as SESSION-15's other five events)
from `SessionServiceImpl.leaveSession` when the caller's participant row transitions from `JOINED`
to `LEFT` specifically — scoped deliberately narrower than the full method: `leaveSession` also
handles `INVITED`→`LEFT` (declining an invite) and `REQUESTED`→`LEFT` (cancelling a join request),
neither of which should notify anyone, since nobody was ever counting on a person who hadn't actually
joined. Recipients: the other currently-`JOINED` participants (excluding the leaver), resolved via
the existing `SessionService.getParticipantIdsByStatuses(sessionId, [JOINED])` batch method —
same recipient-resolution path `session.participant.joined` already uses.

**Two-sided — both halves needed for this to actually notify anyone:**
1. **Producer** (`session-impl`/`session-api`): new `SessionParticipantLeftEvent` payload DTO,
   outbox row written in `leaveSession`, same `recordOutboxEvent`/`buildOutboxEvent` helper pattern
   SESSION-15 already established.
2. **Consumer** (`notification-impl`): `SessionEventsConsumer.onSessionEvent`'s routing-key switch
   has a hard default that logs-and-drops any unrecognized key — a new `case
   "session.participant.left"` must be added there, or the event is produced but silently never
   becomes a notification.

**Edge cases:**
- Only the real `JOINED`→`LEFT` transition fires the event — read `previousStatus` before the
  status flip, same pattern SESSION-15's `joinSession` wiring already uses for its own
  previous-status check.
- A standalone session's own creator can't call `leaveSession` at all (existing guard, unchanged) —
  no special case needed here.
- **Related, not blocking:** `getParticipantIdsByStatuses` currently gates recipients to
  `session.status IN (SCHEDULED, ONGOING)` — see `SESSION-20`. If someone leaves a session that's
  already `COMPLETED`/`CANCELLED` (unusual but not blocked by `leaveSession` itself), this event
  will currently resolve zero recipients, same root cause as `SESSION-20`'s bug. Not this ticket's
  problem to fix, but whoever picks up `SESSION-20` should confirm this event's behavior is still
  correct after that fix lands.

**Out of scope:** the notification consumer's aggregation/display logic beyond wiring the new case;
any client/UI change; `INVITED`/`REQUESTED`→`LEFT` notifications (explicitly decided out, see above).

**Tests:** the event fires only on a genuine `JOINED`→`LEFT` transition, not on decline or
cancelled-request; recipient set excludes the leaver themselves; unrecognized-routing-key path isn't
hit once the new consumer case exists.

---

## Implementation

Built exactly as specced — no divergence from the approved design.

**Status gate resolved at pickup (user decision).** The ticket left the recipient status gate
implicit; it was raised and settled as `(SCHEDULED, ONGOING)` — i.e. exactly what the shared
`SessionServiceImpl.getParticipantIdsByStatuses` already applies. So this event reuses that method
unchanged: **no new gate, no migration, no shared-method change, no index change.** An earlier
reading of "gate = SCHEDULED only" was explored and dropped; it would have required either a
producer-side status check or a per-event status list, both unnecessary once the intended behavior
matched the existing default.

**1. `session-api` — `SessionParticipantLeftEvent`**: `sessionId` + `actorId`, same shape and Lombok
quartet as `SessionParticipantJoinedEvent`. Fan-out event; no recipient baked in.

**2. `session-impl` — producer in `SessionServiceImpl.leaveSession`**: `previousStatus` is captured
*before* `setStatus(LEFT)` (the row is mutated in place, so afterward there is no way to tell which
of the three allowed source states the leave came from), and the outbox row is written only when
`previousStatus == JOINED`. `INVITED`→`LEFT` (declining) and `REQUESTED`→`LEFT` (cancelling a
request) deliberately notify nobody. `sessionOutboxWriter` was already an injected field, so this
adds no constructor dependency and no Spring wiring risk; `record()` writes in the caller's
transaction, so a rollback takes the outbox row with it.

**3. `notification-impl` — consumer case** in `SessionEventsConsumer.parse`, reusing the existing
`PARTICIPANT_JOINED_RECIPIENT_STATUSES` (`List.of(JOINED)`) rather than adding a duplicate constant.
That constant was already shared with `session.status.started`, so its name refers to the recipient
*status* it selects, not to any one event — a clarifying comment was added saying so, since it now
has three consumers. Actor-exclusion is free: `SessionEventProcessor` already filters
`recipientId.equals(actorId)`.

**Tests:** the three existing `leaveSession` specs were extended in place (matching how the
`joinSession` specs already combine flip + outbox assertions) rather than adding parallel ones —
`JOINED` asserts the outbox row and its payload, `INVITED`/`REQUESTED` assert `0 * record(_, _)`.
A new consumer spec proves the routing key reaches the processor as a `[JOINED]` fan-out, which is
what proves the new `case` exists at all — without it the key falls through to the drop-and-log
default and nothing is called.

**Integration test added (divergence from the approved plan, user-requested).** The plan said no IT
was needed — this ticket changes no authorization/visibility check, so it doesn't meet CLAUDE.md's
stated bar. That reasoning was too literal: both Spock specs for this event mock their collaborators
(the producer spec mocks `SessionOutboxWriter`, the consumer spec mocks `SessionEventProcessor`), so
**nothing proved the real path** — real RabbitMQ delivery over the new routing key's
exchange/queue binding, recipient resolution through the real `getParticipantIdsByStatuses`
(including its `SCHEDULED`/`ONGOING` gate) against a real DB, and a real `Notification` row. This is
the same gap SESSION-18 closed for its own null-actor path, for the same reason.
`sessionParticipantLeftEvent_consumedOverRealRabbitMq_notifiesRemainingJoinedParticipantsButNotTheLeaver`
seeds the leaver as a `LEFT` row (the real post-`leaveSession` state, so they're excluded by
participant status before the actor filter is even reached) and asserts the remaining `JOINED`
participant gets exactly one notification while the leaver gets none. **SESSION-18 needed nothing
added** — its existing `sessionStatusStartedEvent_...` test already covers its own path end to end.

**Verification:** `:modules:session:session-impl:test` and `:modules:notification:notification-impl:test`
both green; `:server:test` green (mandatory per CLAUDE.md). `SessionServiceImplSpec` 85 tests,
`SessionEventsConsumerSpec` 10 (was 9), `SessionEventsConsumerIntegrationTest` 4 (was 3).
**One transient infrastructure failure, investigated not ignored:** a `:server:test` run failed
broadly with `NoClassDefFoundError: Could not initialize class SharedRedisContainer` across
unrelated ITs (`PostAccessGateIntegrationTest`, `InternalServiceFilterScopeIT` — neither touches
session or notification code). Traced to a Testcontainers static-initializer failure, not the
changed code; Docker itself was healthy with no leftover containers. An identical re-run with zero
code changes passed clean, confirming container contention from running three container-heavy
suites back to back.

**Deltas for other tickets:**
- **SESSION-20** — `session.participant.left` is a **fourth** consumer of
  `getParticipantIdsByStatuses`; that ticket's text names only three (written before this event
  existed). Under SESSION-20's confirmed scope (remove the gate for the *comment event only*, via a
  comment-specific recipient path) this event is unaffected and the two tickets are genuinely
  independent. Noted so the shared-method caller list stays accurate.
- **Client** — `getNotificationText` has no case for `session.participant.left`, so it renders the
  generic `'You have a new notification'` fallback (graceful by design, not broken). `session.status.
  started` (SESSION-18) has the same gap and has had it since it shipped. Filed together as
  **CLIENT-NOTIF-3**; deliberately out of scope here per this ticket's own "no client/UI change".
