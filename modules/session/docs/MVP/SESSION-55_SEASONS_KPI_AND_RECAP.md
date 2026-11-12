# SESSION-55 · Seasons, game-count target (KPI) and season recap (BA SE-1 to SE-3, KP-1 to KP-3)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A group admin creates a season (name, start date, end date); a season view is the same games filtered by its dates, with nothing copied or locked. One active season at a time. The admin sets a target number of games per player for a season and each player sees progress. At the end of a season a recap shows most points, most games and who reached the target. Rewards are handled offline; no reward logic. Open question from the BA: which date a game belongs to (recommendation: the session's local date).

**Out of scope:** Fees in the recap (separate topic).

**Tests:** Spock for the date filtering and the single-active-season rule; an IT for the admin-only endpoints.
