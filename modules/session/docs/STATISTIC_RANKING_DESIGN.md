# Statistics, ranking games and leaderboards: design

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
7. Verification needs the player's region. Without one the player can propose a ranking game but cannot confirm, and the client opens the "Add region" dialog. A proposal notifies the other players.
8. **The region match is fixed at verification time** (a snapshot of the player's country and region on the confirmation).
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
  "combos": { "size": 2 }
},
"ranking": {
  "sort": [ { "by": "winDiff", "dir": "DESC" }, { "by": "winRate", "dir": "DESC" }, { "by": "games", "dir": "DESC" } ],
  "minGames": { "single": 0, "combo": 5 }
}
```

- **Core counters** every competitive sport has: `games`, `wins`, `losses`, `draws`. **Metrics** are the sport's own numbers (goals, assists, distance, best time); each declares an aggregate: `SUM`, `MAX` or `MIN`. A metric the schema does not declare is not counted.
- **Derived** columns are formulas evaluated at read time from core counters and metrics: two operands and one of `+ - * /`; a division by zero reads as no value. Nothing derived is stored.
- **Combos:** `combos.size` makes counters for every group of that many players of one team (badminton: 2, the "pair"); absent means none. When the block is absent for a `COMPETITIVE` schema the default is the badminton behaviour: metrics `scoreFor` and `scoreAgainst`, derived `winRate`, `winDiff`, `scoreDiff`, and combos of size 2 when `playersPerSide.max` is 2.
- **`ranking.sort`:** any core counter, metric or derived key, then `name`. `minGames` is per board kind (`single`, `combo`): an entry below it shows in statistics but has no rank. Equal entries after all keys share a rank.

## 4. Data (session-impl, one Liquibase changelog per ticket; next free V number at pickup)

| Table | Key | Written by | Read by | Notes |
|---|---|---|---|---|
| `session_records` gains `ranking_requested_by uuid`, `ranking_requested_at timestamptz` | | propose | records API, stats job | A flag, not a table: one proposer, written once, read with the record. |
| `session_record_verifications (record_id, user_id, verified_at, country_id, region_id)` | (record_id, user_id) | verify | records API, stats job | A table, not a column: many players write concurrently (distinct rows never conflict) and each row carries its own region snapshot. Kept after the guard (the snapshot the statistics came from). |
| `session_stats_jobs (session_id, status, attempts, next_attempt_at, claimed_at, last_error, counted, ignored, result jsonb, finished_at)` | session_id | scheduler | operator, rebuild | The queue. `result` is `{counted: [recordId...], ignored: [{recordId, reason}...]}`, at most `maxRecords` entries: the permanent record of what each session contributed. |
| `user_sport_stats (user_id, sport_id, personal jsonb, teams jsonb, scopes jsonb, history jsonb, version)` | (user_id, sport_id) | stats job | stats API | One row per user and sport. `personal`: core counters (`games`, `wins`, `losses`, `draws`) and the sport's metrics for all games and for ranking games. `teams`: a map from the sorted member ids of a combo (badminton: the pair) to its counters, absent when the schema declares no combos. `scopes`: an array of `{scope: REGION or COUNTRY, countryId, regionId, counters, teams}`, one entry per place where the player earned ranking games (the region and country are those of the venue, matched to the player's snapshot). `history`: pointers `{recordId, sessionId, ranking}`, newest first, capped at 500. |
| `group_member_stats (group_id, user_id, sport_id, stats jsonb, history jsonb, version)` | (group_id, user_id, sport_id) | stats job | stats API, group board | The same shape for the games of that group's sessions (all games): `stats` holds the counters, metrics and `teams`, `history` the pointers. |
| `leaderboard_entry (scope_type, scope_id, sport_id, kind, subject_key, k1, k2, k3, games, rank, ranked_at)` | the first five | stats job (upsert), ranking job (rank) | board APIs | The flat **ranking projection**: one row per player or combo per board (GROUP, REGION, COUNTRY; kind SINGLE or COMBO). `k1..k3` are the sport's sort values, computed once when the row is written. Index `(scope_type, scope_id, sport_id, kind, k1 DESC, k2 DESC, k3 DESC)`. A blob cannot be ranked efficiently (no index reaches into an array of scope entries), a flat table can. |
| `stat_board_runs (sport_id, scope_type, scope_id, dirty, status, claimed_at, computed_at)` | the first three | stats job (dirty), ranking job | cooldown, "as of" | Tiny, bounded by the number of boards. |

Why session-owned tables and not `user_sport_profiles` and `group_members`: the repo rule is one domain per table with cross-domain by ids only; the profile editor rewrites its row, so a stats write and a profile save could overwrite each other; every group membership check reads `group_members`. The blobs have exactly the shape the owner proposed, in tables the session domain owns.

Per counted game the job updates, for each participant (and each combo of the schema's size within a team):

- `user_sport_stats`: `personal` (all games always; ranking games when it is one), `teams`, and, for a ranking game, the `scopes` entry for the venue's region and country when that player's snapshot matches (a combo counts there only when **every** member matches), and the history pointer.
- `group_member_stats` when the session belongs to a group.
- the `leaderboard_entry` rows of every board it touches (GROUP for a group session; REGION and COUNTRY for a matching ranking game), and marks those boards dirty.

All of this runs in the session's one transaction. **Concurrency:** the job first makes sure the rows exist (`INSERT ... ON CONFLICT DO NOTHING`), then locks them with `SELECT ... FOR UPDATE` in sorted `user_id` order, so two sessions with overlapping players serialize per player and cannot deadlock; the blob is read, changed in code and written back under the lock; `version` is a safety check.

Normal games are derived (all minus ranking) for core counters and SUM metrics; a MAX or MIN metric (a best time) is not subtractable, so it is shown for all games and for ranking games only. Size: `teams` has one entry per distinct partner (hundreds at most), `scopes` one per place, `history` 500 pointers of about 40 bytes; a write rewrites the whole jsonb, acceptable at this size and at one transaction per counted session. Game details for a history page are read by id from `session_records` and the session; a rebuild reads `session_stats_jobs.result`, `session_records` and the confirmations, never the capped pointers.

Retention: blobs, verifications and projection rows are kept for ever (truth, bounded by the players); the history is capped by design; finished job rows are pruned after about 30 days (SESSION-75), after which a rebuild of those sessions reads `session_records` directly.

## 5. Ranking games: propose and verify (SESSION-72)

- **Propose:** `POST /api/sessions/{id}/records/{recordId}/ranking-request`. Allowed to anyone allowed to log in that session (the records access rule), while the session is ongoing or completed and until `scheduledEndAt + 24h`. The record must be **rankable** by the reader of its type (for `COMPETITIVE`: a complete score with a strictly higher first team) and its sport must allow ranking games (else 409 `SESSION_RECORD_RANKING_NOT_RANKABLE` with the reason as a parameter, or `SESSION_RECORD_RANKING_NOT_AVAILABLE`). Sets the flag, notifies every other player of the record who is active (`UserService.getActiveUserIds`) with `session.record.verification.requested` (NOTIF-16), one per player per proposal. The proposer does not need to be a player and does not confirm by proposing.
- **Verify:** `POST /api/sessions/{id}/records/{recordId}/verify`. Only a player named in the record (403 `SESSION_RECORD_VERIFY_NOT_A_PLAYER`), only while the record is proposed, in the same window. The player must have a region (409 `SESSION_RECORD_VERIFY_REGION_REQUIRED`; the country follows from the region). Inserts the confirmation with the snapshot, `ON CONFLICT DO NOTHING` (a second tap does nothing).
- **State (derived):** NORMAL (no flag), PROPOSED (flag, not every player confirmed), VERIFIED (flag and a confirmation from every player of the record). The record DTO gains `ranking: { status, requestedBy, confirmedBy[] }`.
- **Edit resets:** a change to a record's `data` or players (update in a change set) clears the flag and deletes its confirmations, inside the same row lock the update already takes. Verify takes the same row lock and re-reads the record, so verify racing an edit either confirms the old content before the edit (then the edit clears it) or finds the flag gone. Deleting a record deletes its confirmations.
- **Not available:** a record with a guest (SESSION-52) cannot be proposed; a deactivated player cannot confirm (the existing request gate) and the record stays proposed until the guard, then counts as normal.
- **Client:** CLIENT-SESSION-54 shows the state on each record, a "Propose as ranking game" action, a "Confirm" action for a named player, the "Add region" dialog when the profile has no region (saves the profile through the existing endpoint and retries), and the notification text (CLIENT-NOTIF-4 rule).

## 6. The statistics engine (SESSION-53)

- **Trigger and drain:** one scheduled tick every 60 seconds on the scheduler thread, plus a run at startup. Each tick takes at most 20 sessions with `status = COMPLETED`, `scheduled_end_at + 24h <= now` and no job row (or a RETRY row due), oldest guard first. Work is bounded per tick; a backlog drains over several ticks.
- **Claim:** `INSERT INTO session_stats_jobs ... ON CONFLICT (session_id) DO NOTHING`; zero rows inserted means another thread or instance has it, so skip. A `RUNNING` row older than 10 minutes can be taken over by a compare-and-set update.
- **Process (one `REQUIRES_NEW` transaction per session):** load the sport's schema (none: SKIPPED), the session's records and verifications, the venue's country and region (`LocationService`, after LOC-5; none: no REGION or COUNTRY counters), read each record through the reader of its type (section 3), ignore the invalid ones, lock the participants' `user_sport_stats` (and `group_member_stats`) rows in sorted order, update the blobs, upsert the `leaderboard_entry` rows, mark the touched boards dirty in `stat_board_runs`, set the job DONE or SKIPPED with `result` (the counted record ids).
- **Status meanings:**
  - *RUNNING*: claimed, not finished (revivable after 10 minutes).
  - *DONE*: at least one record was counted. Final.
  - *SKIPPED*: nothing countable (no schema, no records, all invalid). Final; the reasons are in `result`.
  - *RETRY*: an attempt failed, `next_attempt_at` set (1, 5, 15, 60 minutes); the 60-second tick is the clock that picks it up.
  - *FAILED*: retries exhausted. Revived by the startup run; visible with `last_error`.
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

- **Table or column:** the proposal is a column; confirmations are a table (concurrent writers, a snapshot per row); statistics and history are blobs per user and sport and per group member (read whole, written by one job under a per-player lock, small and bounded); the ranking projection is a flat table because it is the only thing that is queried by value and sorted; `stat_board_runs` holds only the dirty flag, claim and time.
- **What each status means:** section 6 (jobs) and section 5 (record state). Final: DONE, SKIPPED, VERIFIED at the guard. Revivable: RUNNING (stale), FAILED (startup).
- **Async work:** trigger = the 60-second tick and startup; drain = the scheduler thread, 20 sessions per tick, a transaction per session; retry clock = the same tick reading `next_attempt_at`. The nightly job is bounded by the number of dirty boards and handles one per transaction.
- **Two at once:** unique-key claim with skip; per-player row locks in sorted order for the blobs (a loser waits, never overwrites, no deadlock); upserts for the projection; the record row lock for verify versus edit; compare-and-set on run rows and for the cooldown. A request thread (manual refresh) and the nightly job meet only at the run row.
- **Identity and time:** a record id, a session id; the history pointer carries them, so the local play date is read from the session when needed (seasons, SESSION-55). A later edit of the sport's schema does not rewrite blobs (SESSION-77 rebuilds from the job results and the records). A region renumbering (REF-3, V1) would leave `scopes` and projection rows under the old ids; it needs its own migration decision then.
- **Failure and visibility:** `last_error`, `attempts` and `result` on the job; "as of" and `rankedAt` for users.
- **What tests prove:** section 8.
- **Generic across sports:** what differs per sport is only the schema and the reader of the record type; the engine, tables, verification, queue and boards are shared. A football sport using `COMPETITIVE` with metrics `goals` and `assists` and combos of size 11 or none is a schema; running is SESSION-58's reader. Not proved: only badminton is built and tested, so the metric and combo paths are exercised by tests with a second, football-like schema in the fixtures.
- **Argued against:** do we need the projection next to the blobs? Yes: ranking by value across all players needs a flat, indexed table; it is written in the same transaction, small (a few numbers per player per board) and rebuildable from the blobs. Do we need combos? The BA pair board and the region and country pairs need them. Is the 24-hour latency acceptable? Owner confirmed 2026-11-23; the session scoreboard stays live. Can farmed games inflate region boards (friends confirming each other's games)? Yes; verification proves agreement, not honesty. Accepted for now; a later rule (distinct opponents, minimum games) is a ranking configuration, not a model change. A capped history means a player's oldest games are not listed; the job results keep the truth.

## 11. Not changing

The records write path and its limits and window, the client-computed session scoreboard, group sessions, the join and leave rules, the import's behaviour (its games are normal), standalone session visibility.
