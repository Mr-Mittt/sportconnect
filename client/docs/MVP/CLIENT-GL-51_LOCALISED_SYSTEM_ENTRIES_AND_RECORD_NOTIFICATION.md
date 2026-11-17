# CLIENT-GL-51 · Localised system comments and posts, and the record-changed notification

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-GL-63 (the server side; this ticket can only be built against its contract) ·
**Filed:** 2026-11-17, `/workon session` SESSION-GL-63: the owner turned every system comment into a client-localised one and asked for the client side to be filed with it (CLIENT-NOTIF-4 rule: a new notification type and new codes the client branches on).

SESSION-GL-63 gives a server-written entry a stable `systemCode` and `systemParams` next to its `content` (a plain-English fallback). This ticket makes the client use them:

- **System comments** (a `SESSION_SYSTEM` comment, drawn by `CommentItem` through `SystemNoticeLine`) and the **`GROUP_SYSTEM` welcome post** (drawn by the post card) show the en/vi copy for their code, with the params filled in (the actor's or member's name; the welcome post has two variants, with and without the inviter). An entry without a code (every row written before SESSION-GL-63, which is not backfilled) keeps showing its stored `content`. Codes: `SESSION_JOINED`, `SESSION_LEFT`, `SESSION_STARTED`, `SESSION_RECORDS_UPDATED` ("{name} has updated the result"), and the group welcome codes (final names come with the server ticket).
- **The notification** SESSION-GL-63 sends to a session's participants when a result changes: a new `NotificationType` member (routing key fixed by the server ticket, expected `session.record.changed`) with its text in `getNotificationText`, en and vi, and the route it opens (the session). The type union is exhaustive, so the build fails until the case exists.
- Mirrored types: `Comment` and `Post` gain the optional `systemCode` and `systemParams`; the unknown-code case (a newer server) falls back to `content`.

**Out of scope:** backfilling old entries (owner: stay English); the server side; tagging notifications (NOTIF-12).

**Tests:** Vitest for each code in en and vi, the fallback (no code, unknown code) and the notification text; the I18N-4 census row is not touched (no server error is shown); a scoped e2e that opens a session thread and a group feed with a coded entry. Visual baselines: derive at pickup (the session thread and the group feed render these entries).
