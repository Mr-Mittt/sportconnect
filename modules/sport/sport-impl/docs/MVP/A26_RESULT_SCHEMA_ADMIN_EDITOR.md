# A26 · Admin screen to edit a sport's result schema

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

SESSION-50 seeds `sports.result_schema` for badminton by migration. When a second sport needs a result schema, build the admin read and replace endpoints (mirroring the session attribute schema's admin endpoints) and the admin screen (a client ticket is filed at pickup). The BA acceptance criterion: a second sport's template is added by configuration alone, with no change to the record, statistics or leaderboard code.

**Out of scope:** Any schema change for a sport that already has records.

**Tests:** Spock and an IT for the admin-only gate.
