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

The session detail's Result section shows a scoreboard of the whole session above the record list. Like everything else here it is the sport's choice, written in `record.scoreboard` (next to `record.data` and `record.UI`) from what the client's catalog (`record-ui-v1.json`, `COMPETITIVE.scoreboard`) supports. Every key is optional; a schema without the block gets the default basic scoreboard.

```json
"scoreboard": {
  "enabled": true,
  "columns": ["games", "wins", "losses", "winDiff", "scoreDiff"],
  "titles": { "scoreDiff": { "en": "Points +/-", "vi": "Hiệu số điểm" } },
  "sort": [ { "by": "wins", "dir": "DESC" }, { "by": "scoreDiff", "dir": "DESC" }, { "by": "name", "dir": "ASC" } ],
  "scoreSlot": 0
}
```

- `enabled`: `false` hides the scoreboard for the sport (default `true`).
- `columns`: the columns after the player's name, in the order drawn. Supported: `games`, `wins`, `losses`, `winRate` (wins over games, shown as a percentage), `winDiff` (wins minus losses), `scoreFor`, `scoreAgainst`, `scoreDiff` (score for minus against). Unknown and repeated entries are dropped; none left means the default `games`, `wins`, `losses`.
- `titles`: a column's title per language, replacing the client's default (en and vi ship for every column). Without it, or without that language, the other language and then the default are used.
- `sort`: row order, first key first. Keys: any column above or `name`; `dir` is `ASC` or `DESC`. A player with no value for a key sorts after the others, whichever the direction. Default: `wins` DESC, `winDiff` DESC, `games` ASC, `name` ASC.
- `scoreSlot`: the score slot (0 = the first) the score columns count; without it every slot is summed. A number that is not a slot of the sport counts every slot.

**What is counted.** One row per JOINED participant, plus anyone named in a valid record (a player who left keeps their games and reads "Former player"). The first team of a record won and the second lost; every player of a team gets the game. Score columns add the counted slots only where both teams filled the slot, so a game logged without scores adds to games, wins and losses and not to the score columns. The table starts with a `#` index column numbering the rows in the order shown. A cell with no data shows "-": a player with no game (every column), a win rate over no games, a score column with no scored record. The scoreboard is the whole session: the "my results" switch does not change it, and the caller's own row is highlighted. It is drawn above the record list in the Result section and above the rows in the record dialog, where it follows the rows as they are edited (every valid row that is not struck through).

## Where it is edited

Admin: the "Record schema" section of the sport detail at `/admin/sports/:sportId` (SPORT-18), the same generic JSON editor as the profile and session attributes. The server validates only `maxRecords` and the 16 KB size; the editor shows a non-blocking note when `parseRecordSchema` cannot read the typed document (the Results section would stay hidden).

## Planned (2026-11-23, SESSION-53): the server now reads part of the schema

The statistics engine (`modules/session/docs/STATISTIC_RANKING_DESIGN.md`) makes the server read `record.data` (type, `playersPerSide`, `score.slot`) when it counts a session after its 24-hour guard, and two new optional blocks, `record.statistics` (metrics with SUM, MAX or MIN, derived formulas, combo size) and `record.ranking` (sort keys, minimum games), so the same engine serves every sport; one reader per record type (`COMPETITIVE` first). A record that fails the reader is ignored by the statistics with a reason and is never rejected at write time. A shared fixture of valid and invalid records is run by the client's Vitest and the server's Spock so the two readers cannot drift. This section is filled in with the final contract when SESSION-53 is built.

`record.ranking.sort` has **at most three keys** (each a core counter, a metric or a derived key): the ranking projection stores three sort values per board entry (SESSION-54), and the player's name is only the final tiebreak when listing and is not stored. More than three keys are refused or dropped when the schema is saved.
