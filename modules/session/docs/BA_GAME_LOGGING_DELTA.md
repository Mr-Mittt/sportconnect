# Game logging: what the BA document should change

**Status:** Draft for the BA, 2026-11-12
**Compares:** `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md` (dated Nov 7, decisions of Nov 9, 2026) against the implementation decisions in `modules/session/docs/SESSION_RECORDS_DESIGN.md`
**Tickets:** SESSION-50 (server), CLIENT-GL-38 (client); follow-ups SESSION-GL-51 (was 51) to 60, CLIENT-GL-39 (was CLIENT-SESSION-39) to CLIENT-SESSION-48, SPORT-18
**Scope of this comparison:** the game logging part (GL-1 to GL-9, the roles table, the sport template section, the standalone/group table, the non-functional rows and the three open questions). Statistics, boards, seasons, adjustments and guests are deferred, so only the places where today's decisions constrain them are listed.

How to read it: **Server** and **Client** say where the decision is enforced. "Update BA" is a suggested change to the BA text; "Confirm" needs a BA answer.

---

## 1. Changes of wording or meaning (existing BA text)

| BA item | What the BA says | Implementation decision | Where | Update BA |
|---|---|---|---|---|
| Key concepts: **Game**, **Result template**, **Result unit** | A game is one result between two sides; the template is read from seed data | The stored unit is a generic **record**; "game" is the badminton/pickleball label. The template is the sport's **result schema** (a jsonb column on the sport, like the session attribute schema), mainly read by the client. Two kinds are designed, `MATCH` (sides and a winner) and `RECORD` (per-player times and distances); only `MATCH` is built | Both | Add the terms *record* and *result schema*; say that a game is a `MATCH` record and that running, cycling and swimming will be per-player records, not games |
| Sports and templates: "first release reads the badminton template from seed data" | Seed data | Not seeded: set through admin endpoints (`PUT /api/sports/{id}/result-schema`, SESSION-50); the admin screen is SPORT-18. Adding a second sport is a data change plus, for a new kind, code | Server | Keep; note the BA acceptance criterion "second sport by configuration alone" holds only for sports that use an existing kind |
| **GL-1** attendance | "The host can mark attendance for a session. Only attendees can be picked" | **No attendance concept.** The players who can be picked are the session's `JOINED` participants. Nobody marks attendance | Server (players must be `JOINED`), Client (picker lists them) | Reword GL-1; remove "Mark attendance" from the roles table; the answer to open question 2 is "attended = joined". **Confirm:** in a group session, members who never pressed Join cannot be picked (any group member may still log). If the group's habit is "members just show up", the group needs a way to join them in bulk or a real attendance step (a later ticket) |
| **GL-2** two sides and the template's players per side | Number per side from the template | From the sport's result schema, but **enforced by the client only**. The server does not check side sizes | Client | Say it is a UI rule; a one-against-two game is allowed by the badminton schema |
| **GL-3** winner only | Template can ask for a score or allow a draw | Same, as schema fields the client reads. Draws, score and best-of-three are not built (SESSION-59) | Client | Keep |
| **GL-4** no player on both sides | Must | **Client only.** The server checks that players are distinct and `JOINED`, not which side they are on | Client | Say "the app prevents it"; accept that a faulty client could store a record that breaks it. **Confirm** this is acceptable (the effect is limited to that session; statistics skip a malformed record) |
| **GL-5** what a game stores | Session, players, winning side, who logged, when | Row: session, an opaque `data` object (the players too, since 2026-11-13: the server stores no separate player list) (the winning side and any sport fields live inside it), who created and when, who last changed it and when, a client-generated request id for safe retry. The winning side is therefore not a column | Server | Update the field list; add "last changed by and when" |
| **GL-6** live per-player wins, losses, net points | Live session screen | **Computed on the client** from the record list and the schema's points rule. The server has no scoreboard endpoint in this slice. There is no live push: the list is refetched when the section is opened and after each save (a refetch on refocus or a timer is not decided yet) | Client | Say where it is computed; "live" means refreshed on those events (a push is a later option). Later statistics (ST) are computed on the server from the stored records and must agree with the client's session scoreboard |
| **GL-7** 24-hour window | "24 hours after the session ends"; any member changes or deletes; audit entry for every change | The window is `scheduledEndAt + 24 hours` (every session that can be scheduled has an end time). **Adding** a record after the window is also refused (the BA is silent). Logging, editing and deleting are possible only while the session is `ONGOING` or `COMPLETED`, never while `PREPARING`, `SCHEDULED` or `CANCELLED`. No admin override (matches the BA decision). Deleting is a real delete, and the audit entry (before and after content, who, when) is the only trace | Server | State the window as `scheduledEndAt + 24h`, the allowed statuses, and that adding is covered. Say a deleted game is not recoverable except by logging it again |
| **GL-8** shortcuts | Should | Not in this slice (CLIENT-SESSION-45); can be derived from the session's own records | Client | Keep as Should |
| **GL-9** offline | Should | Not in this slice (CLIENT-SESSION-46). The server already makes a resent request safe through the client request id, so the later client queue needs no server change | Client | Keep as Should; add the question of what happens if the 24-hour window closes while the change is waiting |
| Roles table | Host and group admin extra rights; "Add a guest" Host/Admin | For records there is **no extra role**: in a group session any active group member, in a standalone session any `JOINED` participant, can add, change and delete any record (not only their own). Host and admin have no extra rights for records | Server | Collapse the log/edit/delete rows to one rule; "Add a guest" waits for SESSION-52 |
| Standalone and group table: **Players** | Group: group members plus guests; standalone: approved participants plus guests | Both: the session's `JOINED` participants (guests later) | Both | Update the first row |
| Standalone and group table: **Visibility** | Group members only / session participants only | Reading records: group session = active group members; standalone = `JOINED` participants. `REQUESTED` and `INVITED` participants can neither read nor write | Server | State that requested and invited participants see nothing, or **confirm** they may read |
| **NF-2** three taps once players are chosen | Proposed | The dialog is a draft that is saved once, so the sequence is: pick the winning side, add the row, Save. Confirm the Save tap counts | Client | **Confirm** how taps are counted for a batch (several games, one Save) |
| **NF-4** recalculation, no migration | Proposed | Holds: nothing is stored as a total | Both | Keep |
| **NF-5** audit visible to group members | Proposed | **Dropped (2026-11-13).** No audit trail is stored, so there is nothing to show | Server | Remove NF-5 or move it to a later release (a retention rule would be needed first) |
| **NF-7** English and Vietnamese | Decided | The UI, the sport's labels and the error codes (`SESSION_RECORD_*`) are en and vi. The client's own validation messages are client strings | Client | Keep |

