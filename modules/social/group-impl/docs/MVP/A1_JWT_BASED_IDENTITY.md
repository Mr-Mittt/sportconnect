# A1 · JWT-based identity — Implementation Summary

**Ticket:** A1  
**Status:** DONE  
**Date:** 2026-06-29

## What was built

Removed `userId` (and its aliases `adminUserId`, `currentUserId`, `currentOwnerId`) from all caller-identity `@RequestParam` fields across `GroupController`. The calling user's identity is now extracted from the JWT principal injected by Spring Security.

## Files changed

| File | Change |
|---|---|
| `modules/common/build.gradle` | Added `spring-boot-starter-security` dependency |
| `modules/common/src/.../common/auth/SecurityUtils.java` | New static utility: `extractUserId(Authentication) → UUID` |
| `modules/auth/auth-impl/.../security/JwtAuthenticationFilter.java` | Principal changed from `email` to `userId` string |
| `modules/social/group-impl/.../controller/GroupController.java` | All caller-identity `@RequestParam` removed; replaced with `@AuthenticationPrincipal String userIdStr` or `Authentication authentication` |

## Key decisions

- **`SecurityUtils` in `com.sportconnect.common.auth`**: All `*-impl` modules already depend on `common` and have Spring Security on the classpath, so this is the zero-dependency-cost home for the helper. The `common.auth` package is reserved for future auth utilities.

- **Principal = userId (not email)**: The JWT subject has always been the userId string. The filter was discarding it and using email as the principal — reversed with a one-line change. No other code read the principal before this ticket.

- **Two patterns used in the controller**:
  - `@AuthenticationPrincipal String userIdStr` → for endpoints with `@PreAuthorize("hasRole('USER')")` where authentication is guaranteed
  - `Authentication authentication` + `SecurityUtils.extractUserId(auth)` → for public GET endpoints where the caller may be unauthenticated (returns `null` UUID, passed to the service as an optional context)

- **`targetUserId` and `newOwnerId` kept as `@RequestParam`**: These identify the *target* of an operation (member to add, new owner to assign), not the caller — they cannot come from the JWT.

- **Permission check endpoints now require auth**: `is-owner`, `is-admin`, `is-member`, `user-role` gained `@PreAuthorize("hasRole('USER')")` since the caller is always checking their own permissions.

## Non-obvious constraints

- `getUserJoinRequests` (`GET /api/groups/join-requests/user/{userId}`) was not changed — its `userId` is a `@PathVariable`, not a `@RequestParam`, so it falls outside this ticket's scope.
- The `email` field is still present in the JWT claims (unchanged); only the principal used for `authentication.getName()` changed.

---

**Status:** `DONE`  
**Type:** Enhancement (Security)  
**Scope:** `GroupController.java` only — no service layer changes  
Extract `userId` from the JWT principal inside the controller. Remove `userId` from all 24 request params.

---
