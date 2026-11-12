# SESSION-58 · A RECORD kind for sports without a head-to-head result (running, cycling, swimming)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

The result schema is designed to allow a per-player RECORD (times, distances) next to the MATCH kind, but only MATCH is built in SESSION-50. Add the RECORD kind: seed a schema for a first such sport, and the matching client form (a client ticket is filed when this is picked up). Sports with no head-to-head result keep the game vocabulary out of the UI. The BA parks times and distances as a separate topic, so confirm the scope first.

**Out of scope:** Statistics for RECORD results.

**Tests:** Decided at pickup.
