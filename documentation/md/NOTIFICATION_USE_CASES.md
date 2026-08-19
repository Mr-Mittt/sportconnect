# Notification Use Cases

A running list of "should this event notify someone?" candidates found anywhere in the app —
tickets, `/vision` sessions, `/feature` scoping, bug write-ups — collected here so they don't stay
buried in whichever doc first raised them. There is no notification feature (push or in-app) built
yet anywhere in the codebase. This file exists so that when one is finally scoped, there's already
a real list of concrete triggers to design against instead of starting from a blank page.

## How to use this file

- Log a new candidate whenever a "should X notify Y" question comes up and isn't resolved on the
  spot — don't just leave it as an unresolved bullet in that feature's own doc; add it here too,
  with a pointer back to the source.
- Entries are numbered `NOTIF-<n>`, sequential, never reused even if a candidate is rejected.
- Status values: `CANDIDATE` (logged, not yet designed) · `CONFIRMED` (product decision made that
  this should notify — still not built) · `BUILT` (shipped, link the ticket) · `REJECTED`
  (considered and explicitly dropped — say why).
- When the notification feature itself is eventually scoped (via `/feature`), this file is the
  starting input — every `CONFIRMED`/`CANDIDATE` entry becomes a concrete case the design has to
  cover, not a fresh brainstorm.

---

## Use cases

### NOTIF-1 · New comment on a session you're in
**Date added:** 2026-08-07
**Status:** `CONFIRMED` (2026-08-16)
**Source:** `documentation/md/vision/SESSION_COMMENTS_VISION.md` (open question, originally not
resolved), confirmed in `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`

When a participant posts a comment on a session (`SESSION-10`/`CLIENT-SESSION-8`), the other
participants (`JOINED`/`REQUESTED`/`INVITED`) now get notified — confirmed as part of the
notification-module vision session, one of the v1 session-domain triggers (highest rollout
priority of the four domains scoped: session > post > group > friend). Filed as **SESSION-15** in
`modules/session/docs/BACKLOG_MVP.md`, `TODO`, blocked on `modules/common`'s C3 and
`modules/notification`'s NTF-1/NTF-2.

### NOTIF-2 · A JOINED participant leaves a session
**Date added:** 2026-08-18
**Status:** `CONFIRMED` (2026-08-18)
**Source:** user request while reviewing session notification coverage, filed directly as `SESSION-19`

When a participant who was `JOINED` leaves a session (`DELETE /api/sessions/{sessionId}/leave`),
the other currently-`JOINED` participants get notified — confirmed, filed as **SESSION-19** in
`modules/session/docs/BACKLOG_MVP.md`, **`DONE` (2026-08-19)**. Deliberately scoped to the real
leave case only, not `leaveSession`'s other two outcomes (declining an invite, cancelling a join
request) — see the ticket for why.

Recipients are gated to sessions in `SCHEDULED`/`ONGOING` (the shared
`getParticipantIdsByStatuses` behavior, confirmed as intended at pickup). The client cannot yet
render this type — `getNotificationText` has no case for it, so it shows the generic fallback;
tracked as **CLIENT-NOTIF-3** alongside the same gap for `session.status.started` (NOTIF-3).
