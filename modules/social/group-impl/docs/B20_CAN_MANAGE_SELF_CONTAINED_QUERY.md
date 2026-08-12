# B20 · Make `canManageMembers`/`canManagePosts` self-contained instead of composing `isGroupOwner`/`isGroupAdmin`

**Status:** DONE (2026-08-12)
**Type:** Refactor (Efficiency)

## Context

Filed 2026-08-12, surfaced in conversation while reviewing whether `canManageMembers` double-checks
`group.isActive` (B18). It does — redundantly. `canManageMembers(groupId, userId)` is
`isGroupOwner(groupId, userId) || isGroupAdmin(groupId, userId)`, and both `isGroupOwner` and
`isGroupAdmin` independently:

1. call `isGroupActive(groupId)` as their first line, and
2. call `groupMemberRepository.findByGroupIdAndUserId(groupId, userId)` to fetch the caller's
   membership row, and
3. call `groupRoleRepository.findByRoleName(...)` to resolve their respective role.

The `||` short-circuits on step 1 succeeding for `isGroupOwner`, but whenever the caller is *not*
the owner (including non-members), `isGroupAdmin` runs too — re-issuing the exact same
`existsByIdAndIsActiveTrue` and `findByGroupIdAndUserId` queries a second time for no new
information. Same issue for `canManagePosts` (identical composition).

## Why fix it

Confirmed with the user before implementing:
- Not a correctness bug — the composed result is right, just wasteful (extra DB round-trips per
  call, doubled on every non-owner caller).
- `isGroupOwner`/`isGroupAdmin` themselves stay untouched and keep their own gate + queries — they
  have standalone callers with no `canManageMembers` involvement (`GET
  /api/groups/{groupId}/permissions/is-owner` / `/is-admin`, B7's group-type tier logic per
  `docs/B7_GROUP_TYPE_TIERS.md`). Checked whether the client consumes those two endpoints before
  touching anything — it doesn't (`client/src` has no reference to `/permissions/is-owner` or
  `/permissions/is-admin`; the only mention is a *planned* future check in
  `client/docs/sporthub-auth-feed-integration-tickets.md` for a not-yet-built "create broadcast"
  action). So this refactor has zero client-facing behavior change to worry about, and no risk of
  breaking an already-shipped consumer of the standalone endpoints.
- `canManageMembers`/`canManagePosts` have no standalone controller endpoint of their own — they're
  internal gates called from ~13 sites across member management, pinned posts, and invitations (see
  `CLAUDE.md`'s Endpoints table and `GroupServiceImpl` call sites). Nothing external depends on
  their *query pattern*, only their boolean result — safe to reshape internally.

## What was built

`GroupServiceImpl`: `canManageMembers` and `canManagePosts` no longer compose `isGroupOwner` /
`isGroupAdmin`. Both now delegate to a new private helper, `hasManagerRole(Long groupId, UUID
userId)`:

- one `isGroupActive(groupId)` check (was up to two)
- one `groupMemberRepository.findByGroupIdAndUserId(groupId, userId)` (was up to two)
- one `groupRoleRepository.findById(member.getRoleId())` — a primary-key lookup, mirroring the
  existing pattern already used by `getUserRoleInGroup` — with the resulting role name compared
  against `"group_owner"`/`"group_admin"` (was up to two `findByRoleName(...)` calls)

`isGroupOwner`, `isGroupAdmin`, `isGroupMember`, `isGroupActive` are unchanged — same signature,
same behavior, same standalone callers as before.

## Tests

`GroupServiceImplSpec` — every existing test that exercises a `canManageMembers`/`canManagePosts`
call site (pin/unpin post, member add/remove/role-update, transfer-ownership related invitation
flows, join-request/invitation permission checks, group settings and general-data updates, etc.)
was updated so its `groupRoleRepository` stubbing matches the new `findById(roleId)` call instead
of (or in addition to) `findByRoleName(...)`. Two stale comments describing the old
`isGroupOwner`-short-circuits-`canManageMembers` behavior (previously at the call sites now
routed through `hasManagerRole`) were updated to describe the single-lookup behavior instead. No
test asserted on the *return value* differently — this is a pure internal-query-shape change, so
no test's `given`/`when`/`thrown` sections changed, only `then` mock interaction stubs/cardinality.

New coverage: direct tests for `canManageMembers`/`canManagePosts` (previously only exercised
indirectly through callers) covering owner, admin, plain member (denied), non-member (denied), and
soft-deleted group (denied, role lookup never reached) cases.

## Verification

- `./gradlew :modules:social:group-impl:test` — all tests pass.

## Out of scope

`isGroupOwner`/`isGroupAdmin`/`isGroupMember`/`isGroupActive` themselves (unchanged, still used
standalone); the client `/permissions/is-owner`/`is-admin` consumption noted in
`client/docs/sporthub-auth-feed-integration-tickets.md` for the future "create broadcast" action
(not built yet, not affected by this refactor either way).

## Follow-up: post-impl consumer migration (same session)

Immediately after this shipped, the user spotted that `modules/social/post-impl`'s
`PostServiceImpl` had four of its own call sites composing
`groupService.isGroupOwner(...) || groupService.isGroupAdmin(...)` — exactly the pattern just
eliminated inside `group-impl` itself. Migrated all four
(`createPost`/`updatePost`/`deletePost`/`updateBroadcastEndTime`) to call the now-existing
`canManagePosts(groupId, userId)` cross-domain method instead. Full writeup:
`modules/social/post-impl/docs/BACKLOG_MVP.md`, ticket **A16**.
