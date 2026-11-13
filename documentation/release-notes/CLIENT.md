# client release notes

One section per released version, newest first. Write your lines under `## Unreleased` in the same PR as the change
(rules and format: [README.md](README.md)). `/release client` checks this block, turns it into the next version's section,
writes a fresh template and uses the section as the release PR description. Versions before this file existed only say so; the history is in git.

## Unreleased

### Changes

- CLIENT-SESSION-34: the create-session form is now five collapsible sections (Overview, When, Where, Who, Cost) plus the sport's Session detail, with an end time that follows the duration, one-minute time pickers, a game mood slider, "Who can join" (Anyone / By gender with male and female slots), a fee note, and an "Are you ready?" confirmation before a session is created. Title and duration are optional; the description field is gone.
- CLIENT-SESSION-34: the session detail modal shows the same sections, collapsed with a `field: value` summary. On a Preparing session every viewer sees a warning banner; the host edits one section at a time (Edit, Save, Discard in the section header) and leaves the draft with "Mark it scheduled", which also opens by itself when the last missing field is saved. Session cards show the game mood and the gender split. Auto approve now asks for confirmation, and closing the create form with unsent entries asks "Leave without saving?" (a value the sport's schema fills in by itself is not an unsent entry, so an untouched form closes at once).

- SESSION-49: the session title is required and pre-filled in the create form (en `<first name>'s session`, vi `Trận đấu của <first name>`); a blank title shows an inline error and blocks Create, and the detail editor cannot save a blank title.

- CLIENT-NOTIF-6: the live notification socket and the chat socket no longer keep retrying with an expired access token. Each connect attempt sends the current token; a refused connection refreshes it once (one shared refresh for the whole app) and reconnects, and a refresh that is refused for good stops the socket. A refresh that arrives late can no longer sign the user out.

- CLIENT-SESSION-37: anyone who cannot edit a session (not the host, or the session is no longer Preparing) now sees the detail modal as two collapsed sections, "Session information" (all the fields) and "Players" (the avatars), instead of six blocks. A session the system cancelled reads "Auto-cancelled on <time>" instead of "Cancelled by unknown", and the session status is shown in upper case. The host of a Preparing session no longer sees the "host is still preparing" banner meant for viewers, only what is still missing.

- CLIENT-GL-38: the session detail has a collapsible "Results" section (ONGOING and COMPLETED sessions of a sport that has a record schema) listing the games logged, the winner (first team) drawn on the side and in the tone the sport's schema says, with Won / Lost in words. A joined player gets an Update button (until 24 hours after the session ended) that opens a dialog to add, edit and delete games: players picked per team, scores per the schema's slots, a red border while typing and on Save for a team below the minimum players, the same player on both teams, or an incomplete or invalid score; each row has a delete (strike-through) and undo button. Save sends only the changes; a game the server refuses stays at the bottom of the dialog with its reason. En and vi copy. The scoreboard is CLIENT-GL-49.

- CLIENT-GL-38: the "Starts at" picker no longer offers a time in the past: hours before now (today) and minutes before now (this hour) are disabled, landing on the current hour moves a past minute to now + 15 (:59 at most), the default start after 23:00 is tomorrow at 00:00, and a start that has passed while the form stayed open shows "The start time can't be in the past." and blocks Create (or Save in the session detail editor). The server will refuse it too (SESSION-62).

- SPORT-18: the admin sport detail has a "Record schema" section (the same JSON editor as the profile and session attributes) to set what one logged result is for a sport, with a note when the app cannot read the document. Until a sport has a record schema, its session detail shows no Results section.

- CLIENT-GL-38: every empty-state line ("No comments yet.", "No friends found.", "Nothing here yet.", and the like) is now centered across the app, and a collapsed section with nothing in it (the session Results section, the friend list sections) shows its empty line without having to be opened.

- CLIENT-GL-38: session sections are tighter (smaller padding) and their buttons sit to the left of the collapse arrow; a collapsed Players section shows the avatars in its header. Every dialog title is centered. The record dialog is a table (index, team 1, score 1 - score 2, team 2) with the Winner and Loser labels in its first row, picks players from dropdowns that leave out the players already in the record, and is smaller than the session detail so its title and comment box stay visible.

- CLIENT-GL-38: saving a result puts the higher-scoring team first (typed on the wrong side, it moves with its score), and the record dialog stays open after a save;
- CLIENT-GL-38: the comment box is the first thing of the thread in the session and post modals; a reply box opens focused with your avatar, sends on Enter, closes when left untouched and turns its button into a red X while empty; replies are newest first; the heart count follows the timestamp, whose hover shows the full date and time; the session modal body is tighter (`gap-1 px-1 py-1`);
- CLIENT-GL-38: the record dialog picks players from an avatar dropdown (avatar and name, a red X to remove), shows Winner / Loser as sticky colored text, gives an edited field the focus-colored border and keeps a deleted record in place, gray; the Results section brings the Winner / Loser labels back above the list;
- CLIENT-GL-38: the Results section lists games one per line (#, team 1 and its score, team 2 and its score, the left pair right-aligned and the right pair left-aligned), the 3 latest while collapsed and all of them when open, players as `Alice Nguyen / Bob Tran / ...(3)` (a name is cut with an ellipsis only when there is no room; hover for the full list) and `-` for a missing score; the record dialog shows the avatar and name of each picked player, right-aligns the right team, greys out empty fields and drops their placeholders once something is entered, and marks a missing player like a missing score.

### Applied automatically

- A new client image replaces the old one with the next deploy; nothing else changes on the box.

### Manual actions on the box

- none

### Rollback

- Redeploy the previous client image. A Preparing session created with the new form stays editable only through the new endpoints, so roll the client back only together with the server (see Depends on).

### Depends on

- SERVER SESSION-50 (session records, `GET/POST /api/sessions/{id}/records[/changes]`, `GET /api/sports/{id}/result-schema`, migration V089). The section stays hidden for a sport until an admin sets its result schema (`PUT /api/sports/{id}/result-schema`, the admin screen is SPORT-18).
- SERVER SESSION-46: the per-gender slots, game mood and fee note fields, the Preparing-only edit rule, and `POST /api/sessions/{id}/schedule` (migrations V085 to V087). Ship the server first or together; an older server rejects the new fields and has no schedule endpoint.

## 0.1.1 — 2026-11-02

### Changes

- Released before release notes existed; see `git log client-v0.1.0..client-v0.1.1`.

## 0.1.0 — 2026-10-28

### Changes

- Released before release notes existed; see `git log client-v0.1.0`.

