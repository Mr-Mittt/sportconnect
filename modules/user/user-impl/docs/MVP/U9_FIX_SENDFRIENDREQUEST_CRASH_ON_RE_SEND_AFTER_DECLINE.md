# U9 · Fix sendFriendRequest crash on re-send after decline/cancel/unfriend

**Status:** `DONE`  
**Type:** Bug Fix  
**Scope:** `UserFriendServiceImpl.sendFriendRequest`, `FriendRequestRepository` only

**Found while wiring FRIEND-1** (client Friends page): `friend_requests` has
`UNIQUE(sender_id, receiver_id)` — accept/decline/cancel only flip `status`, they never delete the
row (`friend_requests` kept after accept" was documented in U1's own summary as a deliberate choice
to preserve history — see the correction below). `sendFriendRequest` only checked for an existing
row with `status = PENDING`; any other prior outcome for that exact sender→receiver direction
(`DECLINED`, `CANCELLED`, or a stale `ACCEPTED` row left behind after `removeFriend`, which only
deletes the `friendships` rows, not this one) fell through to an `INSERT` for the same
`(sender_id, receiver_id)` pair — a **guaranteed unique-constraint violation**, surfacing as an
unhandled `DataIntegrityViolationException` (raw 500), not a clean `BadRequestException`. In
practice this permanently blocked re-sending a request to anyone previously declined/cancelled/
unfriended, with an ugly failure mode instead of a designed one.

**Correction to U1's summary** (`U1_FRIENDSHIP_SYSTEM.md`): its "Preserves history and prevents
re-sending" line described the *symptom* as if it were the intended behavior. Permanently blocking
re-sending (especially after an unfriend) is not a real product requirement anywhere in this
backlog — it was an unexamined side effect of the unique constraint, not a decision.

**Fix:** `sendFriendRequest` now looks up any existing row for the pair
(`FriendRequestRepository.findBySenderIdAndReceiverId`, new method) regardless of status. A
`PENDING` match still throws `"Friend request already pending"` (unchanged). Any other status
reactivates the *same* row back to `PENDING` (`updatedAt` bumps; `createdAt` stays the original
timestamp — `@CreationTimestamp` is not updatable) instead of inserting a second row, which would
hit the same constraint. No migration needed — schema is unchanged, only the service's read/write
path changed.

**Tests:** `UserFriendServiceImplSpec` updated (`findBySenderIdAndReceiverIdAndStatus` →
`findBySenderIdAndReceiverId` in the existing "already pending"/"create request" specs) plus 3 new
cases: reactivate after `DECLINED`, after `CANCELLED`, and after a stale `ACCEPTED` row (friendship
since removed). `./gradlew :modules:user:user-impl:test` and `:server:test` both green.

**Live-verified against the real running backend**: registered two real users, A → B → decline →
A re-sends → `200` (was an unhandled 500 before the fix), same `requestId` reactivated to `PENDING`.
Separately verified the accept → unfriend → re-send path the same way.

**Out of scope:** no notification/audit-trail change; `FriendRequestResponse` still only exposes
`createdAt` (not `updatedAt`), so a reactivated request's list row shows its original send time, not
the reactivation time — a minor display nuance, not addressed here.

---
