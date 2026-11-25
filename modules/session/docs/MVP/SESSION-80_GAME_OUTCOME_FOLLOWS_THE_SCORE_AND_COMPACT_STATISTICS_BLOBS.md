# SESSION-80 · The game outcome follows the score, ranking games need equal sides, and the statistics blobs are compact

**Status:** `DONE` (2026-11-25)
**Type:** Enhancement · **Depends on:** SESSION-53, SESSION-72, SESSION-73, SESSION-78 (built on the same branch)
**Filed:** 2026-11-25, owner, while testing the statistics engine on the dev database: a record ignored with `NO_SCORE` raised the question of what a ranking game needs and what a normal game needs; then, reviewing the blob sizes, the history format.

## Part 1 · the outcome rules (owner)

Two questions are answered separately by the `COMPETITIVE` reader (`RecordFacts.countable` and `RecordFacts.rankable`):

- **Counted (the statistics):** the team with the **higher score** in the ranking slot wins, whichever team is named first (the first-team-wins position rule only decides a game with no score). **A game with no score in that slot is a win for the first team**, so a planned game counts (with no `scoreFor` or `scoreAgainst`: an ungiven sum is absent, not 0). A sport with no score slot counts the same way. **Equal scores** are a `DRAW` for both teams when the sport has `record.data.allowDraws` (exactly `true`), counted in `games` and in no win or loss; else the game is ignored with `SCORES_EQUAL`. `FIRST_TEAM_NOT_AHEAD` and, for a normal game, `NO_SCORE` no longer exist as ignore reasons. A normal game may have different numbers of players on its sides.
- **Rankable (may be a ranking game):** counted, **and** the ranking slot is scored (`NO_SCORE` otherwise, so a planned game can be proposed but not confirmed), **and** both teams have the same number of players (`TEAM_SIZES_DIFFER`, checked first, so such a game cannot even be proposed). Who is named first does not matter. The engine counts a game as a ranking game only when it is rankable, proposed and confirmed by every named player at its current revision (a record edited after its confirmations can never rank).
- **Proposal errors:** `SESSION_RECORD_RANKING_NOT_RANKABLE` (409) carries `reason` `TEAM_SIZES_DIFFER`, `SCORES_EQUAL`, `NO_SCORE` (confirm only) or an invalid reason. Registered in `ERROR_CODES.md`.
- **Draws:** the reader gives `DRAW` itself now, which closes the reader part of SESSION-59 (best-of-three and a `draws` stat stay there; note added to that ticket).
- **Client:** the client's record validation and scoreboard follow when CLIENT-SESSION-58 runs the shared fixture (note added there): a tie, a first-team win in the scoreboard today, is not countable on the server for a sport without draws.
- **Shared fixture** `competitive-v1-cases.json`: 24 cases, a third schema `draws`, and the new expected fields `countable`, `notCountableReason`, `outcomeOfFirstTeam`.

## Part 2 · compact blobs (owner, with the measurement)

- **History** (`user_sport_stats.history`, `group_member_stats.history`): a flat list of strings `"<0|1>-<recordId>"` (1 = ranking game), newest first, 500 at most (`StatsHistory`). No session id: a record names its session, and the games page (SESSION-73) reads the records first and their sessions from `record.sessionId`. Measured with `pg_column_size` on the dev database: **500 entries, 36 KB as objects, 5 KB as these strings, 6 KB as a number list** (jsonb stores a number as `numeric`).
- **Job result** (`session_stats_jobs.result`): `counted` in the same format, `ignored` as `"<recordId>:<REASON>"`.
- **No empty node** (owner): a partner with no ranking game has no `ranked` node, a place entry or a group member with no grouping has no `groupings` node; a missing key reads as empty. Measured: 300 partners 54 KB with empty `ranked` nodes, 48 KB without.
- **Not done, decided to wait:** positional counter arrays per partner (300 partners about 29 KB), which need a header per row and version handling; and `values` arrays aligned with `columns` in the SESSION-73 responses, a contract change to decide with CLIENT-SESSION-41 and 42.

## Built

`RecordFacts` (new `countable`, `notCountableReason`), `CompetitiveRecordReader`, `SessionStatsProcessor` (counts `countable`; a ranking game must be `rankable`; compact result), `StatsHistory`, `PlayerStatsDoc`, `GroupStatsDoc`, `StatsCounters.isEmpty`, `SessionStatisticsServiceImpl` (games page). Docs: `RECORD_SCHEMA_CONTRACT.md`, `STATISTICS_JSONB_REFERENCE.md` (sections 0, 3.4, 4, 6), `ERROR_CODES.md`, `session-impl/CLAUDE.md` rules 21 and 22, the server release notes, the SESSION-59 and CLIENT-SESSION-58 tickets.

## Tests run (2026-11-25)

- **Spock:** `CompetitiveRecordReaderSpec` 27, `CompetitiveRecordReaderFactsSpec` 9, `CompetitiveRecordReaderFixtureSpec` 25, `SessionRecordRankingSpec` 34, `StatsHistorySpec` 5, `StatsDocsSpec` (new cases for the omitted nodes), `StatsReadHelpersSpec`, `SessionStatisticsServiceSpec`; the whole `session-impl` module **1032 tests, 0 failures**.
- **Integration:** `SessionStatsIntegrationTest` 33, `SessionRankingIntegrationTest` 20, `StatisticsReadIntegrationTest` 21, `SportStatisticsSwitchIntegrationTest` 7, `SessionRecordsIntegrationTest` 31 and `SessionImportIntegrationTest` 12 (run earlier in the same change), all green.
- **Mutation check, 20 mutants, 20 caught:** the outcome rules (10: the higher score rule, draws ignoring the flag, the sides check removed for planned games and for ranking, the second team's outcome, the score numbers, the flag read inverted, an equal-score game still counted, the engine counting `rankable` instead of `countable`, a ranking game not required to be `rankable`) and the compact formats (10: the entry format, the id compare, the cap, the mark parse, the empty `ranked`, `groupings` of a player and of a member kept, the job result's mark and reason, and the group member's mark). One survived the first run (the group member's mark was never asserted); a test was added and the mutant is caught.

### IT changes (report)

- **Updated `SessionStatsIntegrationTest` (30 to 33):** the old "invalid and planned records" test is now "the outcome follows the score" (a planned game counted as a first-team win with no score numbers, a reversed game counted for the second team, equal scores ignored with `SCORES_EQUAL`, a duplicate player still ignored); **added:** equal scores are a draw in a sport with `allowDraws` and count as neither a win nor a loss; a ranking game the second team won counts as a ranking win for its players; a game with sides of different sizes counts as a normal game even if it was proposed and confirmed. The history and result assertions read the new strings (the player's and the group member's history).
- **Updated `SessionRankingIntegrationTest` (19 to 20):** "first team not ahead cannot be proposed" is replaced by equal scores refused with `SCORES_EQUAL`, and a game the second team won proposed and verified. No `@SpyBean`, no `@MockBean`.

## Not proven (said plainly)

- The full `:server:test`, PostgreSQL (the sizes were measured with `pg_column_size` on synthetic values, the counting itself only on H2) and a running server were not run.
- The sides check at the proposal for a record with unequal sides is covered by a Spock spec, not by an integration test (the IT helper builds 2 against 2 games only).
- A planned game now counts as a first-team win: a game set up and never played will be counted if nobody removes it (owner's rule). The 24-hour window before counting is the time to remove it.
- **Sessions already counted are not recounted** (their job row exists): clear `session_stats_jobs` and the statistics tables to count them again with these rules (release notes).
