# CLIENT-GL-49 · Session Result section: the scoreboard

**Status:** `TODO`
**Type:** Feature · **Depends on:** CLIENT-GL-38 ·
**Filed:** 2026-11-13, owner's scope cut during `/workon client` CLIENT-GL-38: that ticket logs records only (the Result section and the record dialog); the per-session scoreboard moves here.

In the Result section of the session detail, above the record list, a scoreboard computed on the client from the session's records: per player the games, wins and losses, and the points from the sport's record schema. Under the badminton record schema the first team of a record is the winner, and the scores (when present) give the points. How a score becomes points (for example net points as the score difference) and any win/loss weighting are decided at pickup from the record schema, which the owner is defining. En/vi copy; the scoreboard reads only valid records (a record that fails the schema is skipped, as on load).

**Out of scope:** Cross-session statistics and head-to-head (CLIENT-SESSION-41), leaderboards (CLIENT-SESSION-42), the server side.

**Tests:** Vitest for the scoreboard math (mutation-checked) and the section; a scoped e2e.
