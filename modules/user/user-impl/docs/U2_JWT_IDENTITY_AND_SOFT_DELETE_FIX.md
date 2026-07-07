# U2 · JWT-based identity + soft-delete query fix

**Status:** DONE
**Module:** `modules/user/user-api` + `modules/user/user-impl`
**Date:** 2026-07-02

## What was built

Two bundled correctness/security fixes in the user module, mirroring patterns already established
elsewhere in the codebase.

### Fix 1 — self-only profile edits

`PUT /api/users/{userId}/profile` previously trusted the `{userId}` path param with no check against
the caller — any authenticated user could edit any other user's profile. `UserService.updateProfile()`
now takes a `callerId` parameter and throws `ForbiddenException` when `userId != callerId`, checked
*before* any repository access. `UserController` extracts the caller via
`@AuthenticationPrincipal String callerIdStr` and passes it through.

`DELETE /api/users/{userId}` stays `ROLE_ADMIN`-only and unaffected — self-delete was explicitly
decided against for this ticket.

### Fix 2 — soft-delete query leak

`UserServiceImpl.getUserByEmail()` / `getUserByUsername()` used `findByEmail()` / `findByUsername()`,
which returned soft-deleted (`isActive=false`) users on these public lookup endpoints. Added
`findByEmailAndIsActiveTrue()` / `findByUsernameAndIsActiveTrue()` to `UserRepository` and swapped them
in — a soft-deleted user now 404s (`ResourceNotFoundException`) exactly like a non-existent one.

## Key decisions

- The ownership check lives in the **service layer**, not the controller, even though the "ownership"
  here is a trivial identity comparison (no DB lookup needed to know who owns a profile — it's the
  target `userId` itself). This was a deliberate choice for testability: this module's convention is
  Spock tests at the service layer only (no controller-level specs exist), and keeping the check there
  keeps it covered by the same `UserServiceImplSpec` file instead of introducing a new test-file
  convention for one check.
- Checked ownership **before** fetching the user (fail fast, no DB hit for an unauthorized caller) —
  different from `PostServiceImpl.deletePost()`'s fetch-then-check pattern, because there the owner can
  only be learned by fetching the entity first; here it's known from the input alone.

## Non-obvious constraints

- `UserService.updateProfile()`'s signature changed (`userId, request` → `userId, callerId, request`).
  Confirmed via repo-wide grep that `UserController` is the only caller — no cross-module impact.
- Found and fixed a **pre-existing broken test setup** while touching this file:
  `UserServiceImplSpec`'s `@Subject` line only passed one constructor arg
  (`new UserServiceImpl(userRepository)`) against a 3-arg `@RequiredArgsConstructor`
  (`userRepository, roleRepository, passwordEncoder`). Groovy's dynamic dispatch let this compile, but
  it would have failed at runtime the moment any test executed — the file had apparently never
  actually been run successfully. Fixed by adding `RoleRepository`/`PasswordEncoder` mocks to the test
  class.

## Tests

18 tests in `UserServiceImplSpec.groovy` (up from 15 — 3 new): self-vs-other-caller on
`updateProfile`, and soft-deleted-user lookups for both `getUserByEmail`/`getUserByUsername`. Full
suite: 55 tests across the module, 0 failures, 0 errors.

Run with: `./gradlew :modules:user:user-impl:test`

## Related finding (spun into a separate ticket)

While confirming this pattern, found the same class of bug in `modules/sport/sport-impl`:
`PUT`/`DELETE /api/sports/profiles/{profileId}` have no ownership check at all. Scoped as **A2** in
`modules/sport/sport-impl/docs/BACKLOG_MVP.md` — not fixed here, out of scope for the user module.
