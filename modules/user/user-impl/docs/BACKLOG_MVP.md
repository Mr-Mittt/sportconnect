# User Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/user/user-impl`  
**Last updated:** 2026-09-04 (U15 filed)

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon user MVP` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| — | — | _(none — all MVP tickets done)_ | — |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [U15](MVP/U15_ACTIVE_SPORT_IDS_ON_USER_INFO_RESPONSE.md) | `activeSportIds: List<Long>` on `UserInfoResponse` (2026-09-04) — PII-free sport-id list a non-owner read needs (friend-profile sport pills), via a new cross-domain `user-impl → sport-api` call (`getUserProfiles(id)`, active-only) in a new `UserService.toPublicUserInfo(UserResponse)`. Fills the gap A22 left removing `GET /sports/profiles/user/{id}`. Unblocks client SPORT-11. Green: `:modules:user:user-impl:test` + full `:server:test` + live smoke | `DONE` |
| 2 | [U14](MVP/U14_DEDICATED_FRIENDS_DIRECTORY_PROFILE_ENDPOINT.md) | Dedicated Friends-directory profile endpoint — resolved to **no backend change**: U11's `UserInfoResponse` already is the contract Friends needs; client cleanup handed to `FRIEND-2` | `DONE` |
| 3 | [U13](MVP/U13_NOTIFICATION_OUTBOX_WIRING_FRIEND_REQUEST_RECEIVED_ACCEPTED.md) | Notification outbox wiring — friend request received/accepted | `DONE` |
| 4 | [U12](MVP/U12_REVOKE_SESSIONS_WHEN_A_USER_IS_DEACTIVATED.md) | Revoke sessions when a user is deactivated | `DONE` |
| 5 | [U11](MVP/U11_PROTECT_USER_DATA_SCOPE_PUBLIC_USER_LOOKUP_ENDPOINTS.md) | Protect user data — scope public user-lookup endpoints away from full PII | `DONE` |
| 6 | [U8](MVP/U8_FIX_N1_PENDING_REQUESTS.md) | Fix N+1 in UserFriendServiceImpl pending-request mappers | `DONE` |
| 7 | [U2](MVP/U2_JWT_IDENTITY_AND_SOFT_DELETE_FIX.md) | JWT-based identity + soft-delete query fix | `DONE` |
| 8 | [U3](MVP/U3_USER_PREFERENCE_ENDPOINTS.md) | UserPreference endpoints | `DONE` |
| 9 | [U4](MVP/U4_PASSWORD_CHANGE_ENDPOINT.md) | Password change endpoint | `DONE` |
| 10 | [U5](MVP/U5_TEST_COVERAGE_BACKFILL.md) | Test coverage backfill | `DONE` |
| 11 | [U6](MVP/U6_USER_DISCOVERY.md) | User discovery — find people to add as friends | `DONE` |
| 12 | [U7](MVP/U7_GENERAL_PHYSICAL_PROFILE_STATS.md) | General physical profile stats | `DONE` |
| 13 | [U1](MVP/U1_FRIENDSHIP_SYSTEM.md) | Friendship system | `DONE` |
| 14 | [U9](MVP/U9_FIX_SENDFRIENDREQUEST_CRASH_ON_RE_SEND_AFTER_DECLINE.md) | Fix sendFriendRequest crash on re-send after decline/cancel/unfriend | `DONE` |
| 15 | [U10](MVP/U10_CROSSED_FRIEND_REQUESTS_ESTABLISH_FRIENDSHIP_IMMEDIATELY.md) | Crossed friend requests establish friendship immediately | `DONE` |

---

**Dependencies:**
```
U2 → U4
U3, U5, U6, U7: no hard dependency (can run in parallel with anything)
U6 reuses U1 (Friendship system, DONE) for friendship-status enrichment
U12 (DONE 2026-08-28) added a new user-impl → auth-api dependency (Fix 1) — this created a circular
  Spring bean dependency with AuthServiceImpl (which already depended on UserService), fixed via
  @Lazy on UserServiceImpl's AuthService field, same pattern as GroupServiceImpl's @Lazy PostService
U13 (DONE 2026-08-28) added a new user-impl → spring-boot-starter-amqp dependency and a
  user-impl → notification-impl event-payload contract (via user-api's new
  com.sportconnect.user.api.event package). Consumer side shipped in modules/notification in the
  same ticket; client NotificationType/getNotificationText cases deferred to a CLIENT-NOTIF-* ticket.
U14 (DONE 2026-08-29) — resolved to **no backend change**. U11 (2026-08-28) already narrowed
  `GET /api/users/{userId}` to `UserInfoResponse` (`id`/`fullName`/`username`/`avatarUrl`/
  `coverUrl`/`bio`, `hasRole('USER')`-gated), which is exactly the contract Friends needs (a
  superset — Friends renders only fullName/bio/avatar/cover). No new endpoint warranted; the
  client feature-folder cleanup stays with client FRIEND-2 (now unblocked). See U14's own doc
  § Resolution.
U15 (DONE 2026-09-04) added a new user-impl → sport-api dependency (interface + DTOs only;
  sport-api depends solely on :modules:common, so no cycle — unlike U12's auth-api edge).
  `UserInfoResponse` gained `activeSportIds`; new `UserService.toPublicUserInfo(UserResponse)`
  does the cross-domain `getUserProfiles(id)` read. Unblocks client SPORT-11 (friend-profile
  sport pills rewire onto the new field).
```

---

## Removed / Deferred

- **Partner/skill matching + user discovery** — discussed during the 2026-07-01 backend brainstorm;
  explicitly deferred, not scoped as a ticket. Depends on cross-domain `UserSportProfile` (lives in
  the `sport` module) + geospatial queries — warrants its own design conversation before scoping.
