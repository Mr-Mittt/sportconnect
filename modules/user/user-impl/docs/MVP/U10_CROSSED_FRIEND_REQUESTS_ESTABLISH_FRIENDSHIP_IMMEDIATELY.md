# U10 · Crossed friend requests establish friendship immediately

**Status:** `DONE`  
**Type:** Enhancement  
**Scope:** `UserFriendServiceImpl.sendFriendRequest`/`acceptFriendRequest` only

**User-requested enhancement**, found in the same session as U9: if A sends a request to B, and
before either accepts/declines, B independently sends a request back to A, both requests would sit
as two separate `PENDING` rows (`(A,B)` and `(B,A)` — different pairs, no unique-constraint
conflict) — both people would stay stuck waiting on each other's explicit accept even though mutual
interest is already obvious from both having initiated contact.

**Fix:** `sendFriendRequest` now checks for an existing `PENDING` row in the *reverse* direction
(`receiverId → senderId`) before anything else. If found, it's accepted immediately — establishing
both `friendships` rows and marking that reverse row `ACCEPTED` — instead of inserting a second
pending row for the forward direction. Extracted the friendship-creation logic shared between this
path and `acceptFriendRequest`'s explicit-accept path into one private `establishFriendship(FriendRequest)`
method, so there's a single place that defines "how a request becomes a friendship" rather than two
copies that could drift.

**Ordering note:** the crossed-request check runs before U9's reactivation check — a crossed
`PENDING` reverse row always wins over whatever state the forward direction's own row might be in
(e.g. a previously `CANCELLED` forward row is simply left as-is, never touched, once the reverse
`PENDING` resolves the relationship via the other row).

**Tests:** 1 new Spock case (`sendFriendRequest should establish friendship immediately when the
receiver already sent the caller a pending request`); every other existing `sendFriendRequest` test
updated to stub the new reverse-direction lookup as empty, since Spock `Mock()` returns `null` (not
`Optional.empty()`) for an unstubbed call — an unstubbed `Optional` would have NPE'd on
`.isPresent()`. `./gradlew :modules:user:user-impl:test` and `:server:test` both green.

**Live-verified against the real running backend**: two real users registered, A sent a request to
B, B (without accepting) sent one back to A — both immediately appeared in each other's
`GET /api/users/friends`, and both pending lists were empty afterward.

**Out of scope:** no change to `acceptFriendRequest`'s own contract or response shape — this only
changes what `sendFriendRequest` does internally when it detects the crossed case.

---
