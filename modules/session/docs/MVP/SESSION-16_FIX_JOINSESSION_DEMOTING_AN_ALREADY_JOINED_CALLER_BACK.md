# SESSION-16 · Fix `joinSession` demoting an already-`JOINED` caller back to `REQUESTED`

**Status:** `TODO`
**Type:** Bug Fix

**Filed:** 2026-08-17, found while wiring SESSION-15's outbox events into `joinSession` — see
`modules/session/docs/MVP/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md`'s Key decisions section. Predates
SESSION-15 and is unrelated to notifications; only became newly *visible* because SESSION-15's new
outbox-firing code would otherwise have turned this into a spurious "your join request was
received" notification to the organizer (defensively guarded against in that code — this ticket is
about the underlying status bug itself, not the notification side effect).

**Problem:** `SessionServiceImpl.joinSession`'s status ternary —
```java
ParticipantStatus targetStatus = participant.getStatus() == ParticipantStatus.INVITED
        || Boolean.TRUE.equals(session.getAutoApprove())
        ? ParticipantStatus.JOINED
        : ParticipantStatus.REQUESTED;
```
never special-cases "the caller is already `JOINED`." An already-`JOINED` participant calling
`POST /api/sessions/{sessionId}/join` again on a non-`autoApprove` session gets silently demoted
back to `REQUESTED` — since their current status isn't `INVITED` and `autoApprove` is false, the
ternary falls through to `REQUESTED` regardless of the fact that they're already a full member.

Not believed to be reachable in normal client use (the client's own "Join" button presumably isn't
shown once `callerParticipation.status == JOINED`, per SESSION-9), but nothing server-side
prevents a stale client, a double-click race, or a direct API call from hitting it.

**Fix (not yet designed in detail):** `joinSession` should treat an already-`JOINED` caller as a
no-op (matching how `leaveSession`'s equivalent already-terminal states are handled), rather than
letting the ternary run unconditionally.

**Tests:** an already-`JOINED` participant calling `joinSession` again (both `autoApprove` true and
false) stays `JOINED`, no status change, no outbox event (already covered defensively by
`SessionServiceImplSpec`'s SESSION-15 tests on the notification side, but the underlying service
behavior itself has no explicit no-op assertion yet).

---
