# SESSION-49 · A session with a null title makes `getSessionTitlesByIds` throw and the whole notification list 500

**Status:** `TODO`
**Type:** Bug Fix · **Depends on:** none ·
**Filed:** 2026-11-11, found live: after login `GET /api/notifications` returned 500 INTERNAL_ERROR
while every other request worked (unread-count included). Cause from code reading, not yet
reproduced against the failing data.

## What's wrong

`SessionServiceImpl.getSessionTitlesByIds` builds its map with
`Collectors.toMap(Session::getId, Session::getTitle)`. `toMap` throws a NullPointerException on a
null value, and `Session.title` is nullable (`@Column(length = 200)`, no `nullable = false`).
`NotificationServiceImpl.getNotifications` calls it for every session-type notification in the
page, so one notification pointing at a session with no title fails the whole list.

## Fix direction

Make the method null-safe: skip null titles (the caller already reads `sessionTitlesById.get(id)`
and tolerates a missing entry; `entityTitle` becomes null). Confirm at pickup how a null title
arises (SESSION-46/48 or the new session form) and whether the entity should enforce one instead.
Cross-domain: `notification-impl` is the only caller found so far, to be censused at pickup.

**Out of scope:** the notification client's display of a title-less session (a fallback label is a
client ticket if wanted).

**Tests:** Spock for the null-title case; IT test for `GET /api/notifications` with a notification
whose session has no title (a mock cannot prove the real 200).
