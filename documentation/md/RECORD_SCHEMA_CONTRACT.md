# Record schema contract (v1): how a sport describes one logged result

**Status:** v1, COMPETITIVE records only. **Owner of the shape:** the client (`client/src/features/session/recordSchema.ts`, `recordData.ts`). **Used by:** CLIENT-GL-38 (log records), CLIENT-GL-49 (scoreboard, `record.scoreboard`), SPORT-18 (admin editor).
**Files:** `client/src/features/session/recordSchema/badminton-record-schema-v1.json` (the badminton example) and `record-ui-v1.json` (the UI options the client supports). A Vitest contract test parses the badminton file against the parser and the catalog, so none of the three can drift.

The server stores a sport's result schema (`sports.result_schema`, `GET /api/sports/{id}/result-schema`, admin `PUT`) as sent and reads **only the top-level `maxRecords`** (1 to 500, default 100). Everything else is the client's. A schema the client does not understand (wrong `version`, a record `type` it does not know, a malformed `playersPerSide` or score slot) hides the Result section; it never breaks the session detail.

## Schema

```json
{
  "version": 1,
  "maxRecords": 50,
  "record": {
    "data": {
      "type": "COMPETITIVE",
      "playersPerSide": { "min": 1, "max": 2 },
      "score": { "slot": [ { "required": true, "title": { "vi": "Điểm", "en": "Point" }, "rule": ">0" } ] }
    },
    "UI": { "id": "horizontal", "config": { "winnerAlign": "LEFT" } },
    "scoreboard": {
      "enabled": true,
      "columns": ["games", "wins", "losses", "winDiff"],
      "sort": [
        { "by": "games", "dir": "DESC" },
        { "by": "wins", "dir": "DESC" },
        { "by": "winDiff", "dir": "ASC" },
        { "by": "name", "dir": "ASC" }
      ]
    }
  }
}
```

This is the badminton example (`badminton-record-schema-v1.json`); the `scoreboard` block is explained under "Scoreboard" below. Sort keys are column ids (`wins`, not `win`): an entry with an unknown key or direction is dropped without a warning.

- `version` must be `1`. `maxRecords` is read by the server too (keep it top-level).
- `record.data.type`: `COMPETITIVE` (two teams). `playersPerSide.min` and `.max`: integers, `1 <= min <= max <= 10`. The dialog draws `max` player slots per team up front (no manual add slot); more than 2 slots stack vertically.
- `score.slot` (optional): up to 4 score slots **per team**, drawn top to bottom, always vertically. Each slot has `title` (en/vi), `required`, and `rule`.
- `rule`: comparisons joined with `&`: `>0`, `>=0`, `<=30`, `>=0&<=30` (integers). Anything else is unreadable and means "any integer".
- `UI.id`: `horizontal` or `vertical`. `UI.config` keys (all optional, defaults in `record-ui-v1.json`): `winnerAlign` (`LEFT`/`RIGHT` for horizontal, `TOP`/`BOTTOM` for vertical), `winnerTone`, `loserTone` (semantic tones `success`, `warning`, `danger`, `accent`, mapped to design tokens; **never a hex colour**). An unknown id, align or tone falls back to the default.

## Stored record (`data`)

```json
{ "teams": [ { "players": ["<userId>"], "scores": [21] }, { "players": ["<userId>", "<userId>"], "scores": [18] } ] }
```

The **first team is the winner** (by position). `scores` has one entry per score slot, `null` = not filled. The client sends `playerIds` (every player of both teams) beside `data`; the server checks they are JOINED and stores only `data` (at most 4096 bytes). The record dialog accepts the winning score on either side; on Save the client puts the team with the higher score in the **first score slot** first (its players and scores move together; a tie or a missing first score keeps the order as typed), so a stored record always has the winner first. The list draws the first team on the `winnerAlign` side.

## Validation (client; red border while typing and on Save)

