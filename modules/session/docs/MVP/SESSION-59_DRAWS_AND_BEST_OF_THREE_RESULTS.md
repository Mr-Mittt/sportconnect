# SESSION-59 · Draws and best-of-three results

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

Deferred by the BA until after the leaderboard is implemented: a sport template that allows draws, or records a score or best-of-three, with the points rule for a draw. Mostly schema and client work plus the statistics that read those fields.

**Out of scope:** Tournaments and brackets.

**Tests:** Decided at pickup.

**Generic statistics note (2026-11-23):** Under the generic statistics design (`STATISTIC_RANKING_DESIGN.md` section 3) a draw is the outcome `DRAW` produced by the `COMPETITIVE` reader and counted in the core counter `draws`; best-of-three is a record-type or schema decision for the reader, not a change of the engine.