## 2. Requirements the BA does not have and should add

1. **Concurrent changes (new NF).** Many players may change the results at once. Rule: first come first served, nobody gets a conflict error. Two simultaneous adds both succeed with different ids. A change to a record someone else deleted meanwhile brings it back as a new record (the later request wins); a delete of an already-deleted record does nothing. Each record is replaced whole, so the dialog sends only the records the user changed, so edits to other records are never overwritten.
2. **Stable identity versus display number.** A record has a unique id that is never reused. The "#1, #2, #3" shown are positions by creation order and shift after a delete. Any feature that refers to a game by number (the chat commands below) needs a separate stable per-session number.
3. **One Save for the whole dialog.** The Result dialog is a draft: adds, edits and deletes are sent together as one change set (at most 50 operations, 64 KB). If one item is invalid, nothing is saved and the error names the item.
4. **Limits (abuse protection).** Per sport: maximum records per session (default 100, ceiling 500) and maximum bytes per record (default 2 KB, ceiling 8 KB); a 64 KB request cap; a nesting-depth cap. The BA needs a business number for the real maximum games in one session. **Confirm** 100.
5. **A result section on the session screen.** A collapsible "Result / Kết quả" section under the players, collapsed by default, shown only for `ONGOING` and `COMPLETED` sessions whose sport has a result schema, with an "Update" button that opens the dialog.
6. **Chat commands as a second entry path (new, SESSION-GL-51).** `:add`, `:del`, `:upd` typed in the session's post chat. The grammar, how players are named, a stable per-session number and the reply are open and settled when that ticket is picked up.
7. **Who may be named.** Only `JOINED` participants of that session can appear in a record; the server enforces it because standalone games later count in each named player's career statistics, so a participant must not be able to log games against arbitrary users.
8. **Malformed records.** The server stores the payload as it is, so statistics skip a malformed record. The BA acceptance criteria "statistics match hand-checked results" should say records are well-formed by construction of the app, and what the product does with a malformed one (skipped silently, or flagged).
9. **No notification.** Adding, changing or deleting a record notifies nobody in this slice (candidate NOTIF-11).
10. **Deactivated users.** A deactivated account is refused by the existing authentication gate on every call, so records cannot be added, changed or read by them.

## 3. Open questions in the BA, revisited

| BA open question | Outcome |
|---|---|
| 1. Which date does a game belong to for seasons? | Not decided here. Records carry `created_at` and the session carries its start and end, so the "session's local date" recommendation is possible. Settled in SESSION-55 |
| 2. Is "attended" the same as "joined"? | Yes, for this slice (see GL-1 above), with the group-member consequence to confirm |
| 3. Two members log the same game at once? | The server never blocks or rejects (see new requirement 1); a duplicate is allowed. The client warns when the same players and winner appear within a few minutes (CLIENT-SESSION-47) so one can be removed. **Confirm** the window ("a few minutes") |

## 4. Not in the first slice (still in the BA, built later)

Guests (GU-1 to GU-4, SESSION-52), statistics (ST, SESSION-53), boards and ranking order (LB, SESSION-54), seasons, KPI and recap (SE, KP, SESSION-55), adjustments (AD, SESSION-56), shortcuts (GL-8), offline queue (GL-9), sharing cards (SH), CSV export (NF-8, SESSION-60), per-player records for sports without a head-to-head result (SESSION-58), draws and best-of-three (SESSION-59). The BA's first acceptance criterion (the founding group logs every game in SportConnect for four weeks) needs statistics and boards as well as logging, so it cannot be met by this slice alone.

