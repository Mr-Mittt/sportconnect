# B6b · Group Info Fields — Implementation Summary

**Date:** 2026-06-29  
**Ticket:** B6b (MVP backlog)  
**Status:** DONE

---

## What Was Built

Added `rules` (TEXT) and `schedule` (TEXT) to the `Group` entity, editable by owner or admin via the existing update endpoint, and exposed via a new dedicated read endpoint.

**New endpoint:** `GET /api/groups/{groupId}/info` → `ApiResponse<GroupInfoResponse>`  
Returns `groupId`, `groupName`, `rules`, `schedule`, `updatedAt`. No membership check — any authenticated user can read.

**Updated endpoint:** `PUT /api/groups/{groupId}` now accepts `rules` and `schedule` in the request body (null-safe patch — omitting them leaves existing values unchanged).

---

## Files Changed

| File | Change |
|---|---|
| `V014__add_rules_and_schedule_to_groups.sql` | `ALTER TABLE groups ADD COLUMN rules/schedule TEXT NOT NULL DEFAULT ''` |
| `db.changelog-master.xml` | Registered V014 |
| `Group.java` | Added `rules` and `schedule` fields with `@Builder.Default = ""` |
| `UpdateGroupRequest.java` | Added optional `rules` (max 10 000 chars) and `schedule` (max 5 000 chars) |
| `GroupInfoResponse.java` | New DTO: `groupId`, `groupName`, `rules`, `schedule`, `updatedAt` |
| `GroupService.java` | Added `getGroupInfo(Long groupId)` to interface |
| `GroupServiceImpl.java` | Implemented `getGroupInfo`; extended `updateGroup` with null-safe rules/schedule patches |
| `GroupController.java` | Added `GET /api/groups/{groupId}/info` |
| `GroupServiceImplSpec.groovy` | 3 new tests |

---

## Key Decisions

- **Default `""` not `null`** — the columns are `NOT NULL DEFAULT ''` so existing groups get empty strings, not nulls. Application-level `@Builder.Default = ""` mirrors this.
- **Dedicated info endpoint** — `rules` and `schedule` are not included in `GroupResponse` (used in list/card views) to keep the main response slim. The info endpoint is meant for a separate "group info" UI section.
- **No membership gate on `getGroupInfo`** — consistent with `getGroup`, which also requires `ROLE_USER` but not membership. Rules/schedule are non-sensitive and useful for users deciding whether to join.
- **`_ *` cardinality for `group_admin` lookup in tests** — `canManageMembers` short-circuits on `isGroupOwner || isGroupAdmin`, so `findByRoleName("group_admin")` is never called when the caller is the owner. This is also the root cause of the 6 pre-existing test failures (tracked in A5).

---

## Test Results

3 new tests, all passing:
- `getGroupInfo should return rules and schedule when group exists`
- `getGroupInfo should throw NotFoundException when group does not exist`
- `updateGroup should update rules and schedule when provided`

---

**Status:** `DONE`  
**Type:** New Feature  
Add `rules` (TEXT) and `schedule` (TEXT) to `Group` entity. Updated via existing `UpdateGroupRequest` / update-group endpoint. Displayed in a separate "group info" UI section, not in the post feed.

---
