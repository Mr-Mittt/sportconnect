# SESSION-84 · A group can disable any stat of the sport's list for its member row

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-83 (the group's `stats_config`, accepting `sessions` only), SESSION-82
**Filed:** 2026-11-27, split off at the pickup of SESSION-83: the owner wants a group to be able to narrow the sport's stat list with `config.{stat}.enabled`; SESSION-83 accepts only `sessions` (any other key is `400` reason `STAT_NOT_CONFIGURABLE`). Duplicate check: no session or client ticket names per-group stat disabling (searched both backlogs and the ticket folders).

Let a group owner or admin disable any stat the sport collects (`games`, `wins`, `losses`, `scoreFor`, `scoreAgainst`, and the formulas that need them) for the group member row and its board, with the same `statsConfig` call and column SESSION-83 adds. What has to be decided first: a formula whose operand the group disabled (`winRate` needs `games` and `wins`: disabled too, or the disable refused), the group's rule validation against its effective collected set (SESSION-83's A, B and C rules, generalised), the statistics read API for a group's member rows (which columns it answers), and the group's partner counters, which carry the same stats. The engine passes the group's effective collected list to the group member row and its partner counters.

**Out of scope:** enabling a stat the sport does not list, a group-specific stat for a player's own totals, seasons.

**Tests:** to be written at pickup, with a mutation check for each requirement.
