# B1 · Friendship system

**Status:** `DONE` — implemented in `modules/user/user-impl` (U1). See `modules/user/user-impl/docs/MVP/U1_FRIENDSHIP_SYSTEM.md`.  
**Type:** New Feature  
**Dependency:** A1  
**Replaces:** `UserFollow` entity and `user_follows` table

**Liquibase migration (new file):**
- Create `friendships` table: `id BIGSERIAL PK, requester_id UUID NOT NULL, addressee_id UUID NOT NULL, status VARCHAR NOT NULL DEFAULT 'PENDING', created_at TIMESTAMP, updated_at TIMESTAMP, UNIQUE(requester_id, addressee_id)`
- Drop `user_follows` table

**New entity:** `Friendship.java` in `post-impl` — fields: `id`, `requesterId (UUID)`, `addresseeId (UUID)`, `status (String)`, `createdAt`, `updatedAt`.  
**Delete entity:** `UserFollow.java`

**New interface:** `FriendshipService.java` in `post-api`:
```java
void sendRequest(UUID requesterId, UUID addresseeId);
void acceptRequest(UUID addresseeId, UUID requesterId);
void declineRequest(UUID addresseeId, UUID requesterId);
void unfriend(UUID callerId, UUID friendId);
Page<FriendshipResponse> getMyFriends(UUID userId, Pageable pageable);
Page<FriendshipResponse> getPendingRequests(UUID userId, Pageable pageable);
String getFriendshipStatus(UUID callerId, UUID targetId); // NONE / PENDING / ACCEPTED / DECLINED
List<UUID> getAcceptedFriendIds(UUID userId); // used by B2 feed query
```

**New DTOs in `post-api`:** `FriendshipResponse` (friendId, fullName, avatarUrl, status, since).

**New controller:** `FriendshipController.java` in `post-impl` at `/api/social/friends`:
```
POST   /request/{addresseeId}    ROLE_USER — send friend request
POST   /accept/{requesterId}     ROLE_USER — accept incoming request
DELETE /decline/{requesterId}    ROLE_USER — decline incoming request
DELETE /{friendId}               ROLE_USER — unfriend
GET    /                         ROLE_USER — my ACCEPTED friends (paginated)
GET    /requests                 ROLE_USER — pending requests I received (paginated)
GET    /status/{userId}          ROLE_USER — friendship status with a specific user
```

**Validation:** Cannot send request to self (`BadRequestException`). Duplicate request blocked by DB unique constraint + service-level check. Cannot accept a request you sent (must be addressee).

**Repository methods needed:** `findByRequesterIdAndAddresseeId`, `findByAddresseeIdAndStatus`, `findAcceptedFriendships` (either direction), `existsByRequesterIdAndAddresseeIdAndStatus`.

---
