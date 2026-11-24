# Statistics: every jsonb structure

**Status:** reference for SESSION-53 (the engine), SESSION-73 (the read API), SESSION-54 (leaderboards) and the client tickets that show statistics. Written 2026-11-24. The code that reads and writes these shapes is `modules/session/session-impl/src/main/java/com/sportconnect/session/stats/` (`PlayerStatsDoc`, `GroupStatsDoc`, `StatsCounters`, `StatsGroupings`, `StatsHistory`, `StatisticsSchema`); `StatsDocsSpec` pins the keys named here. **A shape changes only together with this file and that spec.**

Design and reasons: `modules/session/docs/STATISTIC_RANKING_DESIGN.md`. The sport's side of the schema (`record.statistics`, `record.ranking`): `documentation/md/RECORD_SCHEMA_CONTRACT.md`. Background jobs that write these rows: `documentation/md/BACKGROUND_JOBS.md`.

## 0. Reading rules for any consumer

- **A missing key is zero, an empty map or an empty list.** A new player has no row until their first counted game; a row may have `groupings: {}`.
- **Ignore keys you do not know.** New dimensions and metrics are added by changing a sport's schema, with no migration.
- **Derived values are not stored.** `winRate`, `winDiff`, `scoreDiff` and any other `derived` column are computed from the counters with the sport's `record.statistics.derived` formulas (`StatisticsSchema.valueOf`). The leaderboard keeps the three sort values it needs (section 6).
- **Counts are numbers, not strings.** A whole number is written as an integer (`31`), a metric with a fraction as a decimal. Ids are numbers (`countryId`, `regionId`, `recordId`, `sessionId`) or UUID strings (`userId`, partner ids).
- **`all` includes `ranked`.** `all` is every counted game; `ranked` is the subset that was a ranking game (proposed and confirmed by every player, SESSION-72). A normal game adds to `all` only; a ranking game adds to both.

## 1. Where the configuration lives: the sport's `result_schema`

The statistics config is part of the sport's `result_schema` jsonb (sport module), not a separate table. Two optional blocks under `record`:

```json
"record": {
  "statistics": {
    "counters": ["games", "wins"],
    "metrics":  [ { "key": "scoreFor", "aggregate": "SUM" }, { "key": "scoreAgainst", "aggregate": "SUM" } ],
    "derived":  [ { "key": "winRate", "formula": "wins/games" }, { "key": "winDiff", "formula": "wins-losses" } ],
    "groupBy":  [ { "by": "PARTNER" }, { "by": "TEAM", "size": 2 } ]
  },
  "ranking": {
    "sort": [ { "by": "winDiff", "dir": "DESC" }, { "by": "winRate", "dir": "DESC" }, { "by": "games", "dir": "DESC" } ],
    "minGames": { "single": 0, "combo": 5 }
  }
}
```

| Key | Meaning | Default when the key is missing |
|---|---|---|
| `statistics.counters` | the core counters the sport shows: any of `games`, `wins`, `losses`, `draws`. All four are always stored; this says which ones the read API and screens present. | `["games", "wins"]` |
| `statistics.metrics[]` | the sport's own numbers: `key` and how a game combines into the total, `aggregate` = `SUM`, `MAX` or `MIN`. A number the schema does not declare is not counted. | none |
| `statistics.derived[]` | computed columns: `key` and a `formula` of two operands and one of `+ - * /` over counters, metrics or other derived columns. Not stored. | none |
| `statistics.groupBy[]` | the dimensions that get counters of their own beside the totals. `PARTNER`: one set per teammate. `TEAM` with `size` (2 or more): one set per group of `size` players of one team (the only dimension that becomes a leaderboard entry). At most one of each. | none |
| `ranking.sort[]` | at most three sort keys (`by` a counter, metric or derived key; `dir` `ASC` or `DESC`); more are dropped | `winDiff`, `winRate`, `games`, all `DESC` |
| `ranking.minGames` | games needed to be ranked: `single` for a player, `combo` for a team | `0` and `5` |

