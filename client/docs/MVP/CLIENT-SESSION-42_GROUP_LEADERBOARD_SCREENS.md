# CLIENT-SESSION-42 · Boards: the group's, the region's and the country's

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 (and review gate 2), CLIENT-SESSION-41
**Filed:** 2026-11-12 as "Group leaderboard screens and the ranking-order settings"; **rewritten 2026-11-23** by the `/feature` session "statistic and ranking" (`modules/session/docs/STATISTIC_RANKING_DESIGN.md`). The ranking-order admin settings and the season picker are superseded (the order is the sport's, a group's own order and seasons are later).

Single and Pair boards for the group (members), and for the player's region and country (everyone signed in), with the viewer's own row, the sport's columns, the "ranked at" time, and for the group owner or admin a **Refresh ranking** button that shows a countdown while the one-hour cooldown runs (`STATS_RANKING_COOLDOWN`, `retryAfterSeconds`). A player with no region sees the country board and a prompt to add a region. en/vi, error copy and an I18N-4 row.

**Tests:** Vitest and a scoped e2e.
