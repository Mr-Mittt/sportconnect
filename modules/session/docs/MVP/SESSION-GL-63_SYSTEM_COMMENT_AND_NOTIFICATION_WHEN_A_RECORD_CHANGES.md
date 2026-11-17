# SESSION-GL-63 · System comment and notification when a session record is added, changed or deleted

**Status:** `DONE` (2026-11-17)
**Type:** Enhancement
**Depends on:** SESSION-50 (done); best picked after CLIENT-GL-39
**Filed:** 2026-11-15, owner request while scoping CLIENT-GL-39: a record command typed in the thread is not stored as a comment, so nobody else would know a record changed.

When a record is added, updated or deleted in a session (through the dialog or a CLIENT-GL-39 command), the server writes a system comment into the session's thread and notifies the participants, so every participant knows. The server already has the pattern: `SessionServiceImpl.writeSystemComment` through `CommentService.createSystemSessionComment` (SESSION-21, authored by the session's creator, content templated on the server at write time). The comment text names the actor and the game, for example "Alex added game #4: A, B beat C, D"; en/vi handling follows the SESSION-21 precedent (decide at pickup how the server text is localised, as the client owns en/vi copy).

Inputs and outputs: triggered inside `SessionRecordService` after a successful change set, one comment per operation or one per change set (decide at pickup; a 50-operation change set must not flood the thread). Notification: a new outbox event and routing key; the client case (a `NotificationType` member and its text, en/vi) is part of the same change or a client ticket filed with it (CLIENT-NOTIF-4 rule).

Open at pickup: this is NOTIF-11 in `documentation/md/NOTIFICATION_USE_CASES.md` (noise during a busy session, digest or only after the session ends, who is notified: all participants or only the players named in the record, who counts as the actor). Whether the comment must also skip `session.comment.created` (as SESSION-21 does, to avoid a double ping). Account lifecycle: no new endpoint; the actor was already checked by the records call.

**Out of scope:** the chat-command parsing (CLIENT-GL-39); audit retention.

**Tests:** Spock for the text and the one-per-change-set rule; an integration test through the real records endpoint proving the comment is written in the same transaction and a failed change set writes none.

## Decisions at pickup (2026-11-17, owner, `/workon session`)

- **One comment per change set**, generic: "{user} has updated the result", written when at least one operation of the change set was saved (a change set where nothing changed writes nothing).
- **Notification:** every participant of the session (JOINED, REQUESTED and INVITED) except the actor; one per change set; a per-session cooldown so a busy session is not pinged repeatedly (the length is a design decision in Phase 3).
- **The record comment skips `session.comment.created`** (the SESSION-21 precedent: the notification of the change already pings, a comment ping would be a second one for one occurrence).
- **The comment is authored by the session's creator** (as every session system comment), the text names the real actor, resolved and stored at write time (a later rename does not rewrite history).

## Scope change, 2026-11-17 (owner): system comments become client-localised

Why: the server-baked English text (SESSION-21) cannot follow the user's language; the owner wants every system comment shown in the client's own en/vi copy, and the new record comment is the first one written that way.

