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
- **`friend_requests` kept after accept:** Status updated to ACCEPTED rather than deleted. Preserves history. **Correction (U9, 2026-07-22):** "prevents re-sending" described a symptom, not a real design goal — combined with the table's `UNIQUE(sender_id, receiver_id)` constraint, a kept row of any non-PENDING status (DECLINED/CANCELLED/stale ACCEPTED after an unfriend) made `sendFriendRequest` crash with an unhandled persistence exception on re-send, rather than cleanly blocking it. U9 fixed this by reactivating the existing row back to PENDING instead of inserting a duplicate — re-sending now works as a real user would expect.
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

---

**Status:** `DONE`  
**Type:** New Feature  
**Entities needed:** `Friendship`, `FriendRequest`

An explicit, bidirectional friendship system. Users send friend requests; the
recipient accepts or declines. Once both sides have agreed, they are "friends."
Other modules (e.g. group-impl's invitation flow) check friendship via a
`UserFriendService` interface in `user-api` — never by importing `user-impl`.

#### Friendship lifecycle

```
Sender → sendFriendRequest()  → FriendRequest status: PENDING
Recipient → acceptFriendRequest() → FriendRequest: ACCEPTED + Friendship row created
Recipient → declineFriendRequest() → FriendRequest: DECLINED
Sender → cancelFriendRequest()  → FriendRequest: CANCELLED
Either side → removeFriend()    → Friendship row deleted
```

#### New service interface — `UserFriendService` (in `user-api`)

```java
// friend requests
void sendFriendRequest(UUID senderId, UUID receiverId);
void acceptFriendRequest(UUID requestId, UUID receiverId);
void declineFriendRequest(UUID requestId, UUID receiverId);
void cancelFriendRequest(UUID requestId, UUID senderId);

// friendship
void removeFriend(UUID userId, UUID friendId);
List<UserResponse> getFriends(UUID userId);        // cross-domain entry point
boolean areFriends(UUID userId, UUID otherUserId); // used by group-impl invite guard

// friend requests
List<FriendRequestResponse> getPendingReceivedRequests(UUID userId);
List<FriendRequestResponse> getPendingSentRequests(UUID userId);
```

`getFriends()` and `areFriends()` are the cross-domain API: any module that
needs to check or list friendships calls this interface — never queries the DB
directly.

#### Entities

- **`FriendRequest`** — `id` (UUID), `senderId` (UUID), `receiverId` (UUID),
  `status` (enum: `PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED`), `createdAt`, `updatedAt`
- **`Friendship`** — `id` (UUID), `userId` (UUID), `friendId` (UUID),
  `createdAt`. One row per direction (two rows per pair) so `getFriends()` is a
  simple `findByUserId()` query.

#### Constraints

- Cannot send a request to yourself
- Cannot send a duplicate pending request (check before creating)
- Cannot send a request if already friends
- `acceptFriendRequest` / `declineFriendRequest` — only the receiver may act
- `cancelFriendRequest` — only the sender may act
- `removeFriend` — either party may remove; deletes both directional rows

#### REST endpoints (in `user-impl`'s `UserFriendController`)

```
POST   /api/users/friends/requests                    → sendFriendRequest
PUT    /api/users/friends/requests/{requestId}/accept → acceptFriendRequest
PUT    /api/users/friends/requests/{requestId}/decline→ declineFriendRequest
DELETE /api/users/friends/requests/{requestId}        → cancelFriendRequest
GET    /api/users/friends                             → getFriends (current user)
GET    /api/users/friends/requests/received           → getPendingReceivedRequests
GET    /api/users/friends/requests/sent               → getPendingSentRequests
DELETE /api/users/friends/{friendId}                  → removeFriend
```

All write endpoints require `ROLE_USER`. `GET /api/users/friends` is public
(consistent with the existing GET /api/users/** public pattern — revisit if
privacy requirements tighten).

#### Out of scope for MVP

- Friend suggestions / "people you may know"
- Blocking users
- Notification on friend request received (stub `// TODO: notify` comment)
- Friend count shown on public profile

---
