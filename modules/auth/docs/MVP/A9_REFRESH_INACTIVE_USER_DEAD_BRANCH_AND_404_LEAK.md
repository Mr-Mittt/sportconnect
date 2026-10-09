# A9 · Deactivated accounts: `ACCOUNT_DEACTIVATED` at login, self re-activation, and a generic refresh response (was: dead branch and a 404 that leaks the user id on refresh)

**Status:** `DONE` (2026-10-09)
**Type:** Bug / cleanup (low priority)
**Filed:** 2026-10-05, found during **A8** (auth error-code audit). User decision at A8 pickup: keep the current behavior, because there is no account re-activation process; this ticket records the gap so it is not lost.

## What

`AuthServiceImpl.refreshToken` calls `userService.getActiveUserForUpdate(userId)` before checking `user.getIsActive()`. That method queries `findByIdAndIsActiveTrueForShare` and throws `ResourceNotFoundException("User", "id", userId)` for an inactive user, so the following `if (!user.getIsActive()) throw new UnauthorizedException("ACCOUNT_DEACTIVATED", "Account is deactivated", null)` is **dead code**.

Observable effect:
- Normal case: `deleteUser` revokes the user's refresh tokens, so refresh returns 401 `REFRESH_TOKEN_EXPIRED_OR_REVOKED` before reaching the lookup. Fine.
- The race U12 closed (a refresh that lands while deactivation commits): refresh returns **404** with `User not found with id : <uuid>`. The message leaks the user id and the client classifies it as NOT_FOUND on an auth call.

`ACCOUNT_DEACTIVATED` is registered in `documentation/md/ERROR_CODES.md` but no real request can produce it. The A8 Spock spec for the branch only passes because it mocks `getActiveUserForUpdate` to return an inactive user.

## Scope change (2026-10-09, at pickup): deactivation is reversible by the user

User decision: `ACCOUNT_DEACTIVATED` is not dead weight to remove, it is the hook for **self re-activation**. This turns A9 from a cleanup into a small feature. Option 2 below (remove the code) is dropped.

Required behavior:
1. **Login.** Correct credentials but the account is deactivated → `ACCOUNT_DEACTIVATED`, no tokens issued. Today it answers `INVALID_CREDENTIALS`, because `UserServiceImpl.verifyPassword` returns `false` for an inactive user (and `getUserByEmail` is active-only), so the code is unreachable on login as well as on refresh. A wrong password for a deactivated account stays `INVALID_CREDENTIALS` (no account-state leak without the password).
2. **Client confirmation.** On `ACCOUNT_DEACTIVATED` the client asks: "Your account has been deactivated. Do you want to re-activate it?"
   - Confirm → the account is re-activated and the user is logged in automatically.
   - Decline → nothing changes; the account stays deactivated.
3. **Forgot / reset password must not be blocked by deactivation.** A deactivated user can request a reset link and set a new password, but the account **stays deactivated** until they log in and confirm re-activation. (Overrides A10 step 2, "a deactivated user gets no email"; A10 is updated to match.)
4. **Refresh** (revised the same day): `ACCOUNT_DEACTIVATED` must **not** surface on refresh. The unrevoked-token / race case answers the generic session-ended 401 (`REFRESH_TOKEN_EXPIRED_OR_REVOKED`: "you have been logged out, log in again"), with no user id in the message, instead of the 404. The dead `ACCOUNT_DEACTIVATED` branch in `refreshToken` is removed; the code is thrown only from login. The re-activation offer happens at login, not mid-session.
5. **Register** is unchanged: a deactivated account still counts as an existing account, so registering with its email gives the duplicate-email error (`EMAIL_ALREADY_REGISTERED`, 409). This already works (`existsByEmail` is not active-filtered); A9 only adds a test that pins it.

Open design points are settled in Phase 1 and recorded in the implementation summary.

## Options when picked up (original, superseded by the scope change above)

1. Catch the missing/inactive lookup at the refresh site and throw `UnauthorizedException("ACCOUNT_DEACTIVATED", …)`: stable 401, no id leak, the code becomes real. Add an IT with an unrevoked token for a deactivated user.
2. Remove the dead branch and the registered code if deactivation stays permanent and the race response is acceptable as a 401 `REFRESH_TOKEN_EXPIRED_OR_REVOKED`.

Decide against the user-lifecycle direction at pickup (a re-activation flow would make option 1 more valuable). Related: `modules/user/user-impl/docs/BACKLOG_MVP.md` U12.

## Tests

An IT in `server/src/test/java/com/sportconnect/integration/` that deactivates a user without revoking their refresh token and asserts the refresh response (status and `errorCode`).

## Implementation summary

