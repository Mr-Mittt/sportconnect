# SESSION-55 · Seasons, game-count target (KPI) and season recap (BA SE-1 to SE-3, KP-1 to KP-3)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A group admin creates a season (name, start date, end date); a season view is the same games filtered by its dates, with nothing copied or locked. One active season at a time. The admin sets a target number of games per player for a season and each player sees progress. At the end of a season a recap shows most points, most games and who reached the target. Rewards are handled offline; no reward logic. Open question from the BA: which date a game belongs to (recommendation: the session's local date).

**Group-only (owner, 2026-11-17):** this exists for group sessions only. The standalone-session chain is finished first (SESSION-65, 66, 67, NTF-8 and their client pairs), then the group chain; a standalone session keeps only its own scoreboard (CLIENT-GL-49).

**Out of scope:** Fees in the recap (separate topic).

**Tests:** Spock for the date filtering and the single-active-season rule; an IT for the admin-only endpoints.

**Rewritten at the 2026-11-23 design (`/feature` session "statistic and ranking", `modules/session/docs/STATISTIC_RANKING_DESIGN.md`):** this ticket now reads the history and counters of SESSION-53 (the group-only note of 2026-11-17 is superseded: games of standalone sessions count in personal statistics, and group boards use group sessions). Its detailed design is revisited when it is picked up, after SESSION-54.
Seasons are counted from the permanent record of what each session contributed (`session_stats_jobs.result` plus the session's local date at the venue) into season counters beside the all-time blobs; the group board keeps its all-time counters.

**Note from SESSION-54 slice B (2026-11-26, owner discussion): plan the season as a dimension, not as a date window on a stat.** A per-stat `startDate`/`endDate` setting was considered and rejected: one stat key is one counter slot, so lifetime and season values could not coexist, changing a window rewrites history (nothing recounts until SESSION-77), and an ended season's numbers would be overwritten. Instead keep **season counters (the same stats, one bucket per season id) beside the all-time ones**, as this ticket already says, and decide at pickup:
- **The board key gains the season.** Slice B stores a board as one `leaderboard_entry` row per `(sport, scopeType, scopeId, kind)` with the rule version in it; a season board adds the season id to that key, is rebuilt whole from the season counters (as a group board is from `group_member_stats` today), and the read endpoints take an optional season (default: the active one, or all-time).
- **Which rule a season board uses:** the group's own sort list per kind (slice B), or one per season; say which.
- **Ending a season** is starting a new bucket, with no recount; an old season's board stays readable.
- **Dependencies to check:** SESSION-77 (a season has no history before the rebuild), SESSION-75 (pruning job rows removes the source this ticket counts from) and SESSION-82 (a `sessions` stat per season is derivable from `session_stats_jobs.result`).
