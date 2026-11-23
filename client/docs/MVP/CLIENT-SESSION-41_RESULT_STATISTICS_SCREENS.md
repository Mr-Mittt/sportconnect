# CLIENT-SESSION-41 · Statistics screens: my statistics and my games

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-73 (and review gate 1)
**Filed:** 2026-11-12 as "player totals and head-to-head"; **rewritten 2026-11-23** by the `/feature` session "statistic and ranking" (`modules/session/docs/STATISTIC_RANKING_DESIGN.md`). The earlier group-only note and the scope picker (all-time, season, session) are superseded; head-to-head moved to CLIENT-SESSION-56.

The signed-in player's statistics for a sport: all games and ranking games side by side (normal derived), their pairs, the columns the sport's schema names, the "as of" time, and their games history newest first (paged), each with its ranking badge. Where it lives (a profile section or its own page) is decided at pickup with the owner. The group's member statistics screen shares the table component and arrives in CLIENT-SESSION-42. Statistics appear up to 24 hours after a session ends, so the screen says so when a recent session is missing. en/vi.

**Out of scope:** other players' statistics (SESSION-74, CLIENT-SESSION-55), head-to-head, seasons.

**Tests:** Vitest and a scoped e2e.
