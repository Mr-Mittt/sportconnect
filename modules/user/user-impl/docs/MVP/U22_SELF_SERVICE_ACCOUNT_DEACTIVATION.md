# U22 · Self-service account deactivation

**Status:** `DONE` (2026-10-13)
**Type:** Feature
**Depends on:** U12 (deactivation revokes every session), A9 (a deactivated account can be re-activated from the login page). Client half: **ACCOUNT-4** (client backlog).
**Filed:** 2026-10-13, found right after client AUTH-10 shipped: users can be offered re-activation, but there is no way for a user to deactivate their own account. `DELETE /api/users/{userId}` is `ROLE_ADMIN`-only (U2 left the self-delete question open).

## What

`POST /api/users/me/deactivate` with `{ "currentPassword": "..." }`, authenticated as a normal user.

- Re-confirms the caller's password (same check and same error as `PUT /api/users/me/password`: `400 CURRENT_PASSWORD_INCORRECT`; a blank password is `400 VALIDATION_FAILED`).
- Soft-deletes the caller's own account (`isActive = false`) and revokes every one of their sessions, exactly like the admin path (`deleteUser`): `authService.logout(userId)` in the same transaction, under the same `findByIdForUpdate` row lock (users row first, refresh_tokens second).
- The caller must still be active: a deactivated or unknown account is `404` (same as `changePassword`).
- The account can come back through A9's `POST /api/auth/reactivate`; nothing is deleted.

Account lifecycle check: a deactivated caller is rejected by the service itself (`findByIdForUpdate(...).filter(isActive)` -> not found), and their access token is already revoked by U12, so the endpoint is unreachable for them either way.

## Consumer census

New endpoint and a new `UserService` method; no existing contract changed. `deleteUser` keeps its behaviour (its body now goes through a private `deactivate(User)` shared with the new method). `/api/users/**` stays authenticated in `SecurityConfig`. Client: new consumer only (ACCOUNT-4, done in the same change).

## Out of scope

- What happens to groups the user owns, their sessions, posts or friendships on deactivation (unchanged from the admin path; a product question for a later ticket).
- A confirmation e-mail, a grace period or hard deletion.
- Notification use cases: no notification feature exists; "tell friends / group members a member left" is not a candidate trigger we are adding here.

## Implementation summary

- `user-api`: `DeactivateAccountRequest { @NotBlank currentPassword }`; `UserService.deactivateOwnAccount(UUID userId, String currentPassword)` with Javadoc.
- `user-impl`: `UserServiceImpl.deactivateOwnAccount` (lock -> must be active -> password check -> `deactivate`), shared private `deactivate(User)`; `UserController` `@PostMapping("/me/deactivate")` with `@PreAuthorize("hasRole('USER')")` and OpenAPI annotations.
- Tests: three Spock cases in `UserServiceImplSpec` (success revokes sessions; wrong password changes nothing and throws `CURRENT_PASSWORD_INCORRECT`; unknown / already-deactivated -> not found). New `server/src/test/java/com/sportconnect/integration/SelfDeactivationIntegrationTest.java` (real MockMvc, real Redis, real services), 6 tests:
  - right password: 200, user inactive, access token 401, refresh cookie 401, login answers `ACCOUNT_DEACTIVATED`;
  - deactivate then `POST /api/auth/reactivate`: the account is back;
  - wrong password: 400 `CURRENT_PASSWORD_INCORRECT`, still active, token still works;
  - blank password: 400 `VALIDATION_FAILED`;
  - no token: 401;
  - only the caller is affected (a second user stays active and keeps working).
- Verified: `./gradlew :modules:user:user-impl:test --tests "*UserServiceImplSpec"` and `./gradlew :server:test --tests "*SelfDeactivationIntegrationTest" --tests "*AccountReactivationIntegrationTest"` both green. The full `:server:test` suite was not run.

## Error codes (C12)

No new code: `CURRENT_PASSWORD_INCORRECT` and `VALIDATION_FAILED` already have en/vi copy in the client's `errors:codes`.
