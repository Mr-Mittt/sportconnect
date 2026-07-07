# U4 · Password change endpoint

**Status:** DONE
**Module:** `modules/user/user-api` + `modules/user/user-impl`
**Date:** 2026-07-02

## What was built

Self-service password change for an already-authenticated user, distinct from the auth module's
forgot-password/reset-token flow (which is for logged-out users).

- `PUT /api/users/me/password` (`ROLE_USER`) — verifies `currentPassword`, hashes and persists
  `newPassword`
- New `ChangePasswordRequest` DTO (`user-api`): `currentPassword` (`@NotBlank`), `newPassword`
  (`@NotBlank`, `@Size(min=8)` — reused the exact validation convention from auth-api's
  `ResetPasswordRequest` for consistency)
- New `UserService.changePassword(UUID userId, String currentPassword, String newPassword)` method

## Key decisions

- **Dedicated method, not reuse of `verifyPassword()`** — `verifyPassword(String email, String
  rawPassword)` is keyed by email (built for the login flow in auth-impl). Reusing it here would need
  an extra `findById` → `getEmail` → `verifyPassword(email, ...)` round trip. `changePassword()` does
  one fetch (`findByIdAndIsActiveTrue`), verifies with `passwordEncoder.matches()` directly, then
  hashes and saves — matching the existing `updateUserPassword()`/`verifyPassword()` pattern of not
  re-hashing values that are already hashed.
- **Same password allowed** — no check rejecting `newPassword == currentPassword`; a resubmission is
  just a no-op hash regeneration.
- **No session/refresh-token invalidation** — explicitly out of scope. Existing sessions on other
  devices stay valid after a password change. This is a reasonable candidate for a future ticket if
  needed, but would require a new cross-domain call into the auth module that doesn't exist today.
- Endpoint added directly to the existing `UserController` rather than a new dedicated controller —
  one route doesn't justify a new file.

## Non-obvious constraints

- No migration needed, no entity changes — `passwordHash` already exists on `User`.
- `PasswordEncoder` was already available as a field in `UserServiceImpl` (used by `verifyPassword()`)
  — confirmed during exploration that this resolved the ticket's original open question (whether
  wiring a `PasswordEncoder` into `user-impl` would violate the no-cross-domain-`-impl`-imports rule).
  It's a plain Spring Security bean, not an auth-impl-specific class, and was already in use here.

## Tests

4 new tests in `UserServiceImplSpec.groovy` (18 → 22): current password matches → hash updated; current
password wrong → `BadRequestException`, no save; user not found → `ResourceNotFoundException`; same
password resubmitted → succeeds. Full module suite: 63 → 67 tests, 0 failures, 0 errors.

Run with: `./gradlew :modules:user:user-impl:test`
