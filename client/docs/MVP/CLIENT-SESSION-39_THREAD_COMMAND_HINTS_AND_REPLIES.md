# CLIENT-SESSION-39 · Session thread: command hints and command results

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-51 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

The client side of the chat commands: input hints or autocomplete for `:add`, `:del`, `:upd` and player mentions, and how a command comment or its reply renders in the thread (en/vi). Scope depends on where SESSION-51 decides to parse.

**Out of scope:** The server side (SESSION-51).

**Tests:** Vitest for the hints and the rendering; a scoped e2e.
