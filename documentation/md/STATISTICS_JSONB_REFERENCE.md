# Statistics: every jsonb structure

**Status:** reference for SESSION-53 (the engine), SESSION-73 (the read API), SESSION-54 (leaderboards) and the client tickets that show statistics. Written 2026-11-24, **reworked 2026-11-25** (owner: one config shared with the client, no defaults, a sport switch, the group head-to-head, no leaderboard writes by the engine). The code that reads and writes these shapes is `modules/session/session-impl/src/main/java/com/sportconnect/session/stats/` (`PlayerStatsDoc`, `GroupStatsDoc`, `GroupH2hDoc`, `StatsCounters`, `StatsGroupings`, `StatsHistory`, `StatsCatalog`, `StatisticsSchema`); `StatsDocsSpec` and `GroupH2hDocSpec` pin the keys named here. **A shape changes only together with this file and those specs.**

Design and reasons: `modules/session/docs/STATISTIC_RANKING_DESIGN.md`, revised by `modules/session/docs/STATISTICS_CONFIG_PAIRS_AND_H2H_DESIGN_DRAFT.md` (the decisions of 2026-11-25). The sport's side of the schema (`record.scoreboard`, `record.ranking`, `record.data.allowDraws`): `documentation/md/RECORD_SCHEMA_CONTRACT.md`. Background jobs that write these rows: `documentation/md/BACKGROUND_JOBS.md`.

## 0. Reading rules for any consumer

- **A missing key is zero, an empty map or an empty list.** A new player has no row until their first counted game; a row may have `groupings: {}`.
- **A stat the sport does not collect is absent.** The counters hold only the stats the sport's `record.scoreboard.columns` need (section 2): a sport that lists `games` and `wins` has no `losses` key at all, and "absent" there means "not collected", never "zero". (A collected stat no game has added to yet is written as `0`, so the two can be told apart.)
- **Ignore keys you do not know.** A new stat is added by changing the catalog and a sport's schema, with no migration.
- **Formulas are not stored.** `winRate`, `winDiff`, `scoreDiff` are computed from the stored counters with the catalog's formulas (`StatisticsSchema.valueOf`); a formula whose operands the sport does not collect has no value.
- **Counts are numbers, not strings.** A whole number is written as an integer (`31`), a sum with a fraction as a decimal. Ids are numbers (`countryId`, `regionId`, `recordId`, `sessionId`) or UUID strings (`userId`, partner ids).
- **`all` includes `ranked`.** `all` is every counted game; `ranked` is the subset that was a ranking game (proposed and confirmed by every player, SESSION-72). A normal game adds to `all` only; a ranking game adds to both.

## 1. Where the configuration lives: the sport's `result_schema` and `statistics_enabled`

The statistics config is part of the sport's `result_schema` jsonb (sport module), not a separate table, and the sport has one switch:

```json
"record": {
  "data": { "type": "COMPETITIVE", "allowDraws": false },
  "scoreboard": {
    "columns": ["games", "wins", "scoreFor", "scoreAgainst"],
    "groupBy": [ { "by": "PARTNER" } ]
  },
  "ranking": {
    "sort": [ { "by": "wins", "dir": "DESC" }, { "by": "games", "dir": "ASC" } ],
    "minGames": { "single": 0, "combo": 5 }
  }
}
```

| Key | Meaning | When the key is missing |
|---|---|---|
| `sports.statistics_enabled` | statistics and ranking on or off for the sport, together (column on `sports`, set by an admin) | off: the runner never picks the sport's sessions, ranking games cannot be proposed |
| `scoreboard.columns[]` | the stats the sport shows, chosen from the record type's catalog (`StatsCatalog`, the client's `record-ui-v1.json` list). The server collects exactly what they need. | **nothing is collected** (no defaults) |
| `scoreboard.groupBy[]` | the **one** dimension that gets counters of its own beside the totals: `{by: PARTNER}` (one set per teammate) or `{by: TEAM, size: n >= 2}` (one set per group of n players of one team). A list, the first usable entry is kept. | no grouping at all |
| `ranking.sort[]` | at most three keys of the catalog (`by`, `dir` `ASC` or `DESC`); a key also collects what it needs when the sport lists columns | no ranking order (no default) |
| `ranking.minGames` | games needed to be ranked: `single` for a player, `combo` for a team | `0` and `5` |
| `data.allowDraws` | the sport's games can end in a draw (the head-to-head then keeps a draws number) | `false` |

