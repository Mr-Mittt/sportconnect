# Group Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/group-impl`  
**Last updated:** 2026-11-27 (B25 done)

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [B21](MVP/B21_NOTIFICATION_OUTBOX_WIRING.md) | Notification outbox wiring — join requests, invites | `TODO` |
| 2 | [B24](MVP/B24_GROUP_INVITE_AND_ADD_MUST_REFUSE_DEACTIVATED_ACCOUNTS.md) | Group `createInvitation` and `addMember` check only a friendship row, so a deactivated friend can be invited or added: refuse a deactivated target (coded, proposal `404 USER_NOT_FOUND` like `sendFriendRequest`); also decide the accept/approve paths (the deactivated-accounts rule, NEXT_TOPICS) | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [B25](MVP/B25_GROUP_COUNTRY_AND_REGION.md) | A group has a required country and region (`NOT NULL`, the owner's on creation, owner or admin can change them; V110 fills existing groups from the current owner's and deactivates those whose owner has none); the reference data carries the timezone and the group answers it derived | `DONE` |
| 2 | [GROUP-1](MVP/GROUP-1_REMOVE_THE_OLD_SINGLE_RECURRENCE_RULE.md) | Removed the old single weekly recurrence rule: V097 drops `groups.recurrence_*` and `group_settings.auto_generate_sessions` (destructive, backup first), `GET/PUT /api/groups/{id}/recurrence`, three DTOs, four `GroupService` methods, the settings flag and group-impl's location dependency; replaced by the session domain's configurations (`modules/session/docs/BACKLOG_MVP.md`, SESSION-GROUP-4/5). `GroupOldRecurrenceRuleRemovedIntegrationTest` 3 | `DONE` (2026-11-19) |
| 3 | [B22](MVP/B22_GROUP_RECURRENCE_GAME_MOOD.md) | Group recurrence config carries a game mood: **closed as superseded by GROUP-1** (the game mood is a field of the new recurrence configuration, SESSION-GROUP-4) | `DONE` (2026-11-19) |
| 4 | [B23](MVP/B23_GROUP_MEMBER_NAME_SEARCH_FOR_TAGGING.md) | Group member name search for tagging: `GET /api/groups/{id}/members/search` (SESSION-GL-64's rule, default 5, ceiling 20, members only); unblocks CLIENT-GL-50 part 2 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 5 | [A11](MVP/A11_ERROR_CODE_AUDIT.md) | **[Error handling · Phase B]** Error code audit for the group module — 29 `GROUP_*` codes; permission failures 400 → 403, state conflicts 400 → 409. Pairs with CLIENT-ERR-5 | `DONE` |
| 6 | [B20](MVP/B20_CAN_MANAGE_SELF_CONTAINED_QUERY.md) | Make `canManageMembers`/`canManagePosts` self-contained instead of composing `isGroupOwner`/`isGroupAdmin` | `DONE` |
| 7 | [B17](MVP/B17_DROP_GROUP_TABLES_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on group-impl tables' cross-domain columns | `DONE` |
| 8 | [B18](MVP/B18_GROUP_ACTIVE_PERMISSION_GATE.md) | Require `group.isActive` in `isGroupMember`/`isGroupOwner`/`isGroupAdmin`; add `isGroupActive()` | `DONE` |
| 9 | [B19](MVP/B19_GROUP_GENERAL_DATA_ENDPOINT.md) | Dedicated `PUT /{groupId}/generalData` endpoint — unblocks client GRP-9 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 10 | [B16](MVP/B16_GROUPS_SPORT_ID_PARTIAL_INDEX.md) | Partial index on `groups.sport_id` for public-group search | `DONE` |
| 11 | [B14](MVP/B14_INVITATION_CO_INVITER_TRACKING.md) | Track every co-inviter on a single group invitation — unblocks client GRP-8 | `DONE` |
| 12 | [B15](MVP/B15_INVITATION_SPORT_ID.md) | Add sportId to GroupInvitationResponse — unblocks client GRP-8 | `DONE` |
| 13 | [B12](MVP/B12_CANCEL_A_SENT_INVITATION_WHILE_STILL_PENDING_OWNER.md) | Cancel a sent invitation while still `pending_owner` — unblocks a client GRP-7 addendum (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 14 | [B13](MVP/B13_INVITATION_REJECT_REASON.md) | Persist a rejection reason on invitee-declined invitations — unblocks client GRP-8 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 15 | [B11](MVP/B11_JOIN_INVITATION_RACE_CONDITIONS.md) | Reconcile join-request/invitation race conditions — blocks client GRP-7 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 16 | [B9](MVP/B9_GROUP_WELCOME_SYSTEM_POST.md) | Group system posts — welcome post on member join | `DONE` |
| 17 | [A10](MVP/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md) | Add multi-value `sportIds` filter to `GET /api/groups/public` — unblocks client GRP-6 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 18 | [B8](MVP/B8_INVITATION_STATUS_FILTER.md) | Extend member-sent invitations to include owner-approved status | `DONE` |
| 19 | [B7](MVP/B7_GROUP_TYPE_TIERS.md) | Settings data set audit → group-type membership-cap tiers | `DONE` |
| 20 | [A9](MVP/A9_PRIVACY_MEMBERSHIP_CHECK_GETGROUP.md) | Add privacy/membership check to `getGroup` | `DONE` |
| 21 | [A6](MVP/A6_FIX_CROSS_DOMAIN_VIOLATION.md) | Fix cross-domain violation (UserRepository/User → UserService/UserFriendService) | `DONE` |
| 22 | [A7](MVP/A7_FIX_N1_QUERIES.md) | Fix N+1 queries in paginated list mappers | `DONE` |
| 23 | [A8](MVP/A8_FIX_N1_GETUSERGROUPS.md) | Fix N+1 in getUserGroups | `DONE` |
| 24 | [B1](MVP/B1_MEMBER_INVITATION_FLOW.md) | Member invitation flow | `DONE` |
| 25 | [A5](MVP/A5_TEST_COVERAGE_GAPS.md) | Test coverage gaps | `DONE` |
| 26 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 27 | [A3](MVP/A3_CANCEL_JOIN_REQUEST.md) | Cancel join request | `DONE` |
| 28 | [B6b](MVP/B6b_GROUP_INFO_FIELDS.md) | Group info fields | `DONE` |
| 29 | [B2](MVP/B2_Group_Sport_Association_UserSpace.md) | Group–Sport association + UserSpace | `DONE` |
| 30 | [B5](MVP/B5_Group_Search_And_Discovery.md) | Group search & discovery | `DONE` |
| 31 | [B3](MVP/B3_THREE_POST_TYPES.md) | Three post types | `DONE` |
| 32 | [B6a](MVP/B6a_PINNED_POSTS.md) | Pinned posts | `DONE` |
| 33 | [GROUP-RECUR-1](MVP/GROUP-RECUR-1_RECURRING_SESSION_SCHEDULE_CONFIG.md) | Recurring-session schedule config, alongside `modules/session` and `modules/location` | `DONE` |

---

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A2 · Direct join | Removed — all joins go through request → owner approval flow |
| A4 · Post approval | Removed — all members can post immediately; no approval needed |
| B4 · Group location | Deferred — will be considered in a later phase |
| B6 · Group announcements | Replaced by A6a (pinned posts) + B6b (group info fields) |
| B10 · Group type change flow (upgrade/downgrade) | Moved to V1 — `modules/social/group-impl/docs/BACKLOG_V1.md` |
