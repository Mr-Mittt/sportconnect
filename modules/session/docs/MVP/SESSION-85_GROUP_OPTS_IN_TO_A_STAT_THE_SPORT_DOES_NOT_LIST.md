# SESSION-85 · A group opts in to a stat the sport does not list

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-83 (the group's `stats_config`, the effective block and its `reason`)
**Filed:** 2026-11-27, owner rule at the pickup of SESSION-83: the sport is global config, so a stat the sport **disables** (`config.{stat}.enabled: false`) is a hard off the application admin chose, while a stat the sport **does not list** in `record.scoreboard.columns` is left to each group (the sub-board). SESSION-83 only lets a group narrow the sport's list (`reason: NOT_LISTED_BY_SPORT` is informational there). Duplicate check: no session or client ticket names a group opt-in to an unlisted stat (searched both backlogs and the ticket folders).

A group owner or admin can turn on a stat the sport does not list, for the group's own member row and board, with `statsConfig.{stat}.enabled = true` (optionally with its own `when` and `combine`); the players' own totals, the ranked, region and country counters stay off because the sport does not collect it. A group config that only sets `when` does not turn an unlisted stat on (no accidental collection). A group's `enabled: true` for a stat the sport **disabled** is refused with `409 SESSION_GROUP_STAT_DISABLED_BY_SPORT`. Today only `sessions` can be configured (SESSION-84 opens the others, and should come first or together).

**What it touches (decide and test together):** the engine's group branch (reads "the sport does not forbid it and the group enabled it" instead of "the sport collects it", and counts the group's rows from the group's own rule); the group's ranking rule validation (against the stats the group collects, not only the sport's); the statistics read API for a group's member rows (its columns come from the sport's collected set today, so the group's extra stat must be answered too); the board builder (the group's collected set, as case C does for a switched-off stat); `effectiveStatsConfig` (`enabled: true` with the group's rule when the group opted in); a group that opted in and later has the sport list the stat (own totals start counting, the group's own `when` still applies to its rows). The group post and the board rebuild mark are the same as SESSION-83's.

**Client:** the CLIENT-SESSION-62 field becomes an editable "off, turn on" toggle for `NOT_LISTED_BY_SPORT` (its Delta of 2026-11-27 says so); the new error code `SESSION_GROUP_STAT_DISABLED_BY_SPORT` gets its en and vi copy there. No history before SESSION-77.

**Out of scope:** the sport's own config, a group-specific count in a player's own totals, seasons.

**Tests:** to be written at pickup: the opt-in through the settings call (owner and admin, member refused), refused for `SPORT_DISABLED`, `when` only does not opt in, the engine counts the group rows and not own totals, the group rule validation and the read API for the extra stat, the board; a mutation check for each requirement.
