# CLIENT-GL-49 · Session Result section: the scoreboard

**Status:** `DONE` (2026-11-17)
**Type:** Feature · **Depends on:** CLIENT-GL-38 ·
**Filed:** 2026-11-13, owner's scope cut during `/workon client` CLIENT-GL-38: that ticket logs records only (the Result section and the record dialog); the per-session scoreboard moves here.

In the Result section of the session detail, above the record list, a scoreboard computed on the client from the session's records: per player the games, wins and losses, and the points from the sport's record schema. Under the badminton record schema the first team of a record is the winner, and the scores (when present) give the points. How a score becomes points (for example net points as the score difference) and any win/loss weighting are decided at pickup from the record schema, which the owner is defining. En/vi copy; the scoreboard reads only valid records (a record that fails the schema is skipped, as on load).

**Out of scope:** Cross-session statistics and head-to-head (CLIENT-SESSION-41), leaderboards (CLIENT-SESSION-42), the server side.

**Tests:** Vitest for the scoreboard math (mutation-checked) and the section; a scoped e2e.


---

## Scope change (2026-11-17, owner, at pickup): the scoreboard is configurable by the sport

The sport's record schema decides what the scoreboard shows, like it already decides the record's shape and look. So the scoreboard is **not** hard-coded: the schema carries a scoreboard block, and the client's UI catalog (`client/src/features/session/recordSchema/record-ui-v1.json`, the one place that lists what the client supports) lists the supported columns, the supported **score methods** (how a record turns into a player's points) and the supported sort keys. The contract (`documentation/md/RECORD_SCHEMA_CONTRACT.md`), the parser (`recordSchema.ts`), the badminton example and its contract test all change with it. Details are settled in Phase 1 below this line.

### Decisions at the Phase 1 gate (2026-11-17, owner)

