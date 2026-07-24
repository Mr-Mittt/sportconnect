# CLAUDE.md — group-impl

Sports group lifecycle: creation, 3-tier role permissions, member management,
join request workflow, and per-group settings.

## Dependencies

| From | Why |
|---|---|
| `modules/social/group-api` | GroupService interface + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| Spring Security | `@PreAuthorize` on write endpoints |

## Role Hierarchy

| Role name (string) | Level | Permissions |
|---|---|---|
| `"group_owner"` | 3 | Delete group, transfer ownership, update settings, all admin actions |
| `"group_admin"` | 2 | Manage members (not owner), accept/decline join requests |
| `"group_member"` | 1 | Post (if settings allow), like, comment |

Roles are **pre-seeded strings** from V007 migration. Always fetch by name via
`GroupRoleRepository.findByRoleName()` — never create roles programmatically.

## Key Classes

| Class | Purpose |
|---|---|
| `GroupServiceImpl` | 600+ line service; all business logic and permission guards |
| `GroupController` | 36 endpoints at `/api/groups` |

## Endpoints

```
// Group CRUD
POST   /api/groups                                         ROLE_USER
GET    /api/groups/{groupId}
GET    /api/groups/user/{userId}
GET    /api/groups/public
PUT    /api/groups/{groupId}
DELETE /api/groups/{groupId}

// Members
POST   /api/groups/{groupId}/members
DELETE /api/groups/{groupId}/members/{targetUserId}
PUT    /api/groups/{groupId}/members/{targetUserId}/role
GET    /api/groups/{groupId}/members
PUT    /api/groups/{groupId}/transfer-ownership
DELETE /api/groups/{groupId}/leave

// Join Requests
POST   /api/groups/join-requests
PUT    /api/groups/join-requests/{requestId}/accept
PUT    /api/groups/join-requests/{requestId}/decline
GET    /api/groups/{groupId}/join-requests
GET    /api/groups/join-requests/user/{userId}

// Settings
GET    /api/groups/{groupId}/settings
PUT    /api/groups/{groupId}/settings

// Permission checks
GET    /api/groups/{groupId}/permissions/is-owner
GET    /api/groups/{groupId}/permissions/is-admin
GET    /api/groups/{groupId}/permissions/is-member
GET    /api/groups/{groupId}/permissions/user-role
```

## Run Tests

```bash
./gradlew :modules:social:group-impl:test
./gradlew :modules:social:group-impl:test --tests "com.sportconnect.social.group.service.GroupServiceImplSpec"
```

## Key Business Rules (enforced in service)

1. One owner per group — auto-assigned on `createGroup`; cannot be removed; cannot be set via `updateMemberRole`
2. Owner cannot leave — must call `transferOwnership` first, then `leaveGroup`
3. One pending request per user per group — `createJoinRequest` checks for existing pending before creating
4. `transferOwnership` — new owner must be an existing member; previous owner becomes `group_admin`
5. Settings defaults on create: `allowMemberPosts=true`, `requirePostApproval=false`, `allowMemberInvites=false`
6. `getGroupSettings` requires membership — non-members get `BadRequestException`
7. Every path that inserts a `GroupMember` row must also trigger the `GROUP_SYSTEM` welcome post
   (B9) via the private `postWelcomeMessage(groupId, newMemberId, inviterId)` helper — pass
   `inviterId = null` for a self-requested join (no one to credit), or the actual inviter's id
   when the join came through an invitation (including an owner/admin's `addMember`-initiated
   one, B9). When adding a new member-join path in the future (e.g. a new invite mechanism),
   check whether it needs this wired in too, the same way B7's `enforceMemberCapacity` had to be
   added to every insertion path. The post is authored by `resolveGroupOwnerId(groupId)` (the
   *current* owner, not `createdBy`) — there is no dedicated system user account. All member-insert
   paths funnel through the private `finalizeMembership(groupId, userId, creditedInviterId)`
   helper (B11) — capacity check + `GroupMember` insert + welcome post in one place; a new
   member-join path should call this rather than reinventing the three steps.
8. `group_join_requests` and `group_invitations` are independent tables with no DB-level link, but
   the service layer keeps them reconciled (B11) so the same (group, person) pair can't sit as two
   unrelated pending items:
   - `createInvitation`: an owner/admin's own invitation skips `pending_owner` — created directly
     at `pending_user` (or `accepted`, if rule 2 below fires in the same call).
   - Both places an invitation is about to become `pending_user` (`approveInvitation`'s normal
     transition, and the owner/admin direct-create path above) check for a `pending` join request
     from the same person first — if one exists, the invitation goes straight to `accepted`, the
     join request is marked `accepted` too (not left dangling), and membership is finalized then
     and there.
   - `createJoinRequest`: if the requester already has a `pending_user` invitation for this group,
     no ordinary pending row is created — a `GroupJoinRequest` is created directly as `accepted`,
     crediting the invitation's approver as `reviewedBy`, and the invitation is accepted too.
   - Deliberate consequence: a single real join event can leave two `accepted` rows (one
     invitation, one join request) for the same (group, person) — no attempt is made to merge or
     suppress either. See `modules/social/group-impl/docs/B11_JOIN_INVITATION_RACE_CONDITIONS.md`
     and the note on client ticket GRP-7 (`client/docs/BACKLOG_MVP.md`) for the display-side
     follow-up.
   - Full rule diagrams: `documentation/md/adr/JOIN_GROUP_ADR.md` §5.

## Gotchas

- Role names are plain strings — always use the exact values `"group_owner"`, `"group_admin"`, `"group_member"` when querying or comparing.
- `canManagePosts()` is defined in `GroupServiceImpl` but not called anywhere — placeholder for the future post-approval flow.
- `GroupMember.joinedAt` is set by `@PrePersist` — do not set it manually.
