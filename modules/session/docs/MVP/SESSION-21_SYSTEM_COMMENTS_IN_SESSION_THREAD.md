# SESSION-21 · System comments in the session discussion thread

**Status:** `TODO`
**Type:** New Feature
**Depends on:** none (`SESSION-10`, `SESSION-15`, `SESSION-18`, `SESSION-19` all `DONE`)
**Filed:** 2026-08-19, user request while closing out `SESSION-19`. Deliberately *additive* to
the existing notifications, not a replacement: a notification is a one-shot ping to a recipient's
bell, whereas a system comment leaves a durable in-thread record that anyone opening the session
later can read in order. Both are wanted.

Writes system-generated entries into a session's existing discussion thread (`SESSION-10`'s
`SESSION_POST`-anchored comment list) marking three moments: **a participant joined**, **a
participant left**, and **the session started**. Read by Normal Users — any participant viewing a
session's discussion. There is no user entry point and no user input: entries are written
server-side at the same three call sites that already emit outbox events today
(`joinSession`/`approveJoinRequest` for joined, `leaveSession` for left,
`SessionGenerationService.startOngoingSessions` for started), and surface through the existing
comment-read endpoint with no new API.

**The central open question, deliberately not resolved here:** `SESSION-10` implemented session
comments by reusing `post-impl`'s `Comment` entity via a `SESSION_POST` anchor, and that entity
declares `@Column(name = "user_id", nullable = false)`. **A system comment has no author.** Whoever
picks this up must decide between a nullable `user_id` + migration, a sentinel system UUID, an
`isSystem`/`type` discriminator column, or a separate `session_system_comments` table — and note
that the first three are changes to **`post-impl`'s** table, i.e. cross-domain, not session-local.
This is the same shape as `SESSION-18`'s null-`actorId` problem, and its resolution there
(a nullable field plus an explicit guard on the path that assumed non-null) is worth reading first.

**Must not double-notify — confirmed product decision at filing (2026-08-19), not an open
question.** A system comment must **not** emit `session.comment.created`. Each of the three moments
already notifies via its own event (`participant.joined`, `participant.left`, `status.started`), so
firing a comment notification as well would ping every participant twice for one occurrence. If the
chosen design writes a real `Comment` row, verify this explicitly — the notification is emitted by
the session-side comment path, not by the entity, but that must be confirmed rather than assumed.
(Not logged in `documentation/md/NOTIFICATION_USE_CASES.md`: that file tracks *candidate triggers*
whose "should this notify?" question is still open, and this one was decided on the spot as a firm
no.)

**Other edge cases to settle at pickup:** ordering/interleaving of system and user entries (both
carry `createdAt`, so a stable sort is likely enough); whether system entries count toward any
comment count the client displays; whether they can be replied to, liked, or deleted (expected:
none of the three); and thread noise from a participant repeatedly joining and leaving the same
session. No new authenticated endpoint is added, so this inherits no new account-lifecycle
(`isActive`) exposure — the three trigger paths are existing endpoints whose posture is unchanged.

**Out of scope:** all client work — rendering a system entry distinctly from a user comment is a
separate client ticket, matching this repo's consistent split (`SESSION-10` → `CLIENT-SESSION-8`,
`SESSION-19` → `CLIENT-NOTIF-3`). Any event beyond the three named above (cancelled, completed,
join-request approved/rejected, invitation accepted) — several have no outbox event today and would
each need a new trigger point. Backfilling system comments for sessions that already exist.
Moderation of system entries.

**Tests:** a system entry is written on a genuine `JOINED` transition, on `JOINED`→`LEFT`, and on
`SCHEDULED`→`ONGOING`; no `session.comment.created` notification results from any of the three;
the entries appear in the existing comment-read path in correct chronological order alongside real
user comments.
