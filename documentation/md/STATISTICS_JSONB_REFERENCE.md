# Statistics: every jsonb structure

**Status:** reference for SESSION-53 (the engine), SESSION-73 (the read API), SESSION-54 (leaderboards) and the client tickets that show statistics. Written 2026-11-24, **reworked 2026-11-25** (owner: one config shared with the client, no defaults, a sport switch, the group head-to-head, no leaderboard writes by the engine). The code that reads and writes these shapes is `modules/session/session-impl/src/main/java/com/sportconnect/session/stats/` (`PlayerStatsDoc`, `GroupStatsDoc`, `GroupH2hDoc`, `StatsCounters`, `StatsGroupings`, `StatsHistory`, `StatsCatalog`, `StatisticsSchema`); `StatsDocsSpec` and `GroupH2hDocSpec` pin the keys named here. **A shape changes only together with this file and those specs.**

Design and reasons: `modules/session/docs/STATISTIC_RANKING_DESIGN.md`, revised by `modules/session/docs/STATISTICS_CONFIG_PAIRS_AND_H2H_DESIGN_DRAFT.md` (the decisions of 2026-11-25). The sport's side of the schema (`record.scoreboard`, `record.ranking`, `record.data.allowDraws`): `documentation/md/RECORD_SCHEMA_CONTRACT.md`. Background jobs that write these rows: `documentation/md/BACKGROUND_JOBS.md`.

## 0. Reading rules for any consumer