- A team has fewer players than `playersPerSide.min`.
- The same player is on both teams (both teams are marked).
- Scores are optional as a whole, but must be complete: for each slot both teams fill it or neither does; a filled score satisfies the slot's `rule`; a team with any score filled fills all its `required` slots.
- A stored record that fails these is skipped when the list loads (and never counts).
- Not checked: that the player is JOINED (the server does, `SESSION_RECORD_PLAYER_NOT_JOINED`), and score ordering.

## Scoreboard (client; CLIENT-GL-49)

The session detail's Result section shows a scoreboard of the whole session above the record list. Like everything else here it is the sport's choice, written in `record.scoreboard` (next to `record.data` and `record.UI`) from what the client's catalog (`record-ui-v1.json`, `COMPETITIVE.scoreboard`) supports. Every key is optional, but **`columns` is also what the server collects (SESSION-53 rework, owner 2026-11-25): a schema with no usable `columns` shows no scoreboard and collects no statistics, there is no default.** (The client's own fallback to `games`, `wins`, `losses` is removed by CLIENT-SESSION-59; until then it still draws it.)

```json
"scoreboard": {
  "enabled": true,
  "columns": ["games", "wins", "losses", "winDiff", "scoreDiff"],
  "titles": { "scoreDiff": { "en": "Points +/-", "vi": "Hiệu số điểm" } },
  "sort": [ { "by": "wins", "dir": "DESC" }, { "by": "scoreDiff", "dir": "DESC" }, { "by": "name", "dir": "ASC" } ],
  "scoreSlot": 0,
  "groupBy": [ { "by": "PARTNER" } ]
}
```

- `enabled`: `false` hides the scoreboard for the sport (default `true`).
- `columns`: the columns after the player's name, in the order drawn. Supported: `games`, `wins`, `losses`, `winRate` (wins over games, shown as a percentage), `winDiff` (wins minus losses), `scoreFor`, `scoreAgainst`, `scoreDiff` (score for minus against). Unknown and repeated entries are dropped; none left means **no scoreboard** (no default). The server collects exactly these stats, from the same catalog.
- `titles`: a column's title per language, replacing the client's default (en and vi ship for every column). Without it, or without that language, the other language and then the default are used.
- `sort`: row order, first key first. Keys: any column above or `name`; `dir` is `ASC` or `DESC`. A player with no value for a key sorts after the others, whichever the direction. Default: `wins` DESC, `winDiff` DESC, `games` ASC, `name` ASC.
- `scoreSlot`: the score slot (0 = the first) the score columns count; without it every slot is summed. A number that is not a slot of the sport counts every slot.
- `groupBy`: read by the server only (the client ignores it): the one grouping of the statistics, see "What the server collects" below.

**What is counted.** One row per JOINED participant, plus anyone named in a valid record (a player who left keeps their games and reads "Former player"). The first team of a record won and the second lost; every player of a team gets the game. Score columns add the counted slots only where both teams filled the slot, so a game logged without scores adds to games, wins and losses and not to the score columns. The table starts with a `#` index column numbering the rows in the order shown. A cell with no data shows "-": a player with no game (every column), a win rate over no games, a score column with no scored record. The scoreboard is the whole session: the "my results" switch does not change it, and the caller's own row is highlighted. It is drawn above the record list in the Result section and above the rows in the record dialog, where it follows the rows as they are edited (every valid row that is not struck through).

## Where it is edited

Admin: the "Record schema" section of the sport detail at `/admin/sports/:sportId` (SPORT-18), the same generic JSON editor as the profile and session attributes. The server validates only `maxRecords` and the 16 KB size; the editor shows a non-blocking note when `parseRecordSchema` cannot read the typed document (the Results section would stay hidden).

## The server reads part of the schema (SESSION-53, built 2026-11-23)

