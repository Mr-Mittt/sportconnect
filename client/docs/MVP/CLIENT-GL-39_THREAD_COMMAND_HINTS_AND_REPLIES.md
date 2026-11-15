# CLIENT-GL-39 · Session thread: command hints and command results

**Status:** `DONE` (2026-11-15)
**Type:** Feature · **Depends on:** SESSION-50 (done; SESSION-GL-51 is postponed, see below) ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

The client side of the chat commands: input hints or autocomplete for `:add`, `:del`, `:upd` and player mentions, and how a command comment or its reply renders in the thread (en/vi). The client parses and validates the commands (see the scope change below).

**Scope change (owner, 2026-11-14 and 2026-11-15, at pickup): a record command is not a comment.** The client never stores a command as a comment. When the user sends a comment (not a reply), the client checks whether it is a record command; if not, it is sent as a normal comment, unchanged.

A record command:
- starts with exactly a supported command (`:add`, `:upd`, `:del`); which commands are supported comes from the sport's record schema;
- is never posted to the thread, and carries **one record per command**;
- is validated by the client. When it is invalid, the client shows the validation message **in the system-comment format** (like "someone has joined"), **visible only to the current user**. It lives in the comment section's local state only: closing and re-opening the session modal removes it;
- when valid, the client builds the **same change-set request as the record dialog** (one item) and sends it to the existing records API. If the request fails, the error is shown the same way (local, caller only, nothing sent to the others, no spam).

Templates:
- `:add <record-input>`
- `:upd <record-id> <record-input>`
- `:del <record-id>`

`<record-input>` is sport-specific. Open: define it in the record schema, or generate it from the same schema fields the record dialog already uses (players per side, record mode). Recommendation: generate it from the schema, add a per-sport override in the schema only if a sport needs one.