- **A missing key is zero, an empty map or an empty list.** A new player has no row until their first counted game; a row may have `groupings: {}`.
- **A stat the sport does not collect is absent.** The counters hold only the stats the sport's `record.scoreboard.columns` need (section 2): a sport that lists `games` and `wins` has no `losses` key at all, and "absent" there means "not collected", never "zero". (A collected stat no game has added to yet is written as `0`, so the two can be told apart.)
- **Ignore keys you do not know.** A new stat is added by changing the catalog and a sport's schema, with no migration.
- **Formulas are not stored.** `winRate`, `winDiff`, `scoreDiff` are computed from the stored counters with the catalog's formulas (`StatisticsSchema.valueOf`); a formula whose operands the sport does not collect has no value.
- **A node nothing was counted into is not written (owner, 2026-11-25).** A partner with no ranking game has no `ranked` node, a place entry with no grouping has no `groupings`, a group member with no grouping has no `groupings`. A reader treats a missing key as empty (the same rule as for an old shape), so a player with 300 partners and no ranking game does not carry 300 empty nodes (measured: 54 KB with them, 48 KB without).
- **A counters object is one short string (SESSION-81, owner 2026-11-25), see section 2**, not a map: the value of the stat with id `n` is in the `n`-th slot (`"7,4,3"` is 7 games, 4 wins, 3 losses). Ids elsewhere are numbers (`countryId`, `regionId`) or UUID strings (`userId`; the partner ids of a **player's** own row). **A group's rows name members by the group's permanent member number**, not by user id (sections 4 and 5).
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
| `ranking.minGames` | games needed to be ranked: `single` for a player, `combo` for a team. **SESSION-54: no longer used**; who is listed is decided by the `require` preconditions of the server-only rule (section 7) | `0` and `5` |
| `data.allowDraws` | the sport's games can end in a draw (the head-to-head then keeps a draws number) | `false` |

The catalog for `COMPETITIVE`: counted `games`, `wins`, `losses`; summed `scoreFor`, `scoreAgainst`; formulas `winRate` (`wins/games`), `winDiff` (`wins-losses`), `scoreDiff` (`scoreFor-scoreAgainst`). Only the counted and summed stats are stored; a formula column makes its operands stored.

The server reads the schema leniently: an entry it cannot use (a column not in the catalog, a `TEAM` with a size below 2, an unknown dimension, a repeat) is dropped and never an error, so editing the schema can never stop a session from being counted. The first build's `record.statistics` block is **not read** any more.

## 2. The counters object

One shape, used everywhere a set of counters is stored (`StatsCounters.encode` and `decode`): **one string**, the value of the stat whose id is `n` in the `n`-th slot, slots separated by `,`, only the collected stats:

```json
"17,7,,312,340"
```

The ids are explicit, global and **append-only** (`StatsCatalog.ids()`; the client's `record-ui-v1.json` carries the same ones as `COMPETITIVE.scoreboard.statIds`, and `StatsCatalogSpec` fails when they differ): `games` 1, `wins` 2, `losses` 3, `scoreFor` 4, `scoreAgainst` 5, then the formulas (never stored) `winRate` 6, `winDiff` 7, `scoreDiff` 8. **`sessions` is 9 (SESSION-82, stored, single players only), so the slots 6 to 8 stay empty before it: `"7,4,,52,40,,,,12"`.** An id is never changed, reused or renumbered; a new stat takes the next number. The id is not the display order of the columns.

- **Empty slot** = not collected (or no value yet). The slots after the last value are cut, so a sport collecting `games` and `wins` stores `"17,7"`. **Nothing counted is `""`.**
- **A whole number** has no decimal part (`312`), a sum with a fraction keeps it (`15.5`), a negative sum keeps its sign (`-9`). The separator is `,` because `-` would clash with a minus sign.
- A reader skips a slot that is empty, not a number, or whose id has no stored stat (a formula id, or an id a newer version added); it never fails. The flat object of the first builds (`{"games": 17}`) is still read.
- (Measured with `pg_column_size`, 300 partners: 48 KB as objects with stat names, 30 KB as arrays, **18 KB as one string per partner**.)
- `games`, `wins`, `losses`: counts. A game whose outcome is unknown, or a draw, adds to `games` only. A collected count is written as `0` by a game that adds nothing to it (a loss adds `0` to `wins`), so "collected, none yet" (`0`) and "not collected" (empty slot) differ.
- `scoreFor`, `scoreAgainst`: sums of what each game gave the player. A sum no game has given yet is an empty slot, not `0`.
- Nothing else: no `draws` counter, no formula, no custom metric.

## 3. `user_sport_stats` (one row per user and sport)

Primary key `(user_id, sport_id)`; `version` (optimistic lock) and `updated_at` are plain columns. The jsonb columns:

### 3.1 `personal`

```json
{ "all": "<counters>", "ranked": "<counters>" }
```

The player's totals in the sport (the counters are the strings of section 2): every counted game (`all`) and the ranking games among them (`ranked`; empty until a ranking game is counted).

### 3.2 `groupings`

```json
{
  "PARTNER": { "<partnerUserId>": "<all>/<ranked>" }
}
```

Each entry is **one string**: the `all` counters, then `/` and the `ranked` counters; **nothing ranked is no `/` part** (`"7,3"` or `"7,3/2,1"`). For a sport grouped by team: `"TEAM": { "<memberIdA>,<memberIdB>": "<all>/<ranked>" }`. A player's own row keeps **user ids** as keys: their partners come from many groups, so a group's member number cannot name them. **One dimension at most**: the sport's `groupBy` keeps one grouping, so a row holds a second dimension only from before the sport's schema was edited.

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
    "counters": "<counters>",
    "groupings": { "PARTNER": { "<partnerUserId>": "<counters>" } }      // left out when empty
  }
]
```

The fields that identify a place (`scope`, `countryId`, `regionId`) stay plain jsonb on purpose: SESSION-54 may index or query them (finding every player at a region). Only the counters are strings.

- The player's **ranking games only**, counted at the **venue's** region and country (where the game was played, not where the player lives). A normal game adds nothing here.
- One `REGION` entry per region and one `COUNTRY` entry per country, created when the first ranking game is counted there. The `COUNTRY` entry is the sum of that country's `REGION` entries and of games at venues with a country but no region.
- Counters only: no `all` / `ranked` split, because everything here is ranked.
- A venue with no country gets no entry at all; with a country but no region, only the `COUNTRY` entry. The job row's `result.notes` says so (section 6).

### 3.4 `history`

```json
[ "0-9031", "1-9027", "0-9019" ]
```

One string per counted game, `"<ranking>-<recordId>"`: `1` when it counted as a ranking game, `0` when not, then the record id. **Newest first, at most 500** (the oldest fall off). **There is no session id and no other detail**: a page of history reads the records by id from `session_records` (each row names its session) and then the sessions. The history is also the second guard against counting a record twice. The one place that knows this format is `StatsHistory`. (It was a list of `{recordId, sessionId, ranking}` objects, 36 KB for 500 entries; as strings it is 5 KB, measured with `pg_column_size`, and smaller than a list of numbers, which jsonb stores as `numeric`.)

## 4. `group_member_stats` (one row per group, user and sport)

Primary key `(group_id, user_id, sport_id)`; written only for the games of a **group** session (all of them, ranking or not).

### 4.1 `stats`

```json
{
  "counters":  "<counters>",
  "groupings": { "PARTNER": { "<partnerMemberNo>": "<counters>" } }      // left out when empty
}
```

The same shape as in section 3, with **no `all` / `ranked` split** (owner, 2026-11-25): this is every game of the group's sessions. **The keys are the group's permanent member numbers** (SESSION-81): a partner is `"3"`, a team the members' numbers sorted as numbers and joined by commas (`"3,7"`). The group module owns the numbers (`GroupMemberNumberService`, table `group_member_numbers`: unique inside the group, never reused, kept when a member leaves, allocated the first time they are asked for; members from before V107 were numbered in joined order). A reader turns a number back into a user id with one batch call (`getUserIdsByMemberNumbers`). Measured: 300 partners in a group member's row are 8 KB with small-integer keys and string counters (48 KB before).

### 4.2 `history`

Same pointers as section 3.4, capped at 500, for the group's games only.

## 5. `group_stats` (one row per group and sport): the head-to-head

Primary key `(group_id, sport_id)`; `version` and `updated_at` plain columns; one jsonb column, `h2h`. Written by the counting transaction for a **group session of a sport grouped by `PARTNER`**, for each counted game of **two teams of exactly two players**; a sport with a `TEAM` grouping, or none, and a game of any other shape adds nothing, and a game outside a group has no head-to-head.

```json
{
  "seq":        4711,
  "h2h": {
    "1.2-3.4": [2, 1, 4711],
    "1.5-3.4": [1, 0, 1, 4650]
  }
}
```

- **The numbers are the group's permanent member numbers** (section 4.1), owned by the group module: the document keeps **no member dictionary of its own** (an older document's `members` and `lastMember` are ignored). It needs no pair table.
- **A pair** is its two member numbers, the smaller first (`"1.2"`). **A matchup key is the smaller pair first** (compared by the first number, then the second): `"1.2-3.4"`. One helper (`GroupH2hDoc.matchupKey`) is the only rule, so a lookup never tries both orders.
- **The value** is `[wins of the first pair of the key, wins of the second, seq]`, or `[wins1, wins2, draws, seq]` for a sport whose `record.data.allowDraws` is true (the length says which; an entry gains the draws number when the sport starts allowing draws). The wins follow the **key order**, not the order of the game's teams.
- **`seq`**: the group's running game number (`seq` at the top is the last one given); each entry's last number is the game number of the last game of that matchup.
- **Cap**: the latest 5,000 matchups are kept; when a new matchup would pass the cap the one with the smallest last `seq` (the least recently played) is dropped, and playing a matchup again refreshes it. Measured: about 11 to 14 bytes a matchup stored (about 55 KB at 5,000), a game rewriting the whole value (4 ms and about 45 KB of log at 3,750 entries).
- Only a game with a result is recorded (a `NONE` outcome adds nothing, a draw only when the sport allows draws).

## 6. `session_stats_jobs.result` (one row per counted session)

```json
{
  "counted": [ "1-9012", "0-9013" ],
  "ignored": [ "9014:SCORES_EQUAL" ],
  "notes":   [ "NO_VENUE_REGION" ]
}
```

- `counted`: one entry per game that was counted, in the history's format `"<ranking>-<recordId>"` (section 3.4): whether it counted as a ranking game and its record id. A rebuild or an operator reads from here why a game is, or is not, in a region or country counter.
- `ignored`: one entry per record that was read and not counted, `"<recordId>:<REASON>"`, the reason being: the reader's invalid reasons (`SCORE_*`, `DUPLICATE_PLAYER`, ...) or `SCORES_EQUAL` (equal scores in a sport that allows no draws; a game with no score is not ignored, the first team wins it), `PLAYER_NOT_JOINED` (a named player is no longer `JOINED`) or `ALREADY_COUNTED` (a history pointer exists).
- `notes`: things an operator should know: `NO_RECORDS`, `NO_VENUE_COUNTRY`, `NO_VENUE_REGION`, `NO_RESULT_SCHEMA`, `NO_READER`, `SESSION_NOT_COMPLETED`, and **`STATISTICS_NOT_CONFIGURED`** (the sport's schema lists no usable `scoreboard.columns`: the session is `SKIPPED` for good; adding columns later does not recount it, SESSION-77 does).
- `sessions` (SESSION-82): the number of players counted for the session itself in the `sessions` stat (absent or 0 for a sport that does not collect it); a session with only those is `DONE`, and a revived row with `sessions` above 0 counts none again.
- Also on the row (plain columns): `status` (`RUNNING`, `DONE`, `SKIPPED`, `RETRY`, `FAILED`), `attempts`, `next_attempt_at`, `claimed_at`, `last_error`, `counted` and `ignored` (the counts), `finished_at`.
- A sport whose statistics are switched off has **no job row**: the runner does not pick its sessions, and a row claimed just before the switch was turned off is deleted by the processor, so switching the sport on later counts the session.

## 7. Leaderboards (SESSION-54, V108): `leaderboard_entry`, `stat_board_changes`, `sport_ranking_rules`, `stat_board_runs`

Design and the whole discussion: `modules/session/docs/SESSION-54_LEADERBOARD_STORAGE_DESIGN.md`. The only code that reads or writes a tree is `BoardTree`, a sort list `SortList`; the tables are session-owned, no foreign keys.

**`leaderboard_entry` is one row per board**, key `(sport_id, scope_type, scope_id, kind)`: `scope_type` `GROUP` + group id, `REGION` + region id or `COUNTRY` + country id; `kind` `SINGLE` (a player) or `PARTNER` (a pair). `tree` is the whole ranked board (jsonb), `entries` how many subjects it holds, `rules_version` the version of the rule row it was built with, `computed_at` when it was published.

```json
{ "v": 1, "sort": [ {"key":"wins","dir":"DESC"}, {"key":"games","dir":"ASC"} ], "require": [], "n": 3,
  "t": [ ["10", [ ["11", ["<A>,<B>~1", "<A>,<C>~3", "<C>,<D>~1"]] ]] ] }