**Defaults with no `record.statistics` block at all** (a `COMPETITIVE` sport): counters `games` and `wins`; metrics `scoreFor` and `scoreAgainst` (SUM); derived `winRate`, `winDiff`, `scoreDiff`; no `groupBy`: a sport gets partner or team counters only by declaring `groupBy` (owner, 2026-11-24). So badminton's stored schema must declare `"groupBy": [ { "by": "PARTNER" }, { "by": "TEAM", "size": 2 } ]` (and, because a declared block is taken as written, its `metrics` and `derived` too) to have them. **A block that is present is taken as written**: no `groupBy` means no groupings.

The server reads the schema leniently: an entry it cannot use (unknown aggregate, bad formula, `TEAM` with a size below 2, an unknown dimension, a repeat) is dropped and never an error, so editing the schema can never stop a session from being counted.

## 2. The counters object

One shape, used everywhere a set of counters is stored (`StatsCounters.toMap`):

```json
{ "games": 17, "wins": 7, "losses": 10, "draws": 0, "metrics": { "scoreFor": 312, "scoreAgainst": 340 } }
```

- `games`, `wins`, `losses`, `draws`: counts. A game whose outcome is unknown adds to `games` only.
- `metrics`: one entry per declared metric that some game has given a value to, combined by its aggregate (`SUM` adds, `MAX` keeps the largest, `MIN` the smallest). A metric no game has given yet is absent, not `0`.

## 3. `user_sport_stats` (one row per user and sport)

Primary key `(user_id, sport_id)`; `version` (optimistic lock) and `updated_at` are plain columns. The jsonb columns:

### 3.1 `personal`

```json
{ "all": <counters>, "ranked": <counters> }
```

The player's totals in the sport: every counted game (`all`) and the ranking games among them (`ranked`).

### 3.2 `groupings`

```json
{
  "PARTNER": { "<partnerUserId>": { "all": <counters>, "ranked": <counters> } },
  "TEAM":    { "<memberIdA>,<memberIdB>": { "all": <counters>, "ranked": <counters> } }
}
```

- The first level is the `by` of a `groupBy` entry. A dimension with no group yet is absent.
- **`PARTNER`** key: the other player's user id. A player's own row never holds their own id. The counters are the games this player played **on the same team** as that partner. Games against a player are not counted (no `OPPONENT` dimension yet).
- **`TEAM`** key: the ids of the `size` players, **sorted as text and joined by commas** (so the same group has the same key whatever order a record lists them in). The key includes the owner of the row. Same key as the `subject_key` of a `COMBO` leaderboard entry.
- Caps: a team with more than 100 other members gets no `PARTNER` entries; a team with more than 100 groups of `size` gets no `TEAM` entries (a team board is meant for pairs and trios).
- A partner grouping is a personal view. It never becomes a leaderboard entry.

### 3.3 `scopes`

```json
[
  {
    "scope": "REGION",              // or "COUNTRY"
    "countryId": 1,
    "regionId": 2,                  // null for a COUNTRY entry
    "counters": <counters>,
    "groupings": { "PARTNER": { "<partnerUserId>": <counters> }, "TEAM": { "<comboKey>": <counters> } }
  }
]
```

- The player's **ranking games only**, counted at the **venue's** region and country (where the game was played, not where the player lives). A normal game adds nothing here.
- One `REGION` entry per region and one `COUNTRY` entry per country, created when the first ranking game is counted there. The `COUNTRY` entry is the sum of that country's `REGION` entries and of games at venues with a country but no region.
- Counters only: no `all` / `ranked` split, because everything here is ranked.
- A venue with no country gets no entry at all; with a country but no region, only the `COUNTRY` entry. The job row's `result.notes` says so (section 5).

### 3.4 `history`

```json
[ { "recordId": 9012, "sessionId": 457, "ranking": true } ]
```

Pointers to the counted games, **newest first, at most 500** (the oldest fall off). Details of a game are read from `session_records` and the session by id when a page is shown; the pointer holds none. `ranking` says whether it counted as a ranking game. The history is also the second guard against counting a record twice.

## 4. `group_member_stats` (one row per group, user and sport)

Primary key `(group_id, user_id, sport_id)`; written only for the games of a **group** session (all of them, ranking or not).

### 4.1 `stats`

```json
{
  "counters":  <counters>,
  "groupings": { "PARTNER": { "<partnerUserId>": <counters> }, "TEAM": { "<comboKey>": <counters> } }
}
```

The same keys as in section 3, with no `all` / `ranked` split: this is every game of the group's sessions.

