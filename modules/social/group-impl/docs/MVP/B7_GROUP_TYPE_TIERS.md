# B7 · Settings data set audit → group-type membership-cap tiers

**Status:** `DONE` (2026-07-20)
**Type:** Enhancement (Audit) → Enhancement (Schema + Enforcement)
**Module:** `modules/social/group-impl`

## Origin

Filed while scoping the client's **GRP-1** ticket (`client/docs/BACKLOG_MVP.md`) — the Groups page
Settings tab needs privacy, member-post permissions, invite permissions, member cap, and group
deletion in one coherent surface, but that data spans two endpoints (`PUT /api/groups/{groupId}` and
`PUT /api/groups/{groupId}/settings`) plus `DELETE /api/groups/{groupId}`. Originally scoped as a
confirm-only audit (no schema change expected).

## Audit findings (original scope items 1–3)

Checked directly against the code, not assumed from prior tickets:

1. **`isPrivate`** — confirmed present and settable on `UpdateGroupRequest` (`group-api`).
2. **Permission model** — confirmed already correct, built in earlier tickets:
   - `updateGroup` — owner **and** admin can write, member gets `BadRequestException`
     (`GroupServiceImpl.java`, `canManageMembers`).
   - `updateGroupSettings` — **owner only** (`isGroupOwner`).
   - `deleteGroup` — **owner only** (`isGroupOwner`).
   - `getGroupSettings` — any member can read (`isGroupMember`).
   Spock coverage was thinner than the ticket asked for — `updateGroup`'s "owner or admin" test only
   exercised the owner path, and `updateGroupSettings` had no admin/member-rejected cases. Added:
   `updateGroup should update group when user is admin`, `updateGroup should persist isPrivate when
   provided`, `updateGroupSettings should throw BadRequestException when user is admin`, `...when
   user is member`.
3. **Decision:** keep the two-endpoint split (client composes one Settings tab from both) — matches
   existing domain boundaries, no schema-change reason to consolidate.

## Scope change (item 4 — the actual finding that mattered)

Item 4 asked to "confirm `maxMembers` has sane validation." It had **none** — `updateGroupSettings`
wrote the raw value straight through, and no code path (join-request accept, invitation accept,
direct add) ever checked member count against it. A cap nobody enforces isn't meaningfully validated
by adding a floor check on the setter, so — decided directly with the user rather than left as a
narrow patch — the manual field was replaced with a fixed-tier system:

- **New `group_types` table** (`id`, `type_name` unique, `max_members`), migration
  `V026__create_group_types_table.sql`, seeded:
  | type_name | max_members |
  |---|---|
  | DEFAULT | 50 |
  | STANDARD | 100 |
  | PREMIUM | 500 |
- **`group_settings.max_members` dropped**, replaced with `group_settings.group_type_id` (`BIGINT
  NOT NULL REFERENCES group_types(id)`). Existing rows backfilled to `DEFAULT`'s id in the same
  migration (`UPDATE ... SET group_type_id = (SELECT id FROM group_types WHERE type_name =
  'DEFAULT')`, run before the `NOT NULL` constraint is added).
- **`GroupServiceImpl.createGroup`** now looks up `DEFAULT` via `GroupTypeRepository.findByTypeName`
  and assigns its id when building the group's `GroupSettings` row — every new group is silently
  `DEFAULT`.
- **`UpdateGroupSettingsRequest.maxMembers` removed** — no manual cap setting anymore. Changing a
  group's type is a separate, not-yet-built flow (filed as **B10** in `BACKLOG_MVP.md`).