The catalog for `COMPETITIVE`: counted `games`, `wins`, `losses`; summed `scoreFor`, `scoreAgainst`; formulas `winRate` (`wins/games`), `winDiff` (`wins-losses`), `scoreDiff` (`scoreFor-scoreAgainst`). Only the counted and summed stats are stored; a formula column makes its operands stored.

The server reads the schema leniently: an entry it cannot use (a column not in the catalog, a `TEAM` with a size below 2, an unknown dimension, a repeat) is dropped and never an error, so editing the schema can never stop a session from being counted. The first build's `record.statistics` block is **not read** any more.

## 2. The counters object

One shape, used everywhere a set of counters is stored (`StatsCounters.toMap`), flat, only the collected stats:

```json
{ "games": 17, "wins": 7, "scoreFor": 312, "scoreAgainst": 340 }
```

- `games`, `wins`, `losses`: counts. A game whose outcome is unknown, or a draw, adds to `games` only. A collected count is written as `0` by a game that adds nothing to it (a loss adds `0` to `wins`).
- `scoreFor`, `scoreAgainst`: sums of what each game gave the player. A sum no game has given yet is absent, not `0`.
- Nothing else: no `draws` counter, no formula, no custom metric.

## 3. `user_sport_stats` (one row per user and sport)

Primary key `(user_id, sport_id)`; `version` (optimistic lock) and `updated_at` are plain columns. The jsonb columns:

### 3.1 `personal`

```json
{ "all": <counters>, "ranked": <counters> }
```

The player's totals in the sport: every counted game (`all`) and the ranking games among them (`ranked`; empty until a ranking game is counted).

### 3.2 `groupings`

```json
{
  "PARTNER": { "<partnerUserId>": { "all": <counters>, "ranked": <counters> } }
}
```

or, for a sport grouped by team, `"TEAM": { "<memberIdA>,<memberIdB>": { "all": <counters>, "ranked": <counters> } }`. **One dimension at most**: the sport's `groupBy` keeps one grouping, so a row holds a second dimension only from before the sport's schema was edited.

- The first level is the `by` of the sport's `groupBy`. A dimension with no group yet is absent; a sport with no `groupBy` has `{}`.
- **`PARTNER`** key: the other player's user id. A player's own row never holds their own id. The counters are the games this player played **on the same team** as that partner. Games against a player are not counted. The same game is also in the partner's row, under this player (accepted duplication: pair statistics are personal data, owner 2026-11-25).
- **`TEAM`** key: the ids of the `size` players, **sorted as text and joined by commas** (so the same group has the same key whatever order a record lists them in). The key includes the owner of the row.
- Caps: a team with more than 100 other members gets no `PARTNER` entries; a team with more than 100 groups of `size` gets no `TEAM` entries.
- A grouping is a personal view. It is not a leaderboard entry: SESSION-54 builds any pair or team board.

### 3.3 `scopes`

```json
[
  {
    "scope": "REGION",              // or "COUNTRY"
    "countryId": 1,
    "regionId": 2,                  // null for a COUNTRY entry
    "counters": <counters>,
    "groupings": { "PARTNER": { "<partnerUserId>": <counters> } }
  }
]
```

