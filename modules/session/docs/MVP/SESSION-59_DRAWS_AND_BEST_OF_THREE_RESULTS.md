# SESSION-59 · Draws and best-of-three results

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

Deferred by the BA until after the leaderboard is implemented: a sport template that allows draws, or records a score or best-of-three, with the points rule for a draw. Mostly schema and client work plus the statistics that read those fields.

**Out of scope:** Tournaments and brackets.

**Tests:** Decided at pickup.

**Generic statistics note (2026-11-23):** Under the generic statistics design (`STATISTIC_RANKING_DESIGN.md` section 3) a draw is the outcome `DRAW` produced by the `COMPETITIVE` reader and counted in the core counter `draws`; best-of-three is a record-type or schema decision for the reader, not a change of the engine.

## Hand-over from the SESSION-53 rework (2026-11-25, owner)

- **The flag exists: `record.data.allowDraws`** (boolean, default false; `StatisticsSchema.allowDraws()`). The group head-to-head already stores a draws number for such a sport (`[wins1, wins2, draws, seq]`, `GroupH2hDoc`, unit-tested), but **no game can be a draw end to end**: the `COMPETITIVE` reader refuses a game the first team did not win (`FIRST_TEAM_NOT_AHEAD`) and never gives `Outcome.DRAW`. This ticket makes the reader give `DRAW` for a tied score of a sport that allows draws, which then reaches `StatsCounters` (a draw counts the game and adds no win or loss) and the head-to-head.
- **A draws stat is a catalog change, not a schema one:** the stats a sport can list are the catalog's (`StatsCatalog`, equal to the client's `record-ui-v1.json` `COMPETITIVE.scoreboard.columns`, a contract test fails if they differ). A `draws` column (and a points formula) means adding it to both, with `StatsCatalog.counts("draws", outcome)`; until then a draw is only the games not won or lost.