- **`GroupSettingsResponse`** gains `groupTypeId`/`groupTypeName`; `maxMembers` stays on the DTO but
  is now resolved from the group's type in `mapToGroupSettingsResponse` (`groupTypeRepository
  .findById(settings.getGroupTypeId())`), not a stored/settable field.
- **Cap enforcement added.** This wasn't in the original B7 scope — raised as an explicit fork with
  the user (a fixed-tier table only matters if something checks against it) and the user chose to
  enforce now rather than defer to B10. New private helper `GroupServiceImpl
  .enforceMemberCapacity(Long groupId)`: loads the group's settings → type → current member count
  (`groupMemberRepository.countByGroupId`), throws `BadRequestException` once count `>=`
  `maxMembers`. Called from the three places that insert a `GroupMember` row: `addMember` (after the
  already-a-member check), `acceptJoinRequest` (after the permission/pending checks), `acceptInvitation`
  (after the invitee/pending checks) — before the role lookup and `save()` in each.

## Addendum (2026-07-20, same day): pessimistic lock on the capacity check

`enforceMemberCapacity`'s count-then-insert was a TOCTOU race: two concurrent calls for the same
group (across instances behind a load balancer, or just two threads on one instance) could both read
the same pre-insert `countByGroupId`, both pass the cap check, and both insert — pushing the group
over its type's `max_members`. Plain `@Transactional` defaults to Postgres's `READ_COMMITTED`, which
doesn't prevent this.

Fixed with a pessimistic row lock: new `GroupSettingsRepository.findByGroupIdForUpdate` (`@Lock
(LockModeType.PESSIMISTIC_WRITE)`, `SELECT ... FOR UPDATE`), used only inside
`enforceMemberCapacity`. The lock is held for the rest of the caller's transaction (`addMember`/
`acceptJoinRequest`/`acceptInvitation`, each already `@Transactional`), so a second concurrent call
for the same group blocks at the lock until the first commits or rolls back, then re-reads the
now-current count — serializing the check-and-insert per group instead of per call. Plain
`findByGroupId` (no lock) is untouched everywhere else — `getGroupSettings`, `updateGroupSettings`,
`createInvitation` — since none of those do a count-then-insert.

`GroupServiceImplSpec`'s six capacity-related mocks (`addMember`, `acceptJoinRequest`,
`acceptInvitation` — one positive + one capacity-exceeded case each) updated from `findByGroupId` to
`findByGroupIdForUpdate`; the other seven `findByGroupId` mocks (`updateGroupSettings`,
`getGroupSettings`, `createInvitation`) are unchanged. `:modules:social:group-impl:test` and the
full-backend compile both green.

## Addendum 2 (2026-07-20, same day): early capacity check on request/invite creation

Before this, a user could submit a join request, or a member could invite someone, into a group
already at capacity — nothing surfaced that until an owner/admin tried to accept it, when it would
silently fail. Added an early, **unlocked** check — `GroupServiceImpl
.checkMemberCapacityNotExceeded(groupId)` — called from `createJoinRequest` (after the
already-pending check) and `createInvitation` (after the already-invited check, only on the path that
creates a new invitation — the "return existing invitation" short-circuit is unaffected). This fails
fast with the same "Group has reached its maximum member capacity of N" message as the accept-time
guard, but does **not** take the pessimistic lock — it's advisory, not authoritative.

`enforceMemberCapacity` (locked, accept-time) and `checkMemberCapacityNotExceeded` (unlocked,
create-time) now share one `checkMemberCapacity(groupId, settings)` helper that does the actual
type-lookup-and-compare, avoiding duplicating that logic across both entry points.

Both are still just checks against a point-in-time count with no reservation — a request/invite can
still be created when there's room and then rejected at accept-time if the group filled up in
between (that race is fine: it's the same "first come, first served" experience). What this closes is
the common case (group already full when the request/invite is made), not the rare race — the race
itself is already what the locked `enforceMemberCapacity` guards against, at the point that actually
matters (the `GroupMember` insert).

`GroupServiceImplSpec`: new `createJoinRequest should throw BadRequestException when group is at its
member cap` and `createInvitation should throw BadRequestException when group is at its member cap`;
the two existing positive tests (`createJoinRequest should create join request successfully`,
`createInvitation should create invitation when all guards pass`) extended with the new mocks —
`createInvitation`'s now expects `2 * groupSettingsRepository.findByGroupId(testGroup.id)` (once for
the `allowMemberInvites` check, once inside the capacity check).

## Addendum 3 (2026-07-20, same day): groupName conflict translated at save-time

Prompted by re-examining whether `updateGroup`/`updateGroupSettings` need the same pessimistic-lock
treatment as the capacity check. They don't — every field except `groupName` is a plain overwrite
with no shared invariant to protect (unlike the member-cap counter, last-write-wins is fine). But
`groupName` has the same check-then-set shape (`existsByGroupName` → set) with a narrow TOCTOU
window: two concurrent renames to the same new name could both pass the check before either commits.

Not a data-integrity bug — `groups.group_name` already has a DB-level `UNIQUE NOT NULL` constraint,
so the race can't produce two same-named groups. But the race loser's `save()` was throwing an
uncaught `DataIntegrityViolationException`, which `GlobalExceptionHandler`'s generic
`Exception`-catch-all turns into an opaque 500 "An unexpected error occurred" — instead of the same
friendly "Group name already exists" 400 the pre-check gives a non-racing conflict.

Fixed by wrapping just the `groupRepository.save(group)` call in `updateGroup` in a
`try`/`catch (DataIntegrityViolationException e)`, re-thrown as `BadRequestException("Group name
already exists")`. Scoped to this one `save()` call, not the whole method, so it doesn't mask
unrelated failures. Safe to catch broadly here because `group_name` is confirmed the *only* unique
constraint on the `groups` table (checked `Group.java` and `V008__create_groups_table.sql`) — no
other constraint violation could reach this catch block.

Two new `GroupServiceImplSpec` tests: the existing pre-check path (`should throw
BadRequestException when new group name already exists`, not previously tested despite the audit
flagging it) and the new race path (`should translate a concurrent groupName conflict at save-time
into BadRequestException`, mocking `groupRepository.save` to throw
`DataIntegrityViolationException` and asserting the translated message). Both green;
`:modules:social:group-impl:test` and full backend compile also green.

## Addendum 4 (2026-07-20, same day): dropped groupTypeId from GroupSettingsResponse

`GroupSettingsResponse` originally gained both `groupTypeId` and `groupTypeName`. Corrected: `groupTypeId`
removed — there's no update path that consumes it (B10, the type-change flow, isn't built), so it
was dead response surface. `groupTypeName` (display) and `maxMembers` (resolved cap) stay, since
GRP-2's Settings tab needs those to show the group's tier. `mapToGroupSettingsResponse` no longer
sets it. No test changes needed — nothing asserted on `GroupSettingsResponse.groupTypeId` (the
`GroupSettings` *entity*'s `groupTypeId` field, used throughout the Spock fixtures for the
`group_settings` row itself, is unaffected and unrelated).

