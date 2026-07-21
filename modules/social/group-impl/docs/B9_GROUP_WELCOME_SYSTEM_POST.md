# B9 · Group System Posts — Welcome Post on Member Join

**Status:** `DONE` (2026-07-21)
**Type:** New Feature (cross-module — touches post module, same shape as B3)

## Origin

Raised while discussing B8/GRP-3: should `GroupMemberResponse` expose who invited a member and
who approved them, so the group can "say hello" to a new member? Exposing `invitedBy` as a
permanent field on every member row was rejected as an indefinite social-graph disclosure. A
transient, feed-visible system post gives the same icebreaker value without adding a durable field
to the API surface.

## Design (as approved, then revised during scoping)

The original ticket draft proposed a dedicated system-user account (global or per-group) as the
post's author, and left `addMember`'s interaction with this feature unresolved. Both were resolved
via discussion before implementation, and the final shipped design differs from the initial draft
in two material ways:

1. **No system-user account.** Rejected in favor of authoring every welcome post as the group's
   *current* owner, resolved dynamically at post-time (not `Group.createdBy`, since ownership can
   transfer). Simpler — no new `UserService` method, no cross-domain user-creation flow, no
   per-group or global placeholder account to provision or exclude from search/friend-suggestion
   surfaces.
2. **`addMember` redesigned, not just wired up.** The ticket's original three trigger points
   (`acceptJoinRequest`, `acceptInvitation`, `addMember`) assumed `addMember` would keep inserting
   a `GroupMember` row directly. During scoping, the decision was made that an owner/admin's direct
   add should **not** bypass the same friends-only gate and acceptance step a peer-sent invitation
   goes through — so `addMember` no longer inserts a member directly at all. It now creates a
   self-approved `GroupInvitation` (`status = pending_user`, `reviewedBy`/`reviewedAt` set to the
   caller/now) that the target must still accept via the existing `acceptInvitation` endpoint. This
   collapses `addMember`'s trigger into the `acceptInvitation` trigger — there is no longer a
   separate "direct add, no inviter to credit" content variant; only `acceptJoinRequest` (self
   join, no inviter) and `acceptInvitation` (mentions the inviter, whoever it is) remain.

## What was built

**Migration** `V027__add_group_system_post_type.sql` — additive `ALTER TABLE posts ADD CONSTRAINT
chk_post_type CHECK (... 'GROUP_SYSTEM')`, no data truncation (unlike B3's V016, which truncated
dev data when it first introduced `post_type`).

**post-api**
- `PostType.GROUP_SYSTEM` added.
- `PostService.createSystemPost(Long groupId, UUID authorUserId, String content)` — new,
  internal-only (not REST-reachable).

**post-impl (`PostServiceImpl`)**
- `createPost` rejects caller-supplied `postType == GROUP_SYSTEM` outright (`BadRequestException`)
  — closes the spoofing hole the ticket flagged: without this guard, any authenticated user could
  self-author a fake system post via the public `POST /api/posts` endpoint.
- `createSystemPost` builds and saves a `Post` directly (`visibility = "public"`, no media, no
  hashtag extraction — content is server-templated and never contains hashtags).
- `updatePost` / `deletePost` both reject `GROUP_SYSTEM` posts unconditionally, before any
  ownership/moderator check — nobody edits or deletes a system post, not even the group owner who
  nominally authored it (this is stricter than the ticket's original suggestion of "owner/admin
  delete for moderation"; the user opted for no exception at all).

**group-impl (`GroupServiceImpl`)**
- New private `resolveGroupOwnerId(groupId)` — resolves the live `group_owner`-role `GroupMember`
  row (`groupMemberRepository.findByGroupIdAndRoleId`), correct across ownership transfers.
- New private `postWelcomeMessage(groupId, newMemberId, inviterId)` — batches the user lookup(s)
  via `userService.getUsersByIds`, builds the content string, calls `postService.createSystemPost`
  authored by `resolveGroupOwnerId(groupId)`. `inviterId = null` → `"{name} joined the group 👋"`;
  non-null → `"{name} joined the group — invited by {inviter} 👋"`.
- Wired into `acceptJoinRequest` (no inviter) and `acceptInvitation` (mentions
  `GroupInvitation.inviterId`, which for an owner/admin-initiated add is that owner/admin).
- `addMember(groupId, adminUserId, targetUserId)` — signature dropped the `roleName` param
  entirely (direct role assignment on add is gone; promote via `updateMemberRole` after the
  invitation is accepted, since acceptance always resolves to `group_member`, same as any other
  invitation). Still requires `userFriendService.areFriends(adminUserId, targetUserId)` and the
  same early `checkMemberCapacityNotExceeded` used by `createInvitation`; rejects if the target
  already has an in-flight invitation to the group.
- `group-api`'s `GroupService.addMember` signature updated to match; `GroupController`'s
  `POST /{groupId}/members` drops the `roleName` request param, response message changed to
  "Invitation sent — awaiting the user's acceptance".

**`group-impl/CLAUDE.md`** — added business rule 7: every path that inserts a `GroupMember` row
must also trigger the welcome post, flagged the same way B7's `enforceMemberCapacity` rule is, so
a future new join-mechanism ticket doesn't miss wiring this in.

## Tests

- `PostServiceImplSpec`: `createPost` rejects `GROUP_SYSTEM`; `createSystemPost` happy path;
  `updatePost`/`deletePost` reject `GROUP_SYSTEM` unconditionally (including for the post's nominal
  author).
- `GroupServiceImplSpec`: `acceptJoinRequest`/`acceptInvitation` happy-path tests extended to
  assert the welcome-post call chain (`getUsersByIds` → `findByGroupIdAndRoleId` →
  `createSystemPost`); `addMember` tests rewritten for the new invitation-creation behavior (happy
  path, capacity, not-admin, already-member, not-friends, already-invited).
- `GroupControllerTest` (server, Testcontainers): `addMember_Success` updated for the dropped
  `roleName` param and new response message.

## Verification

- `:modules:social:post-impl:test` — green.
- `:modules:social:group-impl:test` — green.
- `:server:test` — green, 30/30 (Docker/Testcontainers was down at first pass in this environment;
  user started Rancher Desktop mid-session, re-run afterward went green — includes
  `GroupControllerTest.addMember_Success` and `PostControllerIntegrationTest.shouldCreatePost`
  exercising the real, Liquibase-migrated schema with the new `GROUP_SYSTEM` constraint value).

## Out of scope (unchanged from the ticket, narrowed further by this session's decisions)

- System posts for leave/remove/role-change events, per-user/per-group opt-out toggle,
  push-notification tie-in.
- Client-side rendering of `GROUP_SYSTEM` posts (separate future client ticket, scoped against
  GRP-1's Posts tab).
- A dedicated system-user account (dropped; owner authors the post instead).
- Preserving `addMember`'s one-call direct-role-assignment capability (dropped; `updateMemberRole`
  after acceptance covers it).
