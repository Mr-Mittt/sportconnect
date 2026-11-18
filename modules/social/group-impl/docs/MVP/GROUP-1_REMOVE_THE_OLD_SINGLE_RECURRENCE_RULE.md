# GROUP-1 · Remove the old single recurrence rule from the group module

**Status:** `TODO`
**Type:** Enhancement (Architecture) · **Depends on:** SESSION-GROUP-5 merged and CLIENT-GROUP-SESSION-4/5 shipped (nothing may read or write the old rule any more)
**Filed:** 2026-11-19, from the group-session plan. The owner decided the old rule is **replaced, not migrated** (2026-11-19): groups that had a weekly rule set it up again in the new settings UI. Supersedes B22 (game mood now lives on the new config) and GRP-12.

**Update 2026-11-19 (SESSION-GROUP-5):** group-impl no longer depends on `session-api` and `GroupServiceImpl` no longer triggers any generation (SESSION-GROUP-5 removed both), and `GroupService.getGroupsWithAutoGenerateSessionsEnabled` is now called by nobody: remove it here too, with `getGroupRecurrenceConfigsByGroupIds`.

Remove, in one change: the five `groups.recurrence_*` columns (`recurrence_day_of_week`, `_time`, `_duration_minutes`, `_location_id`, `_location_note`) and `group_settings.auto_generate_sessions` (Liquibase drop, no data migration); `GET/PUT /api/groups/{id}/recurrence`; `UpdateGroupRecurrenceRequest`, `GroupRecurrenceResponse`, `GroupRecurrenceConfigResponse`, `GroupService.getGroupRecurrenceConfigsByGroupIds` and the recurrence validation in `GroupServiceImpl`; `autoGenerateSessions` in `UpdateGroupSettingsRequest`/`GroupSettings` DTOs and the client `GroupSettings` type; the stale recurrence text in `modules/social/group-impl/CLAUDE.md`; mark B22 and GRP-12 superseded; remove the now-unused `GROUP_RECURRENCE_*` strings only if no new code reuses them (the location-sport mismatch code is reused).

**Release notes:** `SERVER.md` and `CLIENT.md` under `## Unreleased`, "Manual actions": existing groups lose their weekly rule and the owner must create new configurations; "Rollback": the dropped columns are not restored.

**Consumer census (mandatory before the drop):** grep every backend module, `client/src`, MSW handlers and tests for each removed name and column; list each as updated here.

**Tests:** the group module Spock specs and ITs that touched recurrence are removed or rewritten; one IT proves the group endpoints still work without the columns; `:server` context starts.

---