### 4.2 `history`

Same pointers as section 3.4, capped at 500, for the group's games only.

## 5. `session_stats_jobs.result` (one row per counted session)

```json
{
  "counted": [ { "recordId": 9012, "ranking": true }, { "recordId": 9013, "ranking": false } ],
  "ignored": [ { "recordId": 9014, "reason": "FIRST_TEAM_NOT_AHEAD" } ],
  "notes":   [ "NO_VENUE_REGION" ]
}
```

- `counted`: one entry per game that was counted: its `recordId` and `ranking`, whether it counted as a ranking game (the same mark as `ranking` in a history pointer, section 3.4). A rebuild or an operator reads from here why a game is, or is not, in a region or country counter.
- `ignored`: a record that was read and not counted, with its reason: the reader's invalid or not-rankable reasons (`NO_SCORE`, `FIRST_TEAM_NOT_AHEAD`, `SCORE_*`, ...), `PLAYER_NOT_JOINED` (a named player is no longer `JOINED`) or `ALREADY_COUNTED` (a history pointer exists).
- `notes`: things an operator should know: `NO_RECORDS`, `NO_VENUE_COUNTRY`, `NO_VENUE_REGION`.
- Also on the row (plain columns): `status` (`RUNNING`, `DONE`, `SKIPPED`, `RETRY`, `FAILED`), `attempts`, `next_attempt_at`, `claimed_at`, `last_error`, `counted` and `ignored` (the counts), `finished_at`.

## 6. `leaderboard_entry` (the flat ranking projection, no jsonb)

One row per player or team per board, so a ranking is set-based SQL and never a scan of the blobs above. Key `(scope_type, scope_id, sport_id, kind, subject_key)`:

| Column | Meaning |
|---|---|
| `scope_type`, `scope_id` | `GROUP` + group id, `REGION` + region id, or `COUNTRY` + country id |
| `kind` | `SINGLE` (subject = the player's user id) or `COMBO` (subject = the `TEAM` key of section 3.2) |
| `k1`, `k2`, `k3` | the values of the sport's `ranking.sort` keys, in order, computed once when the row is written (null when a key has no value yet) |
| `games` | games behind the numbers (the board's `minGames` is applied to it) |
| `rank`, `ranked_at` | set only by the nightly ranking job (SESSION-54); null until then |

`stat_board_runs` holds one small row per board (`dirty`, `status`, `claimed_at`, `computed_at`) for that job.

## 7. Worked example: a badminton player in two regions

Player A has played 17 ranking games, 7 at venues in region 1 (3 won) and 10 in region 2 (4 won), both regions in country 1. Pair games with B were all in region 1. The row in `user_sport_stats` (counters abbreviated to `games/wins`):

```json
personal:  { "all": 17/7, "ranked": 17/7 }
groupings: { "PARTNER": { "<B>": { "all": 7/3, "ranked": 7/3 } },
             "TEAM":    { "<A>,<B>": { "all": 7/3, "ranked": 7/3 } } }
scopes: [
  { "scope": "REGION",  "countryId": 1, "regionId": 1,    "counters": 7/3,  "groupings": { "PARTNER": { "<B>": 7/3 }, "TEAM": { "<A>,<B>": 7/3 } } },
  { "scope": "REGION",  "countryId": 1, "regionId": 2,    "counters": 10/4, "groupings": {} },
  { "scope": "COUNTRY", "countryId": 1, "regionId": null, "counters": 17/7, "groupings": { "PARTNER": { "<B>": 7/3 }, "TEAM": { "<A>,<B>": 7/3 } } }
]
history: [ 17 pointers, newest first ]
```

If some of the 17 had been normal games, they would be in `personal.all` and `groupings.*.all` but not in `ranked` and not in `scopes`.

## 8. Changing a shape

1. Change `PlayerStatsDoc` / `GroupStatsDoc` / `StatsGroupings` (the only code that touches these maps) and `StatsDocsSpec` (which pins the keys).
2. Change this file in the same change.
3. A change to an existing key is a data migration of every row: say so in the ticket. A new optional key or a new dimension needs none (readers treat a missing key as empty, section 0).
4. Anything the client reads from these shapes goes through the SESSION-73 read API; the client never reads the tables.
