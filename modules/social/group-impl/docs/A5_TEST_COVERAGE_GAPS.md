# A5 · Test Coverage Gaps — Implementation Summary

**Ticket:** A5  
**Status:** DONE  
**Date:** 2026-06-30  

## What was built

Added 26 Spock tests to `GroupServiceImplSpec.groovy` covering 8 previously untested service methods. `cancelJoinRequest` and `getPublicGroups` were already covered by prior tickets.

## Methods covered

| Method | Happy path | Error paths |
|---|---|---|
| `removeMember` | admin removes member | group not found; caller not admin; target is owner |
| `leaveMember` | regular member leaves | group not found; owner tries to leave |
| `declineJoinRequest` | admin declines pending request | request not found; caller not admin; request not pending |
| `addMember` | admin adds new user | group not found; caller not admin; target already member |
| `updateMemberRole` | owner promotes member to admin | caller not owner; target is owner; assigning "group_owner" role directly |
| `getGroupMembers` | returns page of members with role names | group not found |
| `getGroupSettings` | member views settings | group not found; non-member access |
| `getUserJoinRequests` | returns pending requests with group name | empty page (no repo side-effects) |

## Key decisions

- `getGroupMembers` maps each `GroupMember` through `mapToGroupMemberResponse`, which calls `userRepository.findById` twice per member (once for `fullName`, once for `avatarUrl`). The test asserts `2 * userRepository.findById(otherUserId)` to pin this behaviour.
- `getUserJoinRequests` empty-page test asserts `0 * groupRepository.findById(_)` to ensure the mapper is never invoked when there are no results — guarding against a future regression where an empty stream still triggers side-effects.
- `updateMemberRole` "assign owner role" path: the service fetches the role via `findByRoleName("group_owner")` before throwing, so `_ *` cardinality is used for that call since it fires 3 times across the two `isGroupOwner` guards plus the direct lookup.
- All tests use `_ *` for mock calls whose exact count depends on short-circuit evaluation inside `canManageMembers` / `isGroupOwner` / `isGroupAdmin`.