- **No separate `points` column or method.** Points and the score difference are the same thing, so the catalog has `scoreFor`, `scoreAgainst` and `scoreDiff` as columns, plus **`winDiff`** (wins minus losses) in place of "points". Catalog columns: `games`, `wins`, `losses`, `winRate`, `winDiff`, `scoreFor`, `scoreAgainst`, `scoreDiff`. The `points.method` block of the first proposal is dropped.
- **Column titles have a default and the schema may override them.** The client ships en and vi titles per column id; `scoreboard.titles.<column>` (`{ "en": ..., "vi": ... }`, the same shape as a score slot's `title`) replaces one.
- **The scoreboard is about the whole session.** The "my results" switch does not touch it. The current user's row is highlighted.
- **Every JOINED participant gets a row**, not only players named in a record (a player who left but is named in a valid record keeps theirs). A cell with no data shows "-" (a player with no game, a win rate over no games, a score column when no scored record counts).

### Added during implementation (2026-11-17, owner)

- The scoreboard also shows in the **record dialog** ("Update results").
- An **index column** (`#`: 1, 2, 3 ... in the sorted order) comes before the player column, in the section and in the dialog.

- **Collapsible, below the records (2026-11-17, owner, after the first build):** the scoreboard has a title bar with a chevron that folds it (open by default, its state kept while the Result section opens and closes), and in the Result section it moves **below** the record list. In the record dialog it is collapsible too and stays above the rows.

---

## Implementation summary (2026-11-17)

**Design as approved** ("approved, go implement"), plus the owner's two additions during the build (the record dialog and the index column, listed above), built as designed.

1. **The scoreboard is the sport's configuration.** The UI catalog (`recordSchema/record-ui-v1.json`, `COMPETITIVE.scoreboard`) lists what the client supports: columns `games`, `wins`, `losses`, `winRate`, `winDiff` (wins minus losses), `scoreFor`, `scoreAgainst`, `scoreDiff`; sort keys (the columns and `name`); default columns (`games`, `wins`, `losses`) and default sort (wins, win difference, fewer games, name). A sport's schema picks from it with `record.scoreboard` (`enabled`, `columns`, `titles`, `sort`, `scoreSlot`); `parseRecordSchema` reads it tolerantly (unknown or repeated columns and sort keys dropped, an unusable result falls back to the defaults, no block at all = the default basic scoreboard) into `RecordSchema.scoreboard`. Documented in `documentation/md/RECORD_SCHEMA_CONTRACT.md` (new "Scoreboard" section); the badminton example and the MSW `mockResultSchema` carry the badminton configuration (`enabled`, columns `games`, `wins`, `losses`, `winDiff`; sort `games` DESC, `wins` DESC, `winDiff` ASC, `name` ASC), checked by a contract test against the catalog (an unknown sort key such as `win` would be dropped silently, so the test fails on one); custom titles, the score columns and the score slot are covered by tests with schemas of their own.
2. **The maths** (`scoreboard.ts`, pure): `buildScoreboard` gives one row per JOINED participant plus anyone named in a valid record (a player who left keeps their games as "Former player"); the first team of a record won; score columns add only the counted slots where both teams filled the slot; a value with no data is `null`, drawn as "-" (a player with no game, a win rate over no games, a score column with no scored record), and such rows sort last. `sortScoreboard` orders by the configured keys, a missing value after a present one in either direction, ties by players with data first, then name.
3. **The screen.** `ResultScoreboard`: a real table (`#` index in the order shown, player, the configured columns), column titles from the sport's own (en/vi, then the other language) else the client's default in en and vi; the caller's row is highlighted, marked "(You)" and `aria-current`; cells truncate, so a 320 px screen never scrolls sideways. In the Result section it sits **below** the record list, collapsed and open, under a title bar with a chevron that folds it (open by default; the state is kept while the section opens and closes), covers the whole session (the "my results" switch does not touch it) and is hidden when there is no valid record or the sport sets `enabled: false`. In the record dialog it is collapsible too and sits above the rows, and **follows the rows as they are edited** (every valid row that is not struck through, saved or new), so the effect shows before Save.
4. **Strings (en and vi):** the eight default column titles, "Player", "Rank", "Scoreboard", "You".

**Deviations from the approved plan:** none in design; the dialog and the index column were added by the owner after approval (dialog: live from its rows, index: plain position, both chosen with the owner). One plan line was wrong in the details: the first run failed a real 320 px overflow check (two header words 2 px too wide) which led to the `truncate` cells and a narrower name column.

**Tests.** Vitest (new unless noted): `scoreboard` maths (wins and losses, doubles, scores, no-score games, mixed, slot choice, players with no game, left players, sorting incl. missing values and ties, the default order, the cell text), the parser and the catalog contract (`recordSchema.test.ts`), the section (columns and order, "-" cells, former player, the highlighted row, the my-results switch, collapsed, language, hidden cases; existing assertions scoped to the record card) and the dialog (saved, deleted and undone rows, an edited score, empty, off; the existing table queries scoped to the dialog's own table). Stories: custom columns and titles, a player with no games, the scoreboard off. Mutation check: 37 mutants of the new logic (winner/loser swap, games, score difference sign, scored flag, slot choice, null sorting, sort direction, win difference, win rate, joined rows, left players, plus sign, percentage, no-data cell, default sort, unknown columns, enabled, titles, title language, slot range, the my-results switch, enabled in the section, the highlighted row, sport titles, index base and header, the dialog counting deleted rows, ignoring edits, ignoring enabled; then folded by default, a title bar that does nothing, a table always shown, `aria-expanded`, the section never folding, the board above the list when collapsed and when open, the dialog never folding), all 37 killed.

**E2E.** `e2e` project: `session-results` (the scoreboard absent with no record; below the record list, folding and unfolding from its title bar; after a save the `#`, Player, Games, Won, Lost and Win +/- columns, one highlighted "(You)" row, the winner's row reading `1 1 1 0 +1`, no sideways scroll at 320 px; in the dialog it shows and empties when the only record is struck out), `matches-journey`, `session-errors`, `session-thread-tags`, `locale`: 21 passed, then the changed session-results spec passed again alone. Earlier in the work the full set of post, feed, notification and a11y specs showed only load flakes that passed alone (see CLIENT-GL-51).

**Visual-regression expectation:** baselines `session-results-section-*` and `session-results-dialog-*` at 375, 768 and 1280 change (the scoreboard above the record cards, and above the dialog's rows); every other baseline must come back byte-identical (no other visual spec renders a Result section or the record dialog: `session-detail-*` sessions are SCHEDULED). Recorded in `BASELINE-UPDATE-1`. Visual regression was not run here.

**Not run:** Firefox and Safari, and the real backend (the scoreboard is client-only; its configuration reaches the client through `GET /api/sports/{id}/result-schema`, which the server returns as stored, proven here against the MSW mock only). The block still has to be added to each sport's stored result schema (admin `PUT`, SPORT-18's editor) before the sport shows more than the default basic scoreboard.