## New files

- `server/src/main/resources/db/changelog/changes/V026__create_group_types_table.sql`
- `modules/social/group-impl/src/main/java/com/sportconnect/group/entity/GroupType.java`
- `modules/social/group-impl/src/main/java/com/sportconnect/group/repository/GroupTypeRepository.java`

## Modified files

- `modules/social/group-impl/src/main/java/com/sportconnect/group/entity/GroupSettings.java` —
  `maxMembers` → `groupTypeId`.
- `modules/social/group-api/src/main/java/com/sportconnect/group/api/dto/UpdateGroupSettingsRequest.java`
  — `maxMembers` field removed.
- `modules/social/group-api/src/main/java/com/sportconnect/group/api/dto/GroupSettingsResponse.java`
  — gained `groupTypeId`, `groupTypeName`.
- `modules/social/group-impl/src/main/java/com/sportconnect/group/service/GroupServiceImpl.java` —
  constructor gains `GroupTypeRepository`; `createGroup`, `updateGroupSettings`,
  `mapToGroupSettingsResponse` updated; new `enforceMemberCapacity` helper wired into `addMember`,
  `acceptJoinRequest`, `acceptInvitation`.
- `server/src/main/resources/db/changelog/db.changelog-master.xml` — registers V026.
- `modules/social/group-impl/src/main/java/com/sportconnect/group/repository/GroupSettingsRepository.java`
  — new `findByGroupIdForUpdate` (pessimistic write lock), see addendum below.

## Tests

`GroupServiceImplSpec` (`modules/social/group-impl/src/test/groovy/...`):
- New `defaultGroupType` fixture in `setup()`.
- `createGroup` — asserts the saved `GroupSettings.groupTypeId` matches `DEFAULT`'s id.
- `updateGroup should update group when user is admin` (new — closes the admin-positive coverage
  gap the audit found).
- `updateGroup should persist isPrivate when provided` (new).
- `updateGroupSettings should update settings when user is owner` — now asserts `response
  .maxMembers`/`groupTypeName` resolve from the type lookup.
- `updateGroupSettings should throw BadRequestException when user is admin` / `...when user is
  member` (new — closes the negative-coverage gap the audit found).
- `getGroupSettings should return settings when caller is a member` — now asserts resolved
  `maxMembers`.
- `addMember`, `acceptJoinRequest`, `acceptInvitation` positive cases — extended with the capacity
  check's mocks (`groupSettingsRepository.findByGroupId`, `groupTypeRepository.findById`,
  `groupMemberRepository.countByGroupId`).
- Three new capacity-exceeded negative cases: `addMember should throw BadRequestException when group
  is at its member cap`, `acceptJoinRequest should throw BadRequestException when group is at its
  member cap`, `acceptInvitation should throw BadRequestException when group is at its member cap`
  — each asserts `0 * groupMemberRepository.save(_)`.

