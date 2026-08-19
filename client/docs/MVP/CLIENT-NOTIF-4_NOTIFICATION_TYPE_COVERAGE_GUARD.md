# CLIENT-NOTIF-4 · Guard against a backend routing key shipping without its client text case

**Status:** `TODO`
**Type:** Enhancement (Architecture / process)
**Depends on:** none — but its value lands before `post-impl` B7, `group-impl` B21 and `user-impl`
U13, each of which will introduce new notification types
**Filed:** 2026-08-19, at CLIENT-NOTIF-3's pickup (user decision to file rather than fold in). The
same gap had already occurred twice independently — SESSION-18 and SESSION-19 each shipped a
notification event with client work scoped out, and neither noticed.

`getNotificationText` (`client/src/features/notifications/notificationText.ts`) is the single place
a backend routing key becomes user-visible text. Nothing structurally forces a backend ticket that
adds a routing key to add its case here, and the `default:` branch quietly absorbs the omission by
rendering "You have a new notification" — a degraded row that looks like working software. That is
exactly how `session.status.started` and `session.participant.left` each shipped broken and stayed
unnoticed until CLIENT-NOTIF-3.

CLIENT-NOTIF-3 added a dev-only `console.warn` on the fallback branch, which helps but only fires if
someone happens to run the app in dev *and* happens to trigger the unmapped type. This ticket is
about making the coverage gap impossible to miss rather than merely observable.

**11 types are already queued** to hit this switch:

| Backlog ticket | New routing keys |
|---|---|
| `post-impl` B7 (`TODO`) | `post.like.created`, `post.comment.created`, `post.comment.replied` |
| `group-impl` B21 (`TODO`) | `group.invitation.created` / `.accepted` / `.declined`, `group.join_request.created` / `.approved` / `.rejected` |
| `user-impl` U13 (`TODO`) | `user.friend_request.created`, `user.friend_request.accepted` |

## Open questions for pickup — the approach is genuinely undecided

Three broad shapes, not mutually exclusive. Deliberately not chosen here; this ticket exists to get
the decision made, not to presume it.

1. **Process guard** — a checklist item in `.claude/commands/ticket.md` / `workon.md` so a backend
   ticket adding a routing key can't close without either adding the client case or filing one.
   Cheapest; relies on the command being followed.
2. **Test guard** — a single source-of-truth list of known types that both `getNotificationText` and
   a test assert against, so an unhandled type fails a test rather than rendering a fallback. The
   hard part is that the authoritative list lives backend-side (`SessionEventsConsumer`'s switch and
   its future siblings), so the client list is a mirror that can itself drift — decide whether a
   drifting mirror is meaningfully better than today's silent fallback.
3. **Contract guard** — have the backend expose its emitted routing keys (an endpoint, or a
   generated constant the client build consumes) so the mirror can't drift. Most robust, most work,
   and crosses a service boundary for what is arguably a display concern.

Whichever is chosen, the `default:` branch stays — a client deployed older than the backend will
always be able to receive a type it doesn't know, so graceful degradation remains correct behavior.
This ticket is about catching the gap in development, not removing the runtime fallback.

**Out of scope:** adding the actual text cases for B7/B21/U13's types — each belongs with its own
ticket (which is precisely the habit this ticket is trying to establish). No change to the fallback's
rendered text.

**Related:** [CLIENT-NOTIF-3](CLIENT-NOTIF-3_NOTIFICATION_TEXT_FOR_MISSING_SESSION_TYPES.md) — the
bug fix that surfaced this, and whose "Delta for later tickets" section points here.
