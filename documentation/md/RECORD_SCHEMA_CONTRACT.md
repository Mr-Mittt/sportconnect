# Record schema contract (v1): how a sport describes one logged result

**Status:** v1, COMPETITIVE records only. **Owner of the shape:** the client (`client/src/features/session/recordSchema.ts`, `recordData.ts`). **Used by:** CLIENT-GL-38 (log records), CLIENT-GL-49 (scoreboard), SPORT-18 (admin editor).
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
    "UI": { "id": "horizontal", "config": { "winnerAlign": "LEFT" } }
  }
}
```

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

## Where it is edited

Admin: the "Record schema" section of the sport detail at `/admin/sports/:sportId` (SPORT-18), the same generic JSON editor as the profile and session attributes. The server validates only `maxRecords` and the 16 KB size; the editor shows a non-blocking note when `parseRecordSchema` cannot read the typed document (the Results section would stay hidden).
