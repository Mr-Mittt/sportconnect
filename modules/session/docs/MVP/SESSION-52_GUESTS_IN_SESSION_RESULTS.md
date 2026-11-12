# SESSION-52 · Guests in session results (BA GU-1 to GU-4)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A host adds a guest by name to a session (no account); guests can be picked in records like any player. Games with a guest do not count toward points or boards by default (a group setting can turn that on), appear only in that session's scoreboard, and are left out of head-to-head records. Later a guest can be linked to a real account and their history moves with them (GU-4, Should). This changes the player model of a record (`players` currently holds user ids that must be `JOINED`), so settle the reference shape at pickup (for example a per-session guest table and a typed player reference).

**Out of scope:** The client (CLIENT-SESSION-40), statistics and boards (they only read the flag).

**Tests:** Spock plus an IT for the add-guest permission (host and group admin only) and the exclusion from group statistics once they exist.