**Approved design (restated).**
- `UserService.verifyPassword(email, pw): boolean` is replaced by `verifyCredentials(email, pw): CredentialCheck` (`NO_MATCH` / `MATCH` / `MATCH_INACTIVE`). The hash is now checked for deactivated accounts too, so `MATCH_INACTIVE` only appears for a correct password and a stranger learns nothing about account state.
- New `UserService.reactivateUserByEmail(email)`: takes the same exclusive row lock as `deleteUser` (new `UserRepository.findByEmailForUpdate`), sets `isActive = true`, no-op if already active.
- `login`: `NO_MATCH` -> 401 `INVALID_CREDENTIALS`; `MATCH_INACTIVE` -> 401 `ACCOUNT_DEACTIVATED` (no tokens, no cookie); `MATCH` -> as before.
- New public `POST /api/auth/reactivate` (same `LoginRequest` body, same refresh-cookie contract as login): re-verifies the credentials; `NO_MATCH` -> `INVALID_CREDENTIALS`; `MATCH_INACTIVE` -> re-activate then log in; `MATCH` (already active) -> just log in. Login and reactivate share a private `startSession` helper. Added to the explicit public list in `SecurityConfig`.
- `refreshToken`: the `ResourceNotFoundException` from `getActiveUserForUpdate` becomes 401 `REFRESH_TOKEN_EXPIRED_OR_REVOKED`; the dead `ACCOUNT_DEACTIVATED` branch is deleted. `ACCOUNT_DEACTIVATED` is never returned by refresh.
- Register is unchanged (`existsByEmail` is not active-filtered, so a deactivated email is still `EMAIL_ALREADY_REGISTERED` 409); reset-password is unchanged (`updateUserPassword` uses `findById`, so it works for a deactivated user and does not re-activate).

**Built as designed; no divergence.** Edits: `CredentialCheck` (new, user-api), `UserService`/`UserServiceImpl`/`UserRepository`, `AuthService`/`AuthServiceImpl`/`AuthController`/`SecurityConfig`, `ERROR_CODES.md` (`ACCOUNT_DEACTIVATED` is now a login code; the refresh row mentions the deactivation race), `auth-impl/CLAUDE.md`.

**Key decisions.** Self-re-activation is open to every deactivated account, including ones an admin deactivated: there is no ban/suspend concept yet and nothing records who deactivated an account. Revisit when admin suspension is scoped. `/reactivate` is as open to password guessing as login; its rate limit is recorded on A5 (V1).

**Non-obvious.** An access token's `iat` has one-second resolution and a token issued at or before the revocation watermark is rejected (U12), so re-activating within the same second as the deactivation would produce an unusable token. Not reachable by a human; the IT sleeps 1.1 s to model real timing.

**Consumer census.**
- `UserService.verifyPassword`: only `AuthServiceImpl.login` plus its two Spock specs, all updated here. Nothing in the client, `services/chat`, infra or the ITs used it.
- `POST /api/auth/login` for a deactivated user: 401 either way, the code changes from `INVALID_CREDENTIALS` to `ACCOUNT_DEACTIVATED`. The client already ships en/vi copy for it and treats a login 401 as bad credentials; the confirmation dialog is client **AUTH-10** (filed in `client/docs/BACKLOG_MVP.md`, blocked on this ticket). Until it ships, a deactivated user sees "This account has been deactivated." on the login form.
- `POST /api/auth/oauth-token` (Swagger helper) goes through login: same new code, acceptable.
- `POST /api/auth/refresh`: 401 both before and after (was 404 for the race); the client already ends the session on a refresh 401. Compatible as-is.
- `POST /api/auth/register`, `reset-password`: unchanged, pinned by tests.
- Forgot-password for deactivated users: rule recorded in **A10** (updated), where the endpoint is wired.

**i18n.** No new `errorCode`, no new backend prose; `ACCOUNT_DEACTIVATED` already had en and vi copy in `errors:codes`. The dialog strings belong to AUTH-10.

**IT changes report.**
- New `AccountReactivationIntegrationTest` (9 tests, `RedisBaseIT`): login correct-password-on-deactivated -> 401 `ACCOUNT_DEACTIVATED`, no cookie, no data; login wrong-password-on-deactivated -> `INVALID_CREDENTIALS`; reactivate with correct credentials -> 200, account active, cookie set, the new access token works on `/api/users/me` while the pre-deactivation one stays 401; reactivate wrong password -> 401 and still deactivated; reactivate unknown email -> `INVALID_CREDENTIALS`; reactivate on an active account -> just logs in; refresh with an unrevoked token of a deactivated user -> `REFRESH_TOKEN_EXPIRED_OR_REVOKED` with no user id in the body; register with a deactivated email -> 409 `EMAIL_ALREADY_REGISTERED`; reset-password for a deactivated user -> 200, account still deactivated, the new password is the one that matches.
- Updated `PublicSurfaceAccessIntegrationTest`: `/api/auth/reactivate` added to the anonymously reachable list.
- Spock: `UserServiceImplSpec` (`verifyPassword` tests replaced by 5 `verifyCredentials` and 3 `reactivateUserByEmail` tests), `AuthServiceImplSpec` (login-deactivated, refresh-user-gone, 3 reactivate tests; the old refresh-`ACCOUNT_DEACTIVATED` spec replaced).

**Verification.** `./gradlew :modules:user:user-impl:test :modules:auth:auth-impl:test` green. `./gradlew :server:test` green: 544 tests, 0 failed, 0 skipped. One earlier full run had 6 failures in `SessionEventsConsumerIntegrationTest` (RabbitMQ `AmqpIOException: java.io.IOException`, a notification consumer path this ticket does not touch); the class passes alone and a second full run was clean, so it is recorded as a transient RabbitMQ connection flake. Not run: `bootRun` manual walkthrough (the ITs exercise the real request pipeline).
