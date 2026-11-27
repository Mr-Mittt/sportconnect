# CLIENT-SESSION-61 · The `sessions` stat in the catalog (label, single-only flag)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-82 (session backlog), CLIENT-SESSION-41
**Filed:** 2026-11-26 with SESSION-82. The client mirrors the stats catalog in `record-ui-v1.json` (`statIds`); the server test `StatsCatalogSpec` fails when the two differ, so this ships in the same change as SESSION-82.

Add `sessions` to the client's catalog mirror with its global id (the next after the current eight, the same number the server uses), the **single-only flag** (the pair and partner statistics tables and the leaderboard's pair board must not offer the column), and its en/vi label ("Sessions played" / "Số buổi đã chơi"). Any stats or board table that lists a sport's columns shows it for singles and hides it for pairs. An I18N-4 row is not needed (no new error shown). A rule error with the new reason `STAT_NOT_FOR_KIND` is admin or group-settings only; if CLIENT-SESSION-42's group-rule editor is built, it needs the en/vi text for it.

**Out of scope:** seasons (SESSION-55).

**Tests:** Vitest for the catalog mirror and the pair table hiding the column.

## Scope change 2026-11-26 (owner, at the pickup of SESSION-82)

The `sessions` stat carries a config in the sport's schema: what counts a session for a player, `joined` (default), `atLeast1Game`, or both with AND or OR. The client mirror and any schema editor or schema validation on the client must accept that config; the exact shape is fixed by SESSION-82's design and written here when it is.

Also (found in the exploration of SESSION-82, 2026-11-26): the client's result dialog scoreboard builds its columns from the same `record.scoreboard.columns` list and shows one session's games, where a `sessions` column has no meaning. Keep `sessions` (and any single-only, history-only stat) out of that scoreboard, and add the `errors:codes` entry (en and vi) for the new reason `STAT_NOT_FOR_KIND` of `SESSION_RANKING_SORT_INVALID` / `SESSION_RANKING_REQUIRE_INVALID`.

## Delta 2026-11-27 (SESSION-82 built)

The catalog mirror shipped with SESSION-82 because the server's `StatsCatalogSpec` reads `record-ui-v1.json`: `sessions` is in `COMPETITIVE.scoreboard.columns` and `statIds` (9), a new `scoreboard.historyOnly` list marks it, and `recordSchema.ts` drops history-only keys from a session's scoreboard columns (Vitest case in `recordSchema.test.ts`). **Still to do here:** the en/vi labels ("Sessions played" / "Số buổi đã chơi") wherever the statistics screens name a stat, the `sessions` config in any client schema editor, and the `STAT_NOT_FOR_KIND` reason copy if a screen ever shows rule errors (admin API only today).