- **Added:** a system entry carries a stable `systemCode` and `systemParams` (the actor's name, resolved at write time) next to the existing `content`, which keeps a plain-English fallback; the client renders the en/vi copy by code and falls back to `content` for an entry without a code.
- **Converted to codes:** the session system comments that exist (`SESSION_JOINED` at two write sites, `SESSION_LEFT`, `SESSION_STARTED`), the new `SESSION_RECORDS_UPDATED`, **and the `GROUP_SYSTEM` welcome post** (owner: include; its two variants, "joined the group" and "joined the group, invited by X"). `GROUP_SYSTEM` is a post, so its code and params live on the post.
- **Existing rows are not backfilled** (owner): old entries have no code, so they keep showing their stored English text; only entries written after this change localise.
- **Contracts touched (census at Phase 2):** the `comments` and `posts` tables (nullable columns, a migration), `CommentResponse` and `PostResponse`, `CommentService.createSystemSessionComment(s)` and `PostService.createSystemPost`, the client's mirrored `Comment`/`Post` types, `CommentItem`/`SystemNoticeLine` and the post card.
- **Client side:** rendering by code and the new notification type (`NotificationType` member and text, en/vi) are a client ticket filed with this one, **CLIENT-GL-51** (CLIENT-NOTIF-4 rule); until it ships, the fallback `content` keeps every entry readable, so the server change is safe to deploy first.

---

## Implementation summary (2026-11-17)

**Design as approved** ("approved, go implement"), built as designed, with one departure noted below.

1. **Migration `V091__system_entry_code_and_params.sql`:** nullable `system_code VARCHAR(40)` and `system_params JSONB` on `comments` and on `posts`; mirrored in the H2 `schema.sql`. No backfill (owner: old entries keep their English text).
2. **`post-api`:** new enum `SystemCode` (`SESSION_JOINED`, `SESSION_LEFT`, `SESSION_STARTED`, `SESSION_RECORDS_UPDATED`, `GROUP_MEMBER_JOINED`, `GROUP_MEMBER_JOINED_INVITED`); `SystemSessionCommentRequest`, `CommentService.createSystemSessionComment` and `PostService.createSystemPost` take a code and params; `CommentResponse` and `PostResponse` return `systemCode` and `systemParams`. `content` stays the English fallback.
3. **`post-impl`:** the `Comment` and `Post` entities store the two fields (`@JdbcTypeCode(JSON)` map, like `SessionRecord.data`), the system writers fill them and every response builder returns them.
4. **`session-impl`:** join (two sites), leave and start write their codes with the baked-in `name`; `SessionRecordServiceImpl.applyChanges` now, when at least one operation was saved (status not `REJECTED` or `UNCHANGED`), writes one `SESSION_RECORDS_UPDATED` comment ("{name} has updated the result", authored by the session's creator, name baked in) and one `session.record.changed` outbox event (`SessionRecordsChangedEvent{sessionId, actorId}`), in the same transaction. The comment does not emit `session.comment.created`. A comment failure rolls the whole change set back (the same as join and leave today).
5. **`group-impl`:** the welcome post writes `GROUP_MEMBER_JOINED` (`name`) or `GROUP_MEMBER_JOINED_INVITED` (`name`, `inviter`).
6. **`notification-impl`:** `SessionEventsConsumer` fans `session.record.changed` out to every JOINED, REQUESTED and INVITED participant except the actor, in any session status.

**Departure from the plan:** no separate per-session cooldown. `NotificationService.recordEvent` already keeps one unread notification per recipient, type and session and only raises its actor count, and the only push is an in-app badge refresh, so a busy session cannot flood anyone; this was stated in the plan the owner approved. Proven by `twoRecordChangedEvents_foldIntoOneUnreadNotificationPerRecipient`.

**Consumer census:**

| Consumer | Result |
|---|---|
| `CommentService.createSystemSessionComment(s)`, `SystemSessionCommentRequest` (`SessionServiceImpl`, `SessionGenerationService`, 2 specs) | updated in this change |
| `PostService.createSystemPost` (`GroupServiceImpl`, 8 spec call sites) | updated in this change |
| `CommentResponse` builders (2 in `CommentServiceImpl`) and `PostResponse` builder | updated (new optional fields) |
| The preview-comment builders in `PostServiceImpl` | compatible as-is: they never carry a system comment (a `SESSION_POST` is unreachable from any feed) |
| `comments` and `posts` tables, H2 `schema.sql` | updated (nullable columns) |
| `SessionEventsConsumer` and its specs | updated (new routing key) |
| Client `Comment` and `Post` types, MSW mocks | compatible as-is (new fields optional); rendering by code and the new `NotificationType` are **CLIENT-GL-51** (filed) |

**Account lifecycle:** no new endpoint; the actor already passed the records gate (and the per-request `isActive` check) in the same call.

**Tests.** Spock: `SessionRecordServiceImplSpec` (one comment and one event per saved change set, many operations still one, delete alone / update alone / restore each count, nothing saved writes nothing in four ways, `maxRecords` refusal, unknown caller named "A participant", a comment failure rolls back and writes no event), `SessionServiceImplSpec` (codes and params), `SessionGenerationServiceSpec` (started code), `CommentServiceImplSpec` (store and return code and params), `PostServiceImplSpec`, `GroupServiceImplSpec` (both welcome variants), `SessionEventsConsumerSpec` (recipients and session statuses). Integration tests: `SessionRecordsIntegrationTest` (now on a real Redis and real `SESSION_POST` anchors; 5 new: comment, code, params, authorship, outbox payload, no `session.comment.created`, the thread endpoint's JSON, two change sets, nothing saved, refused request), `SessionEventsConsumerIntegrationTest` (2 new over real RabbitMQ: recipients, the actor and a participant who left get nothing, completed session; two events fold into one unread row), `PostErrorCodesIntegrationTest` (the group feed returns the welcome post's code). Module tests (`post-impl`, `group-impl`, `session-impl`, `notification-impl`) pass. `:server:test`: 793 tests; the one failure was a wrong assertion of mine in the new `PostErrorCodesIntegrationTest` case (a JsonPath filter returns `[null]`, not empty), fixed and that class re-run (37 passed); the rest of the suite was not run a second time.

**Mutation check.** 18 mutants of the new logic against the scoped specs; all 18 killed (announce skipped, `UNCHANGED` or `REJECTED` counted as saved, wrong routing key, wrong code, comment authored by the actor, left using the joined code, no `name` param, started without a code, batch dropping the code or the params, responses dropping the code or the params, system post dropping the code, welcome variants swapped, inviter param missing, consumer limited to JOINED, consumer limited to active sessions).

**N+1:** none (one user lookup per change set).

**Not run:** `V091` against a real Postgres (the H2 mirror only; the column type is the same `jsonb` as `session_records.data`), a live server, the client.