## 5. Decisions needing a BA answer (summary)

1. Group members who never joined a session: allowed to be picked, or must they join? (GL-1)
2. Is a faulty client storing a record that breaks "no player on both sides" acceptable, given the UI prevents it? (GL-4)
3. Do requested and invited participants of a standalone session get read access to its records? (Visibility)
4. How are taps counted for NF-2 when the dialog saves several games at once?
5. Is 100 records per session enough as the default maximum?
6. How long is "a few minutes" for the duplicate warning?
7. What should happen to a malformed record in statistics?
8. Must adding a game after the 24-hour window be refused? (assumed yes)

## 6. Implementation log

Kept up to date as each ticket of the chain is built; each entry says what was built and what the BA text should now say.

### SESSION-50 (server), built 2026-11-12

| Topic | As built | BA text to change |
|---|---|---|
| Switching logging on for a sport | A sport has result logging only once an admin sets its result schema (`PUT /api/sports/{id}/result-schema`); nothing is seeded. Until then its sessions answer "results cannot be recorded for this sport" | Say that logging is enabled per sport by configuration, and that the badminton schema must be set by an admin before the founding group can start |
| Limits | Defaults 100 records per session and 2 KB per record, ceilings 500 and 8 KB, configurable per sport in the schema; at most 50 operations and 64 KB per request; `data` nested at most 10 levels. A burst of simultaneous adds can pass the record limit by a few | Add the limits as a non-functional requirement and confirm the 100 default (open question 5 stays open) |
| Window and statuses | Add, change and delete are refused unless the session is `ONGOING` or `COMPLETED` and now is no later than `scheduledEndAt` + 24 hours; reads stay open after the window | Matches GL-7 as rewritten in section 1 |
| Who may read | Records: group members (group session) or `JOINED` participants (standalone). A group member who never joined can log and read but cannot be named as a player | Matches the answer to open question 2 and its consequence (open question 1 of section 5 stays open) |
| Changes made at the same time | Never an error. Two adds both succeed; an update of a record someone just deleted stores it again as a new record (new id, status `RESTORED` in the response); deleting a record that is already gone does nothing; in one change set an id both updated and deleted is deleted | Add as the concurrent-changes requirement (section 2, item 1) |
| Retry | Each added record carries a client-generated id, so a retried request returns the stored record instead of creating a second. Known gap: two identical requests arriving at the very same instant can make one of them fail with a server error, because the second insert breaks the uniqueness rule; a normal retry (after the first finished) is safe | Mention that a retry is safe, not that simultaneous duplicates are handled |
| Audit trail | **None (changed 2026-11-13).** There is no audit table and no `GET /audit`. A deleted or replaced game leaves no history; each record keeps only who created it and who last changed it, with the times | **Drop BA GL-7's audit entry and NF-5**, or confirm they stay out of the first release |
| Notifications | None | Matches section 2, item 9 (candidate NOTIF-11) |

Open items this ticket adds to section 5: none new. Still waiting on the BA: questions 1 to 8.

### SESSION-50 change, 2026-11-13: no audit trail, no stored player ids

- **GL-7 / NF-5:** the audit entry for every change is not built. Deleting is final and an edit overwrites. BA text to change: remove "audit entry for every change" and NF-5, or defer them.
- **GL-5:** the stored game is the `data` object plus who created it, who last changed it, and when. The players are inside `data` (the client reads them there); the request sends a separate `playerIds` list only so the server can check each is `JOINED`. A game saved with a wrong `data` is not shown on the board, because the client validates it against the sport's schema when loading.

### SESSION-50 change, 2026-11-13: result size and count limits

- A game is limited to 4 KB of stored content (the same limit as other profile and session data). A session holds at most the sport's configured number of games (default 100, never more than 500), counting the games already saved: with 100 configured for badminton, the 101st cannot be saved and the app is told the limit was reached. Add both to the BA document as non-functional limits.

### SESSION-50 change, 2026-11-13: one bad game does not stop the others

- Saving several games at once: a game that is not valid (too big, names someone who is not in the session, past the sport's game limit) is not saved and is reported back to the app with the reason; every valid game is saved. Add to the BA document as the rule for a group save.

### CLIENT-GL-38 change, 2026-11-13: the game record is described by the sport's record schema

- **GL-4 / GL-5:** a game is two teams (the first is the winner by position), each with 1 to the sport's maximum players (badminton: 1 to 2) and, when the sport defines score slots, a score per slot; scores are optional but must be complete (both teams, all required slots). The same player cannot be on both teams. The earlier "tap the winning side" is gone: the winner is the first team. Contract: `documentation/md/RECORD_SCHEMA_CONTRACT.md`.
- **Scoreboard:** not part of logging. It moves to CLIENT-GL-49, so the session's Result section lists the games first.
