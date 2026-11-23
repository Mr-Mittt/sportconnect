# SESSION-52 · Guests in session results (BA GU-1 to GU-4)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A host adds a guest by name to a session (no account); guests can be picked in records like any player. Games with a guest do not count toward points or boards by default (a group setting can turn that on), appear only in that session's scoreboard, and are left out of head-to-head records. Later a guest can be linked to a real account and their history moves with them (GU-4, Should). This changes the player model of a record (`players` currently holds user ids that must be `JOINED`), so settle the reference shape at pickup (for example a per-session guest table and a typed player reference).

**Out of scope:** The client (CLIENT-SESSION-40), statistics and boards (they only read the flag).

**Tests:** Spock plus an IT for the add-guest permission (host and group admin only) and the exclusion from group statistics once they exist.

**Rewritten at the 2026-11-23 design (`/feature` session "statistic and ranking", `modules/session/docs/STATISTIC_RANKING_DESIGN.md`):** this ticket now reads the history and counters of SESSION-53 (the group-only note of 2026-11-17 is superseded: games of standalone sessions count in personal statistics, and group boards use group sessions). Its detailed design is revisited when it is picked up, after SESSION-54.
A game with a guest cannot be proposed as a ranking game (SESSION-72) and is ignored by the statistics engine with the reason `GUEST` (SESSION-53) unless a group setting turns it on.
