# A3 · Cancel Join Request — Implementation Summary

**Date:** 2026-06-29  
**Ticket:** A3 (MVP backlog)  
**Status:** DONE

---

## What Was Built

`DELETE /api/groups/join-requests/{requestId}` — lets the original requestor withdraw a pending join request before an admin acts on it.

**Response on success:** `200 + ApiResponse<Void>` ("Join request cancelled") — consistent with all other DELETE endpoints in GroupController.

---

## Validation Order (in GroupServiceImpl.cancelJoinRequest)

1. Find request by ID → 404 if not found
2. Verify caller UUID equals `request.getUserId()` → 400 "You can only cancel your own request"
3. Fetch group, verify `group.isActive() == true` → 400 "Group no longer exists"
4. Verify `request.getStatus() == "pending"` → 400 "Request is not pending"
5. Hard-delete the row (`joinRequestRepository.deleteById`)

The group-active check was added to guard against the edge case where a group is deactivated after a request was sent — without it, a user would cancel a request against a ghost group.

---

## Files Changed

| File | Change |
|---|---|
| `group-api/.../GroupService.java` | Added `cancelJoinRequest(Long requestId, UUID callerId)` to interface |
| `group-impl/.../GroupServiceImpl.java` | Implemented `cancelJoinRequest` after `getUserJoinRequests` |
| `group-impl/.../GroupController.java` | Added `DELETE /api/groups/join-requests/{requestId}` |
| `group-impl/build.gradle` | Added Groovy plugin + Spock dependencies + JTS test dep (tests were never runnable before) |
| `GroupServiceImplSpec.groovy` | 5 new tests: happy path + not found + wrong user + group inactive + not pending |

---

## Key Decisions

- **Hard delete over soft delete** — no audit trail requirement for MVP; keeps the table clean and allows re-requesting immediately.
- **200 OK over 204 No Content** — matches every other DELETE in GroupController; consistent ApiResponse shape for frontend.
- **build.gradle fix** — `group-impl` was using `id 'java'` instead of `id 'groovy'` and had no Spock dependencies, so the existing 17 test specs were silently never running. Fixed as part of this ticket. The 6 pre-existing test failures (stale mock expectations) are tracked in A5.

---

## Test Results

5 new tests, all passing:
- `cancelJoinRequest should delete request when caller is the requestor and request is pending`
- `cancelJoinRequest should throw NotFoundException when request does not exist`
- `cancelJoinRequest should throw BadRequestException when caller is not the requestor`
- `cancelJoinRequest should throw BadRequestException when group is inactive`
- `cancelJoinRequest should throw BadRequestException when request is not pending`

---

**Status:** `DONE`  
**Type:** Enhancement  
`DELETE /api/groups/join-requests/{requestId}` — user cancels their own pending request. Only the requestor can cancel; admins use the existing decline endpoint.

---
