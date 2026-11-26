# CLIENT-SESSION-61 · The `sessions` stat in the catalog (label, single-only flag)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-82 (session backlog), CLIENT-SESSION-41
**Filed:** 2026-11-26 with SESSION-82. The client mirrors the stats catalog in `record-ui-v1.json` (`statIds`); the server test `StatsCatalogSpec` fails when the two differ, so this ships in the same change as SESSION-82.

Add `sessions` to the client's catalog mirror with its global id (the next after the current eight, the same number the server uses), the **single-only flag** (the pair and partner statistics tables and the leaderboard's pair board must not offer the column), and its en/vi label ("Sessions played" / "Số buổi đã chơi"). Any stats or board table that lists a sport's columns shows it for singles and hides it for pairs. An I18N-4 row is not needed (no new error shown). A rule error with the new reason `STAT_NOT_FOR_KIND` is admin or group-settings only; if CLIENT-SESSION-42's group-rule editor is built, it needs the en/vi text for it.

**Out of scope:** seasons (SESSION-55).

**Tests:** Vitest for the catalog mirror and the pair table hiding the column.
