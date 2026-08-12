# Group Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/group-impl`  
**Last updated:** 2026-07-25

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | A1 | JWT-based identity | `DONE` |
| 2 | A3 | Cancel join request | `DONE` |
| 3 | B6b | Group info fields | `DONE` |
| 4 | B2 | Group–Sport association + UserSpace | `DONE` |
| 5 | B5 | Group search & discovery | `DONE` |
| 6 | B3 | Three post types | `DONE` |
| 7 | B6a | Pinned posts | `DONE` |
| 8 | B1 | Member invitation flow | `DONE` |
| 9 | A5 | Test coverage gaps | `DONE` |
| 10 | A6 | Fix cross-domain violation (UserRepository/User → UserService/UserFriendService) | `DONE` |
| 11 | A7 | Fix N+1 queries in paginated list mappers | `DONE` |
| 12 | A8 | Fix N+1 in getUserGroups | `DONE` |
| 13 | A9 | Add privacy/membership check to `getGroup` | `DONE` |
| 14 | B8 | Extend member-sent invitations to include owner-approved status | `DONE` |
| 15 | B7 | Settings data set audit → group-type membership-cap tiers | `DONE` |
| 16 | B9 | Group system posts — welcome post on member join | `DONE` |
| 17 | A10 | Add multi-value `sportIds` filter to `GET /api/groups/public` — unblocks client GRP-6 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 18 | B11 | Reconcile join-request/invitation race conditions — blocks client GRP-7 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 19 | B12 | Cancel a sent invitation while still `pending_owner` — unblocks a client GRP-7 addendum (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 20 | B13 | Persist a rejection reason on invitee-declined invitations — unblocks client GRP-8 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 21 | B14 | Track every co-inviter on a single group invitation — unblocks client GRP-8 | `DONE` |
| 22 | B15 | Add sportId to GroupInvitationResponse — unblocks client GRP-8 | `DONE` |
| 23 | GROUP-RECUR-1 | Recurring-session schedule config, alongside `modules/session` and `modules/location` | `DONE` |
| 24 | B16 | Partial index on `groups.sport_id` for public-group search | `DONE` |
| 25 | B17 | Drop DB-level FKs on group-impl tables' cross-domain columns | `DONE` |
| 26 | B18 | Require `group.isActive` in `isGroupMember`/`isGroupOwner`/`isGroupAdmin`; add `isGroupActive()` | `DONE` |
| 27 | B19 | Dedicated `PUT /{groupId}/generalData` endpoint — unblocks client GRP-9 (`client/docs/BACKLOG_MVP.md`) | `DONE` |

---

## Tickets

### GROUP-RECUR-1 · Recurring-session schedule config
**Status:** `DONE`
**Type:** Feature (part of a larger effort — see `documentation/md/SESSION_LOCATION_DESIGN.md`)
**Scope:** `Group` entity (+4 nullable structured recurrence fields, `schedule` TEXT untouched),
`GroupSettings.autoGenerateSessions`, three new `GroupService` methods
(`getGroupRecurrence`/`updateGroupRecurrence`/`getGroupsWithAutoGenerateSessionsEnabled`),
`GET`/`PUT /api/groups/{groupId}/recurrence`, migrations V033–V034.

Adds a structured, machine-readable recurring-session rule to `Group` (day-of-week, time,
duration, `recurrenceLocationId`) alongside the existing free-text `schedule` — `schedule` stays
as owner-editable prose, these new fields are what the session-generation job (SESSION-2, not yet
built — see `modules/session/docs/BACKLOG_MVP.md`) reads. `updateGroupRecurrence` validates (via
a new, narrow `location-api` dependency) that `recurrenceLocationId`'s sport matches the group's
`sportId` — the same sport-match rule `SessionServiceImpl` enforces at session creation, just
checked once at configuration time. `getGroupsWithAutoGenerateSessionsEnabled` is internal-only
(not exposed via the controller), batch-resolves groups + owners in two queries (no N+1) via a
new `GroupMemberRepository.findByGroupIdInAndRoleId` batch method.

---

### B16 · Partial index on `groups.sport_id` for public-group search
**Status:** `DONE` (2026-08-10) · **Summary:**
`modules/social/group-impl/docs/B16_GROUPS_SPORT_ID_PARTIAL_INDEX.md`
**Type:** Performance (DB only — no service/entity/controller changes)

**Filed:** 2026-08-01, found auditing `sport_id`-as-filter indexing across the app (client-side
discussion, `client/docs/BACKLOG_MVP.md`). `V015__add_sport_id_to_groups.sql` added the column with
**no index at all**, and it still has none today — confirmed by reading every migration touching
`groups`, not assumed. Meanwhile every real consumer of it — `GroupRepository.searchPublicGroupsWithCounts`/
`searchPublicGroupsAnon` (A10's `getPublicGroups`, both branches) — filters the exact same
`g.isActive = true AND g.isPrivate = false AND (:sportIds IS NULL OR g.sportId IN :sportIds)` shape.
(The older derived method `findByIsActiveTrueAndIsPrivateFalseAndSportId` still exists in the
repository but appears superseded by A10's list-based queries — worth confirming/removing as dead
code while in this file, not a required part of this ticket.)

**Migration:**
```sql
CREATE INDEX idx_groups_sport_id_public_active ON groups(sport_id)
    WHERE is_active = true AND is_private = false;
```
A **partial** index, not a plain one — it excludes private/inactive groups entirely rather than
indexing every row and filtering afterward, matching the query's actual predicate exactly (same
technique already precedented by `idx_sessions_status_scheduled_start`'s shape). Register in
`db.changelog-master.xml` per the usual convention.

**No code changes** — the query methods already filter exactly what the partial predicate covers;
this is a pure index addition, nothing to change in `GroupRepository`/`GroupServiceImpl`.

**Verification (no new Spock tests — there's no new logic to unit-test):** run against a real
Postgres instance, `EXPLAIN ANALYZE` the actual `searchPublicGroupsWithCounts`/`searchPublicGroupsAnon`
SQL with a populated `groups` table and confirm the planner picks the new index (bitmap or plain
index scan) rather than a sequential scan.

### B17 · Drop DB-level FKs on group-impl tables' cross-domain columns
**Status:** `DONE` (2026-08-11) · **Summary:**
`modules/social/group-impl/docs/B17_DROP_GROUP_TABLES_CROSS_DOMAIN_FKS.md`
**Type:** Enhancement (Architecture)

**Filed:** 2026-08-10, as part of a repo-wide sweep for cross-domain DB-level FKs, following the
precedent set by `post-impl`'s A13 (`posts.sport_id`, `TODO`) — same rationale, applied
domain-by-domain.

**Found:** five `group-impl`-owned columns carry a real Postgres FK across into a different
domain's table, confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database:
- `groups.created_by` → `groups_created_by_fkey` (into `user-impl`'s `users`, `ON DELETE CASCADE`)
- `groups.recurrence_location_id` → `groups_recurrence_location_id_fkey` (into `location-impl`'s
  `locations`, `NO ACTION`)
- `group_members.user_id` → `group_members_user_id_fkey` (into `users`, `ON DELETE CASCADE`)
- `group_join_requests.user_id` → `group_join_requests_user_id_fkey` (into `users`, `ON DELETE CASCADE`)
- `group_join_requests.reviewed_by` → `group_join_requests_reviewed_by_fkey` (into `users`, `NO ACTION`)

All predate root `CLAUDE.md`'s "cross-domain references use IDs only" rule (added 2026-07-07) —
`groups`/`group_members`/`group_join_requests` were all created 2026-03-04 (confirmed via `git log`,
not assumed), well before the rule; `groups.sport_id` (`V015`, added the *same commit* as the rule)
is correctly FK-free, the same contrast A13 already draws for `post-impl`. Every one of
these columns is already a plain `UUID`/`Long` field in its JPA entity (`Group.createdBy`,
`Group.recurrenceLocationId`, `GroupMember.userId`, `GroupJoinRequest.userId`/`reviewedBy`), no
`@ManyToOne` — the application layer already complies; only the schema constraint doesn't.

**Why it matters:** same as A13 — each of these is a hard schema coupling between `group-impl` and
either `user-impl` or `location-impl`, working against "monolith-first, microservice-ready."

**Fix approach:**
```sql
ALTER TABLE groups DROP CONSTRAINT groups_created_by_fkey;
ALTER TABLE groups DROP CONSTRAINT groups_recurrence_location_id_fkey;
ALTER TABLE group_members DROP CONSTRAINT group_members_user_id_fkey;
ALTER TABLE group_join_requests DROP CONSTRAINT group_join_requests_user_id_fkey;
ALTER TABLE group_join_requests DROP CONSTRAINT group_join_requests_reviewed_by_fkey;
```
Confirm every constraint name via `\d <table>` before writing the migration. One new Liquibase
changeset, next sequential `Vxxx` file, registered in `db.changelog-master.xml`. No entity/service/
DTO change — purely schema-level.

**Verify before/after:** `groups.created_by`'s `ON DELETE CASCADE` is the one worth checking closely
— a hard user-delete today would cascade-delete every group they created (and, transitively via
`group_members`'s own cascade, remove every member's row too); confirm whether `UserServiceImpl` has
any hard-delete-user path at all before assuming this cascade is dead weight (per this module's own
`transferOwnership` requirement, an owner *should* have transferred first, but nothing in the DB
schema currently enforces that at delete time — the cascade is the only thing stopping an orphaned
`groups` row today, so dropping it without confirming there's no hard-delete path is the one real
risk in this ticket, unlike the others).

**Out of scope:** `groups.sport_id` (already correctly FK-free, nothing to do); any same-domain
(intra `group-impl`) FK, e.g. `group_members.group_id`, `group_join_requests.group_id`,
`group_settings.group_id`/`group_type_id`, `group_invitation_inviters.invitation_id` — all
correctly scoped, nothing to remove; any change to any JPA entity, service, or repository in this
module.

---

### B18 · Require `group.isActive` in `isGroupMember`/`isGroupOwner`/`isGroupAdmin`; add `isGroupActive()`
**Status:** `DONE` (2026-08-11) · **Summary:**
`modules/social/group-impl/docs/B18_GROUP_ACTIVE_PERMISSION_GATE.md` — implementation diverges
from this ticket's own two suggested approaches; see the summary doc's "Design" section for why.
**Type:** Bug Fix (Security/Correctness)

**Filed:** 2026-08-11, surfaced while designing `post-impl`'s A14 and
`documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` (§5.1) — auditing every cross-domain caller of
these three methods to design a `ResourceGate<T>`-based access check for `Post` surfaced that none
of them account for the group itself being soft-deleted.

**Found:** `deleteGroup` is a soft-delete (`group.setIsActive(false)`) — it never touches
`group_members` rows. But:
```java
public boolean isGroupMember(Long groupId, UUID userId) {
    return groupMemberRepository.existsByGroupIdAndUserId(groupId, userId);
}
```
...and `isGroupOwner`/`isGroupAdmin` (role lookups against the same table) never join against
`group.is_active` either. Confirmed via a repo-wide grep of every cross-domain caller (8 call sites
in `post-impl`, 1 in `session-impl`) that every single one uses the result as a live gate — "can
this caller act *right now*" — never a historical/audit lookup. Concretely, a former member of a
since-soft-deleted group can still: create `GROUP_POST`s in it (`PostServiceImpl.createPost`), have
owner/admin status honored to moderate posts in it (`deletePost`/`updatePost`/
`updateBroadcastEndTime`), list its posts (`getGroupPosts`), and pass `session-impl`'s
group-linked-session gate.

**Why fix at the source, not per-caller:** since every existing consumer already treats these
methods as "true right now," requiring `group.isActive` inside all three closes the gap for every
current and future caller in one change — no domain has to remember to bolt on its own extra
active-check on top. This is unlike the Account Lifecycle gap (root `CLAUDE.md`) — that gap is
deliberately *not* fixed at the JWT-filter choke point because of the already-issued-token
staleness window; no equivalent staleness/caching concern applies here, this is a pure
repository-query correctness fix.

**Fix approach:**
- `isGroupMember(groupId, userId)`, `isGroupOwner(groupId, userId)`, `isGroupAdmin(groupId, userId)`:
  fetch the `Group` first (or join `is_active` into the existing membership/role query) and return
  `false` outright if `!group.getIsActive()`, before evaluating membership/role at all.
- **New method on `GroupService` (group-api):** `boolean isGroupActive(Long groupId)` — a standalone
  existence/lifecycle check with no caller-identity component, for a cross-domain resource's own
  `isAvailable()` implementation to call (e.g. `post-impl`'s future `PostGate.isAvailable(Post)`
  needs to ask "is this post's parent group still active" independent of who's asking — none of the
  three existing methods answer that on their own since they're all keyed to a specific `userId`).
  Returns `false` for a non-existent `groupId` too (no separate not-found signal needed at this
  layer — the caller's own gate decides what "unavailable" means for its resource).

**Tests:** for each of the three existing methods — a member/owner/admin of a soft-deleted group now
gets `false` (was `true`); an active group's checks are unchanged (regression guard). New coverage
for `isGroupActive`: `true` for an active group, `false` for a soft-deleted group, `false` for a
non-existent `groupId`.

**Out of scope:** `post-impl`'s A14 itself (consumes `isGroupActive` once this ships, but is its own
ticket); any change to `deleteGroup`'s own soft-delete behavior (already correct); hard-delete of a
`Group` row (doesn't exist today, not introduced here).

---

### B19 · Dedicated `PUT /{groupId}/generalData` endpoint
**Status:** `DONE` (2026-08-11) · **Summary:**
`modules/social/group-impl/docs/B19_GROUP_GENERAL_DATA_ENDPOINT.md`
**Type:** Enhancement (API design)

**Filed:** 2026-08-11, raised directly by the user while discussing why the client's Settings tab
General section (`rules`/`schedule`) writes through the generic `PUT /{groupId}`
(`updateGroup`/`UpdateGroupRequest`) rather than a scoped endpoint mirroring `GET`/`PUT
/{groupId}/settings` — `GET /{groupId}/info` already existed read-side with no matching write side,
forcing the client to reuse the wider DTO and manually patch its query cache since
`GroupResponse` never carries `rules`/`schedule`.

**Decision (confirmed with user via `AskUserQuestion` before implementing):** add `PUT
/{groupId}/generalData` **alongside** (not replacing) the existing `GET /{groupId}/info`; field
scope is the full `groupName`/`description`/`avatarUrl`/`coverUrl`/`rules`/`schedule` set (not just
the two fields the client edits today) — deliberate front-loading so future UI doesn't need another
backend ticket, same reasoning A10 used keeping `sportId` alongside `sportIds`. `isPrivate` stays
on `UpdateGroupPayload`/`PUT /{groupId}` (its own immediate-apply toggle, different UX shape).
`UpdateGroupRequest`/`PUT /{groupId}` keeps accepting `rules`/`schedule` too, for back-compat — not
removed, same precedent as A10 keeping its legacy `sportId` param.

**What shipped:** new `UpdateGroupGeneralDataRequest` DTO; `GroupInfoResponse` expanded with
`description`/`avatarUrl`/`coverUrl`; new `GroupService.updateGroupGeneralData` (owner/admin,
mirrors `updateGroup`'s permission + partial-update + name-conflict-backstop shape exactly);
`PUT /api/groups/{groupId}/generalData`. Full design/implementation writeup, including the
`AskUserQuestion` decisions verbatim: `modules/social/group-impl/docs/B19_GROUP_GENERAL_DATA_ENDPOINT.md`.

**Out of scope:** removing `rules`/`schedule` from `UpdateGroupRequest` (kept for back-compat); any
UI for the newly-added `groupName`/`description`/`avatarUrl`/`coverUrl` write fields (client's
GRP-9 only wires `rules`/`schedule` through the new endpoint, matching what the Settings tab
General section actually edits today).

## Tickets

### A1 · JWT-based identity
**Status:** `DONE`  
**Type:** Enhancement (Security)  
**Scope:** `GroupController.java` only — no service layer changes  
Extract `userId` from the JWT principal inside the controller. Remove `userId` from all 24 request params.

---

### A3 · Cancel join request
**Status:** `DONE`  
**Type:** Enhancement  
`DELETE /api/groups/join-requests/{requestId}` — user cancels their own pending request. Only the requestor can cancel; admins use the existing decline endpoint.

---

### A5 · Test coverage gaps
**Status:** `DONE`  
**Type:** Enhancement (Quality)  
Full Spock spec coverage for all untested service methods: `removeMember`, `leaveMember`, `declineJoinRequest`, `addMember`, `updateMemberRole`, `getGroupMembers`, `getGroupSettings`, `getPublicGroups`, `getUserJoinRequests`, `cancelJoinRequest` (A3). Both happy path and error path for each.

---

### B1 · Member invitation flow
**Status:** `DONE`  
**Type:** New Feature  
**Entity needed:** `GroupInvitation`

3-step flow:
1. Member invites a user they follow → `GroupInvitation` status: `PENDING_OWNER`
2. Owner approves → status: `PENDING_USER` → in-app notification to invited user
3. Owner declines → status: `DECLINED_BY_OWNER` → nothing sent

Invited user responses:
- Accepts → becomes `group_member` → status: `ACCEPTED`
- Declines → status: `DECLINED_BY_USER`

**Constraints:**
- Inviter must be following the target user (cross-domain check via social-api `UserFollow` interface)
- Gated by `allowMemberInvites` group setting
- No expiry for MVP

---

### B2 · Group–Sport association + UserSpace
**Status:** `DONE`  
**Type:** New Feature  
**Entities affected:** `Group` + new `UserSpace` (or reuse `UserSportProfile` — decide at implementation)

- Add `sportId: Long` (required) to `Group`
- `UserSpace` created per sport when user selects sports at registration (max 3)
- On `createGroup`: validate creator has a `UserSpace` for that sport (cross-domain check via sport-api interface — never import sport-impl)
- `getPublicGroups` gains optional `sportId` filter param
- `GroupResponse` includes `sportId`

---

### B3 · Three post types
**Status:** `DONE`  
**Type:** New Feature (cross-module — touches post module)  
Add `postType` enum + nullable `groupId: Long` to `Post` entity.

| postType | groupId | Visible to |
|---|---|---|
| `GROUP_POST` | required | Group members only |
| `GROUP_BROADCAST` | required | All users who have that sport in their space |
| `USER_FEED` | null | User + their followers |

**Cross-domain rules:**
- `GROUP_BROADCAST` visibility: check `sportId` on group → filter by users with that sport via sport-api interface
- `USER_FEED` visibility: check `UserFollow` via social-api interface
- group-impl never imports post-impl; group membership checks go through `GroupService` interface

---

### B5 · Group search & discovery
**Status:** `DONE`  
**Type:** New Feature  
**Dependency:** B2 (sportId on Group)

`GET /api/groups/search` with optional filters:
- `keyword` — name/description ILIKE
- `sportId`
- `page` / `size`

Public groups only (`isPrivate = false`, `isActive = true`).

---

### B6a · Pinned posts
**Status:** `DONE`  
**Type:** New Feature  
**Dependency:** B3 (GROUP_POST type must exist)  
**Entity needed:** `GroupPinnedPost` (groupId, postId, pinOrder 1–3, pinnedBy: UUID, pinnedAt)

- Owner pins/unpins any existing `GROUP_POST`
- Max 3 pinned per group
- Pinned posts appear truncated (1 line) at the top of the group feed, ordered by `pinOrder`

Endpoints:
- `POST /api/groups/{groupId}/pins` — pin a post
- `DELETE /api/groups/{groupId}/pins/{postId}` — unpin a post

---

### B6b · Group info fields
**Status:** `DONE`  
**Type:** New Feature  
Add `rules` (TEXT) and `schedule` (TEXT) to `Group` entity. Updated via existing `UpdateGroupRequest` / update-group endpoint. Displayed in a separate "group info" UI section, not in the post feed.

---

### A6 · Fix cross-domain violation (UserRepository/User → UserService/UserFriendService)
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

### A7 · Fix N+1 queries in paginated list mappers
**Status:** `DONE`  
**Type:** Bug Fix (Performance)  
**Scope:** `GroupServiceImpl.java` only

**Found during A6** (user flagged it while reviewing `getGroupMembers`). Four paginated methods map
each page item individually via `Page.map(this::mapperMethod)`, and each per-item mapper call does
its own DB round trip(s) — classic N+1. For a page of 20 items this is ~20-40 extra queries.

**Affected methods (mapper called once per page item):**
| Method | Mapper | Per-item queries |
|---|---|---|
| `getGroupMembers` | `mapToGroupMemberResponse` | 1× `userService.getUsersByIds` + 1× `groupRoleRepository.findById` |
| `getUserJoinRequests`, `getGroupJoinRequests` | `mapToJoinRequestResponse` | 1× `groupRepository.findById` (group name) + 1× `userService.getUsersByIds` |
| `getGroupInvitations`, `getMemberSentInvitations` | `mapToGroupInvitationResponse` | 1× `userService.getUsersByIds` (inviter+invitee batched already) |

**Not introduced by A6** — this pattern predates it. A6 actually improved `getGroupMembers`'s user
lookup from 2 queries/member to 1 (consolidated fullName+avatarUrl into one `getUsersByIds` call),
but didn't restructure the page-level loop itself, since A6's scope was strictly the cross-domain
architecture fix with no behavior/performance changes.

**Fix approach:** for each affected method, collect all page items' user ids (and group ids, where
relevant) up front, issue one batched `getUsersByIds()` call (and one `groupRepository.findAllById()`
where applicable) for the whole page, then pass the resolved map(s) into the per-item mapper instead
of having the mapper look up its own dependencies. `GroupRoleRepository` has no existing batch method
— may need one (`findAllById` already exists on Spring Data `CrudRepository`, so likely no repository
change needed, just call-site restructuring).

**Out of scope:** no change to what data is displayed — pure performance refactor, same fields/values.

---

### A8 · Fix N+1 in getUserGroups
**Status:** `DONE`  
**Type:** Bug Fix (Performance)  
**Scope:** `GroupServiceImpl.java` only

**Found while verifying A7** (user asked "seem no N+1 problem in group module, right?" — checked the
whole file for remaining per-item lookups inside `.map()`/loops and found this one; it wasn't part of
A7's ticket scope). `getUserGroups` maps each page item via `Page.map()`, and the per-item work fans
out into several more per-item queries — worse than anything A7 fixed.

**Current code (lines ~155-163):**
```java
public Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable) {
    Page<GroupMember> memberships = groupMemberRepository.findByUserId(userId, pageable);
    return memberships.map(membership -> {
        Group group = groupRepository.findById(membership.getGroupId())
                .orElseThrow(() -> new NotFoundException("Group not found"));
        return mapToGroupResponse(group, userId);
    });
}
```

Per page item, this is **1 (group lookup) + 4 more inside `mapToGroupResponse`** = 5 queries/item:
- `groupRepository.findById(membership.getGroupId())` — 1 query
- `mapToGroupResponse()` internally calls:
  - `userService.getUsersByIds(List.of(group.getCreatedBy()))` — 1 query (single-id, not batched across the page)
  - `groupMemberRepository.countByGroupId(group.getId())` — 1 query
  - `getUserRoleInGroup(groupId, currentUserId)` → `groupMemberRepository.findByGroupIdAndUserId(...)` +
    `groupRoleRepository.findById(...)` — 2 more queries

**Fix approach:** collect distinct `groupId`s from the page's memberships up front, batch-fetch groups
via `groupRepository.findAllById(...)`, batch-fetch creator names via `userService.getUsersByIds(...)`
(collecting all `createdBy` ids across the page), batch-fetch member counts (needs a new repository
method, e.g. `groupMemberRepository.countByGroupIdIn(List<Long> groupIds)` grouped by group id — check
if Spring Data supports this directly or needs a `@Query` with `GROUP BY`), and batch-resolve the
current user's role per group (the same `userId` across all rows — one
`groupMemberRepository.findByUserIdAndGroupIdIn(userId, groupIds)` call plus one
`groupRoleRepository.findAllById(...)` for the distinct role ids found). `mapToGroupResponse` will need
a variant that takes these pre-resolved maps instead of querying internally — similar to what A7 did
for the other mappers. Note `mapToGroupResponse` is also called from `getGroup` (single-item, not
paginated) — keep that call site using the existing per-item-fetch signature or an inline
single-element-map wrapper, per the same convention A7 used for single-item call sites.

**Out of scope:** no change to what data is displayed — pure performance refactor, same fields/values.
Also out of scope: two bounded (max 3) per-item `postService.getPostById()` loops — one in `getGroup`'s
pinned posts resolution (line ~136-147), one in `getPinnedPosts` itself (line ~844-864, iterating
`pinnedPostRepository.findByGroupIdOrderByPinnedAtDesc`). Both are much lower severity than a true
paginated N+1: `GroupPinnedPost` rows per group are capped at exactly 3 by a business rule enforced at
pin-time (B6a), not by a query `LIMIT` or client-controlled pagination — so unlike the 7 paginated
methods this ticket + A8 fixed, there's no scaling axis (more members, more history, bigger page size)
for these two loops to grow along. Noted here for awareness but not ticketed.

---

### A9 · Add privacy/membership check to `getGroup`
**Status:** `DONE` (2026-07-08) · **Summary:** `modules/social/group-impl/docs/A9_PRIVACY_MEMBERSHIP_CHECK_GETGROUP.md`  
**Type:** Bug Fix (Security) / Enhancement  
**Scope:** `GroupServiceImpl.getGroup()` (and its controller), `GroupControllerTest`, `GroupServiceImplSpec`

**Found during:** auth module A2/A3 work (2026-07-08) — investigating a stale integration test
(`GroupControllerTest.getGroup_WithoutUserId_Success`) surfaced that `getGroup(groupId,
currentUserId)` has **no privacy or membership enforcement at all**. It fetches the group by ID
and returns full details — including the top-3 pinned posts — to any caller who reaches the
endpoint, regardless of `isPrivate`, regardless of whether `currentUserId` is a member, and
regardless of whether `currentUserId` is even non-null. `isPrivate` is returned as informational
data in `GroupResponse` but never checked against the caller. The only thing currently gating this
endpoint at all is `SecurityConfig`'s blanket `.anyRequest().authenticated()` rule — logged in as
*some* user, not necessarily a member of *this* group.

The stale test (which expected an unauthenticated call to succeed with `getGroup(1L, null)`) has
been rewritten to assert the current, correct security-layer behavior instead (401 without auth) —
see the auth module's A2/A3 closeout docs. This ticket is the follow-up: decide and implement
actual *content*-level access control, which is a separate, deeper gap from "must be logged in."

**Needs a product/design decision before implementation:**
- Should a **private** group be visible at all to non-members? (Likely: no — hide full details;
  decide the exact shape: 403 `ForbiddenException`, a minimal "this group is private" stub
  response, or 404 to avoid confirming the group exists.)
- Should a **public** group remain visible to any authenticated user regardless of membership?
  (Likely: yes — this is the point of B5's public discovery/search flow; don't regress that.)
- Is a null/absent `currentUserRole` in the response already an adequate signal for "you're not a
  member," or does enforcement need to be stronger (i.e. block the read, not just omit the role)?

**Suggested scope once decided:** in `getGroup`, if `group.getIsPrivate()` is true and the caller
isn't a member (owner/admin/member — reuse the existing `isGroupMember`/`isGroupOwner`/
`isGroupAdmin` checks), throw `ForbiddenException` instead of returning full details. Public
groups unchanged. Add Spock coverage for both the private-member and private-non-member paths
(currently only the "group not found" and implicit "always succeeds" paths are tested).

**Not urgent for MVP unless private groups are already relied on for genuine privacy** — flag with
product before scheduling; this is a real (if narrow) information-disclosure gap, not cosmetic.

---

### B8 · Extend member-sent invitations to include owner-approved status
**Status:** `DONE` (2026-07-20) · **Summary:** `modules/social/group-impl/docs/B8_INVITATION_STATUS_FILTER.md`  
**Type:** Enhancement  
**Origin:** filed for the client's **GRP-3** (`client/docs/BACKLOG_MVP.md`) — its Members tab needs
a "waiting for user accept" list: invitations the caller sent for a group that an owner/admin has
already approved (status `pending_user`) and the invitee hasn't responded to yet.

**Found while scoping GRP-3:** `GroupServiceImpl.getMemberSentInvitations()` (line ~1098) hardcodes
its status filter to `pending_owner` only —
`invitationRepository.findByGroupIdAndInviterIdAndStatus(groupId, inviterId, "pending_owner",
pageable)`. `GET /api/groups/{groupId}/invitations/sent` therefore can never return a `pending_user`
row today, which is the exact status GRP-3's new section needs.

**Delta (2026-07-20, executed):** at pickup, user first chose an explicit **`status` query param**
(one call per status). Later the same day, while comparing GRP-3's request count against the 5
Members-tab sections, user reversed that: they want **both `pending_owner` and `pending_user` in
one request** (a group member/owner/admin should see everything they've invited that's still in
flight, not just the `pending_user` subset), distinguishable via each row's `status` field. That's
what actually shipped: `GET /api/groups/{groupId}/invitations/sent` takes **no query param** and
always returns both statuses in one page. `GroupService.getMemberSentInvitations` is `(groupId,
inviterId, pageable)` — no `status` arg. New
`GroupInvitationRepository.findByGroupIdAndInviterIdAndStatusIn(groupId, inviterId,
List.of("pending_owner", "pending_user"), pageable)` — the single-status query param variant
(and its now-dead single-status repository method) was removed, not just deprecated. **GRP-3
should build its Members tab against one call to this endpoint**, splitting locally by
`row.status` for whichever of its sections need which status. Full writeup, including the
mid-session revision: `modules/social/group-impl/docs/B8_INVITATION_STATUS_FILTER.md`.

**Out of scope:** no change to `getGroupInvitations` (owner/admin's incoming-approval view) or
`getUserPendingInvitations` (invitee-facing view) — both already return the correct status set for
their own purpose.

**Tests:** `GroupServiceImplSpec` — updated the existing not-a-member throw test to the 3-arg
signature; replaced the per-status happy-path tests with one asserting a single call returns both
`pending_owner` and `pending_user` rows together.

---

### B7 · Settings data set audit → group-type membership-cap tiers
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

### B9 · Group system posts — welcome post on member join
**Status:** `DONE` (2026-07-21) · **Summary:** `modules/social/group-impl/docs/B9_GROUP_WELCOME_SYSTEM_POST.md`
**Type:** New Feature (cross-module — touches post module, same shape as B3)

**Delta from the draft below (resolved during scoping, see summary doc for full detail):** no
dedicated system-user account — the group's *current* owner authors the welcome post instead.
`addMember` was redesigned rather than just wired up: it no longer inserts a `GroupMember` row
directly — it creates a self-approved (`pending_user`) `GroupInvitation` (still friends-gated),
collapsing its trigger into the `acceptInvitation` path and dropping the `roleName` param (always
`group_member` on accept; promote via `updateMemberRole` afterward).

**Origin:** raised directly by the user while discussing B8/GRP-3 — should `GroupMemberResponse`
expose who invited a member and who approved them, so the group can "say hello" to a new member?
Conclusion from that discussion: exposing `invitedBy` as a **permanent field on every member row**
is a social-graph disclosure with no expiry (invitations require `UserFriendService.areFriends`,
so it would broadcast a friendship fact to the entire membership indefinitely, not just at
join-time). A **transient, feed-visible system post** gets the same icebreaker value — it's
naturally scoped to "the group members active around join time," not permanently queryable by
anyone who opens the member list months later — without adding a durable social-graph field to
the API surface. This ticket is that: a `GROUP_SYSTEM` post, auto-created in the group's feed the
moment a `GroupMember` row is inserted, mentioning the inviter by name when the join came through
an invitation.

**Trigger points (all three insert a `GroupMember` row today, `GroupServiceImpl.java`):**
- `acceptJoinRequest` (~line 561) — self-requested, owner/admin approved. No inviter to mention.
- `acceptInvitation` (~line 1005) — invitee accepting an owner-approved invite. Mention the
  inviter (`GroupInvitation.inviterId`, already loaded in this method to validate the caller).
- `addMember` (~line 349) — owner/admin directly adds someone. No inviter to mention (direct add
  isn't the friend-gated invitation flow).

**Content (server-templated, not free text):**
- Join-request / direct-add path: `"{fullName} joined the group 👋"`
- Invitation path: `"{fullName} joined the group — invited by {inviterFullName} 👋"`

**Design decisions to make at pickup (flagging now, not assumed):**
1. **New `PostType.GROUP_SYSTEM`** (`post-api`) — requires a migration (next available `V026__...`)
   altering `chk_post_type` (`V016__add_post_type_to_posts.sql`'s `CHECK (post_type IN
   ('USER_FEED','GROUP_POST','GROUP_BROADCAST'))`) to add the new value, same shape as B3's own
   migration.
2. **Post authorship — real security consideration, not just a modeling detail.** `Post.userId` is
   `NOT NULL` (`Post.java`) — there's no "no author" option without a schema change bigger than
   this ticket needs. Recommend authoring the welcome post as **the new member**
   (`userId = <joining user>`), since that's who every trigger path already has on hand, and
   changing `userId` to nullable would ripple into every ownership check across `post-impl`.
   **Consequence that must be closed, not left open:** `PostServiceImpl.createPost` is reachable
   directly via the public `POST /api/posts` endpoint (`ROLE_USER`, any authenticated caller,
   `CreatePostRequest.postType` is a caller-supplied field). If `GROUP_SYSTEM` is just another enum
   value `createPost` accepts, **any user could self-author a fake "invited by X" system post**,
   impersonating the system and potentially fabricating a friendship claim about someone else. This
   ticket must add an explicit guard — `createPost` rejects `postType == GROUP_SYSTEM` with a
   `BadRequestException` regardless of caller — and expose a **separate, non-REST-reachable**
   interface method (e.g. `PostService.createSystemPost(Long groupId, UUID subjectUserId, String
   content)`) that only `GroupServiceImpl` calls. This is the same "service interface as contract"
   principle the root `CLAUDE.md` already requires for cross-domain calls, applied to close a
   spoofing hole rather than just a domain-boundary concern.
3. **Edit/delete guard.** Since the post is nominally "authored" by the new member,
   `PostServiceImpl.updatePost`/`deletePost`'s existing `userId == caller` ownership check would
   let that member edit or delete their own welcome post like normal content. Recommend: block
   `updatePost` entirely for `GROUP_SYSTEM` posts (no caller should be able to rewrite a system
   message), and scope `deletePost` to group owner/admin only (moderation cleanup) instead of the
   nominal author — needs a `groupService.isGroupOwner`/`isGroupAdmin` check added to that one
   `postType` branch.
4. **Feed placement — no new endpoint needed.** `getGroupPosts`/`PostRepository.
   findByGroupIdAndIsActiveTrue` already returns every post type for a `groupId`, so a
   `GROUP_SYSTEM` post shows up in the existing group feed (`GET /api/posts/group/{groupId}`,
   already consumed by the client's Posts tab, GRP-1) with no backend change beyond the type
   itself existing. Client-side rendering (distinct system-message styling, no like/comment/edit
   affordances for regular members) is **out of scope here** — file as a follow-up client ticket
   once this backend piece lands, scoped against GRP-1's existing Posts tab, not GRP-3's Members
   tab (this is feed content, not member-list content).

**Out of scope:** system posts for leave/remove/role-change events (future, if wanted); a
per-user/per-group opt-out toggle; any push-notification tie-in.

---

### A10 · Add multi-value `sportIds` filter to `GET /api/groups/public`
**Status:** `DONE` (2026-07-21, `modules/social/group-impl/docs/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md`) ·
**Type:** Enhancement · **Dependency:** B5 (existing single-`sportId` filter
on this endpoint) · **Filed:** 2026-07-21, found while scoping the client's GRP-6 (`client/docs/
BACKLOG_MVP.md`) — the Join Group modal's new multi-select sport filter needs to search across
several of the current user's sports in one combined, groupable result set.

**Origin:** `GroupController.getPublicGroups` (`GroupController.java:112-121`) currently accepts
only a single optional `sportId` (`Long`). `GroupRepository.searchPublicGroupsWithCounts`/
`searchPublicGroupsAnon` (`GroupRepository.java:59-90`) apply it via `(:sportId IS NULL OR
g.sportId = :sportId)` in the JPQL `WHERE` clause. There is no way today to search "groups in any
of these N sports" in one call — only one sport, or every sport.

**What ships:**
- Add `@RequestParam(required = false) List<Long> sportIds` to `getPublicGroups`, alongside the
  existing `sportId` param (kept, untouched, for back-compat — `sportId` has no other confirmed
  caller today besides the client's `usePublicGroups` hook, which GRP-6 is updating to use
  `sportIds` instead, but keeping the singular param costs nothing and avoids a silent breaking
  change to a public, Swagger-documented endpoint).
- `GroupServiceImpl.getPublicGroups` — add a `List<Long> sportIds` param, pass through to the
  repository. Precedence when both are somehow present: `sportIds` (if non-empty) takes priority
  over `sportId`; `sportId` remains the sole filter when `sportIds` is absent/empty — the two are
  not combined/ORed together, to avoid an ambiguous "both filters active" query shape.
- `GroupRepository`'s two search queries — extend the `WHERE` clause to
  `(:sportIds IS NULL OR g.sportId IN :sportIds)`, replacing (not appending to) the existing
  `sportId` condition when `sportIds` is provided. Both query methods need the new `@Param
  ("sportIds") List<Long> sportIds` parameter threaded through.
- No DTO change needed — `GroupSearchResponse` already carries `sportId` per row
  (`GroupSearchResponse.java:14`), which is exactly what the client needs to group a single flat
  response by sport client-side.
- No migration — this is a query-shape change only, no schema impact.

**Acceptance criteria:**
- `GET /api/groups/public?sportIds=1&sportIds=2` (Spring's default binding for a `List<Long>`
  `@RequestParam` from repeated query params — verify this is indeed how it resolves before
  finalizing the client's param-serialization side of GRP-6, don't assume comma-joined) returns
  groups from either sport 1 or 2 only.
- `GET /api/groups/public?sportId=1` (legacy singular param, no `sportIds`) still behaves exactly
  as before — regression-tested, not just assumed unchanged.
- `GET /api/groups/public` (neither param) still returns every public group, unchanged.
- Spock coverage: `GroupServiceImplSpec` — new case(s) for `sportIds` filtering (multiple ids,
  empty list treated as "no filter", `sportIds` taking priority over a simultaneously-present
  `sportId`), plus the existing single-`sportId` cases must still pass unmodified (no behavior
  change for that path).
- `./gradlew :modules:social:group-impl:test` and `./gradlew :server:test` both green.

**Out of scope:**
- Removing or deprecating the singular `sportId` param — kept for back-compat, not this ticket's
  concern to clean up.
- Any client-side change — that's GRP-6 (`client/docs/BACKLOG_MVP.md`), which depends on this
  ticket, not the other way around.

---

### B11 · Reconcile join-request/invitation race conditions
**Status:** `DONE` (2026-07-23, `modules/social/group-impl/docs/B11_JOIN_INVITATION_RACE_CONDITIONS.md`) ·
**Type:** Bug fix / business rule · **Dependency:** B1 (member invitation
flow, `DONE`), A3 (join requests, `DONE`) · **Filed:** 2026-07-23, found while scoping the client's
GRP-7 (`client/docs/BACKLOG_MVP.md`). **Blocks GRP-7** — the client ticket wires the approve/accept
UI for both flows and should be built against corrected business rules, not retrofitted after.

**Read `documentation/md/adr/JOIN_GROUP_ADR.md` §5 before implementing.** That section is the
canonical, diagrammed version of the three rules below — both tables' full schema/use-case
background (§1–4) plus two Mermaid sequence diagrams showing exactly where each rule's check sits
in the existing `createInvitation`/`approveInvitation`/`createJoinRequest` flows, tagged by rule
number. The prose here is a summary; the diagrams are the source of truth for the exact
call-site/branch structure. If implementation reveals the rules need to change, **update §5 first,
then this ticket** — don't let them drift apart.

**Origin:** `group_join_requests` (self-service) and `group_invitations` (member-initiated) are
independent tables with no cross-awareness today. Verified by reading the actual service methods:
`createInvitation` always sets `status="pending_owner"` regardless of who the inviter is
(`GroupServiceImpl.java:991`); `approveInvitation` flips `pending_owner→pending_user` with no check
for anything else pending for that (group, user) pair (`GroupServiceImpl.java:1000-1021`);
`createJoinRequest` checks membership + an existing pending join request + capacity, but never
checks for an existing invitation (`GroupServiceImpl.java:563-597`). Three real races fall out of
this:

1. A member invites A (→ `pending_owner`). Before the owner approves, A independently sends a join
   request for the same group. Today both rows sit there as two unrelated pending items — the owner
   has to separately act on each, and approving the invitation still leaves A needing to
   individually accept it, ignoring that A already proved intent via the join request.
2. An owner/admin invites A directly. There's no reason for the owner to "approve their own
   invitation," but today it still starts at `pending_owner` and needs an explicit approve step
   before A can even see it.
3. If A already has, or independently creates, a join request while an invitation to A is sitting at
   `pending_user`, nothing connects the two — A ends up needing to act on the invitation separately
   even though a join request is exactly as strong a signal of intent.

**What ships — three rules (user-specified 2026-07-23, resolved interaction confirmed same day):**

1. **`createInvitation`**: if the inviter passes `canManageMembers(groupId, inviterId)` (owner or
   admin), create the invitation at `status="pending_user"` directly — skip `pending_owner`
   entirely, since there's no one else who needs to approve the owner/admin's own action.
2. **Join-request short-circuit, checked at every point an invitation is about to enter
   `pending_user`** — both `approveInvitation`'s normal `pending_owner→pending_user` transition
   *and* rule 1's direct-to-`pending_user` creation path (confirmed: both call sites need this
   check, not just `approveInvitation` — an owner-authored invitation must also check for a
   pre-existing join request from that user, or the owner-authored path could skip the ADR's rule
   entirely). If a `pending` `GroupJoinRequest` already exists for that (group, user): skip
   `pending_user`, set the invitation `status="accepted"` directly, create the `GroupMember` row,
   post the welcome message (crediting the invitation's `inviterId`) — **and** update the join
   request's own row to `status="accepted"` with `reviewedBy`/`reviewedAt` set (confirmed: don't
   leave it dangling at `pending` — it would otherwise sit as a phantom row in the owner's
   "Waiting for group approve" queue forever, with no clean way to act on it since the user is
   already a member).
3. **`createJoinRequest`**: before creating a new row, check for an existing `pending_user`
   `GroupInvitation` for that (group, user). If one exists: do **not** create a join request row at
   all — instead accept that invitation directly (`status="accepted"`, create `GroupMember`, post
   welcome message, same effect as `acceptInvitation`).

**Open questions to resolve at pickup:**
- `createJoinRequest`'s declared return type is `JoinRequestResponse` — when rule 3 short-circuits
  and no join request is ever created, what does the endpoint return? A few options: a
  `GroupInvitationResponse`-shaped result instead (contract change — needs a client-side type
  update too), a synthetic `JoinRequestResponse` with `status="accepted"` pointing at the resolved
  invitation's id (keeps the response shape stable but is semantically odd — it's not really a join
  request), or a different response wrapper entirely for this case. Pick before implementing, not
  during — this is a real API-contract decision, not a detail to improvise mid-method.
- All three rules end in the same "create GroupMember + post welcome message" effect that already
  exists three times over (`acceptJoinRequest`, `acceptInvitation`, and now this). Worth extracting
  a shared private helper (e.g. `finalizeMembership(groupId, userId, creditedInviterId)`) rather
  than a fourth near-identical block — not required for correctness, but flagged since the
  duplication was already borderline before this ticket adds a fourth copy.
- Capacity: every new short-circuit path (`createInvitation`'s owner-authored case, both
  `pending_user`-entry check-ins, `createJoinRequest`'s short-circuit) results in an actual
  membership creation and must run `checkMemberCapacityNotExceeded`/`enforceMemberCapacity` exactly
  like the existing accept paths do — easy to miss since these are new code paths, not extensions of
  the ones that already have the check.
- Decline-side interactions (declining an invitation/join request while the other is also pending)
  are **explicitly out of scope** for this ticket — only the three rules above, as specified. Don't
  invent additional symmetric rules beyond what's written here.

**Delta (2026-07-23, resolved at pickup, executed as shipped):**
- **Return-shape open question resolved differently than either floated option:** neither a
  `GroupInvitationResponse`-shaped result nor a synthetic accepted `JoinRequestResponse` — rule 3
  always creates a **real** `GroupJoinRequest` row, directly at `status="accepted"`, with
  `reviewedBy` set to the invitation's approver. The endpoint's return type and contract are
  completely unaffected; no client-side change needed for this case.
- **Confirmed consequence of that choice, explicitly accepted by the user:** rules 2 and 3 can now
  leave **two** `accepted` rows for a single real join event — one `GroupInvitation`, one
  `GroupJoinRequest` — both persisted as-is, no merge/suppression logic added. Flagged on GRP-7's
  backlog entry (`client/docs/BACKLOG_MVP.md`) for the client's future display decision.
- `finalizeMembership(groupId, userId, creditedInviterId)` helper extracted as suggested — confirmed
  with the user rather than left as an optional cleanup, since this ticket was about to add a 4th
  near-identical copy of the capacity+insert+welcome-post block.
- Full writeup: `modules/social/group-impl/docs/B11_JOIN_INVITATION_RACE_CONDITIONS.md`.

**Acceptance criteria:**
- All three rules verified with a live-backend walkthrough (register two users, exercise each race
  in order), not just Spock mocks — these are exactly the kind of cross-repository interaction
  GRP-4's own verification found real gaps in.
- Spock coverage in `GroupServiceImplSpec` for each of the three rules independently, plus the
  combined case (rule 1 + rule 2 interaction: owner-authored invitation created after a pending join
  request already exists).
- `./gradlew :modules:social:group-impl:test` and `./gradlew :server:test` both green.
- No regression to the existing single-flow paths (a plain member's invitation still starts at
  `pending_owner` and still requires explicit owner approval when no join request is in play; a
  plain join request with no invitation in play behaves exactly as today).

**Out of scope:**
- Any client-side change — GRP-7 depends on this ticket, not the other way around; the client's
  merged "Waiting for group approve" list (already scoped in GRP-7) should reflect whatever these
  corrected backend semantics produce, once this ships.
- Decline-side symmetric rules (see above).
- The `group_invitations` table's missing DB-level FKs/CHECK constraint on `status` — a
  pre-existing, separate gap noted in `JOIN_GROUP_ADR.md`, not this ticket's concern.

---

### B12 · Cancel a sent invitation while still `pending_owner`
**Status:** `DONE` (2026-07-24) · **Type:** New Feature · **Filed:** 2026-07-24, user-requested
directly while using GRP-7's newly-shipped invitation lifecycle.

**What ships:** `GroupService.cancelInvitation(invitationId, callerId)` — mirrors
`cancelJoinRequest` (A3) exactly: caller must be the invitation's own inviter, the group must still
be active, the invitation must still be `status="pending_owner"` (an owner/admin has not yet
approved it), then hard-deletes the row — no "cancelled" status literal introduced, same as
`cancelJoinRequest` never introducing a "cancelled" `JoinRequestStatus`. New `DELETE
/api/groups/invitations/{invitationId}` endpoint, matching `DELETE /join-requests/{requestId}`'s
convention.

**Explicit scope boundary (user-confirmed):** once an owner/admin approves an invitation
(`pending_user`), the inviter can no longer cancel it — it's out of their hands at that point.
Cancelling a `pending_user` invitation would need different semantics (closer to "revoke", not
"withdraw my own unapproved request") and is out of scope here.

**Tests:** 5 new Spock cases in `GroupServiceImplSpec` — happy path (deletes), invitation not found,
caller is not the inviter, group inactive, invitation not `pending_owner` — directly mirroring
`cancelJoinRequest`'s own 5 test cases.

**Verification:** `./gradlew :modules:social:group-impl:test` and `./gradlew :server:test` both
green; live-verified against a running `bootRun` instance (non-inviter cannot cancel, inviter
cancels their own `pending_owner` invitation successfully and it disappears from the owner's
approval queue, cancelling after approval correctly 400s).

**Client:** wired the same session as a GRP-7 addendum — see `client/docs/BACKLOG_MVP.md`.

---

### B13 · Persist a rejection reason on invitee-declined invitations
**Status:** `DONE` (2026-07-24) · **Type:** Enhancement · **Filed:** 2026-07-24, alongside client
ticket **GRP-8** (`client/docs/BACKLOG_MVP.md`) — GRP-8's invitee-facing reject flow asks for a
reason before rejecting an invitation, but `PUT /invitations/{invitationId}/reject` took no request
body. Confirmed: `GroupController.rejectInvitation` had no `@RequestBody` parameter at all, and
`GroupInvitation` (entity) had no reason/notes column — a real gap, not an oversight to build around
client-side. **Summary:** `modules/social/group-impl/docs/B13_INVITATION_REJECT_REASON.md`.

**Originally scoped as:**
- New Liquibase changeset adding a nullable `reject_reason` column (`text`, no length cap — same
  precedent as `Post.content`) to `group_invitations`.
- New `RejectInvitationRequest` DTO with an optional `reason` field; `PUT
  /invitations/{invitationId}/reject` accepts it in the body (empty/absent is fine — the invitee
  isn't required to give one at the API layer, even though GRP-8's client UI may require it
  client-side).
- `GroupServiceImpl.rejectInvitation` persists the reason alongside the existing
  `status="declined_by_user"` transition.
- Surface it on `GroupInvitationResponse.rejectReason` (`string | null`) so **`getMemberSentInvitations`**
  (GRP-3's "Waiting for user accept" section, already shown to the inviter) can display why their
  invitation was declined — no new endpoint needed, just a new field on the existing response.

**Delta (2026-07-24, resolved at pickup — visibility scope changed):** confirmed with the user that
visibility should be **owner/admin only**, not every co-inviter via `getMemberSentInvitations` (that
endpoint is member-facing — any inviter can call it, not just owner/admin). This also surfaced a real
gap: neither existing invitation-listing endpoint returns a rejected row at all —
`getGroupInvitations` filters strictly to `pending_owner` (by design, so GRP-3/GRP-7's approval queue
never shows resolved rows) and `getMemberSentInvitations` filters to the two in-flight statuses only.
**Shipped instead:** a length cap of **500 characters** (`@Size(max = 500)`, tighter than the
originally-sketched uncapped field), and a new, narrowly-scoped **`GET
/{groupId}/invitations/declined`** endpoint (owner/admin only) rather than repurposing either
existing one. `rejectReason` is still on `GroupInvitationResponse` as scoped, just reached via this
new endpoint instead of `getMemberSentInvitations`.

**Out of scope:** no equivalent reason field for `declineJoinRequest` (join-request decline, the
owner/admin side); no `declined_by_owner` rows on the new `/declined` endpoint (an owner-declined
invitation never reached the invitee, so there's nothing to explain).

**Executed:** shipped as revised above. Full Spock coverage (reason persisted/omitted on reject; the
new endpoint's group-not-found/not-owner-or-admin/happy-path cases) plus new `GroupControllerTest`
MockMvc cases for both the changed and new endpoints. `./gradlew :modules:social:group-impl:test` and
`./gradlew :server:test` both green. Confirmed no H2 test-schema update was needed —
`group_invitations` isn't modeled in `server/src/test/resources/schema.sql` at all (the only
server-level test touching invitations, `GroupControllerTest`, mocks `GroupService` entirely).
Live-verified against a real running backend end-to-end (two real registered/friended users, a real
group, a self-approved owner invitation rejected with a reason, the new endpoint returning it to the
owner, and a non-owner/admin correctly getting a 400). Full writeup:
`modules/social/group-impl/docs/B13_INVITATION_REJECT_REASON.md`.

---

### B14 · Track every co-inviter on a single group invitation
**Status:** `DONE` (2026-07-25) · **Type:** Feature · **Filed:** 2026-07-24, alongside client ticket **GRP-8**
(`client/docs/BACKLOG_MVP.md`) — user requested that when more than one group member independently
invites the same prospective member, both the invitee's own Invitations view and the owner/admin's
approval queue show one merged row ("Invited by X, Y, Z"), and a single owner/admin approval covers
all of them.

**Current behavior (confirmed):** `createInvitation`'s `existsByGroupIdAndInviteeIdAndStatusIn(groupId,
inviteeId, [pending_owner, pending_user])` check means a second, different member's invite attempt
for an already-pending invitee **silently returns the existing single-inviter invitation
unchanged** — the second inviter is never recorded anywhere. There is no way today for "multiple
invitations to the same new member" to exist as multiple `GroupInvitation` rows.

**Decision (resolved for this ticket — flag if the user actually intended literal duplicate rows,
one per inviter, bulk-actioned together):** track every inviter against **one canonical invitation
row**, not one row per inviter. The alternative (duplicate rows, bulk-approved/bulk-declined
together) reintroduces exactly the class of multi-row-race problem **B11** was filed to eliminate —
two independently-transitioned rows for the same real-world event can drift out of sync (e.g. an
owner approves one, the invitee accepts one, sibling rows dangle at `pending_owner`/`pending_user`
forever with no reconciliation path, the same failure mode B11's ADR documents). A single row with
multiple recorded inviters has no such race: there is nothing to reconcile.

**What ships:**
- New join table `group_invitation_inviters` (`invitation_id` FK → `group_invitations.id`,
  `inviter_id`, `created_at`, unique on `(invitation_id, inviter_id)`) via a new Liquibase
  changeset. The original single inviter (`GroupInvitation.inviterId`) is backfilled into this table
  as its first row on migration; the `inviterId` column itself is kept as-is on the entity (no
  column removed — existing code reading "who created it" keeps working unchanged).
- `createInvitation`: when `alreadyInvited` is true and the calling `inviterId` isn't already a
  co-inviter on the existing row, insert a `group_invitation_inviters` row for them instead of
  returning the existing invitation untouched. A repeat call from the same person still no-ops
  (existing behavior, now scoped to "already a co-inviter" rather than "an invitation already
  exists").
- `GroupInvitationResponse` gains `inviterFullNames: List<String>` (every co-inviter, oldest-first;
  a singleton list in the common single-inviter case) alongside the existing singular `inviterId`/
  `inviterFullName` (kept unchanged for backward compatibility with GRP-3/GRP-4/GRP-7's existing
  client code).
- `approveInvitation`/`declineInvitation`/`acceptInvitation`/`rejectInvitation` are all **unchanged** —
  they still operate on the one canonical row, so a single approve/accept/reject already covers every
  co-inviter with no bulk-update logic needed anywhere.

**Out of scope:** no UI/API to remove one co-inviter from an invitation individually outside of
`cancelInvitation`'s own withdraw action, and no per-co-inviter timestamps beyond `created_at` on the
join row — the list is display-only.

**Delta (2026-07-25, resolved at pickup — `cancelInvitation` is NOT unchanged as originally
scoped):** three real design questions surfaced during pickup, all resolved directly with the user
before implementing (not assumed):
1. **Owner/admin auto-approve on merge** — confirmed: joining as a co-inviter on a still-
   `pending_owner` row as owner/admin auto-transitions it toward `pending_user` (or `accepted` under
   B11 rule 2), same reasoning as B11 rule 1's self-approval. A regular member joining does not
   change the status.
2. **`getMemberSentInvitations` scope** — confirmed: matches any recorded co-inviter, not just the
   row's original creator. New repository query `findByGroupIdAndCoInviterIdAndStatusIn` (EXISTS
   subquery) replaces `findByGroupIdAndInviterIdAndStatusIn`.
3. **`cancelInvitation` is per-co-inviter, not per-row** — this reverses the "unchanged" bullet above:
   any recorded co-inviter can withdraw their own invite (deletes only their
   `group_invitation_inviters` row); the invitation itself is deleted only once its *last*
   co-inviter withdraws. A real, user-specified design change from B12's original single-inviter
   cancel semantics.

Also confirmed (unit tests + live verification, per explicit user request covering **both** terminal
statuses, not just one): a prior invitation resolved as `declined_by_owner` or `declined_by_user`
never merges with a subsequent invite — the subsequent invite always creates a genuinely fresh row.

**Executed:** shipped as revised above, plus (not originally itemized, but necessary for correctness)
every `GroupInvitation`-creating path — not just `createInvitation`'s merge branch — now records its
creator as the first co-inviter (`createInvitation`'s normal create, `createSelfApprovedInvitation`,
`addMember`'s direct-add path), so `inviterFullNames` is populated for every invitation created after
this ships, not only merged ones. N+1-safe batched co-inviter/user resolution across all 6
page-returning invitation-listing call sites. 132 Spock tests green (13 new), `./gradlew :server:test`
green, five-scenario live verification against a real running backend. Full writeup:
`modules/social/group-impl/docs/B14_INVITATION_CO_INVITER_TRACKING.md`.

---

### B15 · Add sportId to GroupInvitationResponse
**Status:** `DONE` (2026-07-25) · **Type:** Enhancement · **Filed:** 2026-07-24, alongside client
ticket **GRP-8** — two client needs both require knowing an invitation's group's sport without a
second round-trip: (1) GRP-7's accept-invitation flow works around this gap today by
force-switching the sport filter to "All" before navigating, instead of switching directly to the
group's real sport; (2) GRP-8's new "add this sport to your profile?" accept-time confirmation
needs the sportId both to check whether the invitee already has a matching sport profile and to
submit the profile-creation call if they confirm.

**Delta (2026-07-25, resolved at pickup — `sportName` dropped from scope):** the ticket as
originally filed also called for a `sportName` field, resolved the same way `post-impl`'s A9
resolves `PostResponse.sportName` (inject `SportService`, batch `getSportsByIds()` once per page).
Reconsidered before implementation: sports are static reference data, already fully exposed via the
public `GET /api/sports` endpoint — a client fetches that list once and resolves any `sportId` to a
name locally, so there's no need for the backend to add a new cross-domain `SportService`
dependency to `group-impl` just to join a name in on every response. This also resolves an internal
contradiction in the original scope text, which called the change "purely additive — no new query"
while `sportName` would in fact have required one.

**What shipped:** `GroupInvitationResponse.sportId: Long` only, resolved from the already-loaded
`Group` row (zero new queries). The invitation-mapping helper chain
(`mapToGroupInvitationResponse`/`mapInvitationPage`/`mapSingleInvitationResponse`) now threads the
`Group` entity itself through instead of just its `groupName` string — same convention already used
by `mapToJoinRequestResponse(request, groupsById, usersById)` for join requests.
`getUserPendingInvitations` (the one call site spanning multiple groups/sports in one page) batches
a `Map<Long, Group>` via its existing `groupRepository.findAllById(...)` call, no new query added.

**Follow-up filed, not executed:** the same static-reference-data reasoning applies to `post-impl`'s
A9 `sportName` field — but that field is already shipped and live-consumed by the client's
Feed/PostCard sport-badge rendering, so removing it would be a breaking contract change, not a
purely-additive one like this ticket. Filed as `modules/social/post-impl/docs/BACKLOG_MVP.md`'s new
**A12** to resolve whether the client already has a locally-cached sports list reachable from that
render path before acting on it.

**Tests:** `GroupServiceImplSpec` — added `sportId` assertions to existing happy-path tests
(`getDeclinedInvitations`, `getMemberSentInvitations` ×2, `createInvitation`); added a new
happy-path test for `getGroupInvitations` (previously had zero happy-path coverage, only a
permission-denied case); added two new tests for `getUserPendingInvitations` (previously had
**zero** Spock coverage at all) covering per-group sportId resolution across a multi-group page and
the defensive null/"Unknown Group" fallback. `./gradlew :modules:social:group-impl:test` — 131
green. `./gradlew :server:test` — 34 green (required setting `DOCKER_HOST` explicitly per
`server/README.md`'s documented Rancher Desktop/Windows Testcontainers workaround — environment
quirk, not a code issue). Full writeup:
`modules/social/group-impl/docs/B15_INVITATION_SPORT_ID.md`.

---

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A2 · Direct join | Removed — all joins go through request → owner approval flow |
| A4 · Post approval | Removed — all members can post immediately; no approval needed |
| B4 · Group location | Deferred — will be considered in a later phase |
| B6 · Group announcements | Replaced by A6a (pinned posts) + B6b (group info fields) |
| B10 · Group type change flow (upgrade/downgrade) | Moved to V1 — `modules/social/group-impl/docs/BACKLOG_V1.md` |
