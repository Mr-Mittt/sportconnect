# Game logging: what the BA document should change

**Status:** Handover to the BA, 2026-11-23 (first draft 2026-11-12; the implementation log in section 6 is kept to 2026-11-22). The corrected requirements text is `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards (revised 2026-11-23).md`; this file says why each change was made.
**Compares:** `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md` (dated Nov 7, decisions of Nov 9, 2026) against the implementation decisions in `modules/session/docs/SESSION_RECORDS_DESIGN.md`
**Tickets built (game logging):** SESSION-50 (server) and CLIENT-GL-38 (client) with SPORT-18 (admin screen for the sport's result schema); CLIENT-GL-39 (record commands in the session chat), SESSION-GL-63 and CLIENT-GL-51 (a system line and a notification when results change), SESSION-GL-64 and CLIENT-GL-50 (tagging people), CLIENT-GL-49 (session scoreboard), SESSION-65 (leave rule), SESSION-70, SESSION-71 and CLIENT-ADMIN-IMPORT-1 (admin import of past results). **Not built:** SESSION-GL-51 (postponed), SESSION-52 to 60, CLIENT-SESSION-40 to 44, 48 (and 45 to 47 in the client V1 backlog)
**Scope of this comparison:** the game logging part (GL-1 to GL-9, the roles table, the sport template section, the standalone/group table, the non-functional rows and the three open questions). Statistics, boards, seasons, adjustments and guests are deferred, so only the places where today's decisions constrain them are listed.

## 0. State at handover (2026-11-23)

Game logging is built, merged and in use for both session types. Statistics, boards, seasons, adjustments and guests are not built.

**What a player can do today.** Open a session that is ongoing or finished (and whose sport has a result schema), open the collapsible Result section, add, change and delete games in one dialog that saves once (or type `:add`, `:upd`, `:del` in the session's chat box), see the session scoreboard under the games, and filter to "my games". Everyone in the session is told when results change. An admin can import a month of past results from the group's spreadsheet.

**What the BA should read first: seven places where what was built departs from the BA text or its assumptions.**

1. **Notification (reverses the first answer).** A saved change to the results now writes a line in the session's thread and notifies every participant (section 2, item 9).
2. **Statistics, boards, seasons, KPI and adjustments are group only (owner, 2026-11-17).** The BA's "standalone games count toward a player's career statistics and head-to-head" is dropped; a standalone session keeps only its own scoreboard (section 1, last rows).
3. **History import is built as an admin tool** (the BA parks it): section 2, item 13 and section 5, question 10.
4. **A standalone session is public or private** (host's choice) and **a group session is custom or regular**: the BA's definitions of both change (section 1, key concepts).
5. **A joined player can leave only until 15 minutes before the start.** This makes "attended = joined" more stable (section 2, item 12).
6. **No duplicate warning for now (owner, 2026-11-17); shortcuts and the offline queue moved to the client V1 backlog.** Open question 3's window is parked, GL-8 and GL-9 stay Should.
7. **The scoreboard is the sport's configuration** (columns and sort order), not a fixed table (section 1, GL-6).

Still waiting on the BA: the questions in section 5 (the first eight from 2026-11-12, four new ones marked *new*).

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
| **GL-6** live per-player wins, losses, net points | Live session screen | **Computed on the client** from the record list. Which columns show (games, wins, losses, win rate, wins minus losses, score for, score against, score difference), in which order and sorted how is the **sport's own configuration** in its result schema (CLIENT-GL-49, 2026-11-17); the default badminton board is games, wins, losses and wins minus losses, which is the BA's default net points (+1 a win, -1 a loss). A different points rule is not built. The scoreboard is under the games and in the dialog, covers the whole session whatever the "my games" switch says, and highlights the caller. The server has no scoreboard endpoint in this slice. There is no live push: the list is refetched when the section is opened and after each save (a refetch on refocus or a timer is not decided yet) | Client | Say where it is computed; "live" means refreshed on those events (a push is a later option). Later statistics (ST) are computed on the server from the stored records and must agree with the client's session scoreboard |
| **GL-7** 24-hour window | "24 hours after the session ends"; any member changes or deletes; audit entry for every change | The window is `scheduledEndAt + 24 hours` (every session that can be scheduled has an end time). **Adding** a record after the window is also refused (the BA is silent). Logging, editing and deleting are possible only while the session is `ONGOING` or `COMPLETED`, never while `PREPARING`, `SCHEDULED` or `CANCELLED`. No admin override (matches the BA decision). Deleting is a real delete, and the audit entry (before and after content, who, when) is the only trace | Server | State the window as `scheduledEndAt + 24h`, the allowed statuses, and that adding is covered. Say a deleted game is not recoverable except by logging it again |
| **GL-8** shortcuts | Should | Not in this slice (CLIENT-SESSION-45, client V1 backlog since 2026-11-17); can be derived from the session's own records | Client | Keep as Should |
| **GL-9** offline | Should | Not in this slice (CLIENT-SESSION-46, client V1 backlog since 2026-11-17). The server already makes a resent request safe through the client request id, so the later client queue needs no server change | Client | Keep as Should; add the question of what happens if the 24-hour window closes while the change is waiting |
| Roles table | Host and group admin extra rights; "Add a guest" Host/Admin | For records there is **no extra role**: in a group session any active group member, in a standalone session any `JOINED` participant, can add, change and delete any record (not only their own). Host and admin have no extra rights for records | Server | Collapse the log/edit/delete rows to one rule; "Add a guest" waits for SESSION-52 |
| Standalone and group table: **Players** | Group: group members plus guests; standalone: approved participants plus guests | Both: the session's `JOINED` participants (guests later) | Both | Update the first row |
| Standalone and group table: **Visibility** | Group members only / session participants only | Reading records: group session = active group members; standalone = `JOINED` participants. `REQUESTED` and `INVITED` participants can neither read nor write | Server | State that requested and invited participants see nothing, or **confirm** they may read |
| Key concepts: **Standalone session** | "A public session not tied to a group" | A standalone session is **public or private**, the host's choice (SESSION-69, 2026-11-18). A private one is found by nobody in Discover, is seen only by its creator and anyone holding a participant row (joined, requested or invited), and cannot be shared. Records follow the same rules in both | Both | Reword the definition and the "Standalone and group" table: records rules do not depend on public or private |
| Key concepts: **Group session** | "Created by a group for its members, once or on a recurring schedule" | Two kinds (SESSION-GROUP-1 to 6): a **custom** session any active member creates by hand (the creator is joined, sport = the group's sport, members only, never public) and a **regular** session the system generates from the owner's or an admin's weekly or monthly slots. An audience (all members, or specific members) only decides who is notified; every member can see and join. Records rules are identical for both | Both | Reword; the BA's "Who runs it: host and group admins" holds for editing and cancelling the session, not for records (any member logs) |
| Standalone and group table: **Head-to-head and pair stats**, and the decision "Standalone games count toward a player's career statistics" | Standalone games count toward career statistics and head-to-head | **Group only (owner, 2026-11-17).** No statistic, head-to-head or board is computed from a standalone session; it keeps its own scoreboard (CLIENT-GL-49). SESSION-53 to 56 and CLIENT-SESSION-41 to 44 carry the note | Server | Change the row, the decision and NF-6's "standalone statistics" wording. **Confirm** (section 5, question 9) |
| **NF-2** three taps once players are chosen | Proposed | The dialog is a draft that is saved once, so the sequence is: pick the winning side, add the row, Save. Confirm the Save tap counts | Client | **Confirm** how taps are counted for a batch (several games, one Save) |
| **NF-4** recalculation, no migration | Proposed | Holds: nothing is stored as a total | Both | Keep |
| **NF-5** audit visible to group members | Proposed | **Dropped (2026-11-13).** No audit trail is stored, so there is nothing to show | Server | Remove NF-5 or move it to a later release (a retention rule would be needed first) |
| **NF-7** English and Vietnamese | Decided | The UI, the sport's labels and the error codes (`SESSION_RECORD_*`) are en and vi. The client's own validation messages are client strings. Since 2026-11-17 every system line in a session thread and the group welcome post carry a code and are shown in the reader's language; entries written before that stay in English | Client | Keep; note that older thread entries are English only |

## 2. Requirements the BA does not have and should add

1. **Concurrent changes (new NF).** Many players may change the results at once. Rule: first come first served, nobody gets a conflict error. Two simultaneous adds both succeed with different ids. A change to a record someone else deleted meanwhile brings it back as a new record (the later request wins); a delete of an already-deleted record does nothing. Each record is replaced whole, so the dialog sends only the records the user changed, so edits to other records are never overwritten.
2. **Stable identity versus display number.** A record has a unique id that is never reused. The "#1, #2, #3" shown are positions by creation order and shift after a delete. Any feature that refers to a game by number (the chat commands below) needs a separate stable per-session number.
3. **One Save for the whole dialog.** The Result dialog is a draft: adds, edits and deletes are sent together as one change set (at most 50 operations, 64 KB). If one item is invalid, nothing is saved and the error names the item.
4. **Limits (abuse protection).** Per sport: maximum records per session (default 100, ceiling 500) and maximum bytes per record (default 2 KB, ceiling 8 KB); a 64 KB request cap; a nesting-depth cap. The BA needs a business number for the real maximum games in one session. **Confirm** 100.
5. **A result section on the session screen.** A collapsible "Result / Kết quả" section under the players, collapsed by default, shown only for `ONGOING` and `COMPLETED` sessions whose sport has a result schema, with an "Update" button that opens the dialog.
6. **Chat commands as a second entry path (new, SESSION-GL-51).** `:add`, `:del`, `:upd` typed in the session's post chat. The grammar, how players are named, a stable per-session number and the reply are open and settled when that ticket is picked up.
7. **Who may be named.** Only `JOINED` participants of that session can appear in a record; the server enforces it because standalone games later count in each named player's career statistics, so a participant must not be able to log games against arbitrary users.
8. **Malformed records.** The server stores the payload as it is, so statistics skip a malformed record. The BA acceptance criteria "statistics match hand-checked results" should say records are well-formed by construction of the app, and what the product does with a malformed one (skipped silently, or flagged).
9. **A thread line and a notification when results change (SESSION-GL-63 and CLIENT-GL-51, 2026-11-17; replaces the first answer "no notification").** One saved change set writes one system line in the session's thread ("{name} has updated the result", in the reader's language, the name fixed at the time) and one notification to every participant (joined, requested and invited) except the person who saved. A busy session does not flood anyone: a person keeps one unread notification per session whose count of changers grows. A change set where nothing was saved writes neither. Tagging people does not notify yet (NOTIF-12, candidate).
10. **Deactivated users.** A deactivated account is refused by the existing authentication gate on every call, so records cannot be added, changed or read by them. The import (item 13) never matches a deactivated member, so they cannot be made a player.
11. **Tagging people in the session thread (SESSION-GL-64 and CLIENT-GL-50, 2026-11-16).** Typing `@` in a comment box offers the people who can see that thread (group members of a group session, participants of a standalone one); the search follows one rule everywhere in the app: first and last name, from the start of a word, accents ignored. The same list feeds the `@name` in the record commands. A tag is stored as a link to the person. No notification for a tag yet.
12. **Leave rule (SESSION-65, 2026-11-17).** A joined participant can leave only until 15 minutes before the start. After that, "joined" cannot change by the player's own action, which is what the game picker relies on ("attended = joined"). The BA should confirm that a player who really cannot come after that point is dealt with by the host, not by the app.
13. **Import of past results (SESSION-70, SESSION-71, CLIENT-ADMIN-IMPORT-1, 2026-11-22).** The BA parks "history import"; an **admin-only** tool exists. An offline script turns a monthly Google Sheet into a JSON file; an admin page uploads it, names the group and the location, sees a preview (each session with its games, each name matched by first name against the group's active members, an alias or a choice from the member list settles a name nobody or several matched), and applies it. Nothing is written while a name is unresolved. Each session is created as a finished group session with its players joined and one game record per game (winners first, no score); a session already there (same group, start and title) is skipped, so a repeat is safe. No thread line and no notification is sent. The dates are the sessions' local dates, so the BA's question 1 (which date a game belongs to for seasons) has the session's date as its answer for imported games. English only (an admin screen).

## 3. Open questions in the BA, revisited

| BA open question | Outcome |
|---|---|
| 1. Which date does a game belong to for seasons? | Not decided here. Records carry `created_at` and the session carries its start and end, so the "session's local date" recommendation is possible. Settled in SESSION-55 |
| 2. Is "attended" the same as "joined"? | Yes, for this slice (see GL-1 above), with the group-member consequence to confirm |
| 3. Two members log the same game at once? | The server never blocks or rejects (see new requirement 1); a duplicate is allowed. The first design had the client warn when the same players and winner appear within a few minutes (CLIENT-SESSION-47). **The owner dropped the warning for now (2026-11-17)** and moved the ticket to the client V1 backlog, so a duplicate is simply a second game that anyone can delete. The window is parked, not answered |

## 4. Not in the first slice (still in the BA, built later)

Guests (GU-1 to GU-4: SESSION-52 and CLIENT-SESSION-40), statistics (ST: SESSION-53 and CLIENT-SESSION-41, **group only**), boards and ranking order (LB: SESSION-54 and CLIENT-SESSION-42, group only), seasons, KPI and recap (SE, KP: SESSION-55 and CLIENT-SESSION-43, group only), adjustments (AD: SESSION-56 and CLIENT-SESSION-44, group only), shortcuts (GL-8: CLIENT-SESSION-45, client V1 backlog), offline queue (GL-9: CLIENT-SESSION-46, client V1 backlog), duplicate warning (CLIENT-SESSION-47, client V1 backlog), sharing cards (SH: CLIENT-SESSION-48), CSV export (NF-8: SESSION-60), per-player records for sports without a head-to-head result (SESSION-58), draws and best-of-three (SESSION-59), chat commands handled by the server (SESSION-GL-51, postponed: the client reads the commands instead, CLIENT-GL-39). The BA's first acceptance criterion (the founding group logs every game in SportConnect for four weeks) needs statistics and boards as well as logging, so it cannot be met by logging alone; logging is ready and the next step is the statistics chain (SESSION-53 with CLIENT-SESSION-41).

## 5. Decisions needing a BA answer (summary)

1. Group members who never joined a session: allowed to be picked, or must they join? (GL-1)
2. Is a faulty client storing a record that breaks "no player on both sides" acceptable, given the UI prevents it? (GL-4)
3. Do requested and invited participants of a standalone session get read access to its records? (Visibility)
4. How are taps counted for NF-2 when the dialog saves several games at once?
5. Is 100 records per session enough as the default maximum?
6. ~~How long is "a few minutes" for the duplicate warning?~~ Parked: no warning for now (owner, 2026-11-17).
7. What should happen to a malformed record in statistics?
8. Must adding a game after the 24-hour window be refused? (assumed yes)
9. *New.* Statistics, boards, seasons and adjustments are for group sessions only, and a standalone session keeps only its own scoreboard: is that the intended product rule (it reverses the 9 November decision on career statistics)?
10. *New.* The admin import of past results exists (item 13 of section 2): is it accepted as a first-release tool, and should imported games count in seasons by the session's own date?
11. *New.* Everyone in a session (joined, requested and invited) is notified when results change, one unread notification per session: right audience, and is "one per session, count of changers" enough?
12. *New.* A player cannot leave a session within 15 minutes of its start: is that acceptable for "attended = joined", or does the group need a real attendance step?

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
| Notifications | None in SESSION-50 itself | Added afterwards by SESSION-GL-63 (entry below); see section 2, item 9 |

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

### CLIENT-GL-39 change, 2026-11-15: games can be logged from the session chat box

- A second way to log, change and delete a game (GL-1 to GL-3): a message in the session's chat box that starts with `:add`, `:upd` or `:del` is a command, not a chat message. For example `:add @Bao @An 21 vs 15 @Binh @Chi` (the first side is the winner, scores are optional and follow the sport's rules), `:upd 12 @Bao 21 vs 15 @An` and `:del 12`. Players are chosen from a list that opens when you type `@`; the id comes from a small copy button on each game in the Results section.
- The app checks the command with the same rules as the Update dialog and sends the same request; the server has no separate rules for it. A mistake shows a short note that only the person who typed it sees, and it disappears when the session is closed. Nothing is written into the chat, and the other players were not told at first (done afterwards by SESSION-GL-63, entry below).
- Only a joined participant inside the 24 hours can use commands; for anyone else the same text is an ordinary message.
- The Results section no longer shows game numbers (#1, #2); a switch next to Update shows only the games you played in.

### SESSION-GL-64 and CLIENT-GL-50, built 2026-11-16: tagging people in the session thread

- A search of the people who can see a session's thread (`GET /api/sessions/{id}/thread-people`, 5 by default, 20 at most) on one app-wide name rule (first and last name, word start, accents ignored; the user search follows it too). In the client, the comment, reply and post boxes of the session thread and of posts are chip boxes: `@` opens the list, the tag is stored as a link to the person and shown as a chip; no tagging yourself outside a record command. BA text to change: none for GL, see section 2, item 11. A tag does not notify (NOTIF-12, candidate).

### CLIENT-GL-49, built 2026-11-17: the session scoreboard

- The scoreboard moved out of CLIENT-GL-38 and is configured by the sport (columns, titles, sort, in the result schema). It lists every joined participant plus anyone named in a valid game (a player who left keeps their games as "Former player"), under the games and in the dialog, collapsible, with an index column and the caller's row highlighted. BA text to change: GL-6 (section 1).

### SESSION-GL-63 and CLIENT-GL-51, built 2026-11-17: a thread line and a notification when results change

- One system line and one `session.record.changed` notification per saved change set (to every participant except the actor, one unread per person and session). System lines and the group welcome post carry a code and are shown in the reader's language; old entries keep their English text. The same ticket added the countdown and a leave question to the session detail and cards, the 7-day date rule for timestamps and a fee shown in two columns. BA text to change: section 2, item 9; NF-7.

### SESSION-65, built 2026-11-17: leave only until 15 minutes before the start

- A joined participant who tries to leave later is refused (`SESSION_LEAVE_TOO_LATE`); declining an invitation and cancelling a request are not affected. BA text to change: section 2, item 12 and question 12.

### SESSION-69, SESSION-66 (with CLIENT-SESSION-52, CLIENT-SESSION-49), built 2026-11-18: who sees a session, and sharing it

- A standalone session is public or private; a private one is seen only by its creator and anyone holding a participant row, and cannot be shared. Any user can share a standalone session with friends (a notification, no participant row; the friend decides to request). Group sessions are members only and can be shared with other members (SESSION-GROUP-3). Records are unchanged: group members or joined participants only. BA text to change: key concepts (section 1).

### Group-session chain, built 2026-11-19 to 2026-11-21 (SESSION-GROUP-1 to 6, 10, 12; CLIENT-GROUP-SESSION-1 to 6)

- Any group member creates a custom session (the creator is joined, members join with one tap because a group session approves automatically); the owner or an admin configures weekly or monthly regular sessions that the system generates in the location's timezone; the group's Sessions tab lists Today's, Later and History by status. For records this means: the picker still lists joined participants only, so **section 5, question 1 stays open**, but a member who wants to be picked joins with one tap and the generated and custom sessions need no extra step. BA text to change: key concepts (section 1).

### SESSION-70, SESSION-71 and CLIENT-ADMIN-IMPORT-1, built 2026-11-22: admin import of past results

- See section 2, item 13 for the behaviour. Limits worth knowing: group sessions only (no standalone import), names match by first name only (an alias or a pick settles a clash), no notification, no thread line, an import can be repeated safely. The offline script was run on the group's real October sheet (11 sessions, 83 games, no warning); the import itself is proven by automated tests and has not been run on production data. BA text to change: the parked "History import" line (section 2, item 13, question 10).
