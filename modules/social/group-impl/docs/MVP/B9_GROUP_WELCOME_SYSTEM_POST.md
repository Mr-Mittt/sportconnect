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

---

**Status:** `DONE` (2026-07-21) · **Summary:** `modules/social/group-impl/docs/MVP/B9_GROUP_WELCOME_SYSTEM_POST.md`
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
