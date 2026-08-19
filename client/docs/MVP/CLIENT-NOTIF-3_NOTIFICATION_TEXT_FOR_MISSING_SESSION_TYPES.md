# CLIENT-NOTIF-3 · Notification text for `session.status.started` and `session.participant.left`

**Status:** `TODO`
**Type:** Bug Fix (display gap)
**Depends on:** none — both backend events already ship (`SESSION-18` `DONE`, `SESSION-19` `DONE`)
**Filed:** 2026-08-19, found while implementing `SESSION-19` — checking whether the client could
render its new notification type surfaced that an *already-shipped* type has the same gap.

`client/src/features/notifications/notificationText.ts`'s `getNotificationText` switch has a case
for six notification types. Two emitted types are missing from it, so both fall through to:

```ts
default:
  return [plain('You have a new notification')];
```

| Type | Shipped by | Status today |
|---|---|---|
| `session.status.started` | `SESSION-18` (`DONE`) | **Renders the generic fallback since it launched** |
| `session.participant.left` | `SESSION-19` (`DONE` 2026-08-19) | Renders the generic fallback |

**This is a degraded-display bug, not a crash.** The fallback is deliberate and documented in that
file's own comment — it exists "so the dropdown degrades gracefully the moment a new producer
ships," which is exactly what happened, twice. Nothing is broken; the notifications simply carry no
useful information, so a user sees "You have a new notification" with no idea what occurred.

**Worth noting as a pattern, not just two one-off misses:** both gaps were created by a backend
ticket shipping an event while scoping client work out. `SESSION-18` and `SESSION-19` each did this
independently, and neither noticed. Whoever picks this up should consider whether adding a new
routing key should carry a checklist item pointing at this switch — otherwise the same gap recurs
on the next event (`post-impl` B7, `group-impl` B21 and `user-impl` U13 are all `TODO` notification
outbox-wiring tickets that will each introduce new types).

## What ships

Two new cases in `getNotificationText`, following the existing segment convention exactly — bold on
actor name(s) and entity title only, never on a fallback phrase:

- `session.status.started` — **no actor** (`SESSION-18`: a scheduled job made the transition, and
  the consumer deliberately passes `actorId = null`). So this case must **not** use `actorSegment`,
  which would render the bold-suppressed `'Someone'` fallback and read as if a person started it.
  Something closer to `['', entity, ' has started']` — exact wording is a product call at pickup.
- `session.participant.left` — has a real actor; mirrors the existing
  `session.participant.joined` case (`[actor, ' joined ', entity]`), e.g. `[actor, ' left ', entity]`.

**Tests:** `notificationText.test.ts` already covers the existing cases plus the fallback — add one
per new type, and keep a fallback case covering a genuinely unknown type so the default branch stays
tested.

## Explicitly out of scope

No backend change — both events already emit correctly and are consumed into real notifications.
No new notification types. No change to the fallback itself (it's correct behavior for a type the
client genuinely doesn't know). No aggregation/display changes beyond these two switch cases.
