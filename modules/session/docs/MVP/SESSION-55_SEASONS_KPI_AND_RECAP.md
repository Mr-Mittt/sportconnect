# SESSION-55 · Seasons, game-count target (KPI) and season recap (BA SE-1 to SE-3, KP-1 to KP-3)

**Status:** `IN PROGRESS`
**Type:** Feature · **Depends on:** SESSION-54, SESSION-84, **B25** (a group has a country and a region, for the local date and country rules), better after SESSION-77 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

A group admin creates a season (name, start date, end date); a season view is the same games filtered by its dates, with nothing copied or locked. One active season at a time. The admin sets a target number of games per player for a season and each player sees progress. At the end of a season a recap shows most points, most games and who reached the target. Rewards are handled offline; no reward logic. Open question from the BA: which date a game belongs to (recommendation: the session's local date).

**Group-only (owner, 2026-11-17):** this exists for group sessions only. The standalone-session chain is finished first (SESSION-65, 66, 67, NTF-8 and their client pairs), then the group chain; a standalone session keeps only its own scoreboard (CLIENT-GL-49).

**Out of scope:** Fees in the recap (separate topic).

**Tests:** Spock for the date filtering and the single-active-season rule; an IT for the admin-only endpoints.

**Rewritten at the 2026-11-23 design (`/feature` session "statistic and ranking", `modules/session/docs/STATISTIC_RANKING_DESIGN.md`):** this ticket now reads the history and counters of SESSION-53 (the group-only note of 2026-11-17 is superseded: games of standalone sessions count in personal statistics, and group boards use group sessions). Its detailed design is revisited when it is picked up, after SESSION-54.
Seasons are counted from the permanent record of what each session contributed (`session_stats_jobs.result` plus the session's local date at the venue) into season counters beside the all-time blobs; the group board keeps its all-time counters.

**Note from SESSION-54 slice B (2026-11-26, owner discussion): plan the season as a dimension, not as a date window on a stat.** A per-stat `startDate`/`endDate` setting was considered and rejected: one stat key is one counter slot, so lifetime and season values could not coexist, changing a window rewrites history (nothing recounts until SESSION-77), and an ended season's numbers would be overwritten. Instead keep **season counters (the same stats, one bucket per season id) beside the all-time ones**, as this ticket already says, and decide at pickup:
- **The board key gains the season.** Slice B stores a board as one `leaderboard_entry` row per `(sport, scopeType, scopeId, kind)` with the rule version in it; a season board adds the season id to that key, is rebuilt whole from the season counters (as a group board is from `group_member_stats` today), and the read endpoints take an optional season (default: the active one, or all-time).
- **Which rule a season board uses:** the group's own sort list per kind (slice B), or one per season; say which.
- **Ending a season** is starting a new bucket, with no recount; an old season's board stays readable.
- **Dependencies to check:** SESSION-77 (a season has no history before the rebuild), SESSION-75 (pruning job rows removes the source this ticket counts from) and SESSION-82 (a `sessions` stat per season is derivable from `session_stats_jobs.result`).

## Scope change 2026-11-27 (owner, at the pickup): the feature as designed in discussion (replaces the KPI and recap direction above)

**What a season is.** A group season is a period (`startDate`, `endDate`) that holds **its own statistics and its own leaderboard**, built from the group sessions linked to it. Tournaments may use it later; nothing for them here.

**Rules**
- A group has at most **2 seasons in `SCHEDULED` or `ONGOING`** at a moment; their dates **do not overlap** (an end date is occupied, the next season starts the day after); `startDate >= today`; a duration of at most **1 month** (days or calendar month to settle).
- A season can be edited while `SCHEDULED`; once `ONGOING` nothing of its definition can be updated (dates, collection mode, stat list, rules). Open: whether the links of a `MANUAL` season stay editable.
- Status: `SCHEDULED` → `ONGOING` (at the start date) → `COMPLETED` (after the end date) → `FINALISED` (a job counts the uncounted sessions of the last date, then finalises). A season can be **cancelled** at any time while `SCHEDULED` or `ONGOING`; what a cancelled season keeps counting is open.
- **Inheritance:** the season's stat list and ranking rules come from the group's effective stat list (SESSION-84) and the group's ranking rules; they are **pre-fill data on the creation form** with a tip that they come from the group config, stored in the season row **at creation** and editable until it starts (not a flag).
- **The leaderboard:** the season has its own board with **fresh counters**. Inheriting the group's current leaderboard gives the season board a baseline rank, **`initRank`**: a board leaf becomes `subject~prevRank~initRank` (the current rank stays derived from the tree), for season boards only; a season that does not inherit has `initRank = 0` for every entry, so a finished season can be compared with where it began.
- **Collection:** `AUTO` collects every group session whose (local) date is within the season; `MANUAL` is the owner or admin linking sessions (the session date still within `startDate`..`endDate`).
- **Season post:** a post in the group feed for the season, like a session's.
- While `ONGOING`, its statistics and board are updated as the current implementation does for the group.

**Group country and region (prerequisite, its own ticket).** A group gets a required country and region, initialised from its owner's on creation, migrated from the owner's for existing groups (a group whose owner has none is invalid business data and is removed from use, soft delete recommended), used for the date's local timezone and for country rules (the "group country later" of SESSION-54).

**Out of scope now (owner):** the KPI target and the recap (they come back with tournaments; to be filed as a follow-up), fees, rewards, tournaments.

## Decisions 2026-11-27 (owner, answers to the open points of the scope change above)
- **`initRank` is taken on the start day**, when the season turns `ONGOING`, from the group's board at that moment (both the single and the pair boards); the stat list and the rules are taken at creation (pre-fill) and stay editable until the start.
- **While `ONGOING` only the links of a `MANUAL` season can change** (link or unlink a session); dates, mode, stat list and rules are locked.
- **Cancelling** is allowed while `SCHEDULED` or `ONGOING`: a cancelled season stops counting and stays readable. **A season keeps counting when the group switches its statistics off** (it stops only when cancelled or completed).
- **Finalising:** after the end date the season is `COMPLETED`; a job finalises it automatically after a **24-hour guard**, counting first the sessions of the last date that are not counted yet; the owner or an admin can **finalise at once**, and then the uncounted sessions are counted into the season straight away **without changing the `session_stats_jobs` status** (the other statistics and boards still count them through the normal job). The season keeps **its own set of counted session ids**, so counting is idempotent by `(season, session)` and a linked session can be removed later.
- **Duration:** at most 31 days.
- **B25** (group country and region, soft delete of a group whose owner has none) is filed as its own ticket, with CLIENT-GROUP-GEO-1; the KPI and the recap are SESSION-86.

## Decision 2026-11-27 (owner, Phase 2): the season has both a post anchor and feed announcements
- **A thread anchor like a session's `SESSION_POST`** (a post that is no feed entry: the target of the season's comments and likes, created inline with the season, its id kept on the season; post-impl's `PostGate` and the comment bypass call back into `session-api` for it, so a new post type `SEASON_POST` and a gate callback are part of this ticket; the client mirrors the type).
- **Feed announcements** (`GROUP_SYSTEM` posts with new system codes) for a season created, started, finalised and cancelled, written in the transaction of the change like the group settings' announcements (no push notification; candidates logged in `NOTIFICATION_USE_CASES.md`).

## Decisions 2026-11-27 (owner, Phase 2): the order and the refactor
- **B25 first:** SESSION-55 is built after B25 (a group's country and region) lands; the season's local dates use the group's timezone, not a fallback.
- **The game-reading code of `SessionStatsProcessor` is extracted** into a shared method as part of this ticket (the engine job and the immediate finalise read the same games; SESSION-77 will reuse it).
- **Found in Phase 2:** the reference module's `Country` and `Region` carry **no timezone**, so B25's country and region alone do not give the group a timezone; B25 must also provide one (see its ticket).
