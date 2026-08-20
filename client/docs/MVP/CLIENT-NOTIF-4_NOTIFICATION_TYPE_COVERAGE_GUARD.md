# CLIENT-NOTIF-4 · Guard against a backend routing key shipping without its client text case

**Status:** `DONE` (2026-08-20)
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

---

## Implementation (2026-08-20)

### The decision, and why

The ticket left three approaches open. Chosen: **option 2 (type guard) + option 1 (process
checklist)**, rejecting option 3 (contract guard). Two findings drove it, both from the codebase
rather than from preference:

**`Notification.type` was the anomaly, not the norm.** The client hand-mirrors ~15 backend enums as
union types — `PostType`, `CommentType`, `SessionStatus`, `ParticipantStatus`, `FeeType`,
`JoinRequestStatus`, `InvitationStatus`, `FriendshipStatus`, `ConversationType` and more — a
convention `client/CLAUDE.md` explicitly endorses ("typed 1:1 against the real backend DTOs,
verified against source"). `Notification.type` alone was a bare `string`. Option 3 would have
invented a novel cross-boundary mechanism for one concern while fifteen siblings stayed
hand-mirrored; typing this one properly is the consistent move, and it was the cheaper one.

**Neither guard alone catches the actual failure.** Worth stating plainly because the ticket's
framing slightly obscured it. The type guard makes it a compile error to add a union member without
a case — but in both real incidents *nobody touched the client at all*, so no member was ever added.
Only the process checklist covers "backend shipped, client untouched." They guard different
failures; that is why both shipped.

**The scope widened at pickup (user decision).** The checklist covers any client-visible backend
enum, not just notification routing keys. CLIENT-SESSION-13 was the same class of bug arriving
through `commentType`, and a routing-key-only checklist would have missed it — 2 of 3 recent
incidents rather than 3 of 3.

### What was built

1. **`NotificationType`** (`features/notifications/types.ts`) — an 8-member union sourced from
   `SessionEventsConsumer`'s switch, replacing `type: string` on `Notification`.
2. **Exhaustiveness assertion** in `getNotificationText`'s `default:` branch —
   `const unhandled: never = notification.type;`. Adding a union member without a case now fails the
   build *and names the missing type*.
3. **The runtime fallback stays**, with its dev-only warn. This is not redundancy: the union mirrors
   what the backend emits *at this build*, and a client deployed older than the backend will still
   receive out-of-union values. The `never` check covers build-time omission; the fallback covers
   version skew. Neither substitutes for the other, and the code comments say so.
4. **Process checklist** added to `.claude/commands/ticket.md` (as a fourth standing cross-cutting
   check) and `.claude/commands/workon.md` (Phase 1), worded for any client-visible enum or event
   type, and naming both incidents so the check reads as evidence rather than ceremony.

### Key decisions

- **The deliberate-unknown test/story sites take an explicit cast**, with a comment saying the cast
  *is* the point rather than a workaround — plus a tripwire: if they ever stop needing one, the union
  has grown a member that should have had its own case. This was the only real friction the
  narrowing introduced.
- **`void unhandled;`** rather than leaving the binding unused, so the assertion survives lint and
  any future `noUnusedLocals` tightening.

### Verification

- `tsc -b` clean; `pnpm lint` 0 errors (2 pre-existing warnings, untouched file).
- **The guard was proven to fire, not assumed to.** Temporarily added `'post.like.created'` to the
  union with no case; the build failed with
  `error TS2322: Type '"post.like.created"' is not assignable to type 'never'` at the `default:`
  branch, naming the missing type. Reverted; `tsc` green again. A guard nobody has watched fail is
  not a guard.
- **Narrowing ripple measured, not estimated:** 4 errors across 2 files, every one a deliberate
  out-of-union literal. The 22 real type literals across tests, stories and MSW fixtures all
  type-checked unchanged.
- **MSW fixtures are covered** — `tsconfig.node.json` includes `e2e/**/*.ts`, so an invalid
  notification type in a handler now fails the build too, not just in `src/`.
- `pnpm test` 891/891 (129 files); e2e `notification-bell` 2/2.
- **A 2-failure e2e run was investigated, not waved through** — both `page.goto` timeouts from CPU
  contention with the concurrent full `vitest` run (`retries: 0` locally); clean 2/2 on re-run in
  14.6s against a 30s timeout. Same false alarm shape as CLIENT-SESSION-13's; confirmed rather than
  pattern-matched.
- **No baselines move.** Nothing rendered changed — this ticket is types, one assertion, comments
  and two command files.

## Delta for later tickets

- **`Notification.type` is now `NotificationType`, not `string`.** Adding a backend routing key means
  adding the union member *and* its `getNotificationText` case in the same change — the build
  enforces the second half once you do the first.
- **B7 / B21 / U13 each add types** (3 / 6 / 2). Each should extend the union and add its cases as
  part of its own client work, which is the habit both halves of this ticket exist to establish.
- **The checklist lives in two command files.** If `/ticket` or `/workon` is ever restructured, the
  client-visible-enum check needs to survive the move.
