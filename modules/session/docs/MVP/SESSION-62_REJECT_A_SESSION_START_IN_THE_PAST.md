# SESSION-62 · Reject a session start in the past (server validation)

**Status:** `TODO`
**Type:** Bug Fix / Enhancement
**Depends on:** none
**Filed:** 2026-11-13, owner decision (option 1) while working CLIENT-GL-38: `POST /api/sessions` accepts any `scheduledStart` (only `@NotNull`, no `@Future`), so a session can be created, by API or by picking an earlier hour today, in the past. The client now restricts and validates this in CLIENT-GL-38; this ticket is the server rule that makes it a guarantee.

`createSession` (and `updateSession` when it changes `scheduledStart`) refuses a start earlier than now minus a small grace (default 5 minutes, so a form left open for a minute still submits) with a coded 400, `SESSION_START_IN_PAST` (C12 contract; `errorParams` carries the earliest accepted instant). The check uses the injected `Clock`, like the other time rules of the module. Group recurrence generation is unaffected (it only generates future sessions); sessions that already start in the past stay as they are, and an update that does not touch `scheduledStart` is not blocked by an old past start.

Client: en/vi copy for `SESSION_START_IN_PAST` in `errors:codes` and its row in the I18N-4 census, in the same change or a client ticket filed with it (CLIENT-GL-38 already blocks a past start before it reaches the server, so this is the fallback for a stale form or another client). Check `useCreateSession` and the detail section save for how the code is shown (inline in the form, like `SESSION_FEE_AMOUNT_REQUIRED`).

Account lifecycle: no new endpoint. Notification use case: none.

**Out of scope:** back-filling games for a session that already happened (a separate decision: it would need an explicit "log a past game" path, not a past session start); changing the 24-hour records window.

**Tests:** Spock (past start refused, inside the grace accepted, update of another field unaffected, an unchanged past start on update accepted) and an IT in `server/src/test/java/com/sportconnect/integration/` for the 400 and its `errorCode`; mutation-check each rule.
