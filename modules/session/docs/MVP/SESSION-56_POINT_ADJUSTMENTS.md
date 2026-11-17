# SESSION-56 · Admin point adjustments with a reason and history (BA AD-1 to AD-4)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-54 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A group admin sets or resets a player's or pair's points. Each change is saved as an adjustment (who, which player or pair, the change in points, a reason, when); displayed points are game points plus adjustments; members can read the history; an adjustment applies to a season or to all-time. The game history is never touched.

**Group-only (owner, 2026-11-17):** this exists for group sessions only. The standalone-session chain is finished first (SESSION-65, 66, 67, NTF-8 and their client pairs), then the group chain; a standalone session keeps only its own scoreboard (CLIENT-GL-49).

**Out of scope:** The client (CLIENT-SESSION-44).

**Tests:** Spock plus an IT for the admin-only gate and the visibility of the history.
