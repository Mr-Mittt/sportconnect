# CLIENT-SESSION-47 · Warn when the same players and winner were logged moments ago (BA open question 3)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** CLIENT-SESSION-38 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

Two players logging the same game at once is not blocked (the server never rejects for concurrency). The dialog warns when a record with the same players and winner appears within a few minutes, so a duplicate can be removed. Decide the time window at pickup.

**Out of scope:** A server-side duplicate check.

**Tests:** Vitest.
