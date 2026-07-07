# U1 · Friendship System — Implementation Summary

**Date:** 2026-07-01  
**Status:** DONE  
**Module:** `user-impl` / `user-api`

## What was built

A bidirectional explicit friendship system replacing the old `user_follows` unidirectional follow model.

## Files created

| File | Purpose |
|---|---|
| `V019__create_friendship_tables.sql` | Drops `user_follows`; creates `friend_requests` + `friendships` |
| `user-api/.../FriendRequestStatus.java` | Enum: PENDING, ACCEPTED, DECLINED, CANCELLED |
| `user-api/.../FriendRequestResponse.java` | DTO returned from request list endpoints |
| `user-api/.../SendFriendRequestRequest.java` | Request body for POST /requests |
| `user-api/.../UserFriendService.java` | Public interface — 10 methods, cross-domain contract |
| `user-impl/.../FriendRequest.java` | Entity mapped to `friend_requests` |
| `user-impl/.../Friendship.java` | Entity mapped to `friendships` (two rows per pair) |
| `user-impl/.../FriendRequestRepository.java` | 5 derived query methods |
| `user-impl/.../FriendshipRepository.java` | `findByUserId`, `existsByUserIdAndFriendId`, `deleteBothDirections` |
| `user-impl/.../UserFriendServiceImpl.java` | Full implementation |
| `user-impl/.../UserFriendController.java` | 8 REST endpoints at `/api/users/friends` |
| `UserFriendServiceImplSpec.groovy` | 18 Spock tests, all passing |

## Files deleted

- `post-impl/.../UserFollow.java` — dead code, never had a service or repository

## Key decisions

- **Two-row friendships:** `friendships` stores one row per direction (`(A,B)` and `(B,A)`) so `getFriends(userId)` is a simple `findByUserId` — no OR query needed.
- **`friend_requests` kept after accept:** Status updated to ACCEPTED rather than deleted. Preserves history and prevents re-sending.
- **`UserFriendService` in `user-api`:** Cross-domain callers (`group-impl` invite guard, `post-impl` feed) use `areFriends()` / `getAcceptedFriendIds()` via this interface only — never import user-impl directly.
- **SecurityConfig:** Added `.requestMatchers("/api/users/friends/**").authenticated()` before the broad `GET /api/users/**` permit-all rule so friend endpoints always require auth.
- **`getAcceptedFriendIds` returns `List<UUID>`:** Used by B2 (personalized feed) in an `IN` clause.

## Endpoints

```
POST   /api/users/friends/requests                       → send friend request
PUT    /api/users/friends/requests/{requestId}/accept    → accept
PUT    /api/users/friends/requests/{requestId}/decline   → decline
DELETE /api/users/friends/requests/{requestId}           → cancel (sender only)
DELETE /api/users/friends/{friendId}                     → unfriend
GET    /api/users/friends                                → my friends list
GET    /api/users/friends/requests/received              → pending received
GET    /api/users/friends/requests/sent                  → pending sent
```