The statistics engine (`modules/session/docs/STATISTIC_RANKING_DESIGN.md`, revised by `STATISTICS_CONFIG_PAIRS_AND_H2H_DESIGN_DRAFT.md`) makes the server read `record.data` (`type`, `playersPerSide`, `score.slot` with its `required` and `rule`, and `record.ranking.scoreSlot`) when it counts a session after its 24-hour guard, and, since the rework of 2026-11-25, the sport's `record.scoreboard` (`columns`, `groupBy`), `record.ranking` and `record.data.allowDraws`, so the same engine serves every sport. One **reader** per record type turns a record into neutral facts (valid, rankable, the teams, one participant per player with the outcome and the numbers); `COMPETITIVE` is the only reader. A record that fails the reader is ignored by the statistics with a reason and is **never rejected at write time**. The server reads the schema **leniently**: an entry it cannot use is dropped, never an error, so editing the schema can never stop a session being counted. The server still validates only `maxRecords` and the 16 KB size when the schema is saved.

**COMPETITIVE, what the reader does.** Valid: exactly two teams; each with between `playersPerSide.min` and `.max` players (defaults 1 and 10); every player a UUID, none twice; the scores consistent (at most one entry per slot, each empty or a whole number; a slot filled by both teams or by neither; a filled score satisfies the slot's `rule`; a team with any score fills every `required` slot). A game with no score at all is valid and *planned*. The first team is the winner by position, so a game is **counted** only when the ranking slot (`record.ranking.scoreSlot`, default the first) is filled by both teams with the first strictly ahead; a game with no score, or one the first team does not win (no draws yet, SESSION-59), is ignored with the reason `NO_SCORE` or `FIRST_TEAM_NOT_AHEAD`; a sport with no score slot is ignored with `RANKING_NOT_AVAILABLE`. The reader gives each player the two numbers `scoreFor` (their team's sum over every slot both teams filled) and `scoreAgainst`. The ignore reasons are stable upper-case tokens: `TEAMS`, `PLAYERS_PER_SIDE`, `PLAYER_ID`, `DUPLICATE_PLAYER`, `SCORE_SHAPE`, `SCORE_INCOMPLETE`, `SCORE_RULE`, `NO_SCORE`, `FIRST_TEAM_NOT_AHEAD`, `RANKING_NOT_AVAILABLE`, and from the engine `PLAYER_NOT_JOINED` (a named player is no longer `JOINED` in the session) and `ALREADY_COUNTED`.

**What the server collects: `record.scoreboard`, `record.ranking`, `record.data.allowDraws` (SESSION-53 rework, owner 2026-11-25).** **One config, shared with the client.** The sport lists the statistics it shows in `record.scoreboard.columns`, chosen from the catalog of its record type, and the server collects exactly what those columns need:

```json
"scoreboard": {
  "columns": [ "games", "wins", "scoreFor", "scoreAgainst" ],
  "groupBy": [ { "by": "PARTNER" } ]
},
"ranking": {
  "sort": [ { "by": "wins", "dir": "DESC" }, { "by": "games", "dir": "ASC" } ],
  "minGames": { "single": 0, "combo": 5 }
}
```

The shape the engine stores these counters in, and everything else it writes as jsonb, is in `documentation/md/STATISTICS_JSONB_REFERENCE.md`.

