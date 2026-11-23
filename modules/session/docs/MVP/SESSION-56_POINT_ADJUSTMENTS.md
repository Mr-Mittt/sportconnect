# SESSION-56 · Admin point adjustments with a reason and history (BA AD-1 to AD-4)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A group admin sets or resets a player's or pair's points. Each change is saved as an adjustment (who, which player or pair, the change in points, a reason, when); displayed points are game points plus adjustments; members can read the history; an adjustment applies to a season or to all-time. The game history is never touched.

**Group-only (owner, 2026-11-17):** this exists for group sessions only. The standalone-session chain is finished first (SESSION-65, 66, 67, NTF-8 and their client pairs), then the group chain; a standalone session keeps only its own scoreboard (CLIENT-GL-49).

**Out of scope:** The client (CLIENT-SESSION-44).

**Tests:** Spock plus an IT for the admin-only gate and the visibility of the history.

**Rewritten at the 2026-11-23 design (`/feature` session "statistic and ranking", `modules/session/docs/STATISTIC_RANKING_DESIGN.md`):** this ticket now reads the history and counters of SESSION-53 (the group-only note of 2026-11-17 is superseded: games of standalone sessions count in personal statistics, and group boards use group sessions). Its detailed design is revisited when it is picked up, after SESSION-54.
Adjustments are stored rows added to the group board's points when the `leaderboard_entry` sort values are written or at ranking time; they never touch the games or the pointers.
