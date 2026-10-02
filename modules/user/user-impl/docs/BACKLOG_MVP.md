# User Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/user/user-impl`  
**Last updated:** 2026-09-27 (U18 DONE)

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
| 1 | [U19](MVP/U19_REMOVE_CITY_FIELD.md) | Remove `city` field entirely from the backend — superseded by Region (U16), found during CLIENT-REF-3 pickup | `TODO` |
| 2 | [U21](MVP/U21_ERROR_CODE_AUDIT.md) | **[Error handling · Phase B]** Error code audit for the user module — profile/preferences/password/friends/search endpoints; categorize, define codes (range errors with `min`/`max`, unknown language, invalid gender, ownership), convert throw sites. Pairs with CLIENT-ERR-3 | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [U20](MVP/U20_GENDER_AS_VALIDATED_ENUM.md) | `gender` is now a closed set (`MALE` / `FEMALE`) — `Gender` enum in `user-api`, strict upper-case validation in `updateProfile` (`400` "gender must be one of: MALE, FEMALE"; `""` clears, `null` skips), migration `V076` normalising legacy rows (+ `CHECK` constraint); wire contract still a string. Spock + new `ProfileGenderIntegrationTest` (6); `:server:test` 367/367; migration verified on real Postgres | `DONE` (2026-10-02) |
| 2 | [U18](MVP/U18_DEDICATED_USER_SUMMARY_BATCH_LOOKUP.md) | Dedicated `getUserSummariesByIds` — a PII-free `{id, fullName, avatarUrl}` batch method migrated onto all 16 real `getUsersByIds` call sites (notification/session/group/post-impl); none read anything beyond those two fields | `DONE` |
| 3 | [U17](MVP/U17_STOP_LEAKING_EMAIL_AND_LOCATION_FROM_GET_USERS_FRIENDS.md) | Stop `GET /api/users/friends` leaking email and precise location — reuses U11's `UserInfoResponse`, found via the U16 `getUsersByIds` discussion | `DONE` |
| 4 | [U16](MVP/U16_USER_COUNTRY_REGION_LANGUAGE_LINKS.md) | Link users to Country / Region / Language (2026-09-26) — `users.country_id`/`region_id` (V075, ids only, re-runnable backfill of the legacy `country` text), profile update takes `countryId`/`regionId` (free-text `country` dropped, silently ignored), `UserResponse` + `countryId`/`regionId`/`regionName` with `country` = resolved name, optional language/country/region/coordinates at register (validated before the user is saved), validated `UserPreference.language`, deactivated caller rejected on both preference calls. New `user-impl → reference-api` edge. `getUsersByIds` deliberately does not resolve names (hot path); `searchUsers` resolves one lookup per page. Unblocks CLIENT-REF-2/3 and A24. Green: user-impl 162 + auth-impl 59 Spock, +30 IT, full `:server:test` 359, live on real Postgres | `DONE` |
| 5 | [U15](MVP/U15_ACTIVE_SPORT_IDS_ON_USER_INFO_RESPONSE.md) | `activeSportIds: List<Long>` on `UserInfoResponse` (2026-09-04) — PII-free sport-id list a non-owner read needs (friend-profile sport pills), via a new cross-domain `user-impl → sport-api` call (`getUserProfiles(id)`, active-only) in a new `UserService.toPublicUserInfo(UserResponse)`. Fills the gap A22 left removing `GET /sports/profiles/user/{id}`. Unblocks client SPORT-11. Green: `:modules:user:user-impl:test` + full `:server:test` + live smoke | `DONE` |
| 6 | [U14](MVP/U14_DEDICATED_FRIENDS_DIRECTORY_PROFILE_ENDPOINT.md) | Dedicated Friends-directory profile endpoint — resolved to **no backend change**: U11's `UserInfoResponse` already is the contract Friends needs; client cleanup handed to `FRIEND-2` | `DONE` |
| 7 | [U13](MVP/U13_NOTIFICATION_OUTBOX_WIRING_FRIEND_REQUEST_RECEIVED_ACCEPTED.md) | Notification outbox wiring — friend request received/accepted | `DONE` |
| 8 | [U12](MVP/U12_REVOKE_SESSIONS_WHEN_A_USER_IS_DEACTIVATED.md) | Revoke sessions when a user is deactivated | `DONE` |
| 9 | [U11](MVP/U11_PROTECT_USER_DATA_SCOPE_PUBLIC_USER_LOOKUP_ENDPOINTS.md) | Protect user data — scope public user-lookup endpoints away from full PII | `DONE` |
| 10 | [U8](MVP/U8_FIX_N1_PENDING_REQUESTS.md) | Fix N+1 in UserFriendServiceImpl pending-request mappers | `DONE` |
| 11 | [U2](MVP/U2_JWT_IDENTITY_AND_SOFT_DELETE_FIX.md) | JWT-based identity + soft-delete query fix | `DONE` |
| 12 | [U3](MVP/U3_USER_PREFERENCE_ENDPOINTS.md) | UserPreference endpoints | `DONE` |
| 13 | [U4](MVP/U4_PASSWORD_CHANGE_ENDPOINT.md) | Password change endpoint | `DONE` |
| 14 | [U5](MVP/U5_TEST_COVERAGE_BACKFILL.md) | Test coverage backfill | `DONE` |
| 15 | [U6](MVP/U6_USER_DISCOVERY.md) | User discovery — find people to add as friends | `DONE` |
| 16 | [U7](MVP/U7_GENERAL_PHYSICAL_PROFILE_STATS.md) | General physical profile stats | `DONE` |
| 17 | [U1](MVP/U1_FRIENDSHIP_SYSTEM.md) | Friendship system | `DONE` |
| 18 | [U9](MVP/U9_FIX_SENDFRIENDREQUEST_CRASH_ON_RE_SEND_AFTER_DECLINE.md) | Fix sendFriendRequest crash on re-send after decline/cancel/unfriend | `DONE` |
| 19 | [U10](MVP/U10_CROSSED_FRIEND_REQUESTS_ESTABLISH_FRIENDSHIP_IMMEDIATELY.md) | Crossed friend requests establish friendship immediately | `DONE` |

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
U16 (DONE 2026-09-26) added a new user-impl → reference-api dependency (interface + DTOs only;
  reference-api depends solely on :modules:common, so no cycle) and a user-api `UserRegistrationDetails`
  consumed by auth-impl. `users.country_id`/`region_id` are plain ids (no FK). `getUsersByIds` returns the ids
  but deliberately does NOT resolve country/region names (hot batch call) — see U16's doc. Client changes
  are CLIENT-REF-2 (sign-up) and CLIENT-REF-3 (profile), both unblocked.
U17 (DONE 2026-09-27) fixed GET /api/users/friends leaking email/location (found while discussing
  U16's getUsersByIds decision). Reused U11's UserInfoResponse; getFriends' return type changed
  List<UserResponse> -> List<UserInfoResponse> (one backend caller, updated in place; client was
  already a strict subset, compatible as-is). No schema change.
U18 (DONE 2026-09-27) added a new user-api DTO (UserSummaryResponse) and UserService method
  (getUserSummariesByIds) migrated onto all 16 real getUsersByIds call sites across
  notification-impl/session-impl/group-impl/post-impl (none read anything beyond
  fullName/avatarUrl) -- an internal refactor, no REST contract changed for any of those four
  modules. getUsersByIds itself is unchanged and kept for any future batch caller that genuinely
  needs the full UserResponse shape.
```

---

## Removed / Deferred

- **Partner/skill matching + user discovery** — discussed during the 2026-07-01 backend brainstorm;
  explicitly deferred, not scoped as a ticket. Depends on cross-domain `UserSportProfile` (lives in
  the `sport` module) + geospatial queries — warrants its own design conversation before scoping.
