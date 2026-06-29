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
| `GroupController` | 24 endpoints at `/api/groups` |

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

## Gotchas

- Role names are plain strings — always use the exact values `"group_owner"`, `"group_admin"`, `"group_member"` when querying or comparing.
- `canManagePosts()` is defined in `GroupServiceImpl` but not called anywhere — placeholder for the future post-approval flow.
- `GroupMember.joinedAt` is set by `@PrePersist` — do not set it manually.
