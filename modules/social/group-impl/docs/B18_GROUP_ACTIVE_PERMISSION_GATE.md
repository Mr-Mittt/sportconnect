# B18 · Require `group.isActive` in `isGroupMember`/`isGroupOwner`/`isGroupAdmin`; add `isGroupActive()`

**Status:** DONE (2026-08-11)
**Type:** Bug Fix (Security/Correctness)

## Context

Filed 2026-08-11, surfaced while designing `post-impl`'s A14 and
`documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` §5.1. `deleteGroup` is a soft-delete
(`group.setIsActive(false)`) that never touches `group_members` rows, but
`isGroupMember`/`isGroupOwner`/`isGroupAdmin` never checked `group.isActive` — a former member of
a since-soft-deleted group could still pass every one of these live gates (create `GROUP_POST`s in
it, have owner/admin status honored to moderate posts in it, list its posts, pass
`session-impl`'s group-linked-session gate).

## Design (approved plan, restated — diverges from the ticket's two literal suggestions)

The ticket's own text offered two implementation options ("fetch the `Group` first ... or join
`is_active` into the existing membership/role query") without resolving which, and Phase 2
exploration found **both would have broken a large swath of the existing 143-test
`GroupServiceImplSpec` for reasons the ticket didn't anticipate**:

- `GroupRepository.findByIdAndIsActiveTrue` (the "fetch the Group first" option) is already used
  at 5 other call sites in `GroupServiceImpl` (`getGroup`, `updateGroup`, `deleteGroup`,
  `getGroupSettings`, `createInvitation`), several of which fetch the group this way and then
  immediately call `canManageMembers` (→ `isGroupOwner`/`isGroupAdmin`) in the same method. ~30
  existing tests assert `1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id)` (exactly
  once) — reusing that same method inside the three permission checks would have doubled the call
  count in those paths and broken those assertions, for a group that's already been confirmed
  active by that point.
- `groupMemberRepository.findByGroupIdAndUserId`/`existsByGroupIdAndUserId` (the "join into the
  existing query" option) are also used directly by 5 unrelated call sites (`transferOwnership`,
  `addMember`, `createInvitation`, etc.), and 130 lines across the test spec already stub these
  exact methods as the mechanism for permission-gating in unrelated feature tests.

**What was built instead:** a new, deliberately distinct `GroupRepository.existsByIdAndIsActiveTrue(Long id)`
(plain Spring Data derived query), used only by the new `isGroupActive(Long groupId)` and, through
it, by `isGroupOwner`/`isGroupAdmin`/`isGroupMember`. Being a brand-new method name, it collides
with neither the `findByIdAndIsActiveTrue` cardinality assertions nor the `GroupMemberRepository`
stubs — the only test-suite change needed for backward compatibility was **one line in `setup()`**:

```groovy
groupRepository.existsByIdAndIsActiveTrue(_) >> true
```

Confirmed by running the suite both before and after this stub: without it, 74 of 143 tests failed
(every test that indirectly exercises a permission check, since an unstubbed `boolean` Mock() call
defaults to `false`); with it, all 143 passed unchanged. Spock resolves interactions in reverse
declaration order, so the handful of new dedicated tests below override this default per-case with
their own more specific stub.

`isGroupActive` is **interface-only, no controller endpoint** — confirmed with the user before
implementing. It has no caller-identity component (unlike `isGroupOwner`/`isGroupAdmin`/
`isGroupMember`, which the controller already exposes at `/permissions/is-owner`/`is-admin`/
`is-member` for a caller checking their own standing), so its only intended callers are same-JVM
cross-domain `-api` consumers — the same shape as the existing
`getGroupsWithAutoGenerateSessionsEnabled`, which is also interface-only.

## What was built

- **`GroupRepository`** — new `boolean existsByIdAndIsActiveTrue(Long id)`.
- **`GroupService` (`group-api`)** — new `boolean isGroupActive(Long groupId)`, with Javadoc
  pointing at its intended cross-domain callers; Javadoc added to the three existing methods
  noting the new soft-delete behavior.
- **`GroupServiceImpl`** — `isGroupActive` implemented via the new repository method;
  `isGroupOwner`/`isGroupAdmin`/`isGroupMember` each prepend `if (!isGroupActive(groupId)) return false;`
  before their existing logic. `canManageMembers`/`canManagePosts` (both compose `isGroupOwner`/
  `isGroupAdmin`) inherit the fix for free, with no change needed to either. `getUserRoleInGroup`
  was left unchanged — out of scope, not named in the ticket.
- **Tests** — 8 new Spock cases in `GroupServiceImplSpec`: `isGroupOwner`/`isGroupAdmin`/
  `isGroupMember` each get a "returns false for a soft-deleted group, even when the user would
  otherwise pass" case (asserting the role/membership lookup is never reached —
  `0 * groupRoleRepository.findByRoleName(_)` etc. — confirming the short-circuit, not just the
  return value); `isGroupAdmin`/`isGroupMember` also gained the direct happy-path tests they were
  previously missing (only reachable before via indirection through other features'
  `canManageMembers` checks). `isGroupActive` gets 3 cases: active, soft-deleted, non-existent
  `groupId`.

## Verification

- Implemented and verified incrementally, per an explicit user request to "verify one by one"
  rather than as one combined change: added the repository/service methods first (compiled clean,
  zero test impact since nothing called them yet), wired them into the three permission checks and
  confirmed the predicted 74/143 failures, added the `setup()` stub and confirmed all 143 passed
  again unchanged, then added the 8 new dedicated tests and confirmed 151/151 passed.
- `./gradlew :modules:social:group-impl:test` — 151 tests, 0 failures.
- `./gradlew :server:bootRun` — booted cleanly (`Started SportConnectApplication in 12.7s`).
- `./gradlew :server:test` — pass, including `GroupControllerTest`'s 26 MockMvc-based integration
  tests (real controller layer against these permission endpoints).
- **Live end-to-end walkthrough against a running `bootRun` instance and the real dev Postgres**,
  reproducing the exact bug: registered a user, created a `UserSportProfile`, created a group
  (auto-assigned owner) — confirmed `/permissions/is-owner` and `/permissions/is-member` both
  returned `true`. Soft-deleted the group via the existing `DELETE /api/groups/{groupId}` (owner
  path). Re-checked `/permissions/is-owner`, `/permissions/is-admin`, `/permissions/is-member` —
  all three now correctly return `false` (would have stayed `true` for `is-owner`/`is-member`
  before this fix). Also confirmed a non-existent `groupId` still returns `false`, unchanged.

No N+1 concern — these are single-item permission checks, not batch mappers or loops.

## Out of scope (unchanged from ticket)

`post-impl`'s A14 itself (its future `PostGate.isAvailable` will consume `isGroupActive`, but
that's its own ticket); any change to `deleteGroup`'s own soft-delete behavior (already correct);
hard-delete of a `Group` row (doesn't exist today, not introduced here); `getUserRoleInGroup`
(not named in the ticket, left unchanged).
