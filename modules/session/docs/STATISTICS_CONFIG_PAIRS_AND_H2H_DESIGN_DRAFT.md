# Statistics: one config, a sport flag, and the group head-to-head (decided 2026-11-25; the pair-table options below were rejected)

**Status:** **DECIDED 2026-11-25 (owner), built by the SESSION-53 rework.** Sections 1 to 3 stand. **Sections 4 to 6 below were the options considered: option A (pair and head-to-head as rows) and option B were both REJECTED**, see "What was decided" right after this paragraph. The measurements in section 4 are kept as the evidence (the row sizes and timings are real, on synthetic rows in a throwaway PostgreSQL 16). It revises `STATISTIC_RANKING_DESIGN.md` sections 3 and 4. Decisions taken by the owner are marked **(owner)**.

## What was decided (2026-11-25, the SESSION-53 rework)

1. **One config shared with the client, no defaults (owner):** `record.scoreboard.columns`, from a catalog per record type (`StatsCatalog`, the same list as the client's `record-ui-v1.json`, guarded by `StatsCatalogSpec`, which reads the client's file). A sport that lists none collects nothing. No fixed counters, no custom metrics, no `record.statistics`. A key of `record.ranking.sort` also collects its inputs (only for a sport that lists columns); there is **no default sort**.
2. **A sport switch (owner):** `sports.statistics_enabled`, off by default, for statistics and ranking together. The runner picks only enabled sports (a disabled sport gets no job row; switching it on makes its sessions due), the processor checks again (it deletes the claim of a sport switched off meanwhile), and the ranking proposal and `verify` refuse a disabled sport (409 `SESSION_RECORD_RANKING_NOT_AVAILABLE`). Logging results keeps its one switch, the result schema. No flag existed before: logging was implicit (a result schema on an active sport).
3. **Pair statistics stay in the member blobs (owner), the duplication accepted:** pair statistics are personal data, so `user_sport_stats.groupings` keeps `{PARTNER: {partner: {all, ranked}}}` (A's row has B and B's row has A) and `group_member_stats.stats` keeps plain counters and groupings (**no ranked split**). **Option A's tables (`stat_pairs`, `pair_stats`, `h2h` as rows) were rejected**: fixed counter columns do not fit a stats list the sport defines, and a pair table only fits sports of two-player sides. `groupBy` moves to `record.scoreboard.groupBy`, in the form the engine already read (a list of `{by, size}`, the first usable entry kept, one grouping per sport; missing means none).
4. **The group head-to-head is one jsonb document per group and sport (owner), in a new table `group_stats`:** a member dictionary and a map `"1.2-3.4": [wins of the first pair, wins of the second, seq]`, **rule A** for the key (the smaller pair first, one tested helper, `GroupH2hDoc.matchupKey`), global to the group and sport (no per-group, region or country split of it), the **latest 5,000 matchups kept** (the least recently played dropped, by the entry's `seq`), a draws number only for a sport with `record.data.allowDraws`. Built only for a group session of a `PARTNER` sport and games of exactly two pairs. The key is made of member numbers inside the document, so no pair table is needed. Measured: about 11 to 14 bytes a matchup, about 80 MB for the worst population (50,000 members at 500 games each, nothing repeating); a game rewrites the whole value, 4 ms and 42 to 59 KB of log at 3,750 entries, 28 ms and 360 KB at 25,000, which is why it is capped.
5. **Draws:** `record.data.allowDraws` (boolean, default false); the head-to-head code and its unit tests exist, but the `COMPETITIVE` reader still refuses a game the first team did not win, so a draw is not reachable end to end until SESSION-59.
6. **The engine does not write `leaderboard_entry` (owner):** the table stays as `V104` made it; SESSION-54's job builds and ranks every board (group, region, country; singles and pairs) from the blobs, and only needs the dirty flags the engine still sets in `stat_board_runs`. How that job finds "every player with an entry in this region" (a jsonb array has no index) is SESSION-54's question.
7. **Sequencing (owner):** SESSION-53 is redone (unmerged), SESSION-73 is rebased on it, then SESSION-54. Client follow-ups filed: SPORT-19 (the admin switch), CLIENT-SESSION-59 (no default scoreboard columns), a note on CLIENT-SESSION-54 (hide the propose action for a sport with the switch off). No client catalog test is needed: the server test reads the client's file.

**Open after this decision:** the pair board for a `PARTNER` sport (badminton) is SESSION-54's to build from the blobs (the engine writes no `COMBO` rows for it); the singles boards stay as they are; whether a group wants a ranked split in its member statistics is answered no.


## 1. What the owner decided

1. **(owner) One config, shared by the client and the server: `record.scoreboard.columns`.** The server collects exactly the stats the sport lists there. **No defaults at all**: a missing block or an empty `columns` means nothing is collected or calculated. No fixed core counters (`games`, `wins`, `losses`, `draws`), no custom `metrics` list, no `record.statistics` block. Reason: sports like running and swimming have no wins or losses.
2. **(owner) The supported stats are a catalog per record type**, the way the client already has it (`record-ui-v1.json`: `COMPETITIVE.scoreboard.columns`). A metric type (running, swimming) will have its own list. The catalog is one shared file for client and server, guarded by a contract test (like the shared reader fixture), so the two cannot drift.
3. **(owner) A flag on the sport**, a new column on `sports`, switches the statistics and ranking feature on and off. The ranking-game proposal and the runner jobs must check it.
4. **(owner) No per-member groupings.** The mirrored copies (A with B in A's row and B with A in B's row) go. Pairs get their own table and a pair ranking board; head-to-head between two pairs `(AB;XY)` is a second table updated only for the pairs that played.
5. **(owner) Sequencing:** redo SESSION-53 (still unmerged, review gate 1 open), then rebase SESSION-73 on it.

## 2. The sport flag, and what exists today

There is **no explicit flag** today. Three implicit switches:

| Feature | Switched on by | What happens when off |
|---|---|---|
| Results logging | `sports.result_schema` present and the sport active | `SESSION_RECORD_NOT_LOGGABLE` (409) |
| Ranking games | the schema's record type has a reader and a score slot | `SESSION_RECORD_RANKING_NOT_AVAILABLE` (409) |
| Statistics engine | a result schema exists | the session is `SKIPPED` |

**Proposal:** one new column, `sports.statistics_enabled BOOLEAN NOT NULL DEFAULT FALSE`, covering statistics **and** ranking. Logging keeps its single switch (the schema), so there is one source of truth for it.

Where it is checked:
- **Ranking proposal** (`requestRanking`, and `verify`): off gives `SESSION_RECORD_RANKING_NOT_AVAILABLE`.
- **Runner:** the picking query takes only the sports with the flag on (sport-api returns the enabled ids, cached), so a session of a disabled sport gets **no job row**. Turning the flag on later makes the old sessions due naturally, which counts the back catalog in the usual bounded passes. The processor checks the flag again (a sport can be switched off while a pass runs).
- **Read APIs:** off gives the same 404 as an unknown sport.
- **Admin sport editor:** one more switch next to the record schema.

## 3. The stats list (part 1)

- The catalog entry says how a stat is computed. Example for `COMPETITIVE`: `games`, `wins`, `losses` are counted, `scoreFor` and `scoreAgainst` are sums, and `winRate`, `winDiff`, `scoreDiff` are formulas over those.
- The server **collects what the configured columns need**: `winRate` needs games and wins, so those are kept even if not listed (they are not shown unless listed).
- **A column added later has no history** until a rebuild (SESSION-77); a column removed leaves harmless stale numbers.
- `record.ranking.sort` keeps its place for the ranking order (at most three keys); the scoreboard's own `sort` stays the client's.
- `scoreboard.enabled` keeps meaning only "hide the in-session table" (client).

## 4. Pairs and head-to-head: the two options

A doubles game of two pairs, `AB` beating `XY`, in a group session. Dimension table first (both options): one row per pair of players ever seen, `player_a < player_b`.

```
stat_pairs(id, sport_id, player_a, player_b)       -- id 71 = (A,B), id 72 = (X,Y)
```

### Option A: a pair table and a matchup table (recommended)

```
pair_stats(sport_id, scope_type, scope_id, pair_id, ranking, games, wins, losses, draws, score_for, score_against, rank)
h2h(sport_id, pair1_id, pair2_id, games, wins_1, wins_2, score_1, score_2, ranking_games)      -- pair1_id < pair2_id
```

- `scope_type` is `ALL` (the pair anywhere), `GROUP`, `REGION` or `COUNTRY`. `ranking = true` rows hold ranking games; **all games = the normal row + the ranking row** (disjoint, so a game writes one row per scope, not two).
- The pair board is `pair_stats` itself: ranked in place (`rank` column), so there is **no separate leaderboard row per pair** (today's `COMBO` entries go).

Example after the game (a normal game, in group 1234):

| table | key | row after |
|---|---|---|
| `pair_stats` | ALL, 0, pair 71, ranking false | games 21, wins 13, losses 8, score_for 421 ... |
| `pair_stats` | GROUP, 1234, pair 71, ranking false | games 9, wins 6, losses 3 ... |
| `pair_stats` | ALL, 0, pair 72, ranking false | games 15, wins 5, losses 10 ... |
| `pair_stats` | GROUP, 1234, pair 72, ranking false | games 4, wins 1, losses 3 ... |
| `h2h` | pair 71 vs pair 72 | games 3, wins_1 2, wins_2 1 |

A **ranking** game adds `REGION` and `COUNTRY` rows per pair (and the ranking flag set): 4 more rows. Players' own totals stay in `user_sport_stats` / `group_member_stats`, now small (counters only, no groupings).

### Option B: the pair table only

Same `pair_stats`, no `h2h`. Head-to-head is computed on request from the player's history (the latest 500 pointers, resolving each record), as SESSION-76 first planned.

### Queries

| Need | Option A | Option B |
|---|---|---|
| A pair's wins and games | one primary-key row | same |
| My partners and their results | `stat_pairs` where I am `player_a` or `player_b` (two index scans), joined to the ALL rows | same |
| Pair board of a group, region, country | `pair_stats` of that scope ordered by the sport's key; a country is ranked nightly by one window statement | same |
| Head-to-head of `(AB;XY)` | one row of `h2h` by key | read the history, find games with both pairs; limited to the latest 500 per player |
| Every opponent pair of `AB` | `h2h` where `pair1_id` or `pair2_id` is `AB` (two index scans) | same scan of the history |

### Measured on a throwaway PostgreSQL 16 (synthetic rows, 2026-11-24; sizes include every index)

230,000 pairs, 736,000 `pair_stats` rows (ALL, GROUP, and for 40% of pairs also ranking ALL, REGION, COUNTRY rows), 230,000 `h2h` rows.

| Table | Rows | Size | Bytes per row |
|---|---|---|---|
| `stat_pairs` (dimension) | 230 k | 56 MB | 254 |
| `pair_stats`, surrogate `pair_id` | 736 k | 137 MB | 195 |
| `pair_stats`, the two player UUIDs instead | 736 k | 237 MB | 338 |
| `h2h`, surrogate ids | 230 k | 41 MB | 187 |
| `h2h`, four player UUIDs instead | 230 k | 84 MB | 383 |
| **Option A, surrogate** (dimension + both tables) | | **234 MB** | |
| **Option A, UUID keys** (no dimension table) | | **321 MB** | |
| **Option B, surrogate** (dimension + `pair_stats`) | | **193 MB** | |

| Operation | Measured |
|---|---|
| One doubles game written (5 upserts: 4 `pair_stats` + 1 `h2h`) | 0.12 ms |
| My partners (every pair I am in) | 0.16 ms, index scans |
| A group's pair board, top 20 | 0.28 ms, index scan (46 pairs in the group) |
| Every opponent pair of one pair | 0.08 ms, two index scans |
| Nightly rank of a country board of 92,000 pairs (one statement, only changed ranks written) | 0.63 s |

**Not measured, said plainly:** the head-to-head point lookup by its two ids (my test query picked its keys with a sort, so its 65 ms is the test, not the lookup, which is a one-row index scan); Option B's history read; real data (the rows are uniform synthetic ones).

### What a game costs now, for comparison

Today (per-member blobs): a doubles game rewrites four player rows and four group-member rows, each a whole jsonb document (4 KB to over 100 KB with partners), so roughly 100 KB or more of rewritten data per game. Option A: five small rows (about 200 bytes each) plus the four player rows, which no longer carry groupings (counters only). The size on disk of the all-games pair view is similar to the blobs (about 270 bytes per pair either way); the gains are the **write volume**, **no mirrored copies**, **indexed queries and paging instead of a 100 to 200 KB blob and a 100-entry cap**, and the **board being the table itself**.

### Recommendation

**Option A with the surrogate `pair_id`.** Against B: +41 MB (about 21%) and one more row per game buys an exact, instant head-to-head, not limited to 500 games and not read from record JSON. Against the UUID-key variant: 27% smaller overall (234 against 321 MB), and a head-to-head row is one small key.

## 5. Open points

1. **Which sports get pairs.** Pairs fit `playersPerSide.max <= 2` (doubles and singles). A 5-a-side team has many lineups, so team and matchup rows would each hold one or two games. Proposal: a sport opts in with one key in `record.scoreboard` (for example `"pairs": true`, valid only when a side holds at most two players); football simply leaves it off. Singles: a one-player "pair" (the head-to-head of two players) uses the same tables with a single-player key; to decide whether to include it now.
2. **Individual head-to-head inside doubles** (A against X, whoever the partners): not stored in this draft; it would add four rows per game. Say if it is wanted.
3. **Scopes for `h2h`:** the draft keeps it all-scope only (no group, region or country split). Say if a group's head-to-head is wanted.
4. **The singles boards** (`leaderboard_entry` `SINGLE`) are the same kind of duplicate of `user_sport_stats`; out of scope here, a later simplification.
5. **Catalog sharing:** the file lives where? Proposal: the client's `record-ui-v1.json` stays the source and the server keeps a tested copy, as for the reader fixture (client ticket needed).
6. **Client default:** the client shows `games, wins, losses` when `columns` is missing; "no defaults" means that changes too (a client ticket).

## 6. What changes in the tickets if this is accepted

- **SESSION-53:** `V104` reworked (add `stat_pairs`, `pair_stats`, `h2h`; drop `groupings` and the `COMBO` leaderboard rows; `sports.statistics_enabled`); the engine reads `record.scoreboard.columns` and the catalog; the flag is checked by the runner; `record.statistics` and its parser go.
- **SESSION-72:** the proposal checks the flag.
- **SESSION-73:** the partner and pair lists read `stat_pairs` + `pair_stats` with paging (the 100 cap and the totals go); the member detail and the group list follow.
- **SESSION-54:** the pair board is `pair_stats`; the nightly statement above.
- **SESSION-76:** head-to-head is the `h2h` table (the history read is no longer needed).
- **Client:** CLIENT-SESSION-41/42 contract notes, the catalog contract test, and the missing-block default.
