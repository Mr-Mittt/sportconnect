# SESSION-44 · `joinSession` (and approve/reject) don't reject a `COMPLETED` session

**Status:** `TODO`
**Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-09-24, found while answering "can a user send a join request for a cancelled or
completed session?" during client CLIENT-SESSION-30 (read-only code review of `SessionServiceImpl`;
not yet reproduced against a running backend).

## What's wrong

`SessionServiceImpl.joinSession` rejects only `CANCELLED`
(`"Cannot join a cancelled session"`, `BadRequestException` → HTTP 400). A `COMPLETED` session is
not checked, so both flavours of join succeed on a finished session:

- **Auto-approve session:** the caller gets a `JOINED` row, the `session.participant.joined` outbox
  event fires, and a "<name> joined the session" system comment is written into a finished
  session's thread.
- **Approval-required session (a "join request"):** the caller gets a `REQUESTED` row and a
  `session.join_request.created` event addressed to the creator — a notification about a request for
  a session that already ended. The creator can then approve it.

`requireRequestedParticipant` (shared by `approveParticipant`/`rejectParticipant`) has the same
shape: it rejects only `CANCELLED` (`"Cannot approve or reject participants for a cancelled
session"`), so a `COMPLETED` session's pending requests are still approvable.

(`cancelSession` does reject both `COMPLETED` and `CANCELLED`, which is the precedent to follow.)

## Direction

- `joinSession`: also reject `COMPLETED` — e.g. `400 "Cannot join a completed session"`, before the
  group-membership and participant-row logic, mirroring the `CANCELLED` check.
- `requireRequestedParticipant`: also reject `COMPLETED`, same message shape.
- Decide (and state in the ticket when picked up) whether `leaveSession` should also reject a
  `COMPLETED`/`CANCELLED` session — today it has no status check, so a user can flip their row to
  `LEFT` and write a "left the session" system comment after the fact. Not decided here.
- Tests: Spock cases in `SessionServiceImplSpec` for each new rejection, plus an IT
  (`SessionListingIntegrationTest`-style, real `MockMvc`) asserting the HTTP 400 and message, since
  the status-to-HTTP mapping goes through `GlobalExceptionHandler`.

## Client impact

None required: the client already hides Join/Accept for a `COMPLETED` session
(`getParticipationAction` returns `null` outside `PREPARING`/`SCHEDULED`/`ONGOING`), so this only
closes the direct-API/stale-UI path. Account lifecycle: unchanged (no new endpoint).
