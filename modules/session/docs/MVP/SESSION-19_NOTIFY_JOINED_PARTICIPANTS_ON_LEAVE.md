# SESSION-19 · Notify JOINED participants when a participant leaves

**Status:** `TODO`
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
