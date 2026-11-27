# CLIENT-SESSION-62 · The group's own `sessions` stat config in the group settings

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-83 (server), CLIENT-SESSION-61 (the `sessions` stat on the client)
**Filed:** 2026-11-26, the client half of SESSION-83 (a group's own config of the `sessions` stat for its member row and board), filed at the pickup of SESSION-82.

A field in the group settings screen, for the owner or admin: what makes a session count for a member of this group (`joined`, `atLeast1Game`, both with AND or OR) or "use the sport's setting" (the default). It reads and writes the group settings call SESSION-83 extends; the screen shows the effective value and says which it comes from. en and vi labels for every string and the new error codes of SESSION-83 (`errors:codes`), added in this ticket.

**Out of scope:** the sport's own config (admin-managed schema), the personal statistics.

## Contract as built by SESSION-83 (2026-11-27)
- The field is **`statsConfig`**, keyed by stat, on `PUT /api/sessions/group/{groupId}/settings` (owner or admin): `{ "sessions": { "enabled": false } }`, `{ "sessions": { "when": ["joined", "atLeast1Game"], "combine": "AND" | "OR" } }`; omitted or `null` keeps, `{}` clears (the sport's setting applies). The answer carries `statsConfig` (the group's own, or `null`) and `effectiveStatsConfig` (`{ "sessions": { "enabled": true, "when": [...], "combine": "OR" } }` or `{ "enabled": false }`; `null` while the sport's statistics are off, and then the field is not shown). Only `sessions` can be configured today.
- A group can only **narrow** the sport's list: it cannot enable a stat the sport does not collect (`effectiveStatsConfig.sessions.enabled` is `false` then).
- Errors to show (en and vi in `errors:codes`): `SESSION_GROUP_STATS_CONFIG_INVALID` (400, `reason`, `detail`), `SESSION_GROUP_STAT_IN_USE` (409, `detail` the stat, `kind` the board kind: ask the owner to change or delete the group's own ranking rule first), and the existing `SESSION_GROUP_STATISTICS_NOT_AVAILABLE` (409).
- The change is announced in the group by a post with the system code `GROUP_STATS_CONFIG_CHANGED` and a `name` param; the client needs a case for it (en and vi) wherever it renders `GROUP_SYSTEM` codes (the same place as `GROUP_STATISTICS_ON` and `GROUP_STATISTICS_OFF`, CLIENT-SESSION-60).
- A switched-off stat has no value on the group's board, even when the board's rule (the sport's, by fallback) names it: the group board screen (CLIENT-SESSION-42) should show an empty value, not zero.

## Delta 2026-11-27: why a stat is off, and what a group can do about it
`effectiveStatsConfig.sessions` carries a **`reason`** when `enabled` is `false`: `SPORT_DISABLED` (the sport set `enabled: false`: a hard off the group cannot change; show the field as read-only with that explanation), `NOT_LISTED_BY_SPORT` (the sport does not list the stat: today nothing can be switched on, and SESSION-84 (slice B) will let a group opt in with `statsConfig.sessions.enabled = true`, so build the field so that this state can later be an editable "off, turn on" toggle), `GROUP_DISABLED` (the group's own switch: show it as editable, "turn on again" removes `enabled: false` or sends `enabled: true`). en and vi copy for the three reasons.