**Decided (owner, 2026-11-15):** the id in a command is the bare real id (`:upd 123 ...`), no `#` prefix. A text that starts with a supported command but does not parse shows the local error and sends nothing (it is not sent as a normal comment). Scores are part of the record input and are optional as a whole: `:add @a @b 23 vs 19 @c @d` (checked with the dialog's `validateRecord`; the winner goes first as in the dialog; a team's scores are read from the schema's score slots, more than one slot is comma-separated, one value per slot: `@a @b 21,18 vs 15,21 @c @d`).

**Also decided (owner, 2026-11-15):** a reply never runs a command (only a top-level comment is checked). Hints show only to users who can log results, only in `ONGOING`/`COMPLETED` sessions, and only for the commands the schema supports. The "my records" switch filters the record list only; there is no scoreboard in the section yet (CLIENT-GL-49), so nothing else is affected.

**Typing hints:** when the text being typed matches a record command, show a text hint for it. Typing `:` lists every supported command with its template; typing `:a` shows only the `:add` hint. `@` opens a player picker (JOINED participants).

**Record section changes (needed by the commands):**
1. A small **icon-only "copy record id" button** on every record row of the Result section, shown only to users who can log results. **Not in the dialog** (owner, 2026-11-15: the dialog edits rows directly). The section and dialog show the display number (#1, #2, ...), not the real id, so the button copies the **real record id** to the clipboard, to paste into `:upd` and `:del`. The Result section **no longer shows the display number (#1, #2, ...)** (owner, 2026-11-15: the copy button replaces it); the record dialog keeps it. This also settles concern 3 below: commands use the real id (global, never reused, stable), not the display position.
2. An **on/off switch on the left side of the section header** (opposite the Update button), no label, hint/aria-label "my records" (en/vi), that filters the list to the records the current user plays in. Default off.

**Follow-up filed:** SESSION-GL-63 (system comment and notification when a session record is changed, so every participant knows after a command succeeds). Until it lands, a successful command leaves no trace in the thread for the others; they see the change in the Result section.

**Out of scope:** A server-side parser (SESSION-GL-51 is postponed; revisit only if the discussion below ends with a server part).

**Tests:** Vitest for the hints and the rendering; a scoped e2e.

## Discussion to continue at pickup (2026-11-14, from the SESSION-GL-51 pickup that was postponed)

**Direction (owner's idea, agreed in principle):** the **client** parses and validates the command with the sport's record schema and calls the existing `POST /api/sessions/{id}/records/changes`. This fits the SESSION-50 design (the server stores `data` as-is and checks only access, status, the 24 h window, that the players are JOINED, and the limits; the client owns the sport rules) and gives one rule set for the dialog and for commands. The server needs no parser and no new endpoint. Consequence: most of what SESSION-GL-51 held moves into this ticket, and SESSION-GL-51 is postponed until the points below show a server part is still needed.

**Concerns to settle before building:**
1. **Two calls, not one.** The comment post and the records call can fail apart. Prefer calling the records API first and posting the comment only on success; otherwise show a failed state on the command comment.
2. **Only this client understands commands.** A second client or the chat service would need its own parser. Accepted for now?
3. **Stable game number for `:del 3` / `:upd 3`.** Record ids are global and the display number shifts after a delete; the records code has no per-session number (checked 2026-11-14: nothing in `session/record`). Options: the display position (simple, but `:del 3` can hit the wrong game after another user's delete) or a per-session counter (a column plus an API field: the only server change this idea might still need, and it would be SESSION-GL-51's reduced scope).
4. **The reply.** A "Game #4 added: ..." confirmation as a system comment cannot be posted by a client (users cannot author system comments; not yet checked how system comments are created in the session module). Without it, the thread shows only the command as typed, as the author's own comment; decide whether that is enough as an audit trail.
5. **Grammar and naming (proposal, not agreed):** `:add @a @b vs @c @d 21-15`, `:upd 3 @a vs @c 21-18`, `:del 3`; players by `@username`, JOINED participants only; the first team is the winner (the winner-first rule of CLIENT-GL-38).
6. **Who can use it:** the same gate as the dialog (participant or group member, ONGOING or COMPLETED, within 24 h of the end); the record API already enforces it.

## Status of the six concerns (2026-11-15)
1. **Two calls:** gone. A command is one records call; no comment is posted.
2. **Only this client parses:** accepted (owner's direction).
3. **Stable game number:** settled by the copy-id button: commands take the real record id. No server change.
4. **The reply:** no stored reply. Errors are local system-style messages visible to the caller only; a successful command shows nothing (owner, 2026-11-15), the Result section just refreshes; the shared confirmation is SESSION-GL-63.
5. **Grammar:** the templates above; the exact `<record-input>` text is open (see above).
6. **Who can use it:** the same gate as the dialog; the server enforces it.

## Implementation summary (2026-11-15)

**Design (approved 2026-11-15, restated).** Client only: no server change, no endpoint, no migration. A pure parser (`recordCommand.ts`) reads a command with the sport's record schema, the JOINED participants and the current records, reuses the record dialog's `validateRecord`, `winnerFirst` and `playersOf`, and the existing `useApplyRecordChanges` sends the same one-item change set. A hook (`useRecordCommands`, called from `useSessionDetailModalData`) owns the caller-only notices. The composer, the comment section and the Result section changed as listed below.

**What was built.**
- `recordCommand.ts`: `commandNameOf` (first word exactly `:add`, `:upd` or `:del`; `:added`, ` :add` and `hello :add` are normal comments), `mentionPlayers` (the token after `@` is the full name the record dialog shows), `parseCommand` (`:add <team 1> vs <team 2>`, `:upd <id> ...`, `:del <id>`; team 1 is players then scores, team 2 is scores then players; several score slots comma-separated; `:upd` and `:del` check the id is in the current list).
- `recordCommandHints.ts`: templates built from the schema (`:add @player1 [@player2] [score] vs [score] @player1 [@player2]`, `:upd <id> ...`, `:del <id>`), narrowing by the first word, the `@` word at the caret, the player list and the insert.
- `hooks/useRecordCommands.ts`: available only when the caller can edit (JOINED, inside the 24-hour window) on a supported schema; otherwise every text is a normal comment. Local errors, a REJECTED operation (`errors:codes.SESSION_RECORD_*`) and a failed request become notices (newest first, at most 3); a successful command shows nothing. The notices reset when the session changes or the modal closes (state derived from `sessionId`, so every page that hosts the modal gets it).
- `SessionCommentComposer`: optional `commands` prop; a command goes to `run` and is never posted; an invalid one keeps its text, a sent one clears the box; the template hints and the `@` list are drawn in place under the box (arrows, Enter or Tab pick, Esc closes). `SessionCommentSection` shows the notices between the composer and the thread with the new shared `SystemNoticeLine` (extracted from the `SESSION_SYSTEM` branch of `CommentItem`). A reply never runs a command (the reply box has its own path).
- `SessionResultSection` / `RecordCard`: no record number any more; an icon-only copy-id button per row (`CopyRecordIdButton`, the real record id, only for a caller who can edit); an icon-only "my results" switch left of Update (default off, filters the list and the 3-latest preview; the heading count stays the total). `RecordCard` was used only by this section, so the dialog is untouched.
- en and vi strings (`comments.command.*`, `result.copyId`, `result.myRecords`, `result.myRecordsEmpty`).

**Key decisions made while building (differences from the approved text).**
- Participants that share a full name all get a suffix (`Nam (1)`, `Nam (2)`), not only the second, so each one can be picked; a bare `@Nam` is "ambiguous".
- `@` matching is by the start of any word of the name (`@an` finds "Anh Tuan" and "Binh An", not "Bao"), not "contains"; names are compared ignoring case.
- The `@` list closes once a name is typed in full, so Enter sends the command instead of picking the same name again.
- A score before the players on the left side is reported on the player that follows it, so `:add 21 vs 15 @An` says the first side needs a player.
- The score rule is the schema's: scores are optional as a whole, a score has to be complete (both sides, every required slot).
- The copy button and the hints depend on `canEdit` (JOINED), not on group membership: a group member who has not joined sees neither, although the server would allow it (same as the dialog).

**Tests (all new, and each requirement mutation-checked: 7 mutations killed).** Vitest: `recordCommand.test.ts`, `recordCommandHints.test.ts`, `useRecordCommands.test.tsx`, `SessionCommentComposerCommands.test.tsx`, `SessionCommentSectionCommands.test.tsx`, and new cases in `SessionResultSection.test.tsx` (the existing ones lost the `#n` and gained the action column). Playwright: a second test in `e2e/flows/session-results.spec.ts` (hints, an invalid command, a valid `:add`, copy id then `:del`, the notice gone after reopening) and the CLIENT-GL-38 test no longer expects `#1`. The "my results" switch is covered by Vitest only (the e2e seed has the same two players in every game). Stories: `WithRecordCommands`, `WithCommandNotices`, `WithMyResultsSwitch`.

**E2E.** Scoped subset run (6 specs, 41 tests passed): `session-results` (2), `matches-journey`, `session-errors`, `session-form-layout`, `a11y`, `locale`; the full `e2e` project was not run (standing rule: scoped runs only unless asked). Vitest `src/features/session`, `src/shared` and `src/locales`: 153 files, 1696 tests passed; `tsc -b` and ESLint clean. Not done: a Storybook look at the new stories, a manual walk in a dev server, and a check against a real backend (no sport has a result schema in the dev database).

**Visual-regression expectation.** Baselines `session-results-section-{375,768,1280}.png` change (no record number, the "my results" switch in the header, a copy button on every row; the list header gained a matching empty column), recorded in `BASELINE-UPDATE-1`; `session-results-dialog-*` and every `session-detail-*` baseline must come back byte-identical (the dialog is untouched; the hint list and notices only show after typing `:` or a failed command, which no visual spec does). Visual regression was not run here.

**Follow-up filed:** SESSION-GL-63 (system comment and notification when a record is changed, NOTIF-11). Notification use case: logged in `NOTIFICATION_USE_CASES.md` (NOTIF-11 points to SESSION-GL-63).
