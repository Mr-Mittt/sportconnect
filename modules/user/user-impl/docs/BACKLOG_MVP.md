# User Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/user/user-impl`  
**Last updated:** 2026-08-28

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
| 1 | [U13](MVP/U13_NOTIFICATION_OUTBOX_WIRING_FRIEND_REQUEST_RECEIVED_ACCEPTED.md) | Notification outbox wiring — friend request received/accepted | `TODO` |
| 2 | [U14](MVP/U14_DEDICATED_FRIENDS_DIRECTORY_PROFILE_ENDPOINT.md) | Dedicated Friends-directory profile endpoint — stop borrowing the generic public `GET /api/users/{userId}` for the Friends directory-search popup — **U11 shipped 2026-08-28, likely collapses to a client-side rename now (see ticket)** | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [U12](MVP/U12_REVOKE_SESSIONS_WHEN_A_USER_IS_DEACTIVATED.md) | Revoke sessions when a user is deactivated | `DONE` |
| 2 | [U11](MVP/U11_PROTECT_USER_DATA_SCOPE_PUBLIC_USER_LOOKUP_ENDPOINTS.md) | Protect user data — scope public user-lookup endpoints away from full PII | `DONE` |
| 3 | [U8](MVP/U8_FIX_N1_PENDING_REQUESTS.md) | Fix N+1 in UserFriendServiceImpl pending-request mappers | `DONE` |
| 4 | [U2](MVP/U2_JWT_IDENTITY_AND_SOFT_DELETE_FIX.md) | JWT-based identity + soft-delete query fix | `DONE` |
| 5 | [U3](MVP/U3_USER_PREFERENCE_ENDPOINTS.md) | UserPreference endpoints | `DONE` |
| 6 | [U4](MVP/U4_PASSWORD_CHANGE_ENDPOINT.md) | Password change endpoint | `DONE` |
| 7 | [U5](MVP/U5_TEST_COVERAGE_BACKFILL.md) | Test coverage backfill | `DONE` |
| 8 | [U6](MVP/U6_USER_DISCOVERY.md) | User discovery — find people to add as friends | `DONE` |
| 9 | [U7](MVP/U7_GENERAL_PHYSICAL_PROFILE_STATS.md) | General physical profile stats | `DONE` |
| 10 | [U1](MVP/U1_FRIENDSHIP_SYSTEM.md) | Friendship system | `DONE` |
| 11 | [U9](MVP/U9_FIX_SENDFRIENDREQUEST_CRASH_ON_RE_SEND_AFTER_DECLINE.md) | Fix sendFriendRequest crash on re-send after decline/cancel/unfriend | `DONE` |
| 12 | [U10](MVP/U10_CROSSED_FRIEND_REQUESTS_ESTABLISH_FRIENDSHIP_IMMEDIATELY.md) | Crossed friend requests establish friendship immediately | `DONE` |

---

**Dependencies:**
```
U2 → U4
U3, U5, U6, U7: no hard dependency (can run in parallel with anything)
U6 reuses U1 (Friendship system, DONE) for friendship-status enrichment
U12 (DONE 2026-08-28) added a new user-impl → auth-api dependency (Fix 1) — this created a circular
  Spring bean dependency with AuthServiceImpl (which already depended on UserService), fixed via
  @Lazy on UserServiceImpl's AuthService field, same pattern as GroupServiceImpl's @Lazy PostService
U14 (new, filed 2026-08-26 at client PROFILE-0 pickup) — no hard dependency. **U11 shipped
  2026-08-28**: `GET /api/users/{userId}` now returns `UserInfoResponse` (`id`/`fullName`/
  `username`/`avatarUrl`/`coverUrl`/`bio`), which already covers what U14 describes needing — at
  pickup, confirm that's really everything Friends needs before building anything new; see U14's own
  doc and client FRIEND-2.
```

---

## Removed / Deferred

- **Partner/skill matching + user discovery** — discussed during the 2026-07-01 backend brainstorm;
  explicitly deferred, not scoped as a ticket. Depends on cross-domain `UserSportProfile` (lives in
  the `sport` module) + geospatial queries — warrants its own design conversation before scoping.
