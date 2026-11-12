# CLIENT-SESSION-46 · Keep a result change made offline and send it when the connection returns (BA GL-9)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** CLIENT-SESSION-38 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

If the connection drops, a change set entered on the phone is kept and sent when the connection returns. The change set's client UUIDs (`clientRef`) already make a retry safe on the server (SESSION-50), so this is a client queue. Settle what happens when the 24-hour window closes while the change waits.

**Out of scope:** The server side (idempotency already exists).

**Tests:** Vitest with a simulated offline period; a scoped e2e.
