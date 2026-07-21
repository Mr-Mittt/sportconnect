# Group Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/group-impl`  
**Last updated:** 2026-07-21

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

---

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

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A2 · Direct join | Removed — all joins go through request → owner approval flow |
| A4 · Post approval | Removed — all members can post immediately; no approval needed |
| B4 · Group location | Deferred — will be considered in a later phase |
| B6 · Group announcements | Replaced by A6a (pinned posts) + B6b (group info fields) |
| B10 · Group type change flow (upgrade/downgrade) | Moved to V1 — `modules/social/group-impl/docs/BACKLOG_V1.md` |
