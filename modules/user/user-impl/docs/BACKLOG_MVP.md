# User Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/user/user-impl`  
**Last updated:** 2026-07-02

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon user MVP` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | U1 | Friendship system | `DONE` |
| 2 | U2 | JWT-based identity + soft-delete query fix | `DONE` |
| 3 | U3 | UserPreference endpoints | `DONE` |
| 4 | U4 | Password change endpoint | `DONE` |
| 5 | U5 | Test coverage backfill | `DONE` |
| 6 | U6 | User discovery — find people to add as friends | `DONE` |
| 7 | U7 | General physical profile stats | `DONE` |
| 8 | U8 | Fix N+1 in UserFriendServiceImpl pending-request mappers | `DONE` |
| 9 | U9 | Fix sendFriendRequest crash on re-send after decline/cancel/unfriend | `DONE` |
| 10 | U10 | Crossed friend requests establish friendship immediately | `DONE` |
| 11 | U11 | Protect user data — scope public user-lookup endpoints away from full PII | `TODO` |
| 12 | U12 | Revoke sessions when a user is deactivated | `TODO` |

**Dependencies:**
```
U2 → U4
U3, U5, U6, U7: no hard dependency (can run in parallel with anything)
U6 reuses U1 (Friendship system, DONE) for friendship-status enrichment
U12 adds a new user-impl → auth-api dependency (Fix 1); no dependency on any other ticket here
```

---

## Tickets

### U1 · Friendship system
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

### U2 · JWT-based identity + soft-delete query fix
**Status:** `DONE`
**Type:** Bug Fix (Security)
**Scope:** `UserController.java` + `UserServiceImpl.java` (+ `UserRepository.java`)

Two bundled correctness/security fixes, in the same spirit as post-impl's A1/A3 bundles.

#### Fix 1 — JWT-based identity on write endpoints

`PUT /api/users/{userId}/profile` currently trusts the `{userId}` path param with no check that it
matches the authenticated caller — any logged-in user can edit any other user's profile. Extract the
caller's id from the JWT principal (same pattern as post-impl's `SecurityUtils.extractUserId()` /
`@AuthenticationPrincipal` usage) and compare against the path `userId`; throw `ForbiddenException` on
mismatch.

**Open question for implementer:** should `DELETE /api/users/{userId}` (currently `ROLE_ADMIN` only)
also allow a user to delete their own account, or stay admin-only as today? This is a product decision
— clarify with the user in Phase 1 before implementing, don't assume either way.

#### Fix 2 — Soft-delete query leak

`UserServiceImpl.getUserByEmail()` and `getUserByUsername()` use `findByEmail()` / `findByUsername()`,
which return soft-deleted (`isActive=false`) users too — these are public endpoints, so deleted
accounts are still fully readable. Add `findByEmailAndIsActiveTrue()` /
`findByUsernameAndIsActiveTrue()` to `UserRepository` and swap them in; a soft-deleted user should 404
exactly like any other non-match.

**Tests:** self-edit profile succeeds; edit-another-user's-profile throws `ForbiddenException`;
`getUserByEmail`/`getUserByUsername` on a soft-deleted user throws `NotFoundException`.

---

### U3 · UserPreference endpoints
**Status:** `DONE`
**Type:** New Feature
**Entities:** `UserPreference` (already exists — table + entity + repository from V001; no service or
controller wired up yet)

Wire up the existing `UserPreference` entity end-to-end so users can read/update their settings
(language, timezone, distance unit, notification toggles, privacy).

**New DTOs (in `user-api`):**
- `UserPreferenceResponse` — all 9 config fields (`language`, `timezone`, `distanceUnit`,
  `notificationEmail`, `notificationPush`, `notificationSms`, `privacyProfile`, `privacyLocation`, plus
  timestamps)
- `UpdateUserPreferenceRequest` — same fields, all nullable/optional (partial update — only supplied
  fields change)

**New service interface — `UserPreferenceService` (in `user-api`):**
```java
UserPreferenceResponse getPreferences(UUID userId); // auto-creates a default row on first access
UserPreferenceResponse updatePreferences(UUID userId, UpdateUserPreferenceRequest request);
```

**New controller — `UserPreferenceController` (in `user-impl`) at `/api/users/me/preferences`:**
```
GET /api/users/me/preferences   ROLE_USER — get caller's preferences (creates defaults if none exist)
PUT /api/users/me/preferences   ROLE_USER — partial update
```
Always keyed off `@AuthenticationPrincipal` — no path param, so this doesn't need U2's
permission-check pattern (there's no "other user's" preferences to leak).

**Validation:** `distanceUnit` in `{km, mi}`; `privacyProfile` / `privacyLocation` in
`{public, friends, private}` — reject invalid values with `BadRequestException`.

**Tests:** first `GET` auto-creates and returns defaults; subsequent `GET` returns the existing row;
partial `PUT` only changes supplied fields; invalid enum value on `PUT` is rejected.

---

### U4 · Password change endpoint
**Status:** `DONE`
**Type:** New Feature
**Dependency:** U2 (reuse its JWT-identity pattern)

Self-service password change for an already-authenticated user — distinct from auth-module's
forgot-password/reset-token flow (which is for logged-out users).

**New DTO (in `user-api`):** `ChangePasswordRequest { currentPassword, newPassword }`.

**New endpoint** (on `UserController` or a new dedicated controller):
```
PUT /api/users/me/password   ROLE_USER
```
Verifies `currentPassword` via the existing `UserService.verifyPassword()`, hashes `newPassword`, and
calls the existing `UserService.updateUserPassword()` (which expects a pre-hashed value — do not
double-hash).

**Open question for implementer:** hashing requires a `PasswordEncoder` bean inside `user-impl`.
Confirm during Phase 2 explore whether `PasswordEncoder` is a shared Spring Security bean (not an
auth-impl-specific class) so wiring it into `user-impl` doesn't violate the
no-cross-domain-`-impl`-imports rule — don't assume the answer, verify it.

**Tests:** correct current password succeeds and persists the new hash; wrong current password is
rejected with `BadRequestException`.

---

### U5 · Test coverage backfill
**Status:** `DONE`
**Type:** Test Coverage
**Scope:** `UserServiceImplSpec.groovy` only — no production code changes

Add Spock coverage for the 5 currently-untested `UserServiceImpl` methods:
- `createUser()` — success path; throws `RuntimeException` when the `USER` role is missing
- `updateUserPassword()` — persists the given hash as-is (no re-hashing); not-found case
- `getUserRoles()` — returns the correct set of role names
- `verifyPassword()` — match / no-match; returns `false` for an inactive (soft-deleted) user
- `updateLastLogin()` — sets `lastLoginAt` to now; not-found case

---

### U6 · User discovery — find people to add as friends
**Status:** `DONE`
**Type:** New Feature
**Reuses:** `UserFriendService` (U1, `DONE`) for friendship-status enrichment — no new cross-domain
concerns, both live in `user-impl`.

A keyword search over other users so the caller can find people and send them a friend request —
distinct from the deferred partner/skill matching feature (no sport/skill/geospatial filtering here,
just name/username lookup).

**New repository method — `UserRepository` (user-impl):**
```java
@Query("""
        SELECT u FROM User u
        WHERE u.isActive = true AND u.id <> :callerId
          AND (LOWER(u.firstName) LIKE LOWER(CONCAT('%', :keyword, '%'))
            OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :keyword, '%'))
            OR LOWER(u.username) LIKE LOWER(CONCAT('%', :keyword, '%')))
        """)
