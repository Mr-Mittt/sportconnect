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

---

**Status:** `DONE`  
**Type:** Bug Fix (Architecture)  
**Scope:** `GroupServiceImpl.java` only

`GroupServiceImpl` directly imports and injects `com.sportconnect.user.entity.User` and
`com.sportconnect.user.repository.UserRepository` — both internal classes of `user-impl`, not the
`user-api` interface. This violates this repo's core architecture rule (root `CLAUDE.md`):
"Cross-domain communication through `-api` interfaces only — never import a concrete class from
another domain's `-impl` module."

**Why this exists (confirmed via `git log`, not guessed):** `GroupServiceImpl.java` was committed in
`64cae07`, which predates `CLAUDE.md` itself — first added in `8b85daa`, several commits later. This
isn't a case of the rule being ignored; the rule didn't exist yet when this code was written, and it
was never retrofitted afterward. Every ticket since (B1–B6b, A1–A5 in this module, plus all `post-impl`/
`user-impl` work) has correctly followed the rule for new code — the violation is confined to this
pre-existing file.

**Current usages to replace (10 call sites):**
- Single-user lookups by ID — `createdByFullName`, `userFullName`, `userAvatarUrl` (×2, in join-request
  mapping), `inviterFullName`, `inviteeFullName` — replace `userRepository.findById(id)` with
  `userService.getUserById(id)` (from `user-api`'s `UserService`), which already returns a
  `UserResponse` carrying `fullName`/`avatarUrl`.
- Batch lookup — `creatorNames = userRepository.findAllById(creatorIds)` — no existing `UserService`
  method does this in one call. **New method needed on `UserService` (`user-api`):**
  `Map<UUID, UserResponse> getUsersByIds(List<UUID> userIds)`, implemented in `UserServiceImpl` via a
  new `UserRepository.findAllById()`-backed batch query — stays inside `user-impl`; only the `Map<UUID,
  UserResponse>` return type crosses the domain boundary.
- The commented-out friend check in `createInvitation()` (lines ~834–837) — inject `UserFriendService`
  (`user-api`) and enable:
  ```java
  if (!userFriendService.areFriends(inviterId, inviteeId)) {
      throw new BadRequestException("You can only invite your friends");
  }
  ```
  This was always the intended B1 behavior — it was left stubbed only because U1 (friendship system)
  didn't exist yet at the time. U1 is now `DONE`.

**Dependency swap:** remove the `UserRepository userRepository` field from `GroupServiceImpl`; add
`UserService userService` and `UserFriendService userFriendService` (both `user-api`).

**Gradle change required (confirmed by checking `group-impl/build.gradle` directly, not assumed):**
`group-impl` currently has **no dependency on `user-api` at all** — its only connection to the user
domain today is the improper `implementation project(':modules:user:user-impl')` line. This ticket
must:
- Remove `implementation project(':modules:user:user-impl')`
- Add `implementation project(':modules:user:user-api')`
- Re-check whether the `testImplementation 'org.locationtech.jts:jts-core:1.19.0'` line (currently
  commented `// JTS needed by Groovy compiler when resolving User entity fields transitively`) is still
  needed afterward — it was only there because tests had to understand `User`'s internal JTS-based
  `location` field; once mocking switches to `UserService`/`UserResponse` (which doesn't expose JTS
  types), this may become removable too. Don't remove it speculatively — verify the test suite still
  compiles without it before deleting.

**Tests:** update `GroupServiceImplSpec` wherever `userRepository` is currently mocked (~10 places) to
mock `userService`/`userFriendService` instead; add new cases for the friends-only invite gate
(non-friend invite → `BadRequestException`; friend invite → succeeds).

**Out of scope:** no change to what data is displayed (same fields, same values) — this is an
architecture-compliance refactor plus one net-new behavior change (enabling the friends-only invite
gate that B1 always intended).

---
