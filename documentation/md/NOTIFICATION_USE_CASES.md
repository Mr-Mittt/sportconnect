# Notification Use Cases

A running list of "should this event notify someone?" candidates found anywhere in the app —
tickets, `/vision` sessions, `/feature` scoping, bug write-ups — collected here so they don't stay
buried in whichever doc first raised them. There is no notification feature (push or in-app) built
yet anywhere in the codebase. This file exists so that when one is finally scoped, there's already
a real list of concrete triggers to design against instead of starting from a blank page.

## How to use this file

- Log a new candidate whenever a "should X notify Y" question comes up and isn't resolved on the
  spot — don't just leave it as an unresolved bullet in that feature's own doc; add it here too,
  with a pointer back to the source.
- Entries are numbered `NOTIF-<n>`, sequential, never reused even if a candidate is rejected.
- Status values: `CANDIDATE` (logged, not yet designed) · `CONFIRMED` (product decision made that
  this should notify — still not built) · `BUILT` (shipped, link the ticket) · `REJECTED`
  (considered and explicitly dropped — say why).
- When the notification feature itself is eventually scoped (via `/feature`), this file is the
  starting input — every `CONFIRMED`/`CANDIDATE` entry becomes a concrete case the design has to
  cover, not a fresh brainstorm.

---

## Use cases

### NOTIF-1 · New comment on a session you're in
**Date added:** 2026-08-07
**Status:** `CANDIDATE`
**Source:** `documentation/md/vision/SESSION_COMMENTS_VISION.md` (open question, not resolved)

When a participant posts a comment on a session (`SESSION-10`/`CLIENT-SESSION-8`), should the
other participants (`JOINED`/`REQUESTED`/`INVITED`) get notified? The session-comments vision
session explicitly left this open — v1 ships as fully opt-in (you only see new comments when you
open `SessionDetailModal`), no notification. Revisit once the notification feature is scoped.