Page<User> searchActiveUsers(@Param("callerId") UUID callerId, @Param("keyword") String keyword, Pageable pageable);
```

**New method — `UserService` (user-api):**
```java
Page<UserSearchResponse> searchUsers(UUID callerId, String keyword, Pageable pageable);
```
`keyword` is **required** (reject blank/too-short, e.g. `< 2` chars, with `BadRequestException`) — this
is a search box, not a browse-everyone feed.

**New DTO (`user-api`):** `UserSearchResponse` — `id`, `fullName`, `username`, `avatarUrl`, `city`,
`country`, `friendshipStatus` (`NONE` / `PENDING_SENT` / `PENDING_RECEIVED` / `FRIENDS`).

**Friendship-status enrichment (no new repository queries needed — reuse existing `UserFriendService`
methods, batched per page rather than per-row to avoid N+1):**
- `userFriendService.getAcceptedFriendIds(callerId)` → mark matches `FRIENDS`
- `userFriendService.getPendingSentRequests(callerId)` → receiver ids → mark matches `PENDING_SENT`
- `userFriendService.getPendingReceivedRequests(callerId)` → sender ids → mark matches
  `PENDING_RECEIVED`
- anything left over → `NONE`

**New endpoint — on `UserController`:**
```
GET /api/users/search?q={keyword}&page=&size=   ROLE_USER
```

**Open question for implementer:** `SecurityConfig` currently treats `GET /api/users/**` as public. This
endpoint needs the caller's identity for friendship-status enrichment, so it must be explicitly gated
to `ROLE_USER` (same override pattern as `GET /api/posts/feed`, which requires auth despite GETs
generally being loosely public in that module too) — confirm the exact `SecurityConfig` rule ordering
during Phase 2 explore, don't assume it "just works" because of the broader public-GET pattern.

**Tests:** keyword matches on first name / last name / username (case-insensitive, partial); caller
excluded from own results; blank/too-short keyword rejected; friendship status correctly reported as
`NONE`/`PENDING_SENT`/`PENDING_RECEIVED`/`FRIENDS` for each relationship state.

---

### U7 · General physical profile stats
**Status:** `DONE`
**Type:** New Feature
**Scope:** `User.java` entity + `UserServiceImpl.updateProfile()` — reuses the existing
`PUT /api/users/{userId}/profile` endpoint, no new endpoint needed.

Split out of a discussion originally framed around U3 (UserPreference). Confirmed with the user:
"preference" (app settings — language, timezone, notifications, privacy) and "physical profile" data
are deliberately separate concepts in this codebase — this ticket is the latter. Its sibling ticket,
**A3** in `modules/sport/sport-impl/docs/BACKLOG_MVP.md`, covers sport-*specific* attributes (e.g.
dominant hand); this ticket covers sport-*agnostic* physical stats only.

**Revised during Phase 1 clarification:** `shoeSize` is **not** a free-form string after all — it's
JP sizing convention, where the size number **is** the foot length in centimeters (e.g. size 25 =
25cm foot). So it's numeric, not `VARCHAR`, and validated the same way as height/weight. Further
revised mid-implementation: `shoeSizeCm` is a whole-number `Integer`, not `BigDecimal` — no half-size
precision.

**Liquibase migration:** add nullable columns to `users`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS shoe_size_cm INTEGER;
```

**Entity (`User.java`):** add `heightCm` (Integer), `weightKg` (BigDecimal), `shoeSizeCm` (Integer)
— all nullable, same style as existing optional profile fields (`bio`, `avatarUrl`, etc.).

**DTOs (`user-api`):** add the same 3 fields to `UpdateProfileRequest` and `UserResponse`.

**Service (`UserServiceImpl.updateProfile()`):** extend the existing null-check-per-field block with
the 3 new fields — no new method, no new permission logic (already self-only as of U2). Validation
bounds (confirmed with the user): `heightCm` 50–300, `weightKg` 20–300, `shoeSizeCm` 10–35. Reject
out-of-range values with `BadRequestException`.

**Tests:** update sets all 3 new fields; partial update (fields omitted) leaves them unchanged
(matches the existing null-check test pattern already in `UserServiceImplSpec`); each field rejects
values outside its bounds.

---

### U8 · Fix N+1 in UserFriendServiceImpl pending-request mappers
**Status:** `DONE`  
**Type:** Bug Fix (Performance)  
**Scope:** `UserFriendServiceImpl.java` only

**Found during a cross-module N+1 audit** (following the audit that produced group-impl's A7/A8 and
post-impl's A6/A7). `getPendingReceivedRequests(userId)` and `getPendingSentRequests(userId)` both
return an unbounded `List<FriendRequestResponse>`, mapped via a shared private helper:
```java
private FriendRequestResponse toFriendRequestResponse(FriendRequest request) {
    String senderName = userRepository.findById(request.getSenderId())
            .map(User::getFullName).orElse("Unknown");
    String receiverName = userRepository.findById(request.getReceiverId())
            .map(User::getFullName).orElse("Unknown");
    ...
}
```
2 `userRepository.findById()` calls per request → `1 + 2N` queries for N pending requests.

**Also fixes an indirect cost in `searchUsers` (U6, `DONE`):** `UserServiceImpl.searchUsers()` calls
both of these methods once per search request (correctly batched per-page, per U6's own ticket text —
not a separate bug in `searchUsers` itself), purely to extract `receiverId`/`senderId` sets for
friendship-status enrichment — the resolved `senderName`/`receiverName` values are computed and then
discarded. Fixing the N+1 inside these two methods automatically removes that waste too; no separate
change needed in `searchUsers`.

**Fix approach:** collect all distinct sender + receiver ids from the fetched `FriendRequest` list up
front, one `userRepository.findAllById(...)` call (same domain, no cross-domain concern — this is
`user-impl`'s own repository), build a `Map<UUID, String>` (id → fullName), then have
`toFriendRequestResponse` read from the map instead of querying per request.

**Tests:** update `UserFriendServiceImplSpec` wherever `userRepository.findById` is mocked for these two
methods to expect a single batched `findAllById` call instead.

**Out of scope:** no change to what data is displayed — pure performance refactor, same fields/values.

---

### U9 · Fix sendFriendRequest crash on re-send after decline/cancel/unfriend
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

### U10 · Crossed friend requests establish friendship immediately
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

### U11 · Protect user data — scope public user-lookup endpoints away from full PII
**Status:** `TODO`  
**Type:** Security Fix  
**Scope:** `UserController` (3 endpoints) + a new `user-api` DTO — no change to `UserService`'s
internal contract or any cross-domain caller

**Found while discussing FRIEND-1's data model.** Returning a user's `id` (a random
`gen_random_uuid()` value, not a sequential integer) to a client is not itself a security problem —
it's normal REST practice and not enumerable. The real problem is what three of `UserController`'s
endpoints do once a caller has (or doesn't even need) an id:

- `GET /api/users/{userId}`
- `GET /api/users/email/{email}`
- `GET /api/users/username/{username}`

All three are `security = {}` (public, no authentication at all — `SecurityConfig`'s
`GET /api/users/**` permit-all rule) and all three return the **full `UserResponse` DTO** — the same
shape a user's own `/profile` view would get: `email`, `phoneNumber`, `dateOfBirth`, `gender`,
`heightCm`/`weightKg`/`shoeSizeCm`, `location` (lat/long), `lastLoginAt`, `isEmailVerified`, `roles`.
No distinction between "a stranger looking someone up" and "the user viewing their own profile."

Two compounding factors make this a real, not theoretical, exposure:
1. **The email/username lookups don't even require an id** — anyone can type in any email address
   (guessed, scraped, bought) and get that person's full PII back, unauthenticated.
2. **User ids are now genuinely everywhere in the app** — post/comment authors, group members,
   friends list, search results (FEED-1, GRP-3, FRIEND-1, ...). "An attacker would need to already
   have the id" is not a meaningful barrier once every social feature surfaces ids by design.

**Fix approach (not yet fully designed — confirm at pickup):**
1. New `PublicUserResponse` DTO in `user-api` — safe subset only: `id`, `fullName`, `username`,
   `avatarUrl`, `coverUrl`, `bio`. (Deliberately close to FRIEND-1's own `FriendUser` client type —
   `client/src/features/friends/types.ts` — which already only models this subset; narrowing the
   backend to match should need little-to-no client change.)
2. `getUserById`/`getUserByEmail`/`getUserByUsername` in `UserController` return `PublicUserResponse`
   instead of `UserResponse` for every caller, authenticated or not — no "return full for self"
   special case, since these 3 endpoints have no reliable way to know who's asking (two of them
   don't even require auth) and mixing return shapes on one endpoint contract complicates every
   typed client that already consumes it.
3. **Confirmed safe to narrow — nothing legitimate depends on the full shape from these 3
   endpoints today:** grepped every caller. `AuthServiceImpl`/`CommentServiceImpl`/`PostServiceImpl`
   all call `UserService.getUserById()`/`getUserByEmail()` directly as an **in-process Java method**
   (the `-api` interface, cross-domain convention) — never through the public REST controller — so
   narrowing the controller's HTTP response touches none of them. No "view my own full profile"
   client screen exists yet either (Profile page is still a `ComingSoonPage` stub) to depend on the
   wider shape.
4. **A real "get my own full profile" endpoint doesn't exist anywhere** (confirmed in AUTH-3's own
   summary: no `/api/users/me`, the refresh response's `user` object doubles as who-am-I). If/when
   the Profile page is scoped, it will need one — flagging this as a related future gap, not solved
   here, since nothing currently depends on it.

**Tests:** update `UserControllerTest`/`UserServiceImplSpec` wherever these 3 endpoints' response
shape is asserted; add a case confirming `PublicUserResponse` never serializes `email`/
`phoneNumber`/`dateOfBirth`/`gender`/`heightCm`/`weightKg`/`shoeSizeCm`/`location`/`lastLoginAt`/
`roles`.

**Out of scope:** a dedicated authenticated "my own full profile" endpoint (flagged above, not
built here — nothing depends on it yet); any change to `UserService`'s internal Java contract or
any in-process cross-domain caller; rate-limiting/enumeration defenses beyond narrowing the response
(the ids themselves are already non-enumerable).

---

### U12 · Revoke sessions when a user is deactivated
**Status:** `TODO`
**Type:** Security Fix
**Scope:** `UserServiceImpl.deleteUser()` (+ new `user-impl` → `auth-api` dependency) for Fix 1;
`JwtAuthenticationFilter`/`SecurityConfig` (`auth-impl`) for Fix 2

**Found while discussing what "delete account" actually does** (2026-08-10 conversation — no
self-service delete exists today; `DELETE /api/users/{userId}` is `ROLE_ADMIN`-only, per U2's
still-open question about whether to add a self-delete path). Traced what deactivation currently
does to a user's live sessions: nothing. `UserServiceImpl.deleteUser()` only sets `is_active =
false` and saves — it never touches `auth-impl`'s token state, and `user-impl` doesn't even
depend on `auth-api` today (confirmed via `build.gradle` — only `user-api` + `common`).

**Current behavior, confirmed by reading the code (not assumed):**
- **Refresh token:** not proactively revoked at deactivation time. It's checked reactively —
  `AuthServiceImpl.refreshToken()` looks up the user and throws `"Account is deactivated"`
  (`AuthServiceImpl.java:137-138`) — but only when the refresh token is next *used*. The token row
  itself sits unrevoked in the DB until then.
- **Access token (JWT):** not checked at all. `JwtAuthenticationFilter.doFilterInternal()` calls
  `jwtTokenService.validateToken(jwt)`, which only checks signature + expiry — no DB lookup, no
  `isActive` recheck, no revocation-list check, on any request. A deactivated user's already-issued
  access token keeps authenticating successfully until it naturally expires (`app.jwt.expiration`,
  currently 1 hour).

**Fix 1 — proactively revoke refresh tokens on deactivation (required for this ticket):**
`AuthService.logout(UUID userId)` (`auth-api`) already does exactly this —
`RefreshTokenRepository.revokeAllUserTokens(userId, now)` — and already accepts an arbitrary
`userId` at the service-interface level (the *controller* restricts it to self via the JWT
principal; the service method itself doesn't). Add `user-impl` → `auth-api` as a new
`implementation project(...)` dependency (no cycle: `auth-api` depends on neither `user-api` nor
`user-impl`), inject `AuthService` into `UserServiceImpl`, and call `authService.logout(userId)`
from `deleteUser()` right after the `isActive = false` save. This closes the "refresh token still
sits valid in the DB" gap — a deactivated user can no longer silently refresh into a new access
token.

**Fix 2 — access-token gap (decide scope at pickup, may be split into its own ticket):**
Closing the up-to-1hr window where an already-issued access token for a deactivated account still
works requires a per-request active-status check, which trades away part of the point of a
stateless JWT (per `KEYCLOAK_VS_CUSTOM_AUTH.md`'s own "stateless JWT can't be revoked easily"
tradeoff). Two options to weigh, don't assume which:
1. A DB lookup per request (`UserService.getUserById()` from the filter) — simplest, but a
   per-request DB hit defeats a chunk of the stateless-JWT performance argument.
2. A Redis-backed deactivated-user set, checked in `JwtAuthenticationFilter` (Redis is already
   wired into the app; A5, the still-`TODO` login-rate-limiting ticket in
   `modules/auth/docs/BACKLOG_MVP.md`, is about to introduce the same kind of per-request Redis
   check for a different purpose — worth coordinating implementation approach/timing with
   whoever picks up A5, not necessarily bundling the two).
Given the added latency/complexity on *every* authenticated request, confirm with the user whether
this is in scope for MVP or an accepted ~1hr-window risk deferred to V1 before implementing Fix 2.

**Fix 1 vs. Fix 2 — not alternatives, they close different gaps (discussed 2026-08-10, in the
context of location-impl's favorite-locations endpoints, which have no `isActive` check today):**
a per-endpoint `isActive` check (e.g. calling `UserService.getUserById()`, which already throws
`ResourceNotFoundException` for a deactivated user via `findByIdAndIsActiveTrue()`, from inside
`favoriteLocation`/`unfavoriteLocation`/etc.) was floated as a quick stopgap for that one module
and explicitly **rejected** in favor of doing Fix 2 properly instead:
- **Fix 1 (revoke on deactivate) stops new access tokens** — cheap (one call at deactivation
  time, zero added latency on normal requests) — but does nothing about an access token the caller
  already holds; that keeps authenticating everywhere until it naturally expires regardless of
  what happens to the refresh token, since the JWT filter never queries the DB.
- **A per-endpoint `isActive` check stops an already-issued access token from working**, but only
  on whichever endpoints someone remembered to patch. Scattering it feature-by-feature (as
  favorite-locations' patch would have done) recreates the exact discipline problem the new
  CLAUDE.md "Account lifecycle" rule (and its wiring into `/feature`/`/workon`/`/implement`) is
  trying to paper over, rather than closing it once. It's strictly weaker than doing Fix 2 as
  originally scoped below.
- **Conclusion:** implement Fix 1 regardless (it's cheap and unconditionally worth doing), and
  implement Fix 2's **option 2 (Redis deny-list in `JwtAuthenticationFilter`)** rather than
  option 1 or a per-endpoint patch — one check, every request, every endpoint, impossible to
  forget on the next feature. No location-impl-specific fix needed; U12 shipping this way closes
  the favorite-locations gap (and every other endpoint's) in one place.

**Open question for implementer — partial index on `users.is_active`?** Confirmed in the same
2026-08-10 conversation: `users` has no index at all (partial or otherwise) on `is_active` today,
unlike `posts`/`comments`/`groups`, which each have a `WHERE is_active = true` partial index. It's
been a non-issue so far because every existing `is_active`-filtered query already rides a more
selective index (PK, or the unique `idx_users_email`/`idx_users_username`). This ticket is the
first thing that could change that calculus:
- If Fix 2 goes with the **DB-lookup-per-request** option, that's a new `is_active` check (via PK,
  so still fine — no index gap introduced) on *every* authenticated request. Not a reason for a
  partial index by itself, but worth naming since it's the first per-request `is_active` read.
- Not needed for Fix 1 (`deleteUser()` reads by PK, not by `is_active`) or the Redis-deny-list
  option for Fix 2 (no DB query at all).
Net: no proven need yet — decide at implementation time whether Fix 2's chosen approach actually
introduces an unindexed `is_active`-only query pattern before adding one speculatively.

**Tests:** `deleteUser()` calls `authService.logout(userId)` exactly once; a refresh attempt with a
token issued before deactivation now fails immediately (not just on the pre-existing
`isActive`-recheck path, since the token itself is revoked first); if Fix 2 is in scope, a request
with a still-unexpired access token for a deactivated user is rejected.

**Out of scope:** the self-service "delete my own account" endpoint itself (U2's still-open
question — a separate product decision); any change to what `deleteUser()` does to the user's
content/social graph (posts, group memberships, sessions — flagged in the same conversation as a
separate, larger gap, not addressed here).

---

## Removed / Deferred

- **Partner/skill matching + user discovery** — discussed during the 2026-07-01 backend brainstorm;
  explicitly deferred, not scoped as a ticket. Depends on cross-domain `UserSportProfile` (lives in
  the `sport` module) + geospatial queries — warrants its own design conversation before scoping.
