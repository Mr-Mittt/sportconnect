# SESSION-GL-63 · System comment and notification when a session record is added, changed or deleted

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** SESSION-50 (done); best picked after CLIENT-GL-39
**Filed:** 2026-11-15, owner request while scoping CLIENT-GL-39: a record command typed in the thread is not stored as a comment, so nobody else would know a record changed.

When a record is added, updated or deleted in a session (through the dialog or a CLIENT-GL-39 command), the server writes a system comment into the session's thread and notifies the participants, so every participant knows. The server already has the pattern: `SessionServiceImpl.writeSystemComment` through `CommentService.createSystemSessionComment` (SESSION-21, authored by the session's creator, content templated on the server at write time). The comment text names the actor and the game, for example "Alex added game #4: A, B beat C, D"; en/vi handling follows the SESSION-21 precedent (decide at pickup how the server text is localised, as the client owns en/vi copy).

Inputs and outputs: triggered inside `SessionRecordService` after a successful change set, one comment per operation or one per change set (decide at pickup; a 50-operation change set must not flood the thread). Notification: a new outbox event and routing key; the client case (a `NotificationType` member and its text, en/vi) is part of the same change or a client ticket filed with it (CLIENT-NOTIF-4 rule).

Open at pickup: this is NOTIF-11 in `documentation/md/NOTIFICATION_USE_CASES.md` (noise during a busy session, digest or only after the session ends, who is notified: all participants or only the players named in the record, who counts as the actor). Whether the comment must also skip `session.comment.created` (as SESSION-21 does, to avoid a double ping). Account lifecycle: no new endpoint; the actor was already checked by the records call.

**Out of scope:** the chat-command parsing (CLIENT-GL-39); audit retention.

**Tests:** Spock for the text and the one-per-change-set rule; an integration test through the real records endpoint proving the comment is written in the same transaction and a failed change set writes none.