## Verification

- `./gradlew :modules:social:group-impl:test --tests GroupServiceImplSpec` — green.
- `./gradlew :modules:social:group-impl:test` (full module) — green.
- `./gradlew compileJava compileTestJava compileTestGroovy` (whole backend) — green, confirms no
  breakage in `server`'s `GroupControllerTest` (which builds `GroupSettingsResponse`/
  `UpdateGroupSettingsRequest` directly but never referenced `maxMembers`, so it compiles unchanged).
- `:server:test` (`GroupControllerTest`, Testcontainers-backed) **not run** — this environment has no
  Docker daemon available (confirmed via `docker info`), a pre-existing environment limitation
  unrelated to this change, not something this ticket introduced.
- No live `bootRun` walkthrough this session — flagged as a follow-up before/at **B10** pickup,
  since B10 is the ticket that will actually exercise a group hitting its cap end-to-end via the API.

## Client impact

`client/docs/BACKLOG_MVP.md`'s **GRP-2** (blocked on B7) can now wire the Settings tab's member-cap
display against `GroupSettingsResponse.maxMembers`/`groupTypeName` — read-only, no UI for changing it
until **B10** ships.

---

**Status:** `DONE`  
**Type:** Enhancement (Audit / Contract) → Enhancement (Schema + Enforcement)  
**Origin:** raised while scoping the client's GRP-1 ticket (`client/docs/BACKLOG_MVP.md`) — the new
Groups page Settings tab needs privacy, member-post permissions, invite permissions, member cap, and
group deletion all in one coherent surface, but that data is currently split across two endpoints
(`PUT /api/groups/{groupId}` for name/description/rules/schedule/**isPrivate**, `PUT
/api/groups/{groupId}/settings` for `allowMemberPosts`/`requirePostApproval`/`allowMemberInvites`/
`maxMembers`) plus `DELETE /api/groups/{groupId}` for deletion.

**Audit findings (original scope, items 1–3):**
1. `isPrivate` **confirmed present and settable** on `UpdateGroupRequest` — real DTO, not just the
   entity field.
2. Permission model **confirmed already correct** going in (built in earlier tickets, not new work):
   `updateGroup` — owner **and** admin write, member rejected; `updateGroupSettings` — **owner
   only**; `deleteGroup` — **owner only**; `getGroupSettings` — any member can read. Spock coverage
   was thinner than the model it verified — added missing admin-positive case for `updateGroup`,
   `isPrivate`-persistence case, and owner/admin/member cases for `updateGroupSettings`.
3. **Decision:** kept the two-endpoint split as-is (matches existing domain boundaries, no reason
   found to consolidate).

**Scope change (item 4 — `maxMembers` validation):** the audit found `maxMembers` was stored on
`group_settings` but **never validated or enforced anywhere** — not on write, not at join time. Fixing
this by re-checking the raw value wasn't enough to make the cap meaningful, so it was replaced
entirely with a fixed-tier system, decided directly with the user rather than left as a client
follow-up:
- New `group_types` table (`id`, `type_name`, `max_members`), seeded with **DEFAULT** (50),
  **STANDARD** (100), **PREMIUM** (500) — migration `V026__create_group_types_table.sql`.
- `group_settings.max_members` **dropped**; replaced with `group_settings.group_type_id` (FK, not
  null). Existing rows backfilled to `DEFAULT` in the same migration. New groups are silently
  created as `DEFAULT` in `GroupServiceImpl.createGroup`.
- `UpdateGroupSettingsRequest.maxMembers` **removed** — no more manual cap setting. Changing a
  group's type is out of scope here, tracked as **B10** below.
- `GroupSettingsResponse` gains `groupTypeId`/`groupTypeName`; `maxMembers` is now a read-only value
  resolved from the group's type, not a stored/settable field.
- **Cap enforcement added** (explicit user decision — a cap nobody checks is pointless): new
  `GroupServiceImpl.enforceMemberCapacity(groupId)` helper, called from every path that inserts a
  `GroupMember` row — `addMember`, `acceptJoinRequest`, `acceptInvitation` — rejecting with
  `BadRequestException` once the group is at its type's `max_members`.

**Out of scope:** no UI work (client follow-up is **GRP-2**, `client/docs/BACKLOG_MVP.md`, blocked on
this ticket); no way to change a group's type after creation (**B10**, below).

---
