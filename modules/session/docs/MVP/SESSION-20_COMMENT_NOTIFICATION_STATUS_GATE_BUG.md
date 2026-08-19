# SESSION-20 · Comment notifications wrongly restricted to SCHEDULED/ONGOING sessions

**Status:** `TODO`
**Type:** Bug Fix
**Depends on:** none (`SESSION-15`/`NTF-2` both `DONE`)
**Filed:** 2026-08-18, user request while reviewing session notification coverage. Corrects the
already-`CONFIRMED` `NOTIF-1` ("new comment on a session you're in") — not a new use case, no new
`NOTIF-<n>` entry needed, `NOTIF-1`'s entry already points at `SESSION-15`.

`SessionServiceImpl.getParticipantIdsByStatuses` (the batch method that resolves fan-out
notification recipients) returns an **empty list** whenever the session's status isn't `SCHEDULED`
or `ONGOING`. `SessionGate` never restricts commenting by session status — a participant can comment
on a `COMPLETED` session freely (post-game recap is a real, common case) — so today, any comment on
a session that has already completed silently generates zero notifications, even though the outbox
row itself is written correctly by `SESSION-15`'s existing wiring.

**Update (2026-08-19, at SESSION-19 pickup):** the shared method now has **four** fan-out callers,
not three — `SESSION-19` added `session.participant.left`, which reuses it unchanged and *depends*
on the `(SCHEDULED, ONGOING)` gate being its behavior (confirmed as the intended semantics at that
ticket's pickup). Scope for this ticket was also confirmed at that time: remove the status gate for
the **comment event only**, via a comment-specific recipient path — not by loosening the shared
method for everyone. Under that scope `participant.joined`, `status.started` and `participant.left`
are all unaffected. Note `leaveSession` has no session-status guard of its own (verified), so
leaving a `COMPLETED`/`CANCELLED` session is reachable and currently resolves zero recipients — if
this ticket's scope ever widens to the shared method, that becomes a live behavior change to
`SESSION-19`'s feature, not just this one.

**Real complication, not a trivial gate removal:** `getParticipantIdsByStatuses` is **shared** by
three things — `session.comment.created` (this ticket's concern), the already-shipped
`session.participant.joined`, and `SESSION-18`'s not-yet-built `session.status.started` (whose own
ticket text explicitly plans to reuse this exact method as-is). Loosening the status gate broadly
would also change `participant.joined` and `status.started` behavior, which may or may not be
wanted — "someone joined a `COMPLETED` session" isn't really a meaningful event today (`joinSession`
already rejects `CANCELLED`, though not `COMPLETED`). Whoever picks this up needs to decide: a
comment-specific recipient-resolution path (e.g. a new method, or a status-list parameter this one
doesn't currently take), vs. changing the shared method's gate outright after confirming that's safe
for the other two callers. Left open here deliberately, not resolved.

**Out of scope:** any change to the `participant.joined`/`status.started` recipient behavior unless
picking this up determines the shared-method change is safe for both; any client/UI change.

**Tests:** a comment on a `COMPLETED` session resolves the same recipient set a comment on a
`SCHEDULED`/`ONGOING` session would (participants other than the commenter, `JOINED`/`REQUESTED`/
`INVITED`); a comment on a `CANCELLED` session — confirm intended behavior at pickup, since
`SessionGate` doesn't block commenting there either but no one raised this specific case.
