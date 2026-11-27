# SESSION-83 · A group's own `sessions` stat config for its member row and board

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-82 (the `sessions` stat and the config in the sport's schema), SESSION-78 (the group's settings row); **better after** SESSION-77 (no history before the rebuild)
**Filed:** 2026-11-26, owner question at the pickup of SESSION-82: "how can a group override this session stat on the sport's `record.scoreboard` config". Duplicate check: no ticket in the session or client backlog, the drafts file or the ticket folders names a per-group stat config (searched `sessions_config`, group override, per-group config).

SESSION-82 puts the config of the `sessions` stat (`counts` of `joined` and `atLeast1Game`, `combine` AND or OR, default `joined`) in the **sport's** schema, so it is the same for every group and for a player's own totals. This ticket lets a group owner or admin set the config **for the group's own rows only**: the group member row (`group_member_stats`) and so its GROUP board. A player's own totals, the ranked counters and the region and country scopes keep the sport's config, because they are shared by every group and by standalone sessions (a per-group meaning there would need a counter row per group and player, which is a different, larger design and is out of scope).

**Design (to confirm at pickup):** a nullable jsonb column `sessions_config` on `group_session_settings` (Liquibase, next free version; no row or null means the sport's config), the same shape and the same lenient validation as the sport's. The engine, when it counts a group session into the group member row (only while the group's switch is on), uses the group's config when set, else the sport's. It is set with the existing group settings call (`PUT /api/sessions/group/{groupId}/settings`) by an owner or admin (`canManageMembers`); a deactivated caller is refused as everywhere. A change applies to sessions counted from then on; older sessions are not re-derived until the SESSION-77 rebuild (say so in the release note). The group's own ranking rule (SESSION-54 slice B) is unchanged: it orders the board, this decides what the number means.

**Client:** a field in the group settings screen, filed as CLIENT-SESSION-62; en/vi labels and the error codes belong there.

**Out of scope:** a group-specific count in a player's own totals, seasons, any other stat's config.

**Tests:** `SessionStatsIntegrationTest` (a group config beats the sport's for the member row and not for the own totals, null falls back, a switch-off group ignores it); the settings call (owner or admin only, member and outsider refused, an invalid config 400); mutation-check each.
