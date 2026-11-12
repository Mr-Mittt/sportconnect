# SESSION-51 · Chat commands `:add`, `:del`, `:upd` in the session post thread

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A second way to change results: commands typed in the session's post chat (the `SessionComment` thread). Both ways submit a one-item change set to the same `SessionRecordService`, which lives in the same module, so there is no dependency cycle.

To settle at pickup: the command grammar; how players are named (mentions or usernames); where the command is parsed (server in `createSessionComment`, or the client before it posts); a stable per-session number for `:del 3` / `:upd 3` (a per-session counter, since record ids are global identity values and the display number shifts after a delete); what the reply or the stored comment looks like; and whether the command comment doubles as a readable audit trail.

**Out of scope:** The dialog (SESSION-50 / CLIENT-SESSION-38).

**Tests:** To be planned at pickup; an integration test through the real comment endpoint is required (cross-bean wiring).
