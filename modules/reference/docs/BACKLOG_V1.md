# Reference Module — V1 Feature Backlog

**Version:** V1
**Module:** `modules/reference` (`reference-api` / `reference-impl`)
**Last updated:** 2026-11-23 (REF-3 moved here from MVP)

## How to use this file

- Pick the first `TODO` ticket; mark it `IN PROGRESS` at the start; `DONE` when implementation and tests are complete.
- Use `/workon reference v1` to resume.

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [REF-3](V1/REF-3_VIETNAM_PROVINCE_DATA_REFRESH.md) | Refresh Vietnam's regions and boundaries to the current province list (63 → 34 merger). **Moved from MVP 2026-11-23 (owner):** no region migration for now. When it is picked up, decide with the owner what happens to the region ids the statistics hold (`stat_player`, `stat_pair`, `session_record_verifications`, `stat_games` — see `modules/session/docs/STATISTIC_RANKING_DESIGN.md`) as well as `users.region_id` and `locations.region_id` | `TODO` |

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
