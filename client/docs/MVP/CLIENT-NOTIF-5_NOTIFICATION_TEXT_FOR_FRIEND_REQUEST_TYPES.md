# CLIENT-NOTIF-5 · Notification text for `user.friend_request.created` and `user.friend_request.accepted`

**Status:** `TODO`
**Type:** Bug Fix (display gap) — same shape as [CLIENT-NOTIF-3](CLIENT-NOTIF-3_NOTIFICATION_TEXT_FOR_MISSING_SESSION_TYPES.md)
**Depends on:** none — backend **U13** (`DONE` 2026-08-28) ships both events end to end (producer in
`modules/user/user-impl`, consumer in `modules/notification`).
**Filed:** 2026-08-28, at U13's `/workon` pickup (user decision: backend ships the producer +
consumer; client text case is its own ticket, exactly the habit
[CLIENT-NOTIF-4](CLIENT-NOTIF-4_NOTIFICATION_TYPE_COVERAGE_GUARD.md) exists to establish).

## The gap

U13 makes `modules/notification` write real `Notification` rows for two new routing keys:

| Type | `entityType` / `entityId` | Actor | Meaning |
|---|---|---|---|
| `user.friend_request.created` | `USER` / the sender's user id | the sender | someone sent you a friend request (a fresh one, or a re-send that reactivated a prior declined/cancelled/removed request) |
| `user.friend_request.accepted` | `USER` / the accepter's user id | the accepter | someone accepted the friend request you sent |

`client/src/features/notifications/notificationText.ts`'s `getNotificationText` switch has no case
for either, and `NotificationType` (`features/notifications/types.ts`) doesn't include them — so
today they render the generic `default:` fallback: **"You have a new notification"**. Not a crash
(the fallback is deliberate, dev-warns), just an uninformative row.

## What ships

1. **`NotificationType`** (`features/notifications/types.ts`) — add `'user.friend_request.created'`
   and `'user.friend_request.accepted'` to the union. Per CLIENT-NOTIF-4, the `const unhandled:
   never` assertion in `getNotificationText`'s `default:` branch then **fails the build** until both
   cases below exist — that's the intended forcing function, not a problem to work around.
2. **Two `getNotificationText` cases**, following the existing segment convention (bold on actor
   name(s) only — there is no entity title for a `USER` entity, so no `entitySegment` here):
   - `user.friend_request.created` → e.g. `[actor, plain(' sent you a friend request')]`
   - `user.friend_request.accepted` → e.g. `[actor, plain(' accepted your friend request')]`
   - exact wording is a product call at pickup; both have a real actor, so `actorSegment` is used
     (unlike `session.status.started`).
3. **Tests** — `notificationText.test.ts`: one case per new type. Keep the existing
   genuinely-unknown-type fallback case (its literal must stay unreal — see CLIENT-NOTIF-3/4).
4. **Storybook** — `NotificationRow` stories for the two new types if they introduce a visually
   distinct shape (both are `[actor, plain(...)]`, so likely one story is enough; match the
   precedent set by the `session.participant.joined`/`left` pair).
5. **MSW fixture** (`e2e/mocks/handlers/notifications.ts`) — add rows for the two new types if an
   e2e/visual spec renders the populated dropdown; seed them `isRead: true` so
   `notification-bell.spec.ts`'s unread-count assertions don't need rewriting (same technique
   CLIENT-NOTIF-3 used).
6. **Visual-regression baselines** — if the dropdown row count in `notification-bell-populated-*`
   changes, regenerate via the `update-baselines` dispatch (the HF-20 process), same as
   CLIENT-NOTIF-3.

## Navigation / click target (decide at pickup)

`entityType` is `USER` and `entityId` is the counterparty's user id. Whether tapping a
friend-request notification should route to that user's profile, to the Friends "pending requests"
view, or do nothing is a product/UX call — flag it, don't assume. This is display-text only unless
the pickup decides to wire navigation.

## Explicitly out of scope

No backend change — U13 already emits and consumes both events. No change to the `default:` fallback
or its dev warning. No notification aggregation/display changes beyond the switch cases (+ the
navigation decision above, if taken).
