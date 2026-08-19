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
**Status:** `BUILT` (`SESSION-15`, 2026-08-18) · corrected by `SESSION-20` (2026-08-19)
**Source:** `documentation/md/vision/SESSION_COMMENTS_VISION.md` (open question, originally not
resolved), confirmed in `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`

When a participant posts a comment on a session (`SESSION-10`/`CLIENT-SESSION-8`), the other
participants (`JOINED`/`REQUESTED`/`INVITED`) now get notified — confirmed as part of the
notification-module vision session, one of the v1 session-domain triggers (highest rollout
priority of the four domains scoped: session > post > group > friend). Filed as **SESSION-15** in
`modules/session/docs/BACKLOG_MVP.md`, which shipped once `modules/common`'s C3 and
`modules/notification`'s NTF-1/NTF-2 unblocked it — so this is now **`BUILT`**.

**Correction (`SESSION-20`, 2026-08-19):** as first built, this notified nobody unless the session
was `SCHEDULED` or `ONGOING` — the shared recipient-resolution method applied that gate internally,
so a comment on a `COMPLETED` session (a post-game recap, which `SessionGate` explicitly permits)
wrote its outbox row correctly and then fanned out to zero people. Fixed by making the
session-status filter an explicit per-caller parameter. **The confirmed rule is now: if you can
comment on it, your comment notifies** — every lifecycle status, `CANCELLED` included (settled at
that ticket's pickup: "why was this cancelled?" is exactly when a participant wants to hear about
it). The other three fan-out events are unchanged and remain scoped to `SCHEDULED`/`ONGOING`.

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

### NOTIF-3 · A session you're in transitions to ONGOING
**Date added:** 2026-08-19
**Status:** `BUILT` (`SESSION-18`, 2026-08-19)
**Source:** logged retroactively at `SESSION-20` pickup — `SESSION-19`'s write-up already refers to
this trigger as "NOTIF-3", but no entry was ever added here, so the number was dangling. Recorded
now so the numbering stays truthful and this file remains the complete list it claims to be.

When `SessionGenerationJob` moves a session from `SCHEDULED` to `ONGOING`, its currently-`JOINED`
participants get notified. Built as **SESSION-18**. No real actor — a scheduled job made the
transition, not a user — which is why `NotificationServiceImpl.recordEvent` had to learn to handle
a null `actorId`. Recipients are gated to `SCHEDULED`/`ONGOING` sessions, unchanged by `SESSION-20`.
The client cannot yet render this type (generic fallback text); tracked as **CLIENT-NOTIF-3**.

### NOTIF-4 · Should a deactivated user still receive notifications?
**Date added:** 2026-08-19
**Status:** `CANDIDATE`
**Source:** surfaced during `SESSION-20`'s account-lifecycle check; out of scope there, logged here
rather than left as a loose bullet in that ticket.

Not a new trigger — a **cross-cutting filter question** affecting every existing and future one.
Nothing in the notification path filters recipients by account state today: a deactivated user
(`isActive = false`) stays in `session_participants`, so every fan-out event still resolves them as
a recipient and writes them a `Notification` row. Fan-out recipient resolution
(`SessionService.getParticipantIdsByStatuses`) checks participant status and session status only,
and `NotificationServiceImpl.recordEvent` doesn't consult `UserService` at all.

Open questions for whoever scopes this:
- Suppress at write time (never record it) or at read time (record, hide from the feed)? Write-time
  loses the history if the account is later reactivated; read-time keeps rows for accounts that may
  never come back.
- Does the answer differ for single-recipient events (a join request addressed to a specific user)
  vs. fan-out?
- Interacts with **U12** in `modules/user/user-impl`'s backlog, which tracks the broader "a
  deactivated user must not be able to interact with the app" gaps. This is the *inbound* side of
  that rule — the user isn't acting, they're being written to — so it may or may not belong under
  the same fix.