```

- **`t` has one level per sort key.** A node is a `[key, child]` pair, an **array and not an object** (jsonb reorders object keys), the nodes of a level are **already in rank order**, and the last level's child lists the subjects that have exactly those values. `key` is the value rounded to 4 decimals as a plain decimal (`"0.6667"`, `"10"`), or `"n"` for no value, which ranks last in either direction. `sort` is the sort list and `require` the preconditions the tree was built with.
- **The rank is derived, not stored:** 1 plus the number of entries in the better nodes; the entries of a leaf tie and share the rank of its first place. Counters are not stored either: the path carries the values the board is sorted by, so a page can show only stats that are in the sort list.
- **A subject** is written `subject~prevRank`: the rank it had in the previous build (also across a rule change), or just `subject` when it was not on the board then. **Region and country boards name a player by user id and a pair by the two ids sorted as text and joined by a comma; a group board names a member by the group's member number (SESSION-81) and a pair by the two numbers sorted as numbers.**
- **A country's `PARTNER` tree is the merge of its region trees** (`CountryMerge`): a pair that played in several regions counts at its best region only (its games are not added up, owner 2026-11-26), and the tree keeps at most `app.stats.ranking.country-slots-per-region` (1,000) entries for each region tree merged. A country's `SINGLE` tree is built from the players' aggregated `COUNTRY` entries and is not capped. A region tree is never capped.
- **Size** (estimate, not measured on PostgreSQL): about 75 to 100 bytes an entry; 60,000 entries is about 6 MB.

**`stat_board_changes`** (`id` generated and ever-increasing, `sport_id`, `scope_type`, `scope_id`, `user_id`, `created_at`): append-only. The statistics engine inserts one row per player and board (group, region, country) a counted session touched, in the counting transaction. The ranking job takes a board's highest `id` as its **cutoff**, rebuilds the players with a row up to it and deletes the rows up to it (`id <= cutoff`), so a game counted during the run keeps its row for the next one. A row says only who changed.

**`sport_ranking_rules`** (`sport_id`, `scope_type` `SPORT` default with `scope_id` 0 | `COUNTRY` | `GROUP`, `scope_id`, `kind`, `sort` jsonb, `conditions` jsonb, `version`, `updated_by`, `updated_at`): server-only, set by an ADMIN (`RankingRuleController`). `sort` is `[{"key":"wins","dir":"DESC"}, {"sum":{"wins":3,"games":1},"dir":"DESC"}]`, at most four keys, a key a catalog stat or a weighted sum of catalog stats, each with its own `ASC` or `DESC`; every stat must be one the sport collects. **`conditions`** (the request's `require`) are the **preconditions** a player or pair must all meet to be listed: `[{"key":"games","op":">=","value":5}, {"key":"wins","op":">=","value":2}]`, each a catalog stat the sport collects (a formula such as `winRate` too), an operator among `>=`, `>`, `<=`, `<`, `=` and a number, at most six; an empty list lists everyone who has played, and a key with no value (a win rate with no games) fails its condition. They decide who is on the board, never the order. A board takes the most specific row (group, then country, then sport; **a group board has no country yet, owner 2026-11-26: the group's country is handled later, so it uses the group's own row or the sport's**); no row, no board of that kind. `version` goes up on every save; a board built with another sort list or other preconditions than the row's is rebuilt whole.

**`stat_board_runs`** (V104 + V108): one small row per board: `dirty`, `dirty_at`, `status` (`IDLE`, `RUNNING` claimed, `FAILED`), `claimed_at`, `computed_at`, `country_id` (a region board's country, a country board's own id), `rules_version`, `full_rebuild` (a rule changed), `last_error`, `next_attempt_at` (a failed board's retry time). The engine sets `dirty` and `country_id`; the ranking job claims, publishes and clears them (the flag is cleared only if `dirty_at` is still the value the run read).

## 8. Worked example: a badminton player in two regions

The sport: columns `games` and `wins`, `groupBy` `PARTNER`. Player A has played 17 ranking games, 7 at venues in region 1 (3 won) and 10 in region 2 (4 won), both regions in country 1. Games with B were all in region 1. The row in `user_sport_stats` (the counters are the strings of section 2: games, then wins):

```json
personal:  { "all": "17,7", "ranked": "17,7" }
groupings: { "PARTNER": { "<B>": "7,3/7,3" } }
scopes: [
  { "scope": "REGION",  "countryId": 1, "regionId": 1,    "counters": "7,3",  "groupings": { "PARTNER": { "<B>": "7,3" } } },
  { "scope": "REGION",  "countryId": 1, "regionId": 2,    "counters": "10,4" },
  { "scope": "COUNTRY", "countryId": 1, "regionId": null, "counters": "17,7", "groupings": { "PARTNER": { "<B>": "7,3" } } }
]
history: [ "1-9031", "1-9027", ... 17 entries, newest first ]
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

