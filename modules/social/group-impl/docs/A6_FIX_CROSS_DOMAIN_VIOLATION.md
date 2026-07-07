# A6 · Fix cross-domain violation (UserRepository/User → UserService/UserFriendService)

**Status:** DONE
**Module:** `modules/social/group-impl`
**Date:** 2026-07-02

## What was built

Replaced `GroupServiceImpl`'s direct dependency on `user-impl` internals
(`com.sportconnect.user.entity.User`, `com.sportconnect.user.repository.UserRepository`) with the
proper `user-api` interfaces (`UserService`, `UserFriendService`), fixing this repo's core
architecture rule violation ("cross-domain calls through `-api` interfaces only").

- Removed the `UserRepository userRepository` field; added `UserService userService` and
  `UserFriendService userFriendService` (both `user-api`)
- New method on `UserService`: `Map<UUID, UserResponse> getUsersByIds(List<UUID> userIds)`,
  implemented in `UserServiceImpl` via `userRepository.findAllById(userIds)` — no `isActive`
  filter, missing ids simply absent from the map, no exception thrown
- All 5 call sites in `GroupServiceImpl` now use this single batched method instead of
  `userRepository.findById`/`findAllById`, and 3 of them were consolidated from 2 lookups into 1:
  - `getPublicGroups` — creator names batch lookup
  - `mapToGroupResponse` — single-id lookup
  - `mapToGroupMemberResponse` — **consolidated** fullName + avatarUrl into 1 call (was 2)
  - `mapToJoinRequestResponse` — **consolidated** requester + reviewer into 1 call (was up to 3)
  - `mapToGroupInvitationResponse` — **consolidated** inviter + invitee into 1 call (was 2)
- Enabled the friends-only invite gate in `createInvitation()`: `userFriendService.areFriends(inviterId, inviteeId)`,
  previously stubbed out pending U1 (friendship system), which is now `DONE`
- `group-impl/build.gradle`: swapped `implementation project(':modules:user:user-impl')` for
  `implementation project(':modules:user:user-api')`; removed the now-unnecessary
  `testImplementation 'org.locationtech.jts:jts-core:1.19.0'` line (verified tests still compile
  without it — it was only needed to resolve `User`'s JTS `location` field transitively)

## Key decisions

- **Batch method everywhere, not `getUserById` + try/catch.** `UserService.getUserById()` throws
  `ResourceNotFoundException` on a missing/inactive user, which would have changed the ticket's
  intended "no behavior change" — the current code's `orElse("Unknown User")` pattern silently
  degrades even for soft-deleted users (`findById` has no `isActive` filter). Rather than wrapping
  every call site in a try/catch (the approach used in the sibling ticket, post-impl's A5), a new
  batch-capable `getUsersByIds()` was added and used uniformly, including for single-id lookups
  (called with a singleton list). This exactly replicates the old semantics (missing id → absent
  from map → same fallback string) with no exception path at all, and cuts several 2-3-call sites
  down to one call each.
- **`getUsersByIds` does not filter `isActive`**, unlike `getUserById`/`getUserByEmail`/etc. This
  intentionally preserves the pre-existing (arguably buggy) behavior where a soft-deleted user's
  real name still displays in group/member/invitation responses — fixing that is out of scope per
  the ticket.

## Non-obvious constraints

- No change to what data is displayed for any existing behavior — same fields, same values, same
  `"Unknown User"`/`null` fallbacks. The only actual behavior change is the new friends-only invite
  gate, which was always the intended B1 behavior once U1 shipped.
- `group-impl` had zero prior dependency on `user-api` (its only connection to the user domain was
  the improper `user-impl` project dependency) — confirmed by reading `build.gradle` directly before
  editing.

## Tests

Updated `GroupServiceImplSpec.groovy`:
- Replaced `UserRepository userRepository = Mock()` → `UserService userService = Mock()` +
  `UserFriendService userFriendService = Mock()`; replaced the `User testUser` entity fixture with a
  `UserResponse` fixture
- Converted ~19 mock interaction lines from `findById`/`findAllById` to `getUsersByIds` returning a
  `Map<UUID, UserResponse>`
- Added 1 new test: `createInvitation` throws `BadRequestException` when inviter and invitee are not
  friends; updated the existing "all guards pass" and "duplicate pending invitation" tests to mock
  `userFriendService.areFriends(...) >> true` since they now pass through the new gate

Run: `./gradlew :modules:social:group-impl:test` — all pass. Also verified: full `./gradlew build -x test`
succeeds, and `:server:bootRun` reaches Liquibase/DB connection (no bean-wiring errors) confirming
the new `UserService`/`UserFriendService` injection resolves correctly.

**Known pre-existing, unrelated failure:** `server/src/test/java/com/sportconnect/integration/GroupControllerTest.java`
fails to compile (`getPublicGroups(any())` called with 1 arg against the 4-arg interface signature from
the already-`DONE` B5 ticket). This predates A6 — confirmed via `git diff` showing it was already
modified/broken in the working tree before this ticket started — and is out of scope here.