- **The catalog** (`StatsCatalog`; for `COMPETITIVE`): `games`, `wins`, `losses` are counted (every game, the games won, the games lost), `scoreFor` and `scoreAgainst` are sums of the numbers the reader gives each player, and `winRate` (`wins/games`), `winDiff` (`wins-losses`) and `scoreDiff` (`scoreFor-scoreAgainst`) are formulas that are **never stored**: a formula column makes the server store its operands (`winRate` stores `games` and `wins`, which are not shown unless listed). The list is the client's `COMPETITIVE.scoreboard.columns` in `record-ui-v1.json`, in the same order: the server's `StatsCatalogSpec` reads that file and fails when the two differ, so adding a stat is a change to both. A record type with no catalog (an unknown type, or a metric type before SESSION-58) supports nothing. Unknown and repeated entries are dropped.
- **No defaults at all.** A schema with no `record.scoreboard.columns`, or none the catalog knows, collects **nothing**: the session is `SKIPPED` with the note `STATISTICS_NOT_CONFIGURED`. There are no fixed counters, no custom metrics and no `record.statistics` block (the first build's block is not read any more: a sport that only has it collects nothing), so a sport such as running or swimming, which has no wins, is not forced into them. A column added to a sport later has no history until a rebuild (SESSION-77).
- **The sport's switch.** Statistics and ranking are on only for a sport whose `statisticsEnabled` is true (`sports.statistics_enabled`, off by default, set by an admin with `PUT /api/sports/{sportId}`; SPORT-19 is the client screen). The runner picks only sessions of enabled sports, so a disabled sport gets no job row and switching it on counts its finished sessions in the usual passes; ranking games cannot be proposed or confirmed for a disabled sport (409 `SESSION_RECORD_RANKING_NOT_AVAILABLE`). Logging results needs only the result schema, not the switch.
- **`ranking.sort`** has at most three keys, each a key of the catalog (the ranking job stores three sort values per board entry, SESSION-54; the player's name is only the final tiebreak and is not stored). A key beyond the third, an unknown key, an unknown direction (`ASC` or `DESC`) and a repeated key are dropped. A key of the sort also makes the server collect what it needs, so the ranking can order by a stat that is not shown, but only for a sport that lists columns. **There is no default sort**: a sport that names none has no ranking order. `minGames` (per board kind, `single` and `combo`; defaults 0 and 5) is applied by the ranking job: an entry below it shows in statistics but has no rank. `scoreSlot` is the zero-based score slot that decides the winner (default 0).
- **`groupBy`** (inside `scoreboard`) names the **one** dimension that gets counters of its own beside the totals (`all` games and `ranked` games each). It is a list, and the **first usable entry** is kept, so a sport is grouped one way or not at all (a repeat of the same two-player team would be the same numbers twice): `{ "by": "PARTNER" }` is one set of counters per teammate (player A's games and wins *with* B; badminton; a team with more than 100 other members gets none), and `{ "by": "TEAM", "size": 5 }` (`size` 2 or more) is one set per group of that many players of one team that includes the player (football; a team with more than 100 such groups gets none). **Missing means no grouping at all.** The grouping is the sport's current one: a read (SESSION-73) shows only that dimension, though a row may still hold another from before a schema edit.
- **The group head-to-head.** In a **group session** of a sport grouped by `PARTNER`, a game of two teams of exactly two players also counts in the group's head-to-head (`group_stats.h2h`, one document per group and sport: a member dictionary and, per matchup of two pairs, the wins of each and the game number, the latest 5,000 matchups kept). A sport with a `TEAM` grouping, or none, builds none; a game outside a group has none.
- **Draws.** `record.data.allowDraws` (boolean, default `false`) says the sport's games can end in a draw; the head-to-head then keeps a draws number. The `COMPETITIVE` reader still refuses a game the first team did not win, so no game is a draw end to end until SESSION-59 makes the reader give `DRAW`.
- **The engine writes nothing to `leaderboard_entry`.** It marks the boards a game touched dirty (`stat_board_runs`); SESSION-54's job builds and ranks every board (group, region, country; singles and pairs) from the blobs.

**The shared fixture** is `modules/session/session-impl/src/test/resources/record-reader/competitive-v1-cases.json`: two real schemas (badminton, and a football-like one with up to 11 a side) and 21 cases, each with the expected `valid`, `rankable`, reason and players. The server's `CompetitiveRecordReaderFixtureSpec` runs every case; the client's Vitest will run the same file (client ticket CLIENT-SESSION-58, not built yet), so until then the two readers are held together only by review. A case changed there is a decision for both sides.
