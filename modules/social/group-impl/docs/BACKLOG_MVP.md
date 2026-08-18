# Group Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/group-impl`  
**Last updated:** 2026-08-16

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

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [B20](MVP/B20_CAN_MANAGE_SELF_CONTAINED_QUERY.md) | Make `canManageMembers`/`canManagePosts` self-contained instead of composing `isGroupOwner`/`isGroupAdmin` | `DONE` |
| 2 | [B17](MVP/B17_DROP_GROUP_TABLES_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on group-impl tables' cross-domain columns | `DONE` |
| 3 | [B18](MVP/B18_GROUP_ACTIVE_PERMISSION_GATE.md) | Require `group.isActive` in `isGroupMember`/`isGroupOwner`/`isGroupAdmin`; add `isGroupActive()` | `DONE` |
| 4 | [B19](MVP/B19_GROUP_GENERAL_DATA_ENDPOINT.md) | Dedicated `PUT /{groupId}/generalData` endpoint — unblocks client GRP-9 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 5 | [B16](MVP/B16_GROUPS_SPORT_ID_PARTIAL_INDEX.md) | Partial index on `groups.sport_id` for public-group search | `DONE` |
| 6 | [B14](MVP/B14_INVITATION_CO_INVITER_TRACKING.md) | Track every co-inviter on a single group invitation — unblocks client GRP-8 | `DONE` |
| 7 | [B15](MVP/B15_INVITATION_SPORT_ID.md) | Add sportId to GroupInvitationResponse — unblocks client GRP-8 | `DONE` |
| 8 | [B12](MVP/B12_CANCEL_A_SENT_INVITATION_WHILE_STILL_PENDING_OWNER.md) | Cancel a sent invitation while still `pending_owner` — unblocks a client GRP-7 addendum (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 9 | [B13](MVP/B13_INVITATION_REJECT_REASON.md) | Persist a rejection reason on invitee-declined invitations — unblocks client GRP-8 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 10 | [B11](MVP/B11_JOIN_INVITATION_RACE_CONDITIONS.md) | Reconcile join-request/invitation race conditions — blocks client GRP-7 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 11 | [B9](MVP/B9_GROUP_WELCOME_SYSTEM_POST.md) | Group system posts — welcome post on member join | `DONE` |
| 12 | [A10](MVP/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md) | Add multi-value `sportIds` filter to `GET /api/groups/public` — unblocks client GRP-6 (`client/docs/BACKLOG_MVP.md`) | `DONE` |
| 13 | [B8](MVP/B8_INVITATION_STATUS_FILTER.md) | Extend member-sent invitations to include owner-approved status | `DONE` |
| 14 | [B7](MVP/B7_GROUP_TYPE_TIERS.md) | Settings data set audit → group-type membership-cap tiers | `DONE` |
| 15 | [A9](MVP/A9_PRIVACY_MEMBERSHIP_CHECK_GETGROUP.md) | Add privacy/membership check to `getGroup` | `DONE` |
| 16 | [A6](MVP/A6_FIX_CROSS_DOMAIN_VIOLATION.md) | Fix cross-domain violation (UserRepository/User → UserService/UserFriendService) | `DONE` |
| 17 | [A7](MVP/A7_FIX_N1_QUERIES.md) | Fix N+1 queries in paginated list mappers | `DONE` |
| 18 | [A8](MVP/A8_FIX_N1_GETUSERGROUPS.md) | Fix N+1 in getUserGroups | `DONE` |
| 19 | [B1](MVP/B1_MEMBER_INVITATION_FLOW.md) | Member invitation flow | `DONE` |
| 20 | [A5](MVP/A5_TEST_COVERAGE_GAPS.md) | Test coverage gaps | `DONE` |
| 21 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 22 | [A3](MVP/A3_CANCEL_JOIN_REQUEST.md) | Cancel join request | `DONE` |
| 23 | [B6b](MVP/B6b_GROUP_INFO_FIELDS.md) | Group info fields | `DONE` |
| 24 | [B2](MVP/B2_Group_Sport_Association_UserSpace.md) | Group–Sport association + UserSpace | `DONE` |
| 25 | [B5](MVP/B5_Group_Search_And_Discovery.md) | Group search & discovery | `DONE` |
| 26 | [B3](MVP/B3_THREE_POST_TYPES.md) | Three post types | `DONE` |
| 27 | [B6a](MVP/B6a_PINNED_POSTS.md) | Pinned posts | `DONE` |
| 28 | [GROUP-RECUR-1](MVP/GROUP-RECUR-1_RECURRING_SESSION_SCHEDULE_CONFIG.md) | Recurring-session schedule config, alongside `modules/session` and `modules/location` | `DONE` |

---

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A2 · Direct join | Removed — all joins go through request → owner approval flow |
| A4 · Post approval | Removed — all members can post immediately; no approval needed |
| B4 · Group location | Deferred — will be considered in a later phase |
| B6 · Group announcements | Replaced by A6a (pinned posts) + B6b (group info fields) |
| B10 · Group type change flow (upgrade/downgrade) | Moved to V1 — `modules/social/group-impl/docs/BACKLOG_V1.md` |
