# SESSION-57 · Session record audit: retention and rate limiting

**Status:** `TODO`
**Type:** Hardening · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

SESSION-50's `session_record_audit` is append-only and each add/delete cycle within the limits writes rows, so one participant can grow it without bound. Decide a per-session cap, a retention rule for old sessions (see SESSION-29), and/or a rate limit on `POST /records/changes`.

**Out of scope:** The records' own limits (done in SESSION-50).

**Tests:** An IT that proves the chosen cap or limit.
