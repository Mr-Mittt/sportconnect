# CLIENT-SESSION-43 · Season management, KPI progress and the season recap

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-55 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

Season create and list for admins, the KPI target and each player's progress, and the end-of-season recap. En/vi copy.

**Group-only (owner, 2026-11-17):** this exists for group sessions only. The standalone-session chain is finished first (SESSION-65, 66, 67, NTF-8 and their client pairs), then the group chain; a standalone session keeps only its own scoreboard (CLIENT-GL-49).

**Out of scope:** The server side (SESSION-55).

**Tests:** Vitest and a scoped e2e.

**Note (2026-11-23, `/feature` session "statistic and ranking", `modules/session/docs/STATISTIC_RANKING_DESIGN.md`):** the group-only note of 2026-11-17 is superseded; this ticket now reads the history and counters of SESSION-53 and is revisited when picked up.

## Delta 2026-11-27 (owner, at the pickup of SESSION-55)
The server ticket SESSION-55 was redesigned: it now builds the **season itself** (a group's period with its own statistics and board, collection auto or by linked sessions, a post in the group feed, statuses `SCHEDULED`, `ONGOING`, `COMPLETED`, `FINALISED`, cancel) and the group's country and region (B25, client CLIENT-GROUP-GEO-1). The **KPI progress and the recap** moved to SESSION-86. This ticket's season-management screens follow SESSION-55's contract (written there at its design); its KPI and recap parts wait for SESSION-86.

## Delta 2026-11-28 (SESSION-55 slice 1, built): the contract this ticket builds the season screens against
- **Endpoints** (all under `/api/sessions/group/{groupId}/seasons`; read = any group member, write = owner or admin): `GET /defaults` (the create form's pre-fill: `statsConfig` `{columns, config}`, `rankingRule` per kind, `timezone`, `today`, `maxDays` 31; show a tip that they come from the group), `POST` (201), `GET` (page; repeatable `status`; newest start first), `GET /{id}` (with `likeCount`, `isLikedByCurrentUser`), `PUT /{id}` (only `SCHEDULED`), `POST /{id}/cancel`, `GET|PUT /{id}/sessions` (a MANUAL season's links: `{add:[ids], remove:[ids]}`, at most 20 each, only while `ONGOING` or `COMPLETED`), and the thread: `GET|POST /{id}/comments`, `POST|DELETE /{id}/comments/{commentId}/like`, `POST|DELETE /{id}/like` (the same shapes as a session's thread; the client never uses `postId` directly).
- **Mirrored enums** (CLIENT-NOTIF-4): `SeasonStatus` (`SCHEDULED`, `ONGOING`, `COMPLETED`, `FINALISED`, `CANCELLED`), `SeasonCollectionMode` (`AUTO`, `MANUAL`), `PostType.SEASON_POST` (a season's anchor: it is in no feed, so a feed never receives it), and four new `systemCode` values on group system posts: `GROUP_SEASON_CREATED`, `_STARTED`, `_FINALISED`, `_CANCELLED` (params `name`, `startDate`, `endDate`, and `by` on created and cancelled; give each an en and vi sentence, the stored English text is the fallback).
- **Dates and instants (changed 2026-11-28):** you send dates (`yyyy-MM-dd`, read in the group's timezone; "today" for the form is `defaults.today`). The server stores a season as UTC instants and answers them: `startAt` (the start of the first day) and `endAt` (**exclusive**, the start of the day after the last), plus `startDate`, `endDate` (the last day, inclusive) and `timezone` read in the group's **current** timezone for showing (absent when the group's region has none). Show dates from `startDate`/`endDate`, or format the instants in the group's timezone; after a group changes region a boundary can read as 02:00 instead of 00:00 while the sessions that count do not change. A linked session is answered without a local date (format `scheduledStart` yourself). A season is `ONGOING` from `startAt` and `COMPLETED` from `endAt`; an edit is refused once `startAt` has passed, even before the job has moved the status (the status job runs every 5 minutes, so a status can lag by that much).
- **Error codes** to give en and vi copy in `errors:codes` (I18N-5): `SESSION_SEASON_NOT_FOUND`, `SESSION_SEASON_DATES_INVALID`, `SESSION_SEASON_START_IN_PAST`, `SESSION_SEASON_TOO_LONG`, `SESSION_SEASON_NAME_REQUIRED`, `SESSION_SEASON_TIMEZONE_MISSING`, `SESSION_SEASON_LIMIT`, `SESSION_SEASON_OVERLAP` (params `seasonId`, `startDate`, `endDate`: name the clashing season), `SESSION_SEASON_NOT_EDITABLE`, `SESSION_SEASON_NOT_CANCELLABLE`, `SESSION_SEASON_LINKS_NOT_ALLOWED`, `SESSION_SEASON_SESSION_INVALID` (param `reason`: `NOT_FOUND`, `NOT_IN_GROUP`, `OUT_OF_RANGE`, `TOO_MANY`). The stat list and rule reuse `SESSION_GROUP_STATS_CONFIG_INVALID` and the `SESSION_RANKING_*` codes already mirrored.
- **Slices 2 and 3 still to come** (the stats of a season, its finalising, its board with `initRank`): this ticket is revisited when they land.
