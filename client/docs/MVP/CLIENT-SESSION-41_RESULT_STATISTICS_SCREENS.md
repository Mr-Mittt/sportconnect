# CLIENT-SESSION-41 · Statistics screens: my statistics and my games

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-73 (and review gate 1)
**Filed:** 2026-11-12 as "player totals and head-to-head"; **rewritten 2026-11-23** by the `/feature` session "statistic and ranking" (`modules/session/docs/STATISTIC_RANKING_DESIGN.md`). The earlier group-only note and the scope picker (all-time, season, session) are superseded; head-to-head moved to CLIENT-SESSION-56.

The signed-in player's statistics for a sport: all games and ranking games side by side (normal derived), their pairs, the columns the sport's schema names, the "as of" time, and their games history newest first (paged), each with its ranking badge. Where it lives (a profile section or its own page) is decided at pickup with the owner. The group's member statistics screen shares the table component and arrives in CLIENT-SESSION-42. Statistics appear up to 24 hours after a session ends, so the screen says so when a recent session is missing. en/vi.

**Out of scope:** other players' statistics (SESSION-74, CLIENT-SESSION-55), head-to-head, seasons.

**Contract built by SESSION-73 (2026-11-24; the exact shapes are section 9 of `documentation/md/STATISTICS_JSONB_REFERENCE.md`).** `GET /api/stats/me?sportId=` and `GET /api/stats/me/games?sportId=&cursor=&size=`. What the screen must do with them:
- **Columns come from the response** (`columns`, in order: the sport's `record.scoreboard.columns`, a plain list of catalog keys, empty while the sport's statistics switch is off); every `values` map is keyed by those keys and a value can be `null` (show a dash). The **label of a column is the client's**, keyed by `key` in en and vi (`games`, `wins`, `losses`, `winRate`, `winDiff`, `scoreFor`, `scoreAgainst`, `scoreDiff`: the catalog, the same list as `record-ui-v1.json`; there are no custom metrics, so a key you have no label for is not expected). A player with no counted game has `null` values (show a dash), not zeros. The scope `REGION` / `COUNTRY` and the game `outcome` (`WIN`, `LOSS`, `DRAW`) are mirrored values that need en/vi labels (I18N-5).
- **Totals are three maps**: `all`, `ranked` and `normal` (all minus ranked; derived columns are computed on the difference). A `MAX`/`MIN` metric is `null` in `normal`.
- **A sport has one grouping**, so a response has either `partners` (badminton: one teammate each) or `pairs` (football: a team's players, the asking player included), never both, and neither for a sport with no `groupBy`. Each is **one page, most played first** (`page` from 0 and `size` 1 to 50, default 20, on `GET /api/stats/me`); **`pairsTotal` / `partnersTotal` say how many exist**, so page until the list reaches the total.
- **Places** (`scopes`) carry `countryId` and `regionId` only: resolve the names from `/api/reference` in the app's language.
- **History paging**: send the previous page's `nextCursor` as `cursor` (a record id, not an offset); stop when it is `null`. A page can hold fewer than `size` games. `outcome` is `null` when the sport's schema no longer reads the record. `ranking` is the badge.
- **`asOf`** is when the player's numbers were last updated, `null` for a player with no counted game: show the "up to 24 hours after a session ends" note then. No sport schema or a missing sport is `404 SPORT_NOT_FOUND`.

**Tests:** Vitest and a scoped e2e.
