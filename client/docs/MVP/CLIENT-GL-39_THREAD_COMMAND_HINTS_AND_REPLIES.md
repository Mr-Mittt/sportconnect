# CLIENT-GL-39 · Session thread: command hints and command results

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 (done; SESSION-GL-51 is postponed, see below) ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

The client side of the chat commands: input hints or autocomplete for `:add`, `:del`, `:upd` and player mentions, and how a command comment or its reply renders in the thread (en/vi). Scope depends on where the command is parsed (see the 2026-11-14 note: the owner leans to the client).

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
