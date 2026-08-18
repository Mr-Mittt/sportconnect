# A5 · Fix cross-domain violation in CommentServiceImpl (UserRepository/User → UserService)

**Status:** DONE
**Module:** `modules/social/post-impl`
**Date:** 2026-07-02

## What was built

Replaced `CommentServiceImpl`'s direct dependency on `user-impl` internals
(`com.sportconnect.user.entity.User`, `com.sportconnect.user.repository.UserRepository`) with the
proper `user-api` interface (`UserService`), fixing this repo's core architecture rule violation
("cross-domain calls through `-api` interfaces only").

- Replaced the `UserRepository userRepository` field with `UserService userService`
- New private helper `resolveUserFullName(UUID userId)` wraps `userService.getUserById(userId).getFullName()`
  in a `try/catch` for `ResourceNotFoundException`, preserving the original `"Unknown User"` fallback
  behavior exactly
- Both call sites (`buildPreviewResponse()`, `mapToResponse()`) now call this helper instead of
  `userRepository.findById(...).map(User::getFullName).orElse("Unknown User")`
- Removed the now-unnecessary `implementation project(':modules:user:user-impl')` line from
  `post-impl/build.gradle` — `user-api` was already present and stays, `PostServiceImpl` in this same
  module already used it correctly for `UserFriendService`

## Key decisions

- **Preserved the exact fallback semantics.** `UserService.getUserById()` throws
  `ResourceNotFoundException` on a missing user, where the old code silently returned `"Unknown User"`
  via `Optional.orElse(...)`. The new `resolveUserFullName()` helper catches that specific exception
  and returns the same fallback string — a comment author who no longer exists (data-integrity edge
  case) still renders instead of 500ing the whole response.
- **No batch lookup needed** (unlike group-impl's sibling ticket A6) — both call sites map one comment
  at a time, so `getUserById(UUID)` (already existing on `UserService`) was sufficient; no new method
  needed on the interface.

## Non-obvious constraints

- No production behavior change — same displayed `fullName` value, same `"Unknown User"` fallback
  string, same 2 call sites. Pure architecture-compliance refactor.
- `PostServiceImpl.java` in this same module was already clean (uses `UserFriendService` from
  `user-api` correctly) — this ticket only touched `CommentServiceImpl.java`.

## Tests

Updated 8 existing mock stubs in `CommentServiceImplSpec.groovy` from `userRepository.findById(userId)
>> Optional.of(user)` to `userService.getUserById(userId) >> user` (now a `UserResponse` fixture
instead of a `User` entity fixture). Added 1 new test: comment author lookup throwing
`ResourceNotFoundException` still renders `"Unknown User"` instead of propagating the exception.
`CommentServiceImplSpec`: 16 → 17 tests, 0 failures, 0 errors. Full project `compileJava` verified
clean after removing the `user-impl` Gradle dependency.

Run with: `./gradlew :modules:social:post-impl:test`

---

**Status:** `DONE`  
**Type:** Bug Fix (Architecture)  
**Scope:** `CommentServiceImpl.java` only — `PostServiceImpl.java` in this same module is already clean
(correctly uses `UserFriendService` from `user-api` only).

`CommentServiceImpl` directly imports and injects `com.sportconnect.user.entity.User` and
`com.sportconnect.user.repository.UserRepository` — both internal classes of `user-impl`, not the
`user-api` interface. This violates this repo's core architecture rule (root `CLAUDE.md`):
"Cross-domain communication through `-api` interfaces only — never import a concrete class from
another domain's `-impl` module." Found during the same audit that produced `modules/social/group-impl`'s
ticket A6 (identical pattern).

**Why this exists (confirmed via `git log`, not guessed):** `CommentServiceImpl.java` traces back to
the same early commits (`64cae07`/`499db05`) that predate `CLAUDE.md`'s introduction (`8b85daa`,
several commits later). Same story as A6 in group-impl — the code predates the rule's documentation
and was never retrofitted once the rule existed. All other cross-domain code in this module (e.g.
`PostServiceImpl`'s use of `GroupService`/`UserFriendService`) correctly follows the rule.

**Current usages to replace (2 call sites, both the same pattern):**
```java
String userFullName = userRepository.findById(comment.getUserId())
        .map(User::getFullName)
        .orElse("Unknown User");
```
- `buildPreviewResponse()` (~line 173)
- `mapToResponse()` (~line 200)

Replace both with `userService.getUserById(comment.getUserId())`'s `fullName` — no batch lookup needed
here (unlike A6's `creatorNames` case), since each is a single-comment mapping call; no new `UserService`
method required, `getUserById(UUID)` (`user-api`) already exists and returns a `UserResponse` with
`getFullName()`.

**Note:** `getUserById()` throws `ResourceNotFoundException` if the user doesn't exist, whereas the
current code silently falls back to `"Unknown User"` via `.orElse(...)`. Preserve the existing
fallback behavior — wrap the call (e.g. `try/catch` or a small helper) rather than letting a missing
user break comment rendering; a comment author who was later hard-deleted (if that ever happens) or a
data-integrity edge case shouldn't 500 the whole response.

**Dependency swap:** remove the `UserRepository userRepository` field from `CommentServiceImpl`; add
`UserService userService` (`user-api` — `post-impl` already depends on `user-api`, used correctly
elsewhere in this module by `PostServiceImpl`, no new Gradle dependency needed).

**Gradle change required (confirmed by checking `post-impl/build.gradle` directly, not assumed):**
`CommentServiceImpl` is the only file in this module using `user-impl` internals — once this ticket
lands, remove the now-unnecessary `implementation project(':modules:user:user-impl')` line from
`post-impl/build.gradle` entirely (keep `user-api`, which stays needed).

**Tests:** update `CommentServiceImplSpec` wherever `userRepository` is mocked (2 places) to mock
`userService` instead; add a case confirming the `"Unknown User"` fallback still applies when the
author lookup fails.

**Out of scope:** no change to what data is displayed (same `fullName` value, same fallback string) —
pure architecture-compliance refactor, no new behavior.

---
