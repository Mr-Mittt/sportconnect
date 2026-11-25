# Statistics, ranking games and leaderboards: design

> **Revised 2026-11-25 (owner, the SESSION-53 rework): read `STATISTICS_CONFIG_PAIRS_AND_H2H_DESIGN_DRAFT.md` first, "What was decided".** Where this document differs, that one wins. In short: the sport's stats come from one config shared with the client (`record.scoreboard.columns`, `groupBy`; **no defaults, no fixed counters, no custom metrics, no `record.statistics`**), the catalog being the client's list (`StatsCatalog`); a sport has a switch (`sports.statistics_enabled`, off by default) checked by the runner and the ranking proposal; pair statistics stay in the member blobs (**one grouping per sport**, the duplication accepted) and a group keeps the head-to-head of its pairs in a new `group_stats` document; and **the counting engine writes nothing to `leaderboard_entry`**: SESSION-54's job builds and ranks the boards from the blobs (the statements in sections 4 and 7 about the engine upserting the entries and storing sort values are superseded). The jsonb shapes are in `documentation/md/STATISTICS_JSONB_REFERENCE.md`.

**Status:** Approved plan, not implemented (2026-11-23). **Source:** the owner's specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`, the owner's answers of 2026-11-23 (recorded below), the BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards (revised 2026-11-23).md`, and the game logging design `SESSION_RECORDS_DESIGN.md`.
**Tickets:** SESSION-72, SESSION-53, SESSION-73, SESSION-54 (server); CLIENT-SESSION-54, 41, 42 (client); prerequisite LOC-5 (location); follow-ups SESSION-74 to 77, CLIENT-SESSION-55, 56; rewritten SESSION-52, 55, 56 and CLIENT-SESSION-40, 43, 44, 48. **BA hand-over:** `STATISTIC_RANKING_DELTA.md` (kept up to date while the tickets are built).

## 1. What it is

From the results logged in sessions the server calculates statistics per player, per pair and per group, and ranks them: in the group, in the region and in the country. What is counted is configured per sport (badminton first: games, wins, losses, win rate, personal and pair). Two kinds of game exist:

- **Normal game:** any valid record, as logged today.
- **Ranking game:** a record with a complete score that every player named in it has confirmed (verified). Only ranking games feed the region and country boards.

## 2. Decisions (owner, 2026-11-23)

1. Existing records stay normal; verification upgrades a record to a ranking game.
2. **Sources.** Personal statistics: games of all sessions, group and standalone, normal and ranking shown separately. Group member statistics and the group board: games of that group's sessions, counted once more per group. Region and country boards: ranking games of any session, only for a player whose region (country) matches the session location's region (country).
3. Sports: badminton-style two-team matches are built; the design is schema-driven. Football-style stats (goals, assists) and running (SESSION-58) are later.
4. Board order comes from the sport's schema; the group uses the same order. A group's own order is later.
5. Group board: members only. Region and country boards: every signed-in user, by display name.
6. Region and country boards include **pairs** as well as single players.
7. **A ranking game is proposed by a `JOINED` participant of the session and confirmed by every player named in it** (owner, 2026-11-23, SESSION-72 pickup). No region is needed to propose or to confirm. A game can be set up from `SCHEDULED` on, even without a score; a proposal notifies the other players, and so does a change to a proposed game.
8. **A ranking game counts on the board of the venue's region and country, for every player in it, wherever the player lives** (owner, 2026-11-23, SESSION-72 pickup; replaces the earlier "snapshot of the player's region at verification"): player X from region A who plays a ranking game at a venue in region B is counted for X on region B's board, and on B's country's. The player's own region is compared with nothing and is not stored on the confirmation.
9. No region migration now: REF-3 (the 63 to 34 province refresh) moves to the reference V1 backlog.
10. **Statistics appear after the 24-hour guard.** A queue picks completed sessions in order of their guard (`scheduledEndAt + 24h`), checks every record, ignores invalid ones, calculates, and saves the counted games as history, newest on top. Ranking is a separate job, nightly, plus a manual group refresh with a one-hour cooldown (owner or admin).
11. Nightly job at 00:05, `Asia/Ho_Chi_Minh`, configurable.
12. Personal and pair statistics get a visibility setting (default visible), and another player can ask for access (low priority: SESSION-74 and CLIENT-SESSION-55).
13. **Generic across sports (owner, 2026-11-23, after the first review):** sport knowledge lives only in the sport's schema and in one reader per record type; the engine, the counters, verification and the boards know nothing about badminton (section 3).
14. **Blob layout (owner, 2026-11-23):** statistics and history are blobs, one row per user and sport and one per group member, not counter rows and a history table (section 4). They live in **session-owned tables** (not in `user_sport_profiles` or `group_members`, which belong to other domains).
15. **History is pointers only,** newest first, capped at 500 per player and sport; what was counted per session is kept once in the job row, so a rebuild never depends on a capped blob.

## 3. Generic by design: one engine, one reader per record type

**Principle (owner, 2026-11-23):** the platform serves many sports, so nothing in the engine, the tables or the endpoints may assume badminton. A sport's behaviour comes from two places only: its schema (`sports.result_schema`) and the **reader of its record type**. A new sport that uses an existing record type is a data change (a schema); a new kind of record is one new reader.

**Why the server reads a record at all.** `session_records.data` is stored as sent and only the client understands it (`RECORD_SCHEMA_CONTRACT.md`). Statistics need the server to understand it. This changes the 2026-11-12 decision "the server never reads `data`": it reads it **only after the 24-hour guard**, when the record can no longer change, and never rejects a write because of its shape (the exception is proposing a ranking game, section 5).

**`RecordTypeReader`** (an interface in session-impl, one implementation per `record.data.type`). Input: the record's `data` and the sport's schema. Output, neutral **facts**, the only thing the rest of the engine sees:

```
RecordFacts {
  valid, ignoreReason,
  rankable, notRankableReason,
  participants: [ { userId, team, outcome: WIN|LOSS|DRAW|NONE, metrics: { key: number } } ],
  teams: [ [userId, ...], ... ]
}
```

- **`COMPETITIVE` v1 (built now):** valid when there are exactly two teams, each between `playersPerSide.min` and `.max` players, UUID ids, no player twice (inside or across teams), scores complete the way the contract says. Outcome WIN for team 0 and LOSS for team 1 (a DRAW outcome arrives with SESSION-59). Metrics `scoreFor` and `scoreAgainst`: the sum of the counted score slots (`scoreSlot`, default every slot where both teams filled it). `rankable` when the score is complete and the first team's first-slot score is strictly higher.
- **A per-player kind (SESSION-58, later):** one participant per record, outcome NONE, metrics such as `distanceM` and `durationS`, its own `rankable` rule. Adding it adds a reader and no table.
- A shared fixture of valid and invalid records per reader is run by the client's Vitest and the server's Spock so the two cannot drift.

**What the schema declares for statistics** (new optional block `record.statistics`, read by the server; the keys are the scoreboard's where they overlap):

```json
"statistics": {
  "metrics": [ { "key": "scoreFor", "aggregate": "SUM" }, { "key": "scoreAgainst", "aggregate": "SUM" } ],
  "derived": [ { "key": "winRate", "formula": "wins/games" }, { "key": "winDiff", "formula": "wins-losses" },
               { "key": "scoreDiff", "formula": "scoreFor-scoreAgainst" } ],
  "counters": ["games", "wins"],
  "groupBy": [ { "by": "PARTNER" }, { "by": "TEAM", "size": 2 } ]
},
"ranking": {
  "sort": [ { "by": "winDiff", "dir": "DESC" }, { "by": "winRate", "dir": "DESC" }, { "by": "games", "dir": "DESC" } ],
  "minGames": { "single": 0, "combo": 5 }
}
```

- **Core counters** every competitive sport has: `games`, `wins`, `losses`, `draws`. **Metrics** are the sport's own numbers (goals, assists, distance, best time); each declares an aggregate: `SUM`, `MAX` or `MIN`. A metric the schema does not declare is not counted.
- **Derived** columns are formulas evaluated at read time from core counters and metrics: two operands and one of `+ - * /`; a division by zero reads as no value. Nothing derived is stored.
- **Counters and groupings (owner, 2026-11-24):** `counters` lists the core counters the sport shows (default `games`, `wins`; all four are stored). `groupBy` names the ONE dimension that gets counters of their own beside the totals (owner, 2026-11-24: a sport is grouped one way only, since for a two-player team the two would be the same numbers): `PARTNER` (each teammate: player A's games and wins with B; badminton) or `TEAM` with a `size` (every group of that many players of one team; football; this is the old `combos`). Only `TEAM` becomes a leaderboard entry, so a `PARTNER` sport has no pair board; a partner view is personal. Absent `groupBy` means none. When the block is absent for a `COMPETITIVE` schema the default is the badminton behaviour: counters `games` and `wins`, metrics `scoreFor` and `scoreAgainst`, derived `winRate`, `winDiff`, `scoreDiff`, and **no `groupBy`**: a sport asks for partner or team counters by declaring `groupBy` (owner, 2026-11-24; a sport's stored schema must declare its one grouping). Every jsonb shape is in `documentation/md/STATISTICS_JSONB_REFERENCE.md`.
- **`ranking.sort`:** any core counter, metric or derived key, then `name`. `minGames` is per board kind (`single`, `combo`): an entry below it shows in statistics but has no rank. Equal entries after all keys share a rank.

## 4. Data (session-impl, one Liquibase changelog per ticket; next free V number at pickup)

| Table | Key | Written by | Read by | Notes |
|---|---|---|---|---|
| `session_records` gains `ranking_requested_by uuid`, `ranking_requested_at timestamptz` | | propose | records API, stats job | A flag, not a table: one proposer, written once, read with the record. |
| `session_record_verifications (record_id, user_id, revision, verified_at)` | (record_id, user_id) | propose (the proposer's own), verify | records API, stats job | A table, not a column (owner, 2026-11-23: no read-modify-write of jsonb on every confirm and edit): one row per player per record, at most the players of the game (4 for badminton doubles), `record_id` a same-domain FK with `ON DELETE CASCADE`. A confirmation counts only while its `revision` equals the record's current `revision`, so an edit makes confirmations stale without a write to them; a re-confirmation overwrites the player's row. The proposal itself is two plain fields on `session_records` (`ranking_requested_by`, `ranking_requested_at`) plus `revision`. Kept after the guard (SESSION-53 reads it). |
| `session_stats_jobs (session_id, status, attempts, next_attempt_at, claimed_at, last_error, counted, ignored, result jsonb, finished_at)` | session_id | scheduler | operator, rebuild | The queue. `result` is `{counted: [{recordId, ranking}...], ignored: [{recordId, reason}...]}`, at most `maxRecords` entries: the permanent record of what each session contributed. |
| `user_sport_stats (user_id, sport_id, personal jsonb, groupings jsonb, scopes jsonb, history jsonb, version)` | (user_id, sport_id) | stats job | stats API | One row per user and sport. `personal`: core counters (`games`, `wins`, `losses`, `draws`) and the sport's metrics for all games and for ranking games. `groupings`: `{PARTNER: {partnerId: {all, ranked}}, TEAM: {sorted member ids of a team (badminton: the pair): {all, ranked}}}`, a dimension absent when the schema does not group by it. `scopes`: an array of `{scope: REGION or COUNTRY, countryId, regionId, counters, groupings}`, one entry per place where the player earned ranking games (the region and country are those of the venue, for every player of the game wherever they live; no player region is compared or stored). `history`: pointers `{recordId, sessionId, ranking}`, newest first, capped at 500. |
| `group_member_stats (group_id, user_id, sport_id, stats jsonb, history jsonb, version)` | (group_id, user_id, sport_id) | stats job | stats API, group board | The same shape for the games of that group's sessions (all games): `stats` holds `counters` and `groupings` (counters per partner and per team), `history` the pointers. |
| `leaderboard_entry (scope_type, scope_id, sport_id, kind, subject_key, k1, k2, k3, games, rank, ranked_at)` | the first five | stats job (upsert), ranking job (rank) | board APIs | The flat **ranking projection**: one row per player or combo per board (GROUP, REGION, COUNTRY; kind SINGLE or COMBO). `k1..k3` are the sport's sort values, computed once when the row is written. Index `(scope_type, scope_id, sport_id, kind, k1 DESC, k2 DESC, k3 DESC)`. A blob cannot be ranked efficiently (no index reaches into an array of scope entries), a flat table can. |
| `stat_board_runs (sport_id, scope_type, scope_id, dirty, status, claimed_at, computed_at)` | the first three | stats job (dirty), ranking job | cooldown, "as of" | Tiny, bounded by the number of boards. |

Why session-owned tables and not `user_sport_profiles` and `group_members`: the repo rule is one domain per table with cross-domain by ids only; the profile editor rewrites its row, so a stats write and a profile save could overwrite each other; every group membership check reads `group_members`. The blobs have exactly the shape the owner proposed, in tables the session domain owns.

Per counted game the job updates, for each participant (and each combo of the schema's size within a team):

- `user_sport_stats`: `personal` (all games always; ranking games when it is one), `groupings` (the player's partners and teams for the game, `all` always and `ranked` for a ranking game), and, for a ranking game, the `scopes` entry for the venue's region and country (every player of the game, wherever they live; the partner and team counters count there too), and the history pointer.
- `group_member_stats` when the session belongs to a group.
- the `leaderboard_entry` rows of every board it touches (GROUP for a group session; REGION and COUNTRY, at the venue's region and country, for a ranking game), and marks those boards dirty.

All of this runs in the session's one transaction. **Concurrency:** the job first makes sure the rows exist (`INSERT ... ON CONFLICT DO NOTHING`), then locks them with `SELECT ... FOR UPDATE` in sorted `user_id` order, so two sessions with overlapping players serialize per player and cannot deadlock; the blob is read, changed in code and written back under the lock; `version` is a safety check.

Normal games are derived (all minus ranking) for core counters and SUM metrics; a MAX or MIN metric (a best time) is not subtractable, so it is shown for all games and for ranking games only. Size: `groupings` has one entry per distinct partner and per team (hundreds at most), `scopes` one per place, `history` 500 pointers of about 40 bytes; a write rewrites the whole jsonb, acceptable at this size and at one transaction per counted session. Game details for a history page are read by id from `session_records` and the session; a rebuild reads `session_stats_jobs.result`, `session_records` and the confirmations, never the capped pointers.

Retention: blobs, verifications and projection rows are kept for ever (truth, bounded by the players); the history is capped by design; finished job rows are pruned after about 30 days (SESSION-75), after which a rebuild of those sessions reads `session_records` directly.

## 5. Ranking games: propose and verify (SESSION-72)

- **Who and when (SESSION-72, as built):** records can be logged and proposed while the session is `SCHEDULED`, `ONGOING` or `COMPLETED` and no later than `scheduledEndAt + 24h` (`PREPARING` and `CANCELLED` stay closed; this relaxed SESSION-50's rule so participants can set the games up before the start). A game set up before play has **no score**: it is a *planned game* (valid, not rankable, reason `NO_SCORE`).
- **Propose:** `POST /api/sessions/{id}/records/{recordId}/ranking-request`. Only a **`JOINED` participant** (403 `SESSION_RECORD_RANKING_PROPOSER_NOT_JOINED`; logging itself keeps the records access rule, so a group member who never joined can read and log but not propose). The sport's schema must define a score slot (else 409 `SESSION_RECORD_RANKING_NOT_AVAILABLE`), and the record must be valid and either **rankable** (a complete score with the first team strictly ahead) or a **planned game with no score**; a scored game that is not rankable is 409 `SESSION_RECORD_RANKING_NOT_RANKABLE` with `errorParams.reason`. Sets `ranking_requested_by/at` (a second proposal changes nothing and notifies nobody), **confirms the proposer's own game** when they are a named player and the game is already rankable, and notifies every other active player named in it (`UserService.getActiveUserIds`) with one `session.record.verification_requested` event each (NOTIF-16; three words on purpose, the notification queue is bound `session.*.*`).
- **Verify:** `POST /api/sessions/{id}/records/{recordId}/verify`. Only a player named in the record (403 `SESSION_RECORD_VERIFY_NOT_A_PLAYER`), only while the record is proposed (409 `SESSION_RECORD_NOT_PROPOSED`), only while it is **rankable** (a planned game cannot be confirmed: 409 `SESSION_RECORD_RANKING_NOT_RANKABLE`, reason `NO_SCORE`), in the same window. Takes the record's row lock (the lock an update takes), stores the confirmation at the record's current `revision`; confirming again does nothing.
- **State (derived, never stored):** NORMAL (not proposed), PROPOSED (proposed, not every player has a confirmation at the current revision), VERIFIED (proposed, rankable, and every player named in the record has a confirmation at the current revision). The record DTO gains `ranking: { status, requestedBy, confirmedBy[] }` (the players whose confirmation counts), built for a whole session with one confirmations query.
- **An edit makes confirmations stale:** an update that changes a record's `data` (the players are inside `data`) raises its `revision`; the proposal stays, the confirmations no longer count, and the other players of a proposed record are asked again (the same event, aggregated to one unread notification per recipient and session). An update that changes nothing raises nothing and asks nobody. Deleting a record deletes its confirmations (cascade).
- **Known gap:** a player's tap confirms the record **as it is when the request runs**; if the content was edited a moment earlier, the player confirms the new content they had not yet seen (the re-notification tells them). SESSION-RANKING-RECORD-1 adds an expected revision to the request.
- **Not available:** a record with a guest (SESSION-52) cannot be proposed; a deactivated player cannot confirm (the existing request gate) and is not notified.

## 6. The statistics engine (SESSION-53)

- **Trigger and drain (as built, SESSION-53; owner, 2026-11-23, replaces the 60-second tick plus start-up run):** a `fixedDelay` tick every **5 minutes** (first one minute after start; no separate start-up run) that only **nudges a dedicated worker thread** (`session-stats`, one per instance, a queue of one with a discard policy, the same shape as the group-session generation worker): every `@Scheduled` method of the server shares one scheduler thread, so counting must never run on it (`documentation/md/BACKGROUND_JOBS.md`). The worker repeats passes until nothing is due or 10 minutes are spent; a pass takes at most 50 sessions: job rows that are due again first, then sessions with `status = COMPLETED`, `COALESCE(scheduled_end_at, scheduled_start) <= now - 24h` and no job row, oldest guard first (the cutoff is computed in Java, so the query is the same on PostgreSQL and H2). A backlog drains over several ticks.
- **Claim:** a session with no row is claimed by a plain `INSERT ... VALUES (..., 'RUNNING', 1, ...)`; the primary key makes the loser fail with a duplicate-key error, which is absorbed (the loser skips). (Not `ON CONFLICT DO NOTHING`, which H2 does not run, and not `save`, which **merges** onto an existing row and would silently overwrite the winner's claim: the integration test found this.) A due row (`RETRY`, `FAILED`, or a `RUNNING` row older than 10 minutes) is claimed by a compare-and-set `UPDATE ... WHERE <still due>` that returns 1 for exactly one worker. The processor then takes the job row's lock (`FOR UPDATE`) and checks it still owns the claim (`RUNNING` with its own claim time), so a worker whose claim was taken over changes nothing.
- **As built (SESSION-53), where it differs from the plan below:**
  - **What counts.** A record is counted when the reader says it is valid with a complete score and the first team strictly ahead (`rankable`); one with no score, a score the reader cannot turn into a win, or a sport with no score slot is ignored with the reader's reason (`NO_SCORE`, `FIRST_TEAM_NOT_AHEAD`, `RANKING_NOT_AVAILABLE`, or the invalid reason); a game naming a player who is no longer `JOINED` is ignored (`PLAYER_NOT_JOINED`). There are no draws yet (SESSION-59). The reader now also returns the two teams and one participant per player (outcome WIN for the first team, LOSS for the second; `scoreFor` and `scoreAgainst`, the sums of the slots both teams filled).
  - **Which games are ranking games.** Proposed and confirmed by every named player at the record's current revision (the SESSION-72 derivation, `RecordRankingSupport.confirmedPlayers`), recomputed at counting time.
  - **Lock order.** The missing statistics rows are created first, each in its own small `REQUIRES_NEW` transaction (a concurrent creator's duplicate-key error is absorbed), and only then are all the rows locked in **one** ordered statement (`ORDER BY user_id`, `FOR UPDATE`), user rows then group-member rows, so every transaction takes its locks in one pass in the same order. Creating a row after locking another would let two sessions lock each other's new rows in opposite orders. Boards are marked dirty last, in sorted board order, with one atomic `UPDATE` each.
  - **Entries.** One upsert per touched board entry per session, computed from the **final** counters of the session (not per game). Board entries are written under the player locks, so a plain read then write is safe; the first write of a board run row is the one place with no player lock, so it goes through the same insert-and-absorb writer.
  - **Groupings.** `TEAM`: for every group of `size` players inside one team that includes the player (sorted ids joined by commas, so the order in a record never matters); a team with more than 100 such groups gets none. The team's counters are written to each member's blob; the board entry is computed from the first member's. `PARTNER`: for every other member of the player's team, under that member's user id (a team with more than 100 other members gets none); personal and group-member views only, never a board entry.
  - **Schema.** `record.statistics` and `record.ranking` are read leniently (`StatisticsSchema`): an entry the server cannot use is dropped. A present `statistics` block is taken as written (no `groupBy` means no partner and no team counters); an absent block gets the badminton defaults. More than three sort keys, unknown keys and directions, and repeats are dropped when read, so `sport-impl` validates nothing new.
  - **The football-like fixture** uses `COMPETITIVE`: the reader gives team scores only (no goals and assists per player: that needs per-player data a COMPETITIVE record does not carry), so the second schema exercises MAX and MIN of the team's goals, a derived goal difference and no `groupBy` (an integration test also runs it grouped by `PARTNER` only).
- **Process (one `REQUIRES_NEW` transaction per session):** load the sport's schema (none: SKIPPED), the session's records and verifications, the venue's country and region (`LocationService`, after LOC-5; none: no REGION or COUNTRY counters), read each record through the reader of its type (section 3), ignore the invalid ones, lock the participants' `user_sport_stats` (and `group_member_stats`) rows in sorted order, update the blobs, upsert the `leaderboard_entry` rows, mark the touched boards dirty in `stat_board_runs`, set the job DONE or SKIPPED with `result` (the counted records, each with its ranking mark).
- **Status meanings:**
  - *RUNNING*: claimed, not finished (revivable after 10 minutes).
  - *DONE*: at least one record was counted. Final.
  - *SKIPPED*: nothing countable (no schema, no records, all invalid). Final; the reasons are in `result`.
  - *RETRY*: an attempt failed, `next_attempt_at` set **15 minutes ahead** (fixed, owner 2026-11-23: was the 1, 5, 15, 60 minute ladder, which a 5-minute tick cannot honour); the next tick whose time is at or past it picks it up (the third tick after the failure). A failed session is never picked again in the same drain.
  - *FAILED*: the fourth attempt failed. Due again after **6 hours**, one attempt each time (it fails straight back to `FAILED` if the cause remains); visible with `last_error`.
- **Imported and old sessions:** the admin import creates completed sessions in the past, so their guard has passed and the next tick counts them (as normal games, since an import carries no verification). Sessions completed before this ticket are picked the same way (a one-off backlog; it drains at 20 per tick).
- **Guards:** the job claim is unique per session, and the history pointer of a record is checked before it is added, so a record is never counted twice even if two threads ran the same session (the claim prevents it; the check is the second line).
- **Failure and visibility:** the job row (`attempts`, `last_error`, `result`) and log lines; the user sees the statistics "as of" the last counted session.

## 7. Rankings (SESSION-54)

- **Rank storage and the update (set-based, never a scan of blobs and never a sort in Java):** at counting time (section 4) each touched board membership gets one `leaderboard_entry` upsert whose `k1..k3` are the values of the keys in `record.ranking.sort` (a core counter, a metric or a derived formula evaluated in code; at most three keys, validated when the schema is saved) and `games`. Ranking a board is **one statement**: `UPDATE leaderboard_entry e SET rank = r.rk, ranked_at = now() FROM (SELECT subject_key, rank() OVER (ORDER BY k1 <dir>, k2 <dir>, k3 <dir>) rk FROM leaderboard_entry WHERE <board> AND games >= :minGames) r WHERE <board> AND e.subject_key = r.subject_key AND e.rank IS DISTINCT FROM r.rk`, then `rank = NULL` for entries below `minGames`. The window reads in index order and `IS DISTINCT FROM` writes only rows whose rank changed, so a large country board stays cheap. If a board ever outgrows this, the same projection feeds a Redis sorted set per board as a cache (`REDIS_KEYS.md` pattern, rebuilt from Postgres); not built now, measured at review gate 2.
- **Nightly job:** a cron (`app.stats.ranking.cron`, default `0 5 0 * * *` in `Asia/Ho_Chi_Minh`) walks the dirty boards, one board per transaction, bounded per pass. A board is claimed with a compare-and-set update on its `stat_board_runs` row (`status IDLE -> RUNNING`, or `RUNNING` older than 15 minutes); the loser skips. `dirty` is cleared only by the run that read it (compare on a version/timestamp), so a session job that marks it dirty mid-run is not lost.
- **Manual refresh:** `POST /api/sessions/group/{groupId}/leaderboard/refresh?sportId=`, owner or admin. One atomic update claims the board only when `computed_at <= now - 1 hour` (configurable); the loser gets 429 `STATS_RANKING_COOLDOWN` with `retryAfterSeconds`, which the client turns into a countdown. It runs on the request thread for one group board, bounded by the group size; region and country boards are never refreshed by hand.
- **Reads:** a board page is `ORDER BY rank LIMIT n` on the index and the viewer's own row is a primary-key lookup; group board for members only (404 before 403 as everywhere); region and country boards for every signed-in user. A deactivated user is dropped at read time (`getActiveUserIds`); a user who left the group is dropped from its board (`group-api`); names come from the display lookups. Every response carries `rankedAt`.

## 8. Cross-domain, account lifecycle, census

- **Reads of other domains, through `-api` only:** `UserService.getUsersByIds` (country and region ids, at verification) and `getActiveUserIds`; `LocationService` (venue country and region, new batch method, after LOC-5); `GroupService` (membership, role, active members); `SportService.getResultSchema`. No new `-api` dependency for session-impl except `location-api` and `user-api` calls it already has; check at pickup that no cycle appears (needs a real-context IT).
- **Account lifecycle:** every new endpoint sits behind the per-request active check (A25). A deactivated user cannot propose or confirm, is dropped from boards, and keeps their name in history.
- **Consumer census (at each pickup):** `SessionRecordResponse` and the client's mirrored record type (a new `ranking` field, additive), `SessionImportWriter` (writes records directly: it must not set the flag), `RecordChangeSet` update path (clears the flag), the schema contract (new `ranking` block), the MSW handlers, `NotificationType` (new type), ERROR_CODES.
- **Tests that cannot be proved on H2:** the `ON CONFLICT` upserts, `FOR UPDATE` (the per-player lock order), the `rank()` update with `IS DISTINCT FROM`, the claim races and the compare-and-set updates are PostgreSQL behaviour. Plan the concurrency ITs on the real-Postgres container where the harness has one; otherwise list them as not run.

## 9. Ticket chain, gates and landing

| Order | Ticket | Scope |
|---|---|---|
| 1 | LOC-5 (location backlog, existing) | Venue country and region; needed by REGION and COUNTRY scopes (SESSION-53 reads it, so it ships before SESSION-53). |
| 2 | SESSION-72 | Ranking games: propose, verify, edit reset, notification event, the `RecordTypeReader` interface and the `COMPETITIVE` reader (server). |
| 3 | SESSION-53 (rewritten) | Engine: queue, readers, statistics blobs, ranking projection. |
| **gate 1** | | **Review with the owner: the data model and the queue.** |
| 4 | SESSION-73 | Read API: my statistics, my games, group member statistics. |
| 5 | SESSION-54 (rewritten) | Ranking jobs, group board, manual refresh, region and country boards. |
| **gate 2** | | **Review with the owner: the ranking job and the cooldown.** |
| 6 | CLIENT-SESSION-54 | Propose and confirm UI, Add-region dialog, notification text. |
| 7 | CLIENT-SESSION-41 (rewritten) | My statistics and my games screens. |
| 8 | CLIENT-SESSION-42 (rewritten) | Boards, refresh countdown, region and country. |

**All server tickets are built first, then the client tickets (owner, 2026-11-23), the same way as game logging.** The client tickets then build against a finished, reviewed server contract. Until CLIENT-SESSION-54 ships, the new notification type `session.record.verification.requested` has no client text (the generic fallback shows, as SESSION-GL-63 did before CLIENT-GL-51), and nobody can propose or confirm from the app, so the server endpoints are exercised by integration tests and by hand. The record's new `ranking` field is additive, so the existing client keeps working.

SESSION-58 (per-player records) and SESSION-59 (draws) later add a reader and a DRAW outcome, with no table change. Later (rewritten to read the history and counters): SESSION-55 and CLIENT-SESSION-43 (seasons, KPI, recap), SESSION-56 and CLIENT-SESSION-44 (adjustments), SESSION-52 and CLIENT-SESSION-40 (guests), CLIENT-SESSION-48 (cards). Follow-ups filed: SESSION-74 and CLIENT-SESSION-55 (visibility setting and access requests, low priority), SESSION-75 (prune finished jobs), SESSION-76 and CLIENT-SESSION-56 (head-to-head and best partners), SESSION-77 (rebuild the blobs from the job results and the records). REF-3 moved to the reference V1 backlog.

Landing: one pull request per ticket (the stacked local branches the owner used for the group-session chain also work); each gate is a stop for review before the next ticket builds on the model.

## 10. Design review (answers)

- **Table or column:** the proposal is a column; confirmations are a table (one row per player, written at different times by different people; tied to the record's revision); statistics and history are blobs per user and sport and per group member (read whole, written by one job under a per-player lock, small and bounded); the ranking projection is a flat table because it is the only thing that is queried by value and sorted; `stat_board_runs` holds only the dirty flag, claim and time.
- **What each status means:** section 6 (jobs) and section 5 (record state). Final: DONE, SKIPPED, VERIFIED at the guard. Revivable: RUNNING (stale after 10 minutes), RETRY (when due), FAILED (after 6 hours).
- **Async work:** trigger = the 5-minute tick (no start-up run); drain = a dedicated worker thread (never the shared scheduler thread), passes of 50 sessions until nothing is due or 10 minutes are spent, one transaction per session; retry clock = the same tick reading `next_attempt_at`. The nightly job is bounded by the number of dirty boards and handles one per transaction.
- **Two at once:** unique-key claim with skip; per-player row locks in sorted order for the blobs (a loser waits, never overwrites, no deadlock); upserts for the projection; the record row lock for verify versus edit; compare-and-set on run rows and for the cooldown. A request thread (manual refresh) and the nightly job meet only at the run row.
- **Identity and time:** a record id, a session id; the history pointer carries them, so the local play date is read from the session when needed (seasons, SESSION-55). A later edit of the sport's schema does not rewrite blobs (SESSION-77 rebuilds from the job results and the records). A region renumbering (REF-3, V1) would leave `scopes` and projection rows under the old ids; it needs its own migration decision then.
- **Failure and visibility:** `last_error`, `attempts` and `result` on the job; "as of" and `rankedAt` for users.
- **What tests prove:** section 8.
- **Generic across sports:** what differs per sport is only the schema and the reader of the record type; the engine, tables, verification, queue and boards are shared. A football sport using `COMPETITIVE` with metrics `goals` and `assists` and a `groupBy` of `TEAM` size 11 or none is a schema; running is SESSION-58's reader. Not proved: only badminton is built and tested, so the metric and grouping paths are exercised by tests with a second, football-like schema in the fixtures.
- **Argued against:** do we need the projection next to the blobs? Yes: ranking by value across all players needs a flat, indexed table; it is written in the same transaction, small (a few numbers per player per board) and rebuildable from the blobs. Do we need combos? The BA pair board and the region and country pairs need them. Is the 24-hour latency acceptable? Owner confirmed 2026-11-23; the session scoreboard stays live. Can farmed games inflate region boards (friends confirming each other's games)? Yes; verification proves agreement, not honesty. Accepted for now; a later rule (distinct opponents, minimum games) is a ranking configuration, not a model change. A capped history means a player's oldest games are not listed; the job results keep the truth.

## 11. Not changing

The records write path and its limits and window, the client-computed session scoreboard, group sessions, the join and leave rules, the import's behaviour (its games are normal), standalone session visibility.
