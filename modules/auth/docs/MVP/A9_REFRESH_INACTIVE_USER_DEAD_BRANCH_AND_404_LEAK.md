# A9 · `/api/auth/refresh` for an inactive user: dead `ACCOUNT_DEACTIVATED` branch and a 404 that leaks the user id

**Status:** `TODO`
**Type:** Bug / cleanup (low priority)
**Filed:** 2026-10-05, found during **A8** (auth error-code audit). User decision at A8 pickup: keep the current behavior, because there is no account re-activation process; this ticket records the gap so it is not lost.

## What

`AuthServiceImpl.refreshToken` calls `userService.getActiveUserForUpdate(userId)` before checking `user.getIsActive()`. That method queries `findByIdAndIsActiveTrueForShare` and throws `ResourceNotFoundException("User", "id", userId)` for an inactive user, so the following `if (!user.getIsActive()) throw new UnauthorizedException("ACCOUNT_DEACTIVATED", "Account is deactivated", null)` is **dead code**.

Observable effect:
- Normal case: `deleteUser` revokes the user's refresh tokens, so refresh returns 401 `REFRESH_TOKEN_EXPIRED_OR_REVOKED` before reaching the lookup. Fine.
- The race U12 closed (a refresh that lands while deactivation commits): refresh returns **404** with `User not found with id : <uuid>`. The message leaks the user id and the client classifies it as NOT_FOUND on an auth call.

`ACCOUNT_DEACTIVATED` is registered in `documentation/md/ERROR_CODES.md` but no real request can produce it. The A8 Spock spec for the branch only passes because it mocks `getActiveUserForUpdate` to return an inactive user.

## Options when picked up

1. Catch the missing/inactive lookup at the refresh site and throw `UnauthorizedException("ACCOUNT_DEACTIVATED", …)`: stable 401, no id leak, the code becomes real. Add an IT with an unrevoked token for a deactivated user.
2. Remove the dead branch and the registered code if deactivation stays permanent and the race response is acceptable as a 401 `REFRESH_TOKEN_EXPIRED_OR_REVOKED`.

Decide against the user-lifecycle direction at pickup (a re-activation flow would make option 1 more valuable). Related: `modules/user/user-impl/docs/BACKLOG_MVP.md` U12.

## Tests

An IT in `server/src/test/java/com/sportconnect/integration/` that deactivates a user without revoking their refresh token and asserts the refresh response (status and `errorCode`).
