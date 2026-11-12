# SESSION-54 · Group leaderboards and the admin-set ranking order (BA LB-1 to LB-9)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-53 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

Per sport a group plays: a Single board and (where the template has two players per side) a Pair board, all stats as columns, default all-time with any season selectable. The group admin picks a primary sort and a tiebreaker from net points, win rate, wins, games played and head-to-head; entries still tied share a rank. Optional minimum games to appear (suggested none for Single, 5 for Pair). No tiers, promotion or demotion. Standalone sessions show only their own scoreboard. Ranking order and scoring rules come from stored games with no data migration (NF-4).

**Out of scope:** Seasons (SESSION-55), adjustments (SESSION-56).

**Tests:** Spock for the sort and shared-rank rules; an IT for the admin-only configuration endpoints.
