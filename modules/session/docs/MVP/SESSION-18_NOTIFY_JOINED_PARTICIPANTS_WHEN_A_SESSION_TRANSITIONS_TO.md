# SESSION-18 · Notify JOINED participants when a session transitions to ONGOING

**Status:** `TODO`
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
