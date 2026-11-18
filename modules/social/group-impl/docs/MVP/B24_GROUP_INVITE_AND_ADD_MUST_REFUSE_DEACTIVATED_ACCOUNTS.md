# B24 · Group invite and add must refuse a deactivated account

**Status:** `TODO`
**Type:** Enhancement (Security)
**Depends on:** none (the rule is root `CLAUDE.md` § Account lifecycle; the model is `UserFriendServiceImpl.sendFriendRequest`)
**Filed:** 2026-11-18, found while auditing the owner's rule "a lookup to show a user includes deactivated accounts, a lookup for a new interaction excludes them" (raised during SESSION-66). Part of the NEXT_TOPICS topic "Deactivated accounts in new interactions".

`GroupServiceImpl.createInvitation(groupId, inviterId, request)` (the invitee is `request.inviteeId`) and `addMember(groupId, adminUserId, targetUserId)` both gate the target only with `userFriendService.areFriends(...)`, which is a friendship **row**: a deactivated account stays someone's friend, so a deactivated friend can be invited (and a pending invitation or a `GroupMember` row plus the `GROUP_SYSTEM` welcome post is created for them) or added straight into the group. By the rule, reaching or acting on a person is a new interaction and must exclude deactivated accounts.

**Rule to apply.** Check the target is active before any write. One target, one `UserService.getActiveUserIds(List.of(id))` (or the existing active lookup), not a per-row loop. Because there is a single target and the caller named them on purpose, a **coded refusal** fits better than a silent skip: proposal, the same answer `sendFriendRequest` gives, `404 USER_NOT_FOUND` (the deactivated account is indistinguishable from a missing one, so it does not reveal that the account exists). The final code is decided at pickup; a new code needs its `errors:codes` en/vi copy in this change or a client ticket filed with it, and a row in `ERROR_CODES.md` § group.

**Also decide at pickup** (U28 audits them first): the paths that *complete* a pending item for a person who was deactivated after it was created: `acceptJoinRequest`, `approveInvitation`, `acceptInvitation`, and the B11 side effect `acceptJoinRequestAsSideEffect`. Likely the same check, with the same answer, before `finalizeMembership` (capacity check, `GroupMember` insert, welcome post).

**Out of scope:** the member-search and member-list reads (search is active-only already; lists show deactivated members by name on purpose), removing an already deactivated member, group notifications (B21).

**Tests:** Spock for the active check in both methods; an IT through the real pipeline (`GroupErrorCodesIntegrationTest` style): invite a deactivated friend, add a deactivated friend, an active friend still works, no row and no welcome post written on refusal.
