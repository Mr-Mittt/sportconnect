# U5 · Test coverage backfill

**Status:** DONE
**Module:** `modules/user/user-impl`
**Date:** 2026-07-02

## What was built

No production code changes — added Spock coverage for the 5 `UserServiceImpl` methods that had zero
tests: `createUser()`, `updateUserPassword()`, `getUserRoles()`, `verifyPassword()`,
`updateLastLogin()`.

## Key decisions

- Added a not-found case for `getUserRoles()` even though the original ticket text only explicitly
  asked for the happy path — it's the same one-line pattern already used everywhere else in this file,
  free to include, and locks in real behavior (`findById` unwrapped via `orElseThrow`).
- `verifyPassword()` got 4 cases instead of the 2 minimally implied ("match/no-match" + inactive-user):
  match, no-match, inactive user (asserts `passwordEncoder.matches()` is **never called** — the method
  short-circuits on `!user.getIsActive()` before reaching the encoder), and user-not-found (same
  short-circuit, different reason). Splitting these out makes the short-circuit behavior explicit
  rather than bundling both null-user and inactive-user into one case.
- `updateUserPassword()`'s test explicitly asserts `0 * passwordEncoder.encode(_)` to lock in that this
  method (used by the auth module's password-reset flow) receives an **already-hashed** value and must
  never re-hash it — this was flagged as a gotcha in `modules/user/user-impl/CLAUDE.md` even before
  this ticket.

## Non-obvious constraints

- None beyond what's already documented — this ticket didn't touch any production code.

## Tests

12 new tests added to `UserServiceImplSpec.groovy` (22 → 34): 2 for `createUser` (success + missing-role
`RuntimeException`), 2 for `updateUserPassword` (persists as-is + not-found), 2 for `getUserRoles`
(correct set + not-found), 4 for `verifyPassword` (match, no-match, inactive-user, not-found), 2 for
`updateLastLogin` (sets timestamp + not-found). Full module suite: 67 → 79 tests, 0 failures, 0 errors.

Run with: `./gradlew :modules:user:user-impl:test`

---

**Status:** `DONE`
**Type:** Test Coverage
**Scope:** `UserServiceImplSpec.groovy` only — no production code changes

Add Spock coverage for the 5 currently-untested `UserServiceImpl` methods:
- `createUser()` — success path; throws `RuntimeException` when the `USER` role is missing
- `updateUserPassword()` — persists the given hash as-is (no re-hashing); not-found case
- `getUserRoles()` — returns the correct set of role names
- `verifyPassword()` — match / no-match; returns `false` for an inactive (soft-deleted) user
- `updateLastLogin()` — sets `lastLoginAt` to now; not-found case

---
