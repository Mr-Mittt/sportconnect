# SESSION-78 · A group switch for statistics and its leaderboard

**Status:** `DONE` (2026-11-25)
**Type:** New Feature · **Depends on:** SESSION-53 (done), SESSION-73 (done); read by SESSION-54 (its job and refresh skip a group that is off)
**Filed:** 2026-11-25, `/ticket` after the SESSION-53 rework and SESSION-73: the sport has a switch (`sports.statistics_enabled`), the group has none; owner: a group owner or admin chooses whether the group's statistics and leaderboard run.

A group has one setting, `statisticsEnabled` (default off: no row means off, even when the sport's switch is on), read by any member and changed by the group's owner or admin. It is one switch for the group's member statistics (`group_member_stats`, `group_stats`) and its leaderboard, as the sport's switch is for statistics and ranking.

## Scope as built (owner decisions, 2026-11-25)

- **Storage (owner chose the column):** `group_session_settings.statistics_enabled BOOLEAN NOT NULL DEFAULT FALSE` (migration `V106`; `V105` has merged and is untouched). The existing settings endpoints carry it: **`GET /api/sessions/group/{groupId}/settings` and `PUT .../settings` gain `statisticsEnabled`** (no new path; the first draft named `.../statistics-setting`). A `PUT` that sends only `statisticsEnabled` changes nothing else and does not touch regular-session generation, and the regular-session switch does not touch it. Same permissions as the other fields (404 `GROUP_NOT_FOUND`, then 403 `SESSION_GROUP_MEMBER_REQUIRED` / `SESSION_GROUP_ADMIN_REQUIRED`).
- **The group's sport must have statistics on (owner):** while the group's sport does not have `sports.statistics_enabled` on, **or the group has no sport, the group's setting is ignored**: the settings answer carries `statisticsEnabled: null` (the client does not render it, no reason is shown to the user), and a `PUT` that sends `statisticsEnabled` (on or off) is refused with **409 `SESSION_GROUP_STATISTICS_NOT_AVAILABLE`**, nothing saved; a `PUT` of the other fields works as before. A value saved earlier is kept and shows again when the sport is switched on. Registered in `ERROR_CODES.md` § session.
- **Read at counting time (owner chose):** `SessionStatsProcessor` reads the setting once per group session, inside the counting transaction (`existsByGroupIdAndStatisticsEnabledTrue`, a primary-key read). While it is off (or there is no row) the session is counted for the players only: nothing is written to `group_member_stats` or `group_stats`, and no GROUP board is marked dirty. The players' own rows and the venue entries are unchanged. **Switching it on counts only sessions processed from then on**; sessions counted while it was off reach the group rows only through the SESSION-77 rebuild.
- **Off keeps what was counted visible (owner):** the SESSION-73 reads are unchanged by the group's switch.
- **A change writes a group system post** as the group's owner (SESSION-GROUP-4 precedent), `GROUP_STATISTICS_ON` / `GROUP_STATISTICS_OFF` with `name`; **no push notification** (so nothing is added to `NOTIFICATION_USE_CASES.md`). A call that sends the value the group already has writes nothing and creates no row.
- **SESSION-54 reads it:** its nightly job and manual refresh skip a group that is off (hand-over added to that ticket). The manual refresh itself stays in SESSION-54; there is no reset here.
- **Client pair:** CLIENT-SESSION-60 (the toggle, shown only when `statisticsEnabled` is not null; en/vi for the two posts and the new error code).

**Out of scope:** the manual group-board refresh (SESSION-54), a reset of the group's counters, a per-member hide (SESSION-74 is the player's own visibility), region and country boards, a notification, a sport-off message on the client.

## Implementation summary (2026-11-25)

**Built (session-api, session-impl, post-api, server migration; branch `feature/session-78-group-statistics-setting`).**

- `V106__group_statistics_setting.sql` and its changelog entry; the H2 mirror in `schema.sql`.
- `GroupSessionSettings.statisticsEnabled`, `GroupSessionSettingsRepository.existsByGroupIdAndStatisticsEnabledTrue`, `UpdateGroupSessionSettingsRequest.statisticsEnabled` (`Boolean`, omitted = unchanged), `GroupSessionSettingsResponse.statisticsEnabled` (`Boolean`, `null` when not available).
- `GroupSessionConfigServiceImpl`: the sport check (`GroupService.getGroup(...).getSportId()` and `SportService.getStatisticsEnabledSportIds()`, one group read and one cached set read per settings call), the 409, the change detection and the two posts; `SystemCode.GROUP_STATISTICS_ON` / `_OFF`.
- `SessionStatsProcessor`: the group id is used only while the group's switch is on.
- Docs: `session-impl/CLAUDE.md` rules 16 and 22, release notes (Changes, Applied automatically, Rollback, Depends on), the deployment guide history row, `ERROR_CODES.md`, the SESSION-54 hand-over, CLIENT-SESSION-60.

**Design review answers.** *Table or column:* a column on the group's existing settings row (written by the owner or admin, read by every settings read and once per counted group session by the engine, never queried across groups). *Two at once:* a switch change and a counting run are independent transactions; the run reads the value once, so it sees the old or the new value for that whole session, and two settings writes are last-write-wins on one row (no version check, as for the other fields). *What the tests can prove:* the rules and the engine's skip on H2; the real interleaving of a settings write and a counting run on PostgreSQL is not run.

**Tests run (2026-11-25).** `GroupSessionConfigServiceImplSpec` 90 (new: statistics off by default, on and off posts, a repeated value writes nothing, the sport off or missing refuses the change and shows null), `GroupSessionConfigIntegrationTest` 23, `SessionStatsIntegrationTest` 30, `StatisticsReadIntegrationTest` 21, `SportStatisticsSwitchIntegrationTest` 7, `RegularSessionCancelIntegrationTest` 9, `GroupSessionGenerationIntegrationTest` 23, all green (the two statistics ITs now switch their test group on first). **Mutation check, 13 mutants, 12 caught:** the processor reading the switch (always on, inverted), the no-op check, the field not saved, the on and off posts swapped, the response always false, the entity default true, the change test inverted, and for the sport rule the 409 removed, the availability always true, the answer never null, the check inverted. **1 survived by design:** the English text of the 409 (the tests assert the code, which is the contract).

### IT changes (report)

- **Updated `SessionStatsIntegrationTest` (28 to 30) and `StatisticsReadIntegrationTest` (21):** the test group gets a settings row with `statisticsEnabled` on (a group is off by default). **Added to `SessionStatsIntegrationTest`:** a group with no row is counted for the players only, then switched on and only the later session reaches the group rows, board and head-to-head; an explicit off row behaves the same.
- **Updated `GroupSessionConfigIntegrationTest` (18 to 23):** the fixture sport has statistics on; the default test also asserts `statisticsEnabled: false`. **Added:** switching independent of regular sessions with posts authored as the owner; a no-op writes nothing and creates no row; a plain member 403, an outsider 403 and an inactive group 404; the sport off shows null and a change is 409 while other settings still change; a saved value hides while the sport is off and returns with it. No `@SpyBean`, no `@MockBean`.

**Not proven (said plainly):** the whole `session-impl` module and the full `:server:test` were not re-run (only the classes above); PostgreSQL was not used (the real interleaving of a settings write against a counting run, and `V106` through Liquibase); no running server. A group's setting does nothing until the group's sport is switched on by an admin and the group's owner switches the group on; there is no screen for it until CLIENT-SESSION-60.

**Account lifecycle.** The settings endpoints are behind the per-request active gate and the owner/admin check, as before; the engine path has no caller.
