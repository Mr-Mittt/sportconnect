# B1 · Member Invitation Flow — Implementation Summary

**Ticket:** B1  
**Status:** DONE  
**Date:** 2026-06-30

---

## What was built

A 3-step invitation flow for group members to invite other users:

1. **Member sends invite** → `GroupInvitation` created with status `pending_owner`
2. **Owner/admin approves** → status moves to `pending_user`; notification stub left for ADR resolution
3. **Owner/admin declines** → status set to `declined_by_owner`; nothing sent

Invited user responses:
- **Accepts** → status `accepted` + `GroupMember` row created with `group_member` role
- **Rejects** → status `declined_by_user`

---

## Files changed

| File | Change |
|---|---|
| `server/…/V018__create_group_invitations.sql` | New migration: `group_invitations` table |
| `db.changelog-master.xml` | Registered V018 |
| `group-impl/…/GroupInvitation.java` | New entity |
| `group-impl/…/GroupInvitationRepository.java` | New repository |
| `group-api/…/CreateInvitationRequest.java` | New DTO |
| `group-api/…/GroupInvitationResponse.java` | New DTO |
| `group-api/…/GroupService.java` | 7 new interface methods |
| `group-impl/…/GroupServiceImpl.java` | 7 new method implementations + helper |
| `group-impl/…/GroupController.java` | 8 new endpoints |
| `group-impl/…/GroupServiceImplSpec.groovy` | 13 new Spock tests (happy + error paths) |

---

## Key decisions

**Statuses as plain strings** — mirrors `GroupJoinRequest` convention (`"pending"`, etc.). No enum to keep it consistent with existing code; revisit if this pattern causes issues at scale.

**Duplicate pending invite → silent 200** — returns the existing invitation object rather than an error. Prevents spam from the inviter while giving them the current state.

**Invitee already a member → 400 error** — unlike the duplicate invite case, the inviter should know why their action had no effect.

**Friend check stubbed** — `// TODO: stub` comment marks the guard site in `createInvitation`. Wire `userFriendService.areFriends()` once U1 (friendship system) is implemented in user-impl.

**Notifications stubbed** — `// TODO: notify` comment at the `approveInvitation` call site. Pending ADR.md `#in-app-notification` decision.

---

## Non-obvious constraints

- `GroupInvitationRepository.findByGroupIdAndInviteeIdAndStatusIn` is needed alongside the `existsBy…` variant because the silent-ignore path must return the existing object — `existsBy` alone isn't enough.
- `canManageMembers` calls both `isGroupOwner` and `isGroupAdmin` sequentially, so Spock tests for permission-denial paths must declare `2 *` on `findByGroupIdAndUserId` mock interactions.
- The `allowMemberInvites` group setting defaults to `false` on group creation — owners must explicitly enable it before members can send invitations.

---

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