### 9.6 The leaderboards (SESSION-54 slice B)

| Endpoint | Who | What |
|---|---|---|
| `GET /api/sessions/group/{groupId}/leaderboard?kind=&cursor=&size=` | a member of the group | a page of the group's board (the sport is the group's, as in 9.4) |
| `GET /api/leaderboards/regions/{regionId}?sportId=&kind=&cursor=&size=` | any signed-in user | a page of the region's board |
| `GET /api/leaderboards/countries/{countryId}?sportId=&kind=&cursor=&size=` | any signed-in user | a page of the country's board |
| `POST /api/sessions/group/{groupId}/leaderboard/refresh` | group owner or admin | builds the group's board now; 200 `{rankedAt, nextRefreshAt}`, 429 `SESSION_RANKING_COOLDOWN` (`retryAfterSeconds`), 409 `SESSION_RANKING_IN_PROGRESS` or `SESSION_GROUP_STATISTICS_OFF` |
| `GET / PUT / DELETE /api/sessions/group/{groupId}/leaderboard/rules` | GET any member; PUT, DELETE group owner or admin | the group's own sort list (`kind`, `sort`, `require`; `scopeType` and `scopeId` are ignored: the rule is this group's); `DELETE ?kind=` |

- **Answer** (`LeaderboardResponse`): `sportId`, `scopeType`, `scopeId`, `kind`, `sort` (the board's own sort list as it was built, so the client knows what `values` are), `total` (entries on the board before anyone is hidden), `entries`, `me`, `nextCursor`, `rankedAt`. An entry is `{rank, prevRank, players, values}`: `rank` is the competition rank (equal entries share it, so ranks skip: 1, 1, 3), `prevRank` the rank in the build before (null when not listed then), `players` one player (`SINGLE`) or two (`PARTNER`) as `{id, fullName, avatarUrl}`, `values` the sort values in the sort list's order (null where there is none). **A page can only show stats that are in the sort list**: the tree holds nothing else.
- **`kind`** is `SINGLE` (default) or `PARTNER`; anything else is 400 `SESSION_RANKING_KIND_INVALID`. **Paging is by cursor**: send the previous `nextCursor` (a position in the board, not a page number) because the number of hidden entries on a page is not known in advance; `size` 1 to 50 (default 20). One request looks at most 2,000 entries ahead, so `entries` can be shorter than `size` while `nextCursor` is still set.
- **Who is shown:** a deactivated player on any board, a member who left on a group board, and a pair when either player is not shown, are skipped at read time (the board is unchanged: the next build drops them). `me` is the caller's best entry anywhere on the board (the best pair among those they are in), or null. `rank` is never recomputed at read time, so a hidden entry leaves a gap.
- **A board never built** (no rule, no ranking game yet, or the nightly run has not reached it) is an empty answer (`entries` empty, `rankedAt` null), not an error. **A sport whose statistics switch is off is 404 `SPORT_NOT_FOUND`** (on the boards and on the refresh), as for an unknown sport. A group board stays readable while the **group's** switch is off: what was ranked before stays (the engine and the job skip such a group).
- The boards are read from an in-memory copy of each tree (parsed once, valid while the board's `computed_at` is the stored one; `app.stats.ranking.read-cache-boards`, default 8 boards per instance).
- **Refresh:** one compare-and-set takes the board only when it was built at least the cooldown ago and nobody is building it, so two refreshes, or a refresh and the nightly run, never build it twice. It runs on the request thread (a group board is built from its members' rows), and **keeps the previous ranks of the last nightly build** (so "previous" keeps meaning "before the last nightly run"). Saving or deleting a group's own rule also asks the worker to rebuild that board now.

## 10. Changing a shape

1. Change `PlayerStatsDoc` / `GroupStatsDoc` / `GroupH2hDoc` / `StatsGroupings` / `BoardTree` / `SortList` (the only code that touches these maps and trees) and `StatsDocsSpec` / `GroupH2hDocSpec` (which pin the keys).
2. Change this file in the same change.
3. A change to an existing key is a data migration of every row: say so in the ticket. A new optional key or a new dimension needs none (readers treat a missing key as empty, section 0). A stat added to the catalog and to a sport's columns has no history until the rebuild (SESSION-77).
4. Anything the client reads from these shapes goes through the SESSION-73 read API; the client never reads the tables.

## 11. The `sessions` stat (SESSION-82)

`sessions` is the ninth catalog stat (id 9, kind `SESSIONS`, **single players only**): it counts sessions, not games. It is counted once per session and player by `StatsCounters.addSession`, never by a game, in the player's own totals (`all`), in the group member row (only while the group's switch is on), and, only for a player who had a ranking game in the session, in the ranked counters and the region and country scopes. A pair or team entry never holds it (`StatisticsSchema.collectedForCombos()` leaves it out) and a ranking rule for a `PARTNER` board cannot name it (`STAT_NOT_FOR_KIND`).

What makes a session count for a player is the sport's own config, `record.scoreboard.config.sessions = { "when": ["joined", "atLeast1Game"], "combine": "AND" | "OR" }` (`StatisticsSchema.SessionsRule`): `joined` (a joined participant when the session was counted), `atLeast1Game` (a counted game in it), or both, met together (`AND`) or either (`OR`, the default when two are listed). **The default is `joined` alone.** A counted game needs a joined player, so today `AND` counts the same players as `atLeast1Game` and `OR` the same as `joined`; the form is kept for conditions that are not implied. An unknown entry is dropped and nothing usable is the default. `enabled: false` (default `true`) lists the column but does not collect it: the column is dropped and nothing is counted. The config is read leniently like the rest of the schema, and the client ignores it.

A session with no games still counts its joined players when the rule allows it (`joined`): the engine does not stop at `NO_RECORDS`. The job's `result` gains `sessions` (the players counted for the session itself); a session with only those is `DONE`, and a revived job row whose result already says `sessions` counts them no second time. **No history:** counters stored before this stat have no `sessions`; it counts the sessions processed after the sport lists it, until the SESSION-77 rebuild. A group's own config of it for its member row is SESSION-83.