- The player's **ranking games only**, counted at the **venue's** region and country (where the game was played, not where the player lives). A normal game adds nothing here.
- One `REGION` entry per region and one `COUNTRY` entry per country, created when the first ranking game is counted there. The `COUNTRY` entry is the sum of that country's `REGION` entries and of games at venues with a country but no region.
- Counters only: no `all` / `ranked` split, because everything here is ranked.
- A venue with no country gets no entry at all; with a country but no region, only the `COUNTRY` entry. The job row's `result.notes` says so (section 6).

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
  "groupings": { "PARTNER": { "<partnerUserId>": <counters> } }
}
```

The same keys as in section 3, with **no `all` / `ranked` split** (owner, 2026-11-25): this is every game of the group's sessions.

### 4.2 `history`

Same pointers as section 3.4, capped at 500, for the group's games only.

## 5. `group_stats` (one row per group and sport): the head-to-head

Primary key `(group_id, sport_id)`; `version` and `updated_at` plain columns; one jsonb column, `h2h`. Written by the counting transaction for a **group session of a sport grouped by `PARTNER`**, for each counted game of **two teams of exactly two players**; a sport with a `TEAM` grouping, or none, and a game of any other shape adds nothing, and a game outside a group has no head-to-head.

```json
{
  "members":    { "<userId>": 1, "<userId>": 2, "<userId>": 3, "<userId>": 4 },
  "lastMember": 4,
  "seq":        4711,
  "h2h": {
    "1.2-3.4": [2, 1, 4711],
    "1.5-3.4": [1, 0, 1, 4650]
  }
}
```

- **`members`**: a small number per member, handed out in the order members first appear and **never reused** (a member who leaves keeps theirs); `lastMember` is the last number given. The document is self-contained, so it needs no pair table.
- **A pair** is its two member numbers, the smaller first (`"1.2"`). **A matchup key is the smaller pair first** (compared by the first number, then the second): `"1.2-3.4"`. One helper (`GroupH2hDoc.matchupKey`) is the only rule, so a lookup never tries both orders.
- **The value** is `[wins of the first pair of the key, wins of the second, seq]`, or `[wins1, wins2, draws, seq]` for a sport whose `record.data.allowDraws` is true (the length says which; an entry gains the draws number when the sport starts allowing draws). The wins follow the **key order**, not the order of the game's teams.
- **`seq`**: the group's running game number (`seq` at the top is the last one given); each entry's last number is the game number of the last game of that matchup.
- **Cap**: the latest 5,000 matchups are kept; when a new matchup would pass the cap the one with the smallest last `seq` (the least recently played) is dropped, and playing a matchup again refreshes it. Measured: about 11 to 14 bytes a matchup stored (about 55 KB at 5,000), a game rewriting the whole value (4 ms and about 45 KB of log at 3,750 entries).
- Only a game with a result is recorded (a `NONE` outcome adds nothing, a draw only when the sport allows draws).

## 6. `session_stats_jobs.result` (one row per counted session)

```json
{
  "counted": [ { "recordId": 9012, "ranking": true }, { "recordId": 9013, "ranking": false } ],
  "ignored": [ { "recordId": 9014, "reason": "FIRST_TEAM_NOT_AHEAD" } ],
  "notes":   [ "NO_VENUE_REGION" ]
}
```

- `counted`: one entry per game that was counted: its `recordId` and `ranking`, whether it counted as a ranking game (the same mark as `ranking` in a history pointer, section 3.4). A rebuild or an operator reads from here why a game is, or is not, in a region or country counter.
- `ignored`: a record that was read and not counted, with its reason: the reader's invalid or not-rankable reasons (`NO_SCORE`, `FIRST_TEAM_NOT_AHEAD`, `SCORE_*`, ...), `PLAYER_NOT_JOINED` (a named player is no longer `JOINED`) or `ALREADY_COUNTED` (a history pointer exists).
- `notes`: things an operator should know: `NO_RECORDS`, `NO_VENUE_COUNTRY`, `NO_VENUE_REGION`, `NO_RESULT_SCHEMA`, `NO_READER`, `SESSION_NOT_COMPLETED`, and **`STATISTICS_NOT_CONFIGURED`** (the sport's schema lists no usable `scoreboard.columns`: the session is `SKIPPED` for good; adding columns later does not recount it, SESSION-77 does).
- Also on the row (plain columns): `status` (`RUNNING`, `DONE`, `SKIPPED`, `RETRY`, `FAILED`), `attempts`, `next_attempt_at`, `claimed_at`, `last_error`, `counted` and `ignored` (the counts), `finished_at`.
- A sport whose statistics are switched off has **no job row**: the runner does not pick its sessions, and a row claimed just before the switch was turned off is deleted by the processor, so switching the sport on later counts the session.

## 7. `leaderboard_entry` and `stat_board_runs`

`leaderboard_entry` is the flat ranking projection (no jsonb), one row per player or team per board, so a ranking is set-based SQL and never a scan of the blobs above. Key `(scope_type, scope_id, sport_id, kind, subject_key)`:

| Column | Meaning |
|---|---|
| `scope_type`, `scope_id` | `GROUP` + group id, `REGION` + region id, or `COUNTRY` + country id |
| `kind` | `SINGLE` (subject = the player's user id) or `COMBO` (subject = the `TEAM` key of section 3.2) |
| `k1`, `k2`, `k3` | the values of the sport's `ranking.sort` keys, in order (null when a key has no value yet) |
| `games` | games behind the numbers (the board's `minGames` is applied to it) |
| `rank`, `ranked_at` | the position and when it was computed |

**The counting engine does not write this table** (owner, 2026-11-25): SESSION-54's job builds the rows from the blobs of the boards that changed and ranks them. The engine only sets `stat_board_runs` (`dirty`, `dirty_at`, `status`, `claimed_at`, `computed_at`, one small row per board) so that job knows which boards to rebuild. How the job finds "every player with an entry in this region or country" is SESSION-54's question (a jsonb array has no index).

## 8. Worked example: a badminton player in two regions

The sport: columns `games` and `wins`, `groupBy` `PARTNER`. Player A has played 17 ranking games, 7 at venues in region 1 (3 won) and 10 in region 2 (4 won), both regions in country 1. Games with B were all in region 1. The row in `user_sport_stats` (counters abbreviated to `games/wins`):

```json
personal:  { "all": 17/7, "ranked": 17/7 }
groupings: { "PARTNER": { "<B>": { "all": 7/3, "ranked": 7/3 } } }
scopes: [
  { "scope": "REGION",  "countryId": 1, "regionId": 1,    "counters": 7/3,  "groupings": { "PARTNER": { "<B>": 7/3 } } },
  { "scope": "REGION",  "countryId": 1, "regionId": 2,    "counters": 10/4, "groupings": {} },
  { "scope": "COUNTRY", "countryId": 1, "regionId": null, "counters": 17/7, "groupings": { "PARTNER": { "<B>": 7/3 } } }
]
history: [ 17 pointers, newest first ]
```

If some of the 17 had been normal games, they would be in `personal.all` and `groupings.*.all` but not in `ranked` and not in `scopes`. In the group's `group_stats`, A and B (numbers 1 and 2) against X and Y (3 and 4), after three games of which A and B won two, is `"h2h": { "1.2-3.4": [2, 1, 3] }`.

## 9. What the read API returns (SESSION-73)

The client never reads the tables above. It reads four endpoints, which show the stored numbers through the sport's config (section 1). All four need a signed-in, active account. They are read-only.

| Endpoint | Who | What |
|---|---|---|
| `GET /api/stats/me?sportId=&page=&size=` | the caller | their statistics in the sport |
| `GET /api/stats/me/games?sportId=&cursor=&size=` | the caller | a page of their counted games, newest first |
| `GET /api/sessions/group/{groupId}/stats?page=&size=` | a member of the group | one totals row per member |
| `GET /api/sessions/group/{groupId}/stats/members/{userId}?page=&size=` | a member of the group | one member's totals and their pairs or partners (the sport's one grouping) |

- The personal endpoints need `sportId` (a missing one is 400; a missing or deactivated sport is 404 `SPORT_NOT_FOUND`). **The group endpoints take no `sportId`: a group has one sport, and its statistics are that sport's.** A group with no sport is 400 `SESSION_SPORT_REQUIRED` (after the member gate). Every answer carries the `sportId` it used.
- A non-member, and a group that does not exist or is inactive, get the same 403 `SESSION_GROUP_MEMBER_REQUIRED` on both group endpoints, before anything else is read.
- **While the sport's `statistics_enabled` switch is off, nothing is shown**: `columns` is empty, every `values` map is empty and there are no pairs or partners (the stored rows are kept; switching it on shows them again). The `games` history is still readable.

### 9.1 Columns and values (common to all four)

`columns` is the sport's `record.scoreboard.columns`: a list of catalog keys (`StatsCatalog`) in the sport's order, an unknown or repeated key dropped. Every `values` map is keyed by those keys.

```json
"columns": ["games", "wins", "scoreFor", "winRate"]
```

- **The label of a column, and whether it is a count, a sum or a formula, is the client's**: the catalog is the one list the client's `record-ui-v1.json` also holds, so the key is enough (en and vi label per key).
- A value is a number, or `null` where there is none: a stat no game has given yet (**a player with no counted game has `null` everywhere, not zeros**; a collected count is written from the first counted game on) or a formula with no value (a division by zero).

### 9.2 `GET /api/stats/me`

```json
{
  "sportId": 1,
  "columns": [ ... ],
  "totals": { "all": { "games": 3, "wins": 2 }, "ranked": { ... }, "normal": { ... } },
  "pairs":    [ { "players": [ {id, fullName, avatarUrl}, {id, fullName, avatarUrl} ], "values": { "all": {..}, "ranked": {..}, "normal": {..} } } ],
  "pairsTotal": 1,
  "partners": [ { "players": [ {id, fullName, avatarUrl} ], "values": { "all": {..}, "ranked": {..}, "normal": {..} } } ],
  "partnersTotal": 1,
  "scopes":   [ { "scope": "REGION", "countryId": 1, "regionId": 11, "values": { ... } } ],
  "asOf": "2026-11-24T05:31:00Z"
}
```

- `normal` is `all` minus `ranked`: every stored stat (counts and sums) subtracts, never below zero, and formulas are **computed on the difference**, never subtracted (a win rate cannot be).
- A sport has **one grouping only**, so exactly one of `pairs` and `partners` is filled, and both are empty when the sport has no `record.scoreboard.groupBy` (missing means no grouping at all). What is shown follows the sport's **current** config, not what is stored. `pairs`: the `TEAM` groupings, the asking player included in `players`; `partners`: the `PARTNER` groupings, one teammate each (badminton). Most games first (by `all`).
- **Paged:** `page` (from 0, default 0) and `size` (1 to 50, default 20; anything else is 400) cut the one filled list; `pairsTotal` and `partnersTotal` say how many the player has in all. A page past the end is empty. Names are looked up for the page only. The totals and `scopes` are the same on every page.
- `scopes`: the ranking games per place, `COUNTRY` and `REGION` entries, most games first. **Ids only** (the client resolves names from `/api/reference`); `regionId` is `null` for a `COUNTRY`; `values` is ranking games only.
- `asOf` is when this player's row was last updated, `null` for a player with no counted game. Such a player gets `null` values and empty lists, not a 404.
- Names come from the display lookup, so a deactivated partner keeps their real name; an id the lookup does not know has `fullName: null`.

### 9.3 `GET /api/stats/me/games`

```json
{
  "games": [
    { "recordId": 9012, "sessionId": 457, "title": "Monday night", "playedAt": "2026-11-20T10:00:00Z",
      "ranking": true, "outcome": "WIN",
      "teams": [ { "players": [ {id, fullName, avatarUrl}, ... ], "scores": [21] },
                 { "players": [ ... ], "scores": [15] } ] }
  ],
  "nextCursor": 9011
}
```

- Newest first, from the player's history pointers (the latest 500 counted games). `size` is 1 to 50 (default 20; anything else is 400).
- **Paging:** send the previous page's `nextCursor` as `cursor`; it is `null` on the last page. The cursor is the **last record id** of the page, not an offset, so a game counted between two pages is never repeated or skipped. A cursor no longer in the 500 pointers gives an empty last page.
- `ranking` is the mark the engine recorded. `outcome` is `WIN`, `LOSS` or `DRAW` for the asking player, `null` when the sport's current schema can no longer read the record. `scores` has one entry per score slot (`null` for an empty slot). `title` is `null` when the session has none.
- A pointer whose record or session is gone is skipped, so a page can hold **fewer than `size` games** and still have a `nextCursor`.

### 9.4 `GET /api/sessions/group/{groupId}/stats`

```json
{
  "sportId": 1,
  "columns": [ ... ],
  "members": { "content": [ { "member": {id, fullName, avatarUrl}, "values": { "games": 3, "wins": 2 } } ],
               "totalElements": 4, "totalPages": 1, "number": 0, "size": 20 },
  "asOf": "2026-11-24T05:31:00Z"
}
```

- One row per **current, active** member who has a row: the totals over **all** the group's games (a group row has no `all`/`ranked` split). **Totals only**: a member's pairs or partners are 9.5.
- Most games first, then most wins (0 when the sport does not collect wins), then user id. A member who left the group or whose account is deactivated is not listed. Paged by member (`page`, `size` 1 to 50 default 20, a larger size is cut to 50).
- `asOf` is the newest update among **all** the listed members, `null` when the list is empty. Ranks are not here (SESSION-54).

### 9.5 `GET /api/sessions/group/{groupId}/stats/members/{userId}`

```json
{
  "sportId": 1,
  "columns": [ ... ],
  "member": {id, fullName, avatarUrl},
  "totals": { "games": 6, "wins": 4 },
  "pairs": [ { "players": [ {id, fullName, avatarUrl}, {id, fullName, avatarUrl} ], "values": { "games": 5, "wins": 3 } } ],
  "pairsTotal": 1,
  "partners": [ { "players": [ {id, fullName, avatarUrl} ], "values": { "games": 5, "wins": 3 } } ],
  "partnersTotal": 1,
  "asOf": "2026-11-24T05:31:00Z"
}
```

- Any member of the group may open any member's detail. **The member asked about is not checked**: one who left the group or was deactivated is still shown (the group's history; the name comes from the display lookup). A member with no row gets `null` values, empty lists and `asOf: null`.
- Exactly one of `pairs` and `partners` is filled (both are empty for a sport with no `groupBy`), most games first, **paged like 9.2** (`page`, `size`; the totals say how many there are), each entry with the one map of values (a group has no ranking split).
- SESSION-74's privacy setting for personal and pair statistics will also gate this endpoint.

## 10. Changing a shape

1. Change `PlayerStatsDoc` / `GroupStatsDoc` / `GroupH2hDoc` / `StatsGroupings` (the only code that touches these maps) and `StatsDocsSpec` / `GroupH2hDocSpec` (which pin the keys).
2. Change this file in the same change.
3. A change to an existing key is a data migration of every row: say so in the ticket. A new optional key or a new dimension needs none (readers treat a missing key as empty, section 0). A stat added to the catalog and to a sport's columns has no history until the rebuild (SESSION-77).
4. Anything the client reads from these shapes goes through the SESSION-73 read API; the client never reads the tables.
