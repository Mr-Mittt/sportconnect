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
