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

### Applied automatically

- A new client image replaces the old one with the next deploy; nothing else changes on the box.

### Manual actions on the box

- none

### Rollback

- Redeploy the previous client image. A Preparing session created with the new form stays editable only through the new endpoints, so roll the client back only together with the server (see Depends on).

### Depends on

- SERVER SESSION-46: the per-gender slots, game mood and fee note fields, the Preparing-only edit rule, and `POST /api/sessions/{id}/schedule` (migrations V085 to V087). Ship the server first or together; an older server rejects the new fields and has no schedule endpoint.

## 0.1.1 — 2026-11-02

### Changes

- Released before release notes existed; see `git log client-v0.1.0..client-v0.1.1`.

## 0.1.0 — 2026-10-28

### Changes

- Released before release notes existed; see `git log client-v0.1.0`.

