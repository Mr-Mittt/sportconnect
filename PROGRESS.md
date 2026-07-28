# SportConnect — Project Progress

Synthesized from all markdown documentation files. Last updated: June 2026.

---

## 1. Project Overview & Vision

> **SportConnect is the app for sports groups — find them, run them, fill your sessions, and connect with players.**

**Target user:** Casual sports player who belongs to one or more groups/clubs and currently uses WhatsApp + Facebook groups + spreadsheets to organize their sporting life.

**The two pains it solves:**
1. Existing tools aren't built for sports groups — no session management, no slot filling, no sport-specific filters
2. No single app supports the individual player's sports identity across groups, sessions, and equipment

**Day-1 differentiator:** A sports group can fill an empty session slot from outside their group, with the right player, in one post — with sport-specific filters (skill, position, gender, equipment).

**Identity:** Community-first product centered on the group/club experience. Booking and marketplace features are V2+.

**User types:** Player · Group Owner / Admin · Facility Vendor (V2) · Platform Admin

**Core feature — The Calling System:**
| Type | Who posts | Purpose |
|---|---|---|
| Session Calling | Group | Fill an empty slot in an upcoming session |
| Game Calling | Player | Find a session/game to join |
| Group Finding | Player | Find a group to join |
| Player Finding | Group | Recruit new permanent members |

**Phase roadmap:** MVP (groups + social + calling system) → V2 (geo-discovery + equipment trading + facility booking) → V3 (mobile app + payments + tournaments)

Full details: [`documentation/md/IDEA.md`](documentation/md/IDEA.md)

---

## 2. Architecture Decisions (Final Choices)

### 2.1 Platform Type
- **Decision:** Full social sports network, not just a booking platform.
- **Rejected:** Simple facility booking app — too narrow, no community moat.

### 2.2 Authentication
- **Decision:** Custom JWT (Spring Security + JJWT 0.12.x), stateless, interface-based for future Keycloak migration.
- **Rejected:** Keycloak — complex infrastructure, steep learning curve, overkill for MVP.
- **Migration path preserved:** `AuthService` is interface-based; a `KeycloakAuthenticationService` can be swapped in via `@ConditionalOnProperty`.

### 2.3 Module Architecture
- **Decision:** Gradle multi-module with strict api/impl split per domain. Each domain has a `-api` module (interfaces + DTOs only) and an `-impl` module (entities, repos, services, controllers). The `server` module is the assembly point.
- **Dependency rule:** `common → [domain]-api → [domain]-impl → server`
- **Rationale:** Clean boundaries, independent testability, future microservices extraction path.

### 2.4 Database
- **Decision:** PostgreSQL (primary) + Redis (cache + refresh token storage + pub/sub).
- **Rejected:** MongoDB — no ACID guarantees, weaker relational query support, unnecessary schema flexibility for this use case.
- **PostGIS** used for geospatial queries (user location, partner/facility proximity).
- **Redis research:** See `documentation/md/REDIS_RESEARCH.MD` — covers pub/sub, TTL-based token storage, AOF vs RDB persistence, stale cache correction, and microservice Redis topology decisions.
- **Redis current state:** Active for like/comment counters in `post-impl` only. Refresh tokens still in Postgres (`refresh_tokens` table). Migration to Redis is backlog ticket A1 in `modules/auth/docs/BACKLOG_MVP.md`.

### 2.5 Booking Verification
- **Decision:** Database-based cryptographic tokens with QR codes and immutable transfer history (blockchain-inspired, not actual blockchain).
- **Rejected:** Ethereum/NFT blockchain — requires crypto wallets, gas fees, bad UX for general public.
- **Transfer history immutability** enforced via PostgreSQL rules.

### 2.6 Routing
- **Decision:** Path-based routing (`/app`, `/vendor`, `/admin`) with in-app sport filtering.
- **Rejected:** Sport-specific subdomains — harder to manage, no MVP benefit.

### 2.7 Mobile Strategy
- **Decision:** Web-first (React 18 + Tailwind), then React Native (Phase 4/5).
- **Code sharing target:** 60–70% between web and React Native.

### 2.8 Payment
- **Decision:** Stripe Connect (platform aggregator model), 10% commission, escrow for equipment marketplace, weekly vendor payouts.

### 2.9 MVP Phase Order (revised after competitive analysis)
- **Final decision:** Partner Finding + Booking first (unique differentiation, revenue from day 1), then Social Feed, then Equipment Marketplace.
- **Rejected original order:** Social feed first — competes directly with Strava with no differentiation for 16 weeks, no revenue.
- **What was actually built first:** Social feed and groups (implemented before partner/booking).

### 2.10 Sport Thumbnails
- **Decision:** Embedded PNG resources in `sport-impl` for MVP; migrate to S3 + CloudFront for production.
- V013 migration updates sports with `icon_url` paths.

---

## 3. What Is Fully Implemented

### 3.1 Backend Modules (all building successfully)

#### `modules:common`
- `ApiResponse<T>` — standard wrapper for all REST responses
- Shared exceptions: `ResourceNotFoundException`, `BadRequestException`, `UnauthorizedException`
- **C1 (2026-07-03):** Global exception handler — new `GlobalExceptionHandler` (`@RestControllerAdvice`) maps all 5 shared exception types to their correct HTTP status (400/403/401/404) plus `MethodArgumentNotValidException` → 400 with field-level errors and a catch-all `Exception` → 500 (no leaked details), all wrapped in `ApiResponse`; before this fix, every one of these fell through to Spring's default 500 across the **entire application** since none had a handler or `@ResponseStatus`; auto-registered via component scan, zero changes needed at any of the ~100+ existing throw sites; first test infrastructure of any kind added to `modules/common` (MockMvc standalone setup, 7 new Spock tests)
- **MVP backlog:** 1 ticket (C1) in `modules/common/docs/BACKLOG_MVP.md`, **`DONE`**

#### `modules:auth:auth-api` + `modules:auth:auth-impl`
- JWT access + refresh token generation/validation (JJWT 0.12.x)
- `RefreshToken` entity stored in database (UUID user reference, no circular JPA dependency)
- `JwtAuthenticationFilter` — extracts and validates Bearer tokens
- `JwtAuthenticationEntryPoint` — 401 JSON responses
- `SecurityConfig` — stateless, CORS for localhost:3000/5173, public endpoints configured
- `AuthController` endpoints: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/forgot-password` (placeholder), `/reset-password`
- `EmailVerificationService`, `PasswordResetService`, `EmailService`

#### `modules:user:user-api` + `modules:user:user-impl`
- `User` entity: UUID PK, email/username unique, profile fields, PostGIS `geography(Point, 4326)` for location, soft delete (`isActive`), roles (ManyToMany eager)
- `Role` entity: USER, VENDOR, GROUP_OWNER, ADMIN
- `UserRepository` custom queries, `UserServiceImpl` full CRUD + soft delete + geospatial updates
- `UserController` at `/api/users/**`
- `UserPreference` entity
- **U1 (friendship system, DONE):** see `modules/user/user-impl/docs/U1_FRIENDSHIP_SYSTEM.md`
- **U2 (2026-07-02):** JWT-based identity + soft-delete query fix — `updateProfile()` now requires
  caller to match the target `userId` (`ForbiddenException` otherwise); `getUserByEmail`/
  `getUserByUsername` now filter `isActive=true` so soft-deleted users 404 instead of leaking; fixed a
  pre-existing broken `UserServiceImplSpec` constructor call in the process; 55 tests passing (18 in
  `UserServiceImplSpec`, up from 15)
- **U3 (2026-07-02):** UserPreference endpoints — `GET`/`PUT /api/users/me/preferences` (`ROLE_USER`),
  both upsert (auto-create defaults on first access); invalid `distanceUnit`/`privacyProfile`/
  `privacyLocation` values silently fall back to that field's default instead of erroring; new
  `UserPreferenceService`/`UserPreferenceServiceImpl`/`UserPreferenceController`; 8 new tests (63 total
  in the module)
- **U4 (2026-07-02):** Password change endpoint — `PUT /api/users/me/password` (`ROLE_USER`), new
  `UserService.changePassword()` (dedicated method, not a reuse of email-keyed `verifyPassword()`); no
  same-password rejection; no session/refresh-token invalidation (explicitly out of scope); 4 new tests
  (67 total in the module)
- **U5 (2026-07-02):** Test coverage backfill — no production code changes; added Spock coverage for
  the 5 previously-untested `UserServiceImpl` methods (`createUser`, `updateUserPassword`,
  `getUserRoles`, `verifyPassword`, `updateLastLogin`); 12 new tests (79 total in the module)
- **U6 (2026-07-02):** User discovery — `GET /api/users/search?q=` (`ROLE_USER`), keyword match on
  name/username; new `UserSearchResponse` + `UserFriendshipStatus`
  (`NONE`/`PENDING_SENT`/`PENDING_RECEIVED`/`FRIENDS`) enum, enriched via 3 batched `UserFriendService`
  calls (no N+1); found and fixed a missing `spring-data-commons` dependency in `user-api`'s
  `build.gradle` (needed for `Page`/`Pageable` in the service interface); 8 new tests (87 total in the
  module)
- **U7 (2026-07-02):** General physical profile stats — `heightCm`/`weightKg`/`shoeSizeCm` added to
  `User` (V024 migration), reuses existing `PUT /api/users/{userId}/profile`; `shoeSizeCm` is JP
  sizing (size = foot length in cm), stored as `Integer`; bounds-validated (50–300/20–300/10–35) via
  `BadRequestException`; 8 new tests (95 total in the module). Surfaced (not fixed here) that
  `BadRequestException` has no global handler anywhere in the app — tracked as **C1** in the new
  `modules/common/docs/BACKLOG_MVP.md`.
- **U8 (2026-07-03):** Fix N+1 in `UserFriendServiceImpl` pending-request mappers — `toFriendRequestResponse` no longer calls `userRepository.findById()` twice per request; new shared helper `mapFriendRequests()` batches all sender+receiver ids into 1 `findAllById()` call for the whole list instead of `1 + 2N`; found during the same cross-module N+1 audit as group-impl's A7/A8 and post-impl's A6/A7; automatically removes the indirect waste in `searchUsers` (U6) too, which called these methods purely for id extraction; 1 new Spock test (empty-input guard)
- **U9 (2026-07-22):** Fix `sendFriendRequest` crash on re-send after decline/cancel/unfriend —
  `friend_requests`' `UNIQUE(sender_id, receiver_id)` plus accept/decline/cancel only ever flipping
  `status` (never deleting the row) meant re-sending to anyone previously declined/cancelled/
  unfriended hit the unique constraint on `INSERT`, an unhandled 500, not a clean error. Now looks up
  any existing row for the pair regardless of status and reactivates it back to `PENDING` instead of
  inserting a duplicate (still blocks re-sending onto a genuinely `PENDING` row, unchanged). Corrected
  U1's own summary, which had framed the crash's symptom ("prevents re-sending") as an intended
  design decision. 3 new Spock tests; live-verified against the real running backend (decline→resend
  and accept→unfriend→resend both now return `200`). Found while wiring FRIEND-1's real friend-request
  flow — see `client/docs/FRIEND-1_FRIENDS_PAGE.md`.
- **U10 (2026-07-22):** Crossed friend requests establish friendship immediately — if A sends B a
  request and B independently sends one back before either accepts, both requests used to sit as
  two separate `PENDING` rows (different `(sender,receiver)` pairs, no constraint conflict), leaving
  both people waiting on each other's explicit accept despite mutual interest already being obvious.
  `sendFriendRequest` now checks for a `PENDING` reverse-direction row first and accepts it
  immediately instead of inserting a second pending row; extracted the shared friendship-creation
  logic into one `establishFriendship()` used by both this path and the explicit
  `acceptFriendRequest` path. 1 new Spock test + every other `sendFriendRequest` test updated to stub
  the new reverse-direction lookup (Spock `Mock()` returns `null`, not `Optional.empty()`, for an
  unstubbed call). Live-verified against the real running backend: both users appeared in each
  other's friends list immediately, no pending rows left. User-requested, same session as U9.
- **U11 filed (2026-07-22, `TODO`):** Protect user data — `GET /api/users/{userId}`,
  `/email/{email}`, `/username/{username}` are all public (no auth) and return the full
  `UserResponse` (email, phone, DOB, gender, height/weight/shoe size, precise location,
  lastLoginAt) to anyone, not a safe subset. The email/username lookups don't even need an id, and
  ids now surface everywhere (posts, comments, group members, friends, search). Confirmed safe to
  narrow: every internal caller (`AuthServiceImpl`, `CommentServiceImpl`, `PostServiceImpl`) calls
  `UserService` directly in-process, never through this HTTP layer. No client screen depends on the
  wider shape either. Scoping only, no code yet.
- **MVP backlog:** 11 tickets (U1–U11) in `modules/user/user-impl/docs/BACKLOG_MVP.md`, 10 `DONE`,
  U11 `TODO`

#### `modules:sport:sport-api` + `modules:sport:sport-impl`
- `Sport` entity: name, description, category, icon_url, min/max players, soft delete
- `UserSportProfile` entity: skill level, experience, preferred position, unique `(user_id, sport_id)`
- Full CRUD services; `SportController` at `/api/sports/**`
- V013 migration: updates sports table with thumbnail URLs and metadata
- **A1 (2026-07-03):** JWT-based identity — `POST /api/sports/profiles`'s `@RequestParam UUID userId` replaced with `@AuthenticationPrincipal String userIdStr`; corrected the ticket's suggested reuse target (`SecurityUtils.extractUserId`) to match the established required-auth-write-endpoint pattern (`@AuthenticationPrincipal` + `UUID.fromString`) instead, verified against group-impl/post-impl's own `DONE` A1 tickets; no service-layer changes; new **A4** ticket logged (batch sport lookup in `getUserProfiles()` — bounded to ≤3 items by the existing max-3-profiles rule, ticketed for cleanliness not performance, per user's explicit request)
- **A2 (2026-07-03):** Sport profile ownership check — `PUT /api/sports/profiles/{profileId}` and `DELETE /api/sports/profiles/{profileId}` previously had no ownership check (any authenticated user could edit/delete anyone's profile); `UserSportProfileService.updateProfile()`/`deleteProfile()` gained a `callerId` param, throw `ForbiddenException` on mismatch after fetching (fetch-then-check, so not-found still 404s correctly); 2 new Spock tests (non-owner update/delete → `ForbiddenException`)
- **A3 (2026-07-03):** Flexible per-sport attributes — `attributes JSONB` column added to `user_sport_profiles` (V025) for sport-specific data (e.g. dominant hand, stroke style) that doesn't fit a fixed schema; first JSONB column in the codebase, uses Hibernate 6's native `@JdbcTypeCode(SqlTypes.JSON)` mapping (no extra library needed, verified against the project's actual Hibernate version before implementing); `updateProfile()` merges new attribute keys rather than replacing wholesale; serialized size capped at ~4KB (`BadRequestException` if exceeded); 4 new/changed Spock tests. **Verification gap:** the JSONB column/Hibernate JSON mapping could not be validated against a live Postgres in this sandbox — recommend a real DB run before merging.
- **A4 (2026-07-03):** Batch sport lookup in `getUserProfiles` — replaced a per-profile `sportRepository.findById()` with one `findAllById()` call; ticketed and fixed for cleanliness/consistency only, not performance (confirmed this list can never exceed 3 items, per the max-3-profiles rule — never a real N+1 scaling risk); 1 new Spock test (empty-input guard)
- **MVP backlog:** 4 tickets (A1–A4) in `modules/sport/sport-impl/docs/BACKLOG_MVP.md`, **all `DONE`**

#### `modules:social:post-api` + `modules:social:post-impl`
- `Post` entity: content (5000 chars), geolocation, sport, visibility, post type, soft delete
- `Comment` (nested replies, max 1 level enforced in B A4), `PostLike`, `CommentLike` entities
- `Hashtag`, `PostHashtag`, `UserFollow` entities (tables exist; UserFollow → replaced by Friendship in B1)
- `PostServiceImpl`, `CommentServiceImpl`
- `PostController` — 16 endpoints: create/read/update/delete posts, like/unlike, comment CRUD, feed, group posts, active broadcasts, broadcast end-time extension
- **MVP backlog:** 12 tickets (A1–A8, B1–B6) in `modules/social/post-impl/docs/BACKLOG_MVP.md`; all `DONE`
- **A1 (2026-06-30):** JWT-based identity — all `@RequestParam userId` removed from `PostController`; write endpoints use `@AuthenticationPrincipal`, read endpoints use `Authentication` + `SecurityUtils.extractUserId()`; `GET /api/posts/user/{userId}` renamed to `GET /api/posts/mine`
- **A2 (2026-06-30):** Fix post delete permission — `PostServiceImpl.deletePost()` now allows group owner/admin to delete GROUP_POST and GROUP_BROADCAST posts in their group (reuses existing `GroupService.isGroupOwner/isGroupAdmin`)
- **A3 (2026-07-01):** Group posts membership gate — `getGroupPosts()` now throws `ForbiddenException` for unauthenticated or non-member callers; `ForbiddenException` added to `modules/common`
- **A4 (2026-07-01):** Comment fixes — `getPostComments()` now verifies parent post is `isActive=true` before returning comments; soft-deleted post's comments return 404 instead of leaking data; depth enforcement (Fix 2) dropped as unnecessary
- **B1/U1 (2026-07-01):** Friendship system — `UserFollow` entity + `user_follows` table replaced; `friend_requests` + `friendships` tables (V019); `UserFriendService` interface in `user-api` with 10 methods; `UserFriendController` at `/api/users/friends` (8 endpoints); two-row-per-pair friendship design for O(1) `findByUserId`; 18 Spock tests
- **B2 (2026-07-01):** Personalized main feed — `GET /api/posts/feed` now requires auth (401 for guests); returns caller's own USER_FEED posts + friends' USER_FEED posts + GROUP_POSTs from sport-matched groups, ordered by `last_interaction_at DESC`; V020 migration adds `last_interaction_at` column + feed index; `createComment()` updates `last_interaction_at` on the parent post; `GroupService.getGroupIdsBySportProfiles()` added to group-api + implemented in group-impl; `UserFriendService` injected into `PostServiceImpl` via user-api interface; empty-list JPQL sentinel pattern; 4 new Spock tests
- **B5 (2026-07-01):** Hashtag service — auto-extracts `#word` patterns from post content on create (normalized lowercase, deduplicated, max 30); decrements counts on post delete; `HashtagRepository` + `PostHashtagRepository` added; `CreatePostRequest.hashtags` field removed (auto-extracted); `PostResponse.hashtags` now populated; `GET /api/hashtags/trending`, `GET /api/hashtags/suggest?q=` (public); `GET /api/posts/hashtag/{tag}` returns public USER_FEED posts + GROUP_POSTs for caller's member groups; V022 adds `varchar_pattern_ops` index; `GroupService.getGroupIdsForMember()` added; 12 Spock tests
- **B6 (2026-07-01):** GROUP_BROADCAST management — one active broadcast per group enforced at create time (`existsActiveGroupBroadcast`); `broadcastEndTime` defaults to now+24h, must be strictly future (V023 adds column + partial index); group owner/admin can also edit a broadcast's content (moderator override in `updatePost()`, scoped to GROUP_BROADCAST only); `GET /api/posts/broadcast` lists active broadcasts for caller's sport-matched groups; `PATCH /api/posts/{postId}/broadcast-end-time` (owner/admin only) extends expiry; expiry is lazy (`broadcast_end_time > now()` filter), no scheduled job; 17 new Spock tests
- **A5 (2026-07-02):** Fix cross-domain violation in `CommentServiceImpl` — replaced direct `user-impl` `User`/`UserRepository` imports with `UserService` (`user-api`); new `resolveUserFullName()` helper preserves the exact `"Unknown User"` fallback via catching `ResourceNotFoundException`; removed the now-unnecessary `user-impl` Gradle dependency from `post-impl/build.gradle`; found during a cross-module audit alongside group-impl's sibling ticket A6; 1 new Spock test (17 total in `CommentServiceImplSpec`)
- **A6 (2026-07-03):** Fix N+1 hashtag lookup in feed mappers — `mapToResponse` (shared by all 5 paginated feed methods) no longer calls `hashtagService.getTagsForPost()` per post; new batched `HashtagService.getTagsForPosts(List<Long>)` + `PostHashtagRepository.findTagsByPostIds()` resolve the whole page's hashtags in 1 query instead of N; `likeCount`/`commentCount`/`isLikedByCurrentUser` were already addressed (Redis) or a deliberate design choice, confirmed during a cross-module N+1 audit alongside group-impl's A7/A8 and user-impl's U8 — not touched; 2 new Spock tests
- **A7 (2026-07-03):** Fix N+1 in `CommentServiceImpl.getPostComments` — `mapToResponse` no longer calls `userService.getUserById()` or re-queries replies per comment/reply; new batched `CommentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc()` + `UserService.getUsersByIds()` resolve the whole page's replies and authors in 2 queries total instead of 2 per comment; recursion into replies now happens over an in-memory map, naturally bounded to 1 level by A4's existing nesting rule (confirmed, not assumed); 1 test rewritten to exercise the real batched code path instead of an unrealistic `createComment`-based scenario
- **A8 (2026-07-08):** `server:test` needs Redis — chose Testcontainers over making the Redis-backed paths degrade gracefully (that would've meant adding fallback logic to ~10 call sites across `PostServiceImpl`/`CommentServiceImpl` that don't have any today, since `getCount()` — called on every response, not just like/unlike — has no try/catch); `BaseIT` gets a singleton `GenericContainer` Redis (`redis:7-alpine`), started once per JVM via a static initializer + bound via `@DynamicPropertySource`, reaped automatically by Testcontainers' Ryuk sidecar; no new Gradle dependency needed for the container itself, but `org.testcontainers:testcontainers` had to be bumped `1.19.3` → `2.0.5` (the old version hardcodes a stale Docker API version rejected by current Docker engines); the sibling `org.testcontainers:postgresql:1.19.3` dependency was confirmed dead (zero references anywhere in `server/src/test`) and removed rather than version-matched; `application-test.yml`'s dead `spring.data.redis.enabled: false` line removed alongside it
- **(2026-07-08):** Investigated and removed `JavaRevision.java`/`JavaRevisionTest.groovy` — a personal Java pass-by-reference scratch demo (not app code) swept into an unrelated feature commit back in March, asserting a stale/wrong expected value ever since; user confirmed deletion over fixing the assertion or leaving it. `server:test` is now fully green (27/27)

#### `modules:social:group-api` + `modules:social:group-impl`
- `Group`, `GroupMember`, `GroupRole` (pre-seeded: owner/admin/member), `GroupJoinRequest`, `GroupSettings` entities
- `GroupServiceImpl` (600+ lines): full business logic, permission checks, ownership transfer, settings
- `GroupController` — 24 endpoints: group CRUD, member management, join request workflow, settings, permission checks
- Business rules enforced: unique names, owner-only delete, one pending request per user per group, owner cannot leave without transferring
- **A1 (2026-06-29):** JWT-based identity — caller `userId` extracted from JWT principal in controller; `SecurityUtils.extractUserId()` added to `common.auth`; `JwtAuthenticationFilter` principal changed from email → userId
- **A3 (2026-06-29):** Cancel join request — `DELETE /api/groups/join-requests/{requestId}`; hard-delete with caller ownership + group-active + pending-status guards; 5 Spock tests added; group-impl build.gradle fixed to run Groovy/Spock tests
- **B6b (2026-06-29):** Group info fields — added `rules` and `schedule` TEXT columns (V014 migration); editable via existing update endpoint; new `GET /api/groups/{groupId}/info` endpoint returns dedicated `GroupInfoResponse`; 3 Spock tests
- **B2 (2026-06-29):** Group–Sport association + UserSpace — `sport_id` added to `Group` (V015 migration); `createGroup` now requires `sportId` and validates creator has an active `UserSportProfile` for that sport via cross-domain `UserSportProfileService`; `getPublicGroups` accepts optional `?sportId=` filter; `UserSportProfileService.hasProfileForSport()` added; max-3 sport profiles enforced in `createProfile`
- **B5 (2026-06-29):** Group search & discovery — `GET /api/groups/public` extended with optional `keyword` (ILIKE on name) and existing `sportId` filter; new `GroupSearchResponse` DTO with `isMember` flag; member groups sorted first (alpha), then non-members (most members first); single LEFT JOIN with `SUM(CASE WHEN ...)` resolves memberCount + isMember in SQL (2 queries flat vs. prior 2+2N); 33 Spock tests passing
- **B3 (2026-06-30):** Three post types — added `PostType` enum (`USER_FEED`, `GROUP_POST`, `GROUP_BROADCAST`) to `Post` entity (V016 migration, TRUNCATE + CHECK constraint); enforced at create time: `USER_FEED` rejects `groupId`, group types require `groupId` + membership check (GROUP_POST: member; GROUP_BROADCAST: owner/admin only via cross-domain `GroupService`); `groupId` added to `PostResponse`; `findPublicPosts` now filters by `postType = USER_FEED`; post-impl switched to Groovy/Spock; full test suite rewritten; feed visibility filtering deferred to future post-module ticket
- **B6a (2026-06-30):** Pinned posts — `group_pinned_posts` table (V017 migration); owner/admin can pin/unpin `GROUP_POST` posts (max 10 per group, latest-first); cross-domain `PostService.getPostById()` validates post belongs to the group; `getGroup` now includes top 3 pinned posts in `GroupResponse.pinnedPosts`; `GET /api/groups/{groupId}/pins` for full list (members only); group-api gained `post-api` dependency; 11 Spock tests
- **B1 (2026-06-30):** Member invitation flow — `group_invitations` table (V018); 3-step flow: member invites → owner approves/declines → invitee accepts/rejects; gated by `allowMemberInvites` setting; duplicate pending invite silently returns existing; already-a-member returns 400; friend check stubbed pending U1; notifications stubbed pending ADR; 8 endpoints, 13 Spock tests
- **A5 (2026-06-30):** Test coverage gaps — 26 Spock tests added to `GroupServiceImplSpec` covering 8 previously untested methods: `removeMember`, `leaveMember`, `declineJoinRequest`, `addMember`, `updateMemberRole`, `getGroupMembers`, `getGroupSettings`, `getUserJoinRequests`; both happy path and all error paths (not-found, permission, state guards)
- **A6 (2026-07-02):** Fix cross-domain violation in `GroupServiceImpl` — replaced direct `user-impl` `User`/`UserRepository` imports with `UserService`/`UserFriendService` (`user-api`); new `UserService.getUsersByIds()` batch method (no `isActive` filter, no exception on miss) used at all 5 call sites, consolidating 3 of them from 2-3 individual lookups into 1 batched call each; enabled the friends-only invite gate in `createInvitation()` (`userFriendService.areFriends()`), previously stubbed pending U1 which is now done; removed the improper `user-impl` Gradle dependency + now-unnecessary JTS test dependency from `group-impl/build.gradle`; 1 new Spock test (non-friend invite → `BadRequestException`)
- **A7 (2026-07-02):** Fix N+1 queries in paginated list mappers — `getGroupMembers`, `getUserJoinRequests`/`getGroupJoinRequests`, `getGroupInvitations`/`getMemberSentInvitations`/`getUserPendingInvitations` now collect distinct ids from the page up front and do one batched lookup per dependency instead of a per-item query inside `Page.map()`; mappers changed to pure functions taking pre-resolved `Map`s; also fixed `getUserPendingInvitations`'s own per-item `groupRepository.findById()`, a 6th touch-point found during implementation and confirmed in scope; 3 Spock stubs updated to assert single batched calls
- **A8 (2026-07-02):** Fix N+1 in `getUserGroups` — replaced the per-page-item chain (1+4 queries/item) with 4 flat batched queries total: new `GroupMemberRepository.findByUserIdAndGroupIsActiveTrue()` filters deleted groups out at the pagination source (a deliberate behavior change — previously deleted groups lingered in "my groups"); new same-domain JOIN `GroupRepository.findGroupsWithMemberCounts()` resolves groups + member counts in one query; creator names and role names batched via existing `userService.getUsersByIds()`/`groupRoleRepository.findAllById()`, the latter using role ids already present on the page's `GroupMember` rows (no second membership query); new mapper overload added alongside the untouched single-item one used by `getGroup`/`createGroup`
- **A9 (2026-07-08):** Privacy/membership check on `getGroup` — a private group with a non-member (or anonymous) caller now throws `BadRequestException` (400, matching this module's existing permission-failure convention) before the response is built, instead of returning full details including pinned posts to anyone authenticated; public groups and member access to private groups unchanged; reuses existing `isGroupMember()`; 4 new Spock tests in `GroupServiceImplSpec`
- **B8 (2026-07-20, `modules/social/group-impl/docs/B8_INVITATION_STATUS_FILTER.md`):** `GET /api/groups/{groupId}/invitations/sent` previously hardcoded its status filter to `pending_owner` only, so it could never return an invitation waiting on the invitee's response — filed for the client's upcoming GRP-3 (Members tab, "waiting for user accept"/"waiting for group approve" sections). Shipped as a single, unfiltered call: the endpoint now always returns both `pending_owner` and `pending_user` rows together in one page, distinguished by each row's `status` (revised same-day from an initial `status` query-param design, once the user compared it against GRP-3's total request count and wanted both statuses in one request rather than one call per status). `GroupService.getMemberSentInvitations` is now `(groupId, inviterId, pageable)`; new `GroupInvitationRepository.findByGroupIdAndInviterIdAndStatusIn`. `:server:test` green (26/26 `GroupControllerTest` cases unaffected). Live `bootRun` verification skipped both times — port 8080 already held by a pre-existing process not started this session, not restarted to avoid disrupting a possibly-in-use dev server.
- **B7 (2026-07-20, `modules/social/group-impl/docs/B7_GROUP_TYPE_TIERS.md`):** started as an audit-and-confirm ticket for the client's GRP-1 Settings tab (privacy/permission-model checks against `UpdateGroupRequest`/`updateGroupSettings`/`deleteGroup`/`getGroupSettings` — all confirmed already correct, just under-tested; added the missing admin/member Spock cases). The one real finding — `group_settings.max_members` was stored but never validated or enforced anywhere, not on write, not at join time — turned into schema work once a floor-check on the raw value wouldn't have made the cap meaningful: new `group_types` table (migration `V026`) with 3 fixed tiers, DEFAULT/50 (every group's silent default, existing rows backfilled), STANDARD/100, PREMIUM/500; `group_settings.max_members` dropped in favor of `group_settings.group_type_id`; `UpdateGroupSettingsRequest.maxMembers` removed (no more manual cap setting — changing type is a separate flow, filed as **B10**). Cap enforcement — not in the original scope, raised as an explicit decision with the user and built now rather than deferred — added via `GroupServiceImpl.enforceMemberCapacity()`, called from `addMember`/`acceptJoinRequest`/`acceptInvitation`. `:modules:social:group-impl:test` green; full backend `compileJava`/`compileTestJava`/`compileTestGroovy` green (confirms no breakage in `GroupControllerTest`, which never referenced `maxMembers`). `:server:test`'s Testcontainers-backed `GroupControllerTest` not run — no Docker daemon in this environment, pre-existing limitation. No live `bootRun` walkthrough this session — flagged for B10 pickup.
- **B10 (filed 2026-07-20, `modules/social/group-impl/docs/BACKLOG_MVP.md`):** `TODO` — group type change flow (upgrade/downgrade). Filed directly out of B7: groups are silently `DEFAULT` forever today with no way to move to `STANDARD`/`PREMIUM`. Design questions flagged for pickup: who can change type (owner-only vs. an approval/payment gate — tiers read like a monetization surface), the downgrade-below-current-member-count case, and endpoint shape (`PUT .../settings` field vs. dedicated `PUT .../type`).
- **B9 (2026-07-21, `modules/social/group-impl/docs/B9_GROUP_WELCOME_SYSTEM_POST.md`):** new `GROUP_SYSTEM` post type (migration `V027`), auto-created welcome message ("{name} joined the group 👋" / "...— invited by {inviter} 👋") on `acceptJoinRequest`/`acceptInvitation`, authored by the group's *current* owner (resolved dynamically, no dedicated system-user account — that idea from the original ticket draft was dropped during scoping). `createPost` rejects caller-supplied `GROUP_SYSTEM` (closes the impersonation hole); new internal-only `PostService.createSystemPost`; `updatePost`/`deletePost` reject `GROUP_SYSTEM` unconditionally, even for the nominal author. Bigger-than-planned change: `addMember` no longer inserts a member directly — it now creates a self-approved (`pending_user`) `GroupInvitation` that still requires the friends-only gate and the target's acceptance, collapsing its trigger into the same `acceptInvitation` path (roleName param dropped; promote via `updateMemberRole` after accept). `:modules:social:post-impl:test`, `:modules:social:group-impl:test`, `:server:test` all green (30/30 on `:server:test`, Docker started mid-session).
- **A10 (2026-07-21, `modules/social/group-impl/docs/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md`):** filed mid-scoping of the client's GRP-6 (Join Group modal multi-select sport filter) once a client-side per-sport fan-out was reversed in favor of a real backend filter. `GET /api/groups/public` gained an optional `sportIds` (`List<Long>`) param alongside the existing single `sportId` (kept for back-compat) — `sportIds`, when non-empty, takes priority over `sportId` rather than the two being combined. Resolved to one canonical list in `GroupServiceImpl` before the repository is touched; both `searchPublicGroupsWithCounts`/`searchPublicGroupsAnon` JPQL changed from `= :sportId` to `IN :sportIds` (a pattern already used elsewhere in this repository for nullable list params, so not a new risk). `:modules:social:group-impl:test` and `:server:test` both green; live-verified against a running `bootRun` instance with 3 real sport-scoped groups (multi-value filter, legacy single filter, no-filter, and priority-when-both-present all confirmed correct against real HTTP responses, not just mocked tests). Unblocks GRP-6 (`client/docs/BACKLOG_MVP.md`).
- **B11 (2026-07-23, corrected 2026-07-24, `modules/social/group-impl/docs/B11_JOIN_INVITATION_RACE_CONDITIONS.md`):** reconciled the three race conditions between `group_join_requests` and `group_invitations` filed while scoping the client's GRP-7 (full rule diagrams: `documentation/md/adr/JOIN_GROUP_ADR.md` §5). Three rules in `GroupServiceImpl`: (1) `createInvitation` — an owner/admin's own invitation skips `pending_owner`, created directly at `pending_user` (or `accepted`, if rule 2 fires in the same call); (2) every place an invitation is about to enter `pending_user` checks for an existing `pending` join request from the same person first — if found, the invitation goes straight to `accepted` and the join request is marked `accepted` too, not left dangling; (3) `createJoinRequest` — if the requester already has a `pending_user` invitation, a `GroupJoinRequest` row is still created (no synthetic response, no contract change) but directly as `accepted`, crediting the invitation's approver as `reviewedBy`. New shared `finalizeMembership()` helper replaces the capacity+insert+welcome-post block that was about to be duplicated a 4th time. Deliberate consequence, confirmed with the user: rules 2/3 can leave two `accepted` rows (one invitation, one join request) for the same real join event — no merge/suppression added; noted on GRP-7's backlog entry for the client's future display decision. **Follow-up fix (2026-07-24):** the initial pass wired rule 2 into only the two call sites the ADR named, missing a third — `addMember` (B9's owner/admin direct-add) also creates a self-approved `pending_user` invitation and needed the same check; caught by the user re-reviewing the rules against the code, not by the original tests. Fixed by reusing the same `acceptJoinRequestAsSideEffect` helper. `:modules:social:group-impl:test` (117 tests) and `:server:test` both green; all races — including the `addMember` one — live-verified against a running `bootRun` instance with real registered users, friend requests, and group invitations/join requests. Unblocks GRP-7 (`client/docs/BACKLOG_MVP.md`).

#### `server`
- `SportConnectApplication.java` — main entry point with full component scan
- `application.yml` — PostgreSQL, Redis, Liquibase, JWT, mail, CORS, Swagger/OpenAPI configured
- `application-dev.yml` — dev database (`sportconnect_dev`), shorter JWT expiry

#### Database Migrations (Liquibase, all applied)
| Migration | Content |
|---|---|
| V001 | users, roles, user_roles |
| V002 | refresh_tokens, email_verification, password_reset_tokens |
| V003 | sports, facility_types |
| V004 | posts, post_media, post_likes, comments, comment_likes, post_shares |
| V005 | user_follows, hashtags, post_hashtags, notifications, user_blocks, post_reports |
| V007 | group_roles (pre-seeded with 3 roles) |
| V008 | groups table |
| V009 | group_members table |
| V010 | group_join_requests table |
| V011 | group_settings table |
| V012 | adds group_id, is_hidden, is_system_post to posts |
| V013 | updates sports with icon_url, category, min/max players |

**~29 total DB tables.**

### 3.2 Frontend — rebuilt from scratch (old client removed 2026-07-06)

The original CRA-based client (auth pages, social feed, groups UI, localStorage token handling) was
**deleted on 2026-07-06** for a from-scratch rebuild. Functionality the old client had
(login/register, feed, likes/comments, group switching) is re-scoped in the Client MVP Backlog's
AUTH and FEED integration phases (see section 5) — this time with in-memory access tokens +
httpOnly refresh cookie instead of localStorage.

**HF-00 (scaffolding) is DONE** (2026-07-06, `client/docs/HF-00_PROJECT_SCAFFOLDING.md`): Vite 7 +
React 18 + TS strict + Tailwind v4 (design tokens in `src/index.css` `@theme`, 1:1 with the mockup) +
React Router stub routes + Vitest/RTL + Storybook (addon-a11y) + Playwright (e2e +
visual-regression projects) + ESLint 9 (jsx-a11y)/Prettier, pnpm-managed, re-wired into Gradle
(`./gradlew :client:buildClient`, part of the root `build`). All placeholder checks pass (lint,
2 unit tests, build, 2 Playwright tests, Storybook build).

### 3.3 Test Coverage (all Spock Framework, Groovy)

| Module | Tests | Coverage |
|---|---|---|
| auth-impl | ~35 (4 files) | JWT lifecycle, refresh token, auth filter, token entity |
| user-impl | 23 (3 files) | UserService CRUD, User/Role entity, geospatial |
| sport-impl | ~20 (4 files) | SportService, UserSportProfileService, entities |
| social/post-impl | 13 (1 file) | PostService CRUD, likes, feed, auth checks |
| social/group-impl | 71 (2 files) | GroupService + GroupController, permission system |

**Total: ~162 unit tests, all passing.**

---

## 4. In-Progress / Partially Implemented

### 4.1 Forgot-password endpoint is a placeholder
`AuthController.forgotPassword()` returns success but does not look up the user by email or send a reset email. Needs integration with `UserService.getUserByEmail()`.

### 4.2 Social feature tables exist but no service implementation
These tables were created in V004/V005 but have no business logic or API:
- `user_follows` — to be **dropped** and replaced by `friendships` table (Post MVP ticket B1)
- `hashtags`, `post_hashtags` — extraction + service planned in Post MVP ticket B5
- `post_shares` — deferred to V1 (no sharing in MVP)
- `notifications` — deferred; not yet planned
- `user_blocks` — deferred; not yet planned
- `post_reports` — deferred; not yet planned

### 4.3 Sport thumbnail images not placed yet
The directory `modules/sport/sport-impl/src/main/resources/images/sports/` and V013 migration exist, but the 12 PNG image files need to be placed there and a `WebMvcConfigurer` ResourceHandler needs to be configured.

### 4.4 Scratch files in production modules
- `SportConnectApplication.java` contains an unrelated `lengthOfLongestSubstring()` LeetCode method
- `modules/user/user-impl/src/main/java/com/sportconnect/user/leetcode.java` and its Spock spec are scratch files

---

## 5. Planned / Upcoming Features

### Post Module MVP Backlog (10 tickets, all TODO)
Full detail in `modules/social/post-impl/docs/BACKLOG_MVP.md`.

| Ticket | Title | Key dependency |
|---|---|---|
| A1 | JWT-based identity | — |
| A2 | Fix post delete permission (group owner/admin) | A1 |
| A3 | Group posts membership gate | — |
| A4 ✓ | Comment fixes (depth + post-active check) | — |
| B1 ✓ | Friendship system (replaces user_follows) | A1 |
| B2 ✓ | Personalized main feed | A1, B1 |
| B3 ✓ | Redis like/comment/reply counters | — |
| B4 ✓ | Redis comment preview cache | Sorted Set per post; DEL on delete/post-delete; partial indexes on comments table |
| B5 ✓ | Hashtag service (auto-extract, trending, suggest) | — |
| B6 ✓ | GROUP_BROADCAST management | A1, A2 |

**MVP scope decisions (2026-06-30):** Text-only posts and comments. No media, no sharing, no visibility enforcement, no real-time — all deferred to V1. Friendship replaces following. Feed ordered by `last_interaction_at`. Hashtags auto-extracted from `#word` in content. GROUP_BROADCAST is a separate section with 1-per-group limit and 24h default expiry.

### Client MVP Backlog (SportHub rebuild — 36 tickets, Phase 0 complete, created 2026-07-06)

**HF-0 DONE** (2026-07-06, `client/docs/HF-0_SHARED_TYPES_AND_MOCK_DATA.md`): home-feed types +
mock data ported from the approved mockup (dynamic timestamps, coverage criteria encoded as Vitest
assertions).

**HF-10a DONE** (2026-07-06, `client/docs/HF-10a_VISUAL_REGRESSION_HARNESS.md`): visual-regression
harness — reference mockup moved to `client/design-reference/` with the Tabler icon font vendored
(the mockup's CDN link was a 404), 9 committed baselines (375/768/1280px × default/basketball/empty)
under `e2e/visual/__screenshots__/`, deterministic re-runs verified. Phase 0 is complete —
HF-1..HF-6 component tickets are unblocked and parallelizable.

**HF-1 DONE** (2026-07-06, `client/docs/HF-1_TOPBAR_NAVTABS.md`): TopBar + NavTabs in `src/shared/`
plus the shadcn/ui foundation (token-styled Button/Avatar, `cn()`, `components.json`, `@/` alias),
`@tabler/icons-react`, new design-system utilities (`border-hairline`, `max-w-frame`, 11/13px type
steps), and an `AppShell` layout route giving every page the shared shell with real NavTabs
navigation. 13/13 unit tests, e2e click-through, Storybook stories all green.

**HF-2 DONE** (2026-07-06, `client/docs/HF-2_SPORTSWITCHER.md`): shared SportSwitcher — controlled
pill row with synthetic "All" pill, 2px accent active border, always-visible dashed "Add sport"
(aria-disabled at the 3-sport cap — mockup parity decision, supersedes the spec's hide-at-cap rule),
pills wrap on narrow screens. Sport types re-homed to `src/shared/types/sport.ts`; shared
`getSportIcon()` registry added. 18/18 tests, 4 Storybook stories verified against the mockup.

**HF-3 DONE** (2026-07-06, `client/docs/HF-3_POSTCARD_FEED.md`): PostCard + Feed — controlled like
toggle (parent owns state), ramp sport badges, clickable hashtags, per-sport empty state, relative
time via date-fns behind a shared `formatRelativeTime()` helper; new `rampStyles` static class map
and directional `border-hairline-t/b` utilities (fixing a border-stacking bug that also affected
NavTabs). 27/27 tests, 7 Storybook stories, badge colors verified by computed style.

**HF-4 DONE** (2026-07-06, `client/docs/HF-4_UPCOMINGMATCHES.md`): UpcomingMatches right-rail card —
sport-filtered match list capped at 4 visible (`maxVisible` prop; spec's open question resolved),
open/full CTAs distinct by text, per-match `aria-label`s, new shared `formatStartTime()` (future
counterpart of `formatRelativeTime`). Mock-backed for the whole MVP — no matches backend exists.
40/40 tests, 5 Storybook stories verified against the mockup.

**HF-5 DONE** (2026-07-07, `client/docs/HF-5_TRENDINGHASHTAGS.md`): TrendingHashtags right-rail
card — full-row clickable hashtag buttons (tag accent left, muted count right), caller-provided
order enforced by test, long tags truncate, muted empty state. Stays global (epic open question #1
resolved: no activeSport filter); FEED-6 later swaps mock for `GET /api/hashtags/trending`.
44/44 tests, 3 Storybook stories verified against the mockup.

**HF-6 DONE** (2026-07-07, `client/docs/HF-6_GROUPBROADCASTS.md`): GroupBroadcasts right-rail card —
clickable broadcast rows (spec wins over the mockup's static divs), ramp initials avatars,
shared relative time, `line-clamp-2` messages (screenshot check caught that `block` +
`line-clamp-2` silently disables clamping — never combine them). Global like HF-5; FEED-7 later
swaps mock for `GET /api/posts/broadcast`. 48/48 tests, 3 Storybook stories.

**HF-7 DONE** (2026-07-07, `client/docs/HF-7_HOMEFEEDPAGE.md`): HomeFeedPage assembled — the full
Home Feed screen is now live at `/`. `useHomeFeedData()` hook (CLAUDE.md `{ data, isLoading,
isError }` shape supersedes the epic's flat sketch — this is the FEED/SPORT de-mock seam),
page-local `activeSport` driving Feed + UpcomingMatches in one render pass, synchronous like
toggle, md (768px) rail-stacking breakpoint. Verified in a real browser at 1280/375px.
55/55 tests. **Phase 2 (page integration) complete.**

**HF-8 DONE** (2026-07-07, `client/docs/HF-8_RESPONSIVE_A11Y_PASS.md`): responsive + a11y pass —
committed axe/overflow gate (`e2e/flows/a11y.spec.ts`, @axe-core/playwright) at 375/768/1280.
Sport ramps pass AA (8.3–8.9:1); two real failures found and fixed: `text-muted` darkened
#888780→#6e6d66 (was 3.4:1; reference HTML updated, 9 baselines regenerated) and NavTabs
overflowed 375px (now scrolls within itself). Keyboard walk verified. 8/8 e2e, 9/9 visual, 55/55 unit.

**HF-10b DONE** (2026-07-07, `client/docs/HF-10B_VISUAL_REGRESSION_CI_GATE.md`): full-page visual
regression + the repo's **first CI** (`.github/workflows/client-ci.yml`: lint/tsc/unit/e2e/visual
on PRs touching `client/**`, + PR template). One-time human mockup-parity review passed, then
baselines re-taken from the real page (frozen clock) — ongoing gate is tight self-regression
diffing (mockup pixel-match is impossible: computed times, SVG vs webfont icons). Token audit
clean. Manual bootstrap remains: Linux baseline artifact swap + marking the check required
(documented in the summary).

**HF-11 DONE** (2026-07-07, `client/docs/HF-11_E2E_HOME_FEED_JOURNEY.md`): 7-step Home Feed E2E
journey (`e2e/flows/home-feed-journey.spec.ts`) — load, sport filter, clear, like round-trip,
hashtag/CTA reachability (no-op callbacks asserted as such — premise corrections vs the epic),
Add-sport at-cap state. No MSW (all mock-driven); the MSW handler follow-ups for FEED/SPORT
tickets are recorded on the spec + backlog. 9/9 e2e, 55/55 unit.

**HF-9 DONE — HOME FEED EPIC CLOSED** (2026-07-07, `client/docs/HF-9_QA_ACCEPTANCE_CHECKLIST.md`):
all 7 acceptance items executed — 6 pass with evidence (Storybook build, 56/56 unit incl. new
repeated-toggle math test, 9/9 e2e, 9/9 visual, HF-10b token audit); item 7 (E2E green *in CI*)
conditional — CI has never executed. Follow-up **HF-12** (CI bootstrap + first green run, mostly
manual GitHub steps) added to the backlog as the epic's release condition. All 14 HF tickets done;
next is Phase 5 (MSW-0/AUTH-0; re-verify auth backlog A2 first).

**HF-12 DONE — CI LIVE AND GREEN** (2026-07-08, `client/docs/HF-12_CI_BOOTSTRAP.md`): repo work
pushed to GitHub; first `client-ci` runs caught a real bug (`**/lib` gitignore swallowed
`client/src/shared/lib` — CI-only TS2307s, fixed with scoped negation); Linux baselines swapped
via the update-baselines dispatch artifact (PR #2); **fully green run merged**. HF-9 item 7
resolved → Home Feed epic release condition met. Caveat: branch protection unavailable (GitHub
Free + private repo) — red checks block by convention only.

**AUTH-0 DONE** (2026-07-08, `client/docs/AUTH-0_TYPES_API_CLIENT_STORE.md`): auth types
(`src/features/auth/types.ts`), shared `ApiResponse<T>` envelope (`src/shared/types/api.ts`, new),
axios `apiClient` (`withCredentials`, `/api` proxy, separately-testable `attachAuthHeader`
interceptor), Zustand `authStore` (no persist middleware — the point). Resequenced ahead of MSW-0
(user decision — MSW-0's own acceptance criteria needs this ticket's types first). Backend gap
found and fixed along the way: `AuthServiceImpl.toUserResponse()` was missing `avatarUrl`/
`phoneNumber` entirely (only 6 of the real `UserResponse`'s fields), which the epic doc's own
"reality check" had missed — added both, `HashMap` replacing the null-hostile `Map.of(...)`.
8/8 new unit tests, 64/64 full suite, strict `tsc`, lint, and build all clean.

**MSW-0 DONE** (2026-07-08, `client/docs/MSW-0_MOCK_SERVICE_WORKER_HANDLER_SETUP.md`): browser-mode
MSW wired into a Playwright fixture (`e2e/mocks/test.ts`, `page.addInitScript` dynamic-imports
`e2e/mocks/server.ts` by URL — `src/` never imports MSW, zero production bundle impact). Scoped to
auth handlers only (`e2e/mocks/handlers/auth.ts`) — feed/groups/sport handlers deferred to
FEED-0/FEED-6/FEED-7/SPORT-1, same resequencing principle as AUTH-0. Self-verifying proof spec
(`e2e/flows/msw-setup.spec.ts`, 4/4 passing) asserts `response.fromServiceWorker()` since no login
UI exists yet to drive this through. 13/13 e2e, 64/64 unit, clean build.

**AUTH-1 DONE** (2026-07-09, `client/docs/AUTH-1_LOGIN.md`): Login — two-column card
(`LoginPage`/`LoginForm`/`CommunityIllustration`) built against a new `design-reference-login.html`
the user created mid-ticket, which became the authoritative visual spec and expanded scope beyond
the epic's plain text (OAuth buttons rendered-but-disabled per the backlog's OAuth deferral,
password show/hide toggle pulled forward from AUTH-6, illustration + `/register` link built at full
fidelity). `useLogin()` (new `@tanstack/react-query` dependency, first ticket needing it —
`QueryClientProvider` added to `main.tsx`) wraps the mutation and populates `authStore` directly.
Found and fixed a real, previously-invisible bug along the way: `cn()`
(`src/shared/lib/utils.ts`) was silently dropping the custom `border-hairline` utility whenever
merged with a `border-{color}` class — `tailwind-merge` misclassified it into the border-color
conflict group — breaking every `Button` `default`/`outline` variant's border app-wide, unnoticed
until AUTH-1's borderless OAuth buttons had nothing left to mask it. Fixed via
`extendTailwindMerge`; the fix is correctly global but changes Home Feed's already-shipped
rendering, so HF-10b's committed visual-regression baselines are now stale — filed as **HF-13**
(regenerate via the existing `update-baselines` CI dispatch) rather than blocking this ticket.
Verified against both MSW and the real running backend (registered a live user, confirmed
`AuthResponse.user`'s shape matches exactly, including AUTH-0's `avatarUrl`/`phoneNumber` fix).
77/77 unit tests, clean build.

**AUTH-2 DONE** (2026-07-09, `client/docs/AUTH-2_REGISTER.md`): Register — `RegisterPage`/
`RegisterForm` against `POST /api/auth/register` (auto-logs-in, same `AuthResult` shape as login).
Extracted `AuthShell` from `LoginPage`'s inlined two-column shell so Login and Register share the
same illustration/tagline panel (no `design-reference-register.html` exists; user confirmed reusing
Login's shell plus a disabled OAuth row for visual parity). Found jsdom hardcodes
`tooShort: () => false`, so `minLength` never blocks submission under Vitest/RTL — replaced that
test with an attribute assertion and verified the real constraint manually against a live browser +
the real backend instead. Verified against the real running backend via a throwaway Playwright spec
(fresh registration → auto-login → Home Feed; duplicate email → real `"Email already registered"`
inline, no redirect). 91/91 unit tests, clean build.

**AUTH-3 DONE** (2026-07-09, `client/docs/AUTH-3_SESSION_BOOTSTRAP.md`): Session bootstrap on app
load — `useSessionBootstrap()` fires `POST /api/auth/refresh` once on mount (App.tsx, every route,
since ProtectedRoute doesn't exist yet), restoring `authStore` from the httpOnly cookie so a valid
session survives a hard refresh; a failed refresh is the normal logged-out case, silent, no visible
error. Guarded with a `useRef` against React 18 StrictMode's dev-only double-invoke of mount
effects, which would otherwise fire two concurrent `/refresh` calls sharing one single-use cookie —
traced through `AuthServiceImpl`/`AuthController` and confirmed harmless even unguarded (loser gets
a 401 with no `Set-Cookie`), but wasteful. `App.test.tsx` restructured so every case renders through
a `QueryClientProvider` (previously only `/login` did — a real gap `App`'s new unconditional
`useSessionBootstrap()` call would have crashed on). Real-backend verification surfaced a genuine,
unrelated bug: `JwtTokenServiceImpl.generateToken()` had no random component, so two tokens for the
same user within the same second collided on `refresh_tokens.token`'s `UNIQUE` constraint (500) —
AUTH-3's automatic on-load refresh made this newly reachable (e.g. a second tab opened right after
signup). Fixed with a `jti` (`UUID.randomUUID()`) claim, bundled into this branch per user decision
— see **A4** (`modules/auth/docs/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`). 95/95 client unit tests,
auth-impl suite green, clean build.

**AUTH-4 DONE** (2026-07-10, `client/docs/AUTH-4_PROTECTED_ROUTE_LOGOUT.md`): ProtectedRoute +
logout — `AppShell`'s route now gated by `ProtectedRoute` (loading state while bootstrapping, `/login`
redirect-back via router state, `/` redirect on `requiredRole` mismatch); `useLogout()` clears the
session even if `POST /auth/logout` fails. Logout entry point is a new avatar dropdown menu (new
`DropdownMenu` primitive on `@radix-ui/react-dropdown-menu`, new `--shadow-menu` token) — direction
approved via an HTML mockup pitch built from real design tokens before implementation, verified via
Storybook rather than frozen as a visual-regression baseline (too small an addition to the *existing*
TopBar for that machinery). Redirect-back after auth applies to both Login and Register, per user
decision. Found and fixed a real, unrelated regression: `ProtectedRoute` broke 4 previously-green E2E
specs that assumed unauthenticated access to Home Feed (`a11y`, `smoke`, `home-feed-journey`, the
visual-regression spec) — fixed with a new `seedAuthenticatedSession()` E2E helper, after two dead
ends confirmed empirically (direct cookie injection is invisible to MSW's private
`localStorage`-backed cookie store; a raw mocked-fetch login races AUTH-3's bootstrap effect against
MSW's per-navigation worker-ready handshake, ~80% failure rate under parallel workers). Working design
drives the real login form and relies on `ProtectedRoute`'s own redirect-back mechanism, reliable
across repeated parallel runs. Home Feed's 9 committed visual-regression baselines are now stale
(TopBar's markup changed) — filed as **HF-14**, same process as HF-13, not executed here.
Added `PublicOnlyRoute` (new, inverse of `ProtectedRoute`) after review: an already-authenticated
visitor manually navigating to `/login`/`/register` previously just saw the form again, unguarded —
now redirects to Home Feed. Hit and fixed a second race the same shape as AUTH-3's StrictMode one:
`PublicOnlyRoute`'s reactive redirect competed with a just-completed login's own `navigate()` call
(both triggered by the same `setSession()` update) — fixed by deciding `redirect` vs `render` once,
guarded so it fires exactly one time (`useState` + a conditional `setState` during render, not a
`useRef` — the ref version passed every test but failed `pnpm lint` under
`eslint-plugin-react-hooks` v7's `react-hooks/refs` rule; the natural `useEffect` replacement then
tripped `react-hooks/set-state-in-effect`, landing on React's own documented pattern instead).
115/115 client unit tests, 13/13 e2e, clean build.

**HF-14 DONE** (2026-07-10, `client/docs/HF-14_REGENERATE_VISUAL_BASELINES.md`): regenerated
Home Feed's 9 committed visual-regression baselines via the `update-baselines` CI dispatch,
following AUTH-4's TopBar avatar-menu change (same pattern as HF-13's `cn()` follow-up). Diffed old
vs. new before replacing (all 9 genuinely changed) and human-reviewed two of them — the avatar
chevron renders correctly, nothing else shifted.

**AUTH-5 DONE** (2026-07-11, `client/docs/AUTH-5_401_REFRESH_RETRY_INTERCEPTOR.md`): 401
refresh-retry interceptor — `apiClient.ts`'s response interceptor gained an exported
`handleResponseError()` (same testability pattern as AUTH-0's `attachAuthHeader`): on a `401`, one
silent `/auth/refresh` + retry via `apiClient.request()`, excluding `/auth/refresh`/`/auth/login`/
`/auth/register` from the retry flow (recursion risk / not an expired-session scenario) but
deliberately *not* excluding `/auth/logout` (user decision — a logout racing an expired token
should still fully revoke server-side). Concurrent 401s share one module-level `refreshPromise` so
they don't race the backend's single-use refresh-token rotation. Refresh failure clears the session
and relies on `ProtectedRoute`'s existing reactive redirect rather than a manual
`window.location` jump. Verified against the real running backend (not just MSW): forced a `401` on
`POST /auth/logout` via Playwright route interception through the real TopBar dropdown, observed
`401 → refresh 200 → logout 200` — Home Feed itself has no real endpoint to force a 401 against yet
(still mock-backed pending FEED-1), so logout was the available real authenticated call. 13/13 new
+ 124/124 client-wide unit tests, clean build.

**AUTH-6 DONE** (2026-07-12, `client/docs/AUTH-6_AUTH_HARDENING.md`): auth hardening — scope split
during Phase 1: rate-limit error surfacing pulled out entirely after confirming the backend has no
rate-limiting implementation at all (no filter, no `bucket4j`/`resilience4j`, no config — documented
as an unbuilt TODO in `README_AUTH_SETUP.md`), filed as backend ticket **A5**
(`modules/auth/docs/BACKLOG_MVP.md`) instead of building against a made-up response shape; show/hide
toggle was already done in AUTH-1. Remaining scope — a11y hardening — extended `e2e/flows/
a11y.spec.ts` (HF-8's own delta said to extend it, not fork it) with an axe scan + no-overflow gate
for `/login`/`/register` at 375/768/1280px, plus dedicated Tab-order tests (axe doesn't check
interaction). First axe run caught a real bug: the primary submit button's white-on-`#378add` text
is 3.59:1, failing WCAG AA — traced to `design-reference-login.html`'s own inline style, not an
implementation drift (the mockup itself violates its own accessibility baseline). Fixed with a new
`--color-accent-solid` token (6.53:1) and updated the reference HTML to match, same pattern as HF-8's
`text-muted` fix. 124/124 unit tests unaffected, 27/27 e2e (21 in the extended a11y spec) pass, clean
build.

**AUTH-8 DONE** (2026-07-13, `client/docs/AUTH-8_E2E_AUTH_JOURNEY.md`): E2E auth journey — ships 6 of
the epic's 7 steps across two independent tests (not one continuous journey) and drops the "zero real
network calls" acceptance criterion, all tracing to one real, instrumented finding: MSW's
per-navigation Service Worker setup races the app's own bootstrap fetch, and the race gets *worse*
with more navigations in a test (confirmed via real timing data — Vite's module cache speeds up the
app's mount on repeat navigations, MSW's SW handshake doesn't get the same speedup, so the gap widens
in the app's favor). Four fixes tried and rejected before concluding this needs an architecture
change: a cookie mirror (necessary but not sufficient — real `Set-Cookie` is never honored for a
mocked response), gating the refresh request via `page.route()` (bypasses SW dispatch entirely),
gating the app's entry module the same way (deadlocked), and bounded retries (made it *worse* — 15
retries had a 0% success rate where 5 occasionally worked). Filed as backend/infra ticket **MSW-1**
(`client/docs/BACKLOG_MVP.md`) recommending a standalone mock HTTP server to replace the
per-navigation Service Worker setup entirely; step 5 (reload-persistence) deferred there. Step 6
(simulated expired session) redesigned to trigger via AUTH-5's 401-retry interceptor instead of a
reload — reaches the same target state reliably (20/20 clean runs under repeated parallel load, vs.
the reload version's ~35–60% failure rate) without ever risking the race. 124/124 unit tests
unaffected, 29/29 e2e pass across 6 consecutive full-suite runs.

**AUTH-7 DONE** (2026-07-13, `client/docs/AUTH-7_QA_ACCEPTANCE_CHECKLIST.md`): QA/acceptance pass
for the whole auth epic — 5/5 items pass. Drove the real UI (no MSW) against a real running backend
with a standalone Playwright script: register → auto-login → reload-persists-session → logout →
deep-link-redirect → re-login, 8/8 assertions green, zero tokens ever in `localStorage`/
`sessionStorage`. Re-verified BE-1/BE-2 directly against `AuthController.java` source (cookie-based
refresh, header-derived logout with no query param — confirmed live via `curl`, not just trusted from
the backlog note). `pnpm e2e` (29/29, including both `auth-journey.spec.ts` tests), `pnpm test`
(124/124), clean `tsc -b`/lint used as a local proxy for the "passes in CI" item, since this session
has no GitHub Actions access — flagged as a follow-up for a human to confirm on the actual
`client-ci` run. **Phase 5 (auth integration) is now fully closed.**

**FEED-0 DONE** (2026-07-13, `client/docs/FEED-0_TYPES_TANSTACK_QUERY_HOOKS_SCAFFOLD.md`): Phase 6
kickoff — `src/features/feed/types.ts` + 10 TanStack Query hooks (`usePersonalFeed`, `useGroupFeed`,
`usePostsByHashtag`, `useTrendingHashtags`, `useActiveBroadcasts`, `useUserGroups`, `useLikePost`,
`useUnlikePost`, `useDeletePost`, `useCreatePost`), plus `e2e/mocks/handlers/feed.ts`. No UI wiring —
foundation only. Live-backend verification (register/create/like/comment against a real running
server, not just MSW) found and filed two real backend bugs: **A9** (`PostResponse` never populates
`userFullName`/`sportName`/`shareCount` — blocks FEED-1) and **A10** (`GET /api/posts/hashtag/{tag}`
500s unconditionally, a query-generation bug — blocks FEED-6), both in
`modules/social/post-impl/docs/BACKLOG_MVP.md`. Also filed forward-looking Snowflake-ID migration
tickets (`modules/social/post-impl/docs/BACKLOG_V1.md` · C11, `modules/social/group-impl/docs/
BACKLOG_V1.md` · A1) after finding `User`'s UUID-vs-everything-else's-`BIGSERIAL` id split has no
documented rationale anywhere in the repo — ids stay `number` for now, by deliberate decision, not
oversight. One test-infra fix: `tsconfig.node.json` couldn't resolve a transitively-pulled `@/` alias
import (switched `module`/`moduleResolution` from `nodenext` to `esnext`/`bundler`, added `paths`).
One flaky pagination test replaced with a pure-function unit test after confirming via
`--no-file-parallelism` it was CPU contention, not a logic bug. 142/142 unit tests (3 consecutive
clean runs), 29/29 e2e, clean build/lint.

**A9 DONE** (2026-07-13, `modules/social/post-impl/docs/A9_POSTRESPONSE_MISSING_FIELDS.md`): fixed
`PostServiceImpl.mapToResponse()` never populating `userFullName`/`userAvatarUrl`/`sportName`/
`shareCount` (found during FEED-0's live-backend verification). Added
`SportService.getSportsByIds()` (new cross-domain batch method, `sport-api`/`sport-impl`, first
dependency from `post-impl` on the sport domain), batched the user/sport lookups per page the same
way A6/A7 already batched hashtags, and reused `CommentServiceImpl`'s exact `"Unknown User"` fallback
convention rather than inventing a new one. `shareCount` hardcoded to `0` (real sharing logic stays
deferred to V1's `C6`). Filed a follow-up (`modules/sport/sport-impl/docs/BACKLOG_MVP.md` · **A5**,
caching sport lookups) rather than building caching into this bug fix, per user direction during
design review — sport data is effectively static at runtime, but eviction strategy is its own
decision. Verified live against a running backend: `userFullName`/`sportName`/`shareCount` all
populate correctly now, on both the single-item and paginated/batched code paths, with a `null`
`sportId` still resolving to `sportName: null` without erroring. All post-impl and sport-impl tests
pass, whole-server build clean. **`:server:test`'s actual `@SpringBootTest` integration layer was
missed in the first verification pass** — asked directly whether IT tests were checked, ran them,
and `PostControllerIntegrationTest.shouldCreatePost` failed 500 (`Table "sports" not found"`): the
test profile's hand-maintained H2 `schema.sql` never had a `sports` table, since nothing before A9
queried it from a test-scoped path. Fixed by adding the table (mirroring the real Liquibase
migration's shape, no seed data). Full `:server:test` re-run green afterward.

**A10 DONE** (2026-07-14, `modules/social/post-impl/docs/A10_FIX_HASHTAG_ENDPOINT_500.md`): fixed
`GET /api/posts/hashtag/{tag}` 500ing on every call — `PostController`'s `@PageableDefault(sort =
"lastInteractionAt")` made Spring Data JPA append a second `ORDER BY` resolved against
`findPostsByHashtag`'s query root (`PostHashtag`, which has no such field), throwing
`UnknownPathException` before the repository's own static `ORDER BY ph.post.lastInteractionAt`
ever ran. Fixed by dropping the conflicting default sort from the controller (confirmed safe: the
client's `usePostsByHashtag` hook never sends a `sort` override, and `HashtagController`'s other
two paginated endpoints already use this same no-default-sort pattern) rather than restructuring
the query. Added a real `PostControllerIntegrationTest` case (no existing Spock coverage could
catch this — it's a Hibernate query-generation bug, invisible to a mocked-repository unit test),
which surfaced two more pre-existing test-infra gaps fixed in the same pass: `schema.sql` had no
`groups`/`group_members`/`group_roles` tables at all (nothing in `:server:test` had ever exercised
a real, unmocked `GroupService` call before — `getPostsByHashtag` does, for any authenticated
caller), and the new seed data for `group_roles` broke context reuse across test classes (H2
persists across separate `@SpringBootTest` context loads within one suite run, so a second
`schema.sql` execution hit a primary-key violation on a plain `INSERT`) — fixed via H2's `MERGE
INTO ... KEY(id)`. `:modules:social:post-impl:test` and `:server:test` (28/28) both green.

**Cursor pagination design + V1 ticket C12 filed** (2026-07-13,
`documentation/md/CURSOR_PAGINATION_MIGRATION.md`,
`modules/social/post-impl/docs/BACKLOG_V1.md` · C12): design discussion on why `Page<PostResponse>`
(offset `Pageable`) is the wrong shape for `post-impl`'s five feed-shaped read endpoints
(`/feed`, `/mine`, `/broadcast`, `/hashtag/{tag}`, `/group/{groupId}`) — a `COUNT(*)` on every
request, offset drift under concurrent inserts (duplicate/skipped posts on scroll), and `OFFSET`
scan cost growing with scroll depth. Decision: keyset/cursor pagination, new shared
`CursorPage<T>` in `modules/common`. Sequenced as C12, explicitly **after** C11 (the Snowflake ID
ticket filed during FEED-0) rather than independently: a cursor built from today's `BIGSERIAL` id
would encode a raw sequential value, and C11 landing afterward would change every id's
numeric range/ordering at the migration boundary, breaking any cursor already issued — shipping
C11 first avoids a transitional cursor format entirely. Confirmed via `PostRepository.java` that
four of the five endpoints order by creation (id-sortable once C11 ships) but
`findPersonalizedFeed` (`/feed`) orders by `lastInteractionAt` (bumped independently of id on new
likes/comments), so that one endpoint needs a compound `(lastInteractionAt, id)` cursor rather than
id alone. Also traced the client-side coupling: FEED-0's `PageResponse<T>` type and
`useInfiniteQuery`-based hooks (`usePersonalFeed`/`useGroupFeed`/`usePostsByHashtag`/
`useActiveBroadcasts`, `getNextPageParam()`) all assume numeric page params and will need a
follow-up client ticket when C12 is scheduled, same pattern as C11's own client-impact note.
Design/ticket only — no code changed.

**FEED-1 DONE** (2026-07-14, `client/docs/FEED-1_FEED_POSTCARD_REAL.md`): de-mocked Home Feed's
`Feed`/`PostCard` against the real `GET /api/posts/feed` — larger than a data-source swap, since
HF-3 shipped with zero pagination affordance (flat mock array) and a completely different `Post`
shape. Added: real optimistic like/unlike/delete (`onMutate`/`onError`/`onSettled` against a new
shared `optimisticFeedUpdates.ts` cache helper), a new `useInfiniteScrollSentinel` hook
(`IntersectionObserver` + an always-rendered "Load more" button as the required keyboard/
screen-reader fallback), a temporary `sportIdMap.ts` bridging `SportKey` to the backend's real
`sportId` (confirmed live: Soccer=5, Basketball=6, Tennis=2 — the backend has no sport actually
named "Football"), and a new "..." delete menu on `PostCard` (reusing `TopBar`'s dropdown-menu
primitive), shown only for the caller's own posts. **Found and fixed a real bug in FEED-0's
already-built MSW fixtures while extending them, not replacing them:** `mockPost.sportId` was `1`
(Badminton) with `sportName: 'Football'` — inconsistent with the real backend; corrected to `5`
(Soccer). Also made the feed MSW handlers **stateful** (mutated by like/unlike/delete/create)
after catching — first in Vitest, then confirming the same root cause would hit e2e too — that a
stateless handler gets clobbered by the mutation's own background `invalidateQueries` refetch,
which a real backend wouldn't do (it would confirm the new state, not revert it). Rewrote
`home-feed-journey.spec.ts` (added a new delete step), `a11y.spec.ts`, and `app-home-feed.spec.ts`
(empty state now uses a real MSW override, replacing the `?visual-state=empty` seam per HF-10b's
own delta). Verified live against the actually running backend end-to-end (register → create →
feed → like → unlike → delete → hashtag, all correct — re-confirming A9/A10 still hold) and via a
real browser (Playwright, no MSW) against the real Vite dev server. `pnpm vitest run` 164/164,
`playwright --project=e2e` 29/29, Storybook builds clean. All 9 Home Feed visual-regression
baselines diffed at the time (real content + new delete-menu rendering, confirmed via direct image
inspection, not a regression) — filed as follow-up **HF-15**, now also `DONE` (see below).

**HF-15 DONE** (2026-07-14, `client/docs/FEED-1_FEED_POSTCARD_REAL.md`): regenerated Home Feed's
9 committed visual-regression baselines via the `update-baselines` CI dispatch, following FEED-1's
real feed content + new delete-menu rendering. Only 6 of the 9 actually changed byte-for-byte
(`default`/`basketball` at all 3 breakpoints) — the 3 `empty` state baselines came back
byte-identical to what was already committed, because the empty state's rendered result didn't
actually change: matches are still emptied via the `?visual-state=empty` query param, and the feed
is now emptied via a real MSW override (`seedEmptyFeedOnNextLoad`) instead of the old seam, but
both produce the same empty page. Human-verified the new `default`/`basketball` captures show the
3 real posts, correct sport badges, correct like/comment counts, and the 2 delete-menu icons as
expected. `pnpm exec playwright test --project=visual-regression` still reports all 9 as
"different" **when run locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; local Windows runs diverge on font rendering; CI is authoritative). Confirmed via
direct diff-image inspection that the residual local diff is sub-pixel text-position/anti-aliasing
noise, not a content mismatch — same text, same layout in both images.

**FEED-2 DONE** (2026-07-14, `client/docs/FEED-2_COMMENTSECTION_REAL.md`): built a new real comment
thread (`CommentSection`, opened as a modal from `PostCard`'s comment icon) — no
`CommentSection` existed anywhere before this ticket, and no `design-reference-*.html` covered it,
so 3 scope questions (modal vs. inline, reply-to-comment in/out of scope, pagination style) were
confirmed with the user before implementation. Wired `GET`/`POST /posts/{postId}/comments`, delete,
and like/unlike, with FEED-1-style optimistic mutations (only a **root** comment's create/delete
touches the parent post's `commentCount` — verified directly against
`CommentServiceImpl`'s Redis counter keys, not assumed). New shared `Dialog` primitive
(`src/shared/ui/dialog.tsx`) and `--color-overlay` token. Mid-implementation design correction:
`CommentSection` initially owned its own data hook, breaking the established
presentational/controlled convention every other Home Feed component follows (and the reason none of
them need a `QueryClientProvider` to run in Storybook) — refactored so `HomeFeedPage` owns
`useCommentsData()` instead. **Found and fixed a real cache-rollback bug** in `useDeleteComment`:
two overlapping snapshots (one comments-only, one broader `feedKeys.all`) meant the broader one,
captured *after* the comment was already spliced out, silently clobbered the correct rollback on
error — caught by a dedicated test, fixed by taking one snapshot before either mutation runs.
Verified live against the actually running backend (register → create post → create root comment →
`commentCount` 0→1 → create reply → `commentCount` unchanged → like/unlike → delete reply → delete
root → `commentCount` 1→0, all matching the client's optimistic assumptions) and via a real browser
walkthrough (open dialog → post → like → close → confirm count updated → reopen → delete → empty
state). `pnpm vitest run` 198/198, `playwright --project=e2e` 29/29 (single-worker — 4 a11y specs
flake under this machine's default parallel workers, confirmed as timeout flakiness not a real
violation), `pnpm build` clean, Storybook stories visually confirmed. All 9 Home Feed
visual-regression baselines diff again (`PostCard`'s comment `<span>` → `<button>`) — filed
follow-up **HF-16** (`TODO`), same HF-13/14/15 precedent.

**FEED-2 addendum** (2026-07-14, same day, `client/docs/FEED-2_COMMENTSECTION_REAL.md`): a
retroactive `design-reference-post-modal.html` was extracted from the shipped dialog, then hand-
revised by the user into a richer design and the implementation brought in line with it —
`CommentSection`'s header now shows the commented-on post (author/time/sport badge, close button
stacked above the badge) instead of a generic "Comments" title, with the post's content repeated
above the comment list; the composer/reply "Post" buttons now swap muted-gray→solid-blue on
disabled/enabled (a scoped `Button` `className` override, not a new variant). `pnpm test` 200/200,
typecheck/lint/build clean, re-verified live against the running backend (confirmed the button's
actual computed background-color changes, not just a class name). Filed **FEED-11** (`TODO`) to add
`visual-regression` Playwright coverage for the modal — it has none today (Storybook + Vitest only),
unlike Home Feed's page-level baselines.

**FEED-2 follow-up, filed after merge** (2026-07-14, PR #32 already merged, so filed rather than
built on the merged branch): the user asked for the comment modal to fetch its own post
(`GET /api/posts/{postId}`) instead of reading it out of `HomeFeedPage`'s already-loaded feed cache,
specifically so the modal becomes reachable by a direct URL (a shared link, notification deep link,
or a post outside the currently loaded feed pages) rather than only openable by clicking through an
already-rendered post card. Filed as **FEED-12** (`TODO`) — a new `usePost(postId)` hook, a
`/posts/:postId` route, and sane close/back behavior when opened via direct URL. Sequenced before
**FEED-11** in the backlog's dependency notes (not a hard block): once the modal is URL-addressable,
FEED-11's visual-regression spec can `page.goto()` it directly instead of clicking through the feed.

**HF-16 DONE** (2026-07-14, `client/docs/BACKLOG_MVP.md`): regenerated Home Feed's 9
visual-regression baselines via the `update-baselines` CI dispatch, following FEED-2's `PostCard`
comment `<span>` → `<button>` change. Only 6 of the 9 actually changed byte-for-byte
(`default`/`basketball` at all 3 breakpoints) — the 3 `empty`-state baselines came back
byte-identical, since the empty state renders zero posts and the comment button never appears in
that capture. Human-verified the changed captures show correct content/layout/counts at all 3
breakpoints. `pnpm exec playwright test --project=visual-regression` still reports all 9 as
"different" **when run locally on Windows** — expected per HF-12's own note (CI is the authoritative
Linux-rendered environment); confirmed via direct diff-image inspection of the byte-identical
`empty` state that the local diff is purely Windows/Linux font-rendering noise, not a content
mismatch.

**FEED-3 DONE** (2026-07-14, `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`): built the real post
composer (`CreatePostForm`, `src/features/home-feed/components/`) wired to `useCreatePost()` —
content-only (5000-char limit), Photo/Location/Tag-sport stay inert per the ticket's design delta;
only USER_FEED posts from this composer (group posting waits on FEED-4/5). `useCreatePost`'s
onSuccess now prepends the real server-returned post directly into the one feed cache it belongs to
(`optimisticFeedUpdates.ts`'s new `prependPostToFeedCache`) instead of a blanket invalidate, meeting
the "prepend without a full refetch" acceptance criterion; `onSettled` still invalidates in the
background for eventual consistency. Hoisted `POST_BUTTON_DISABLED_OVERRIDE` (the muted-gray→
solid-blue disabled swap) from `CommentSection` into `shared/ui/button.tsx` since this ticket made
it a 3rd call site (also consolidated `CommentItem`'s inlined copy). Renamed
`design-reference-home-feed-v2.html` → canonical `design-reference-home-feed.html` per the backlog
delta (also fixed a stray CDN icon-font link the v2 file shipped with, back to HF-10a's vendored
path). Live-verified against the real running backend (registered a test user, browser walkthrough):
composer renders, Post button enables/disables correctly (blue/white when enabled, confirmed via a
zoomed screenshot after the full-page screenshot looked ambiguous), posting prepends the real post
with correct author/timestamp and clears the textarea, renders cleanly at 375px. `pnpm exec vitest
run` 213/213, `pnpm exec tsc -b` clean, `pnpm lint` clean, `pnpm exec playwright test --project=e2e`
29/29 (confirms the new composer doesn't break `home-feed-journey`/`a11y`/`smoke`). Visual-regression
baseline regen (composer shifts Home Feed's 9 committed baselines, same as HF-13/14/15/16) was
planned HF-15/16-style (same branch, before merge) but the PR merged first — done as a same-day
follow-up instead, see below.

**FEED-3 baseline regen DONE** (2026-07-15, `client/docs/BACKLOG_MVP.md` · FEED-3 entry): regenerated
Home Feed's 9 committed visual-regression baselines via the `update-baselines` CI dispatch, following
FEED-3's composer landing. All 9 changed byte-for-byte this time (unlike HF-16's 6-of-9) — the
composer renders on every state including `empty`, unlike HF-16's comment button which only appeared
on rendered posts. Human-verified `default`/`empty`/`basketball` at all 3 breakpoints — composer,
sport badges, and like/comment counts all correct, nothing else drifted. `pnpm exec playwright test
--project=visual-regression` still reports all 9 as "different" locally on Windows — expected per
HF-12's note (CI is the authoritative Linux-rendered environment); confirmed via diff-image
inspection the local diff is pure sub-pixel font-rendering ghosting, not a content mismatch.

**FEED-4 DONE** (2026-07-15, `client/docs/FEED-4_GROUP_SWITCHING_REAL.md`): built group switching as
a new **Groups page** (`/groups`, replacing the `ComingSoonPage` stub), not an inline control on Home
Feed as the epic implicitly assumed — user decision after a design discussion, since a group's own
sport (`Group.sportId`) naturally bounds the switcher to a handful of pills per sport instead of an
unbounded dropdown. `activeSport` promoted from `HomeFeedPage`'s local state into a new shared
`feedSpaceStore.ts` (Zustand) alongside `selectedGroupId`, so the Groups page inherits and can change
the same sport filter Home Feed uses; switching sport always resets the group selection back to "All"
(groups are 1:1 with a sport). Zero joined groups for the active sport renders "Join Group"/"Create
Group" as two buttons (no-ops until FEED-5); one or more collapses both into a right-aligned "..."
menu instead. No post composer on "All" (no single group to attribute a post to) — reusing
`Feed`/`PostCard`/`CreatePostForm`/`CommentSection`/`CommentItem` on the new page required promoting
them from `features/home-feed/components/` to `shared/components/` (git mv, no logic changes).
"All" on the Groups page has no aggregate backend endpoint, so it derives from `usePersonalFeed()`
(which already blends in sport-matched `GROUP_POST`s) filtered client-side. Fixed a latent e2e fixture
bug along the way: `mockGroup.sportId` was `1` (Badminton), never matching the app's 3 known sports
despite the group's own football theming — the first ticket to actually filter by it. `tsc -b`/`eslint`
clean, `pnpm test` 51/51 files (232/232 tests). Live-verified in a real browser via a temporary
Playwright script (not committed): confirmed all 5 requested states — both switchers render, zero-vs-
nonzero-groups button/menu collapse, composer show/hide on group selection, and sport-switch reset —
via screenshots and `aria-pressed` assertions.

**FEED-5 DONE** (2026-07-15, `client/docs/FEED-5_GROUP_CREATE_JOIN_MODALS.md`): wired real group
creation (`POST /api/groups`) and join requests (`POST /api/groups/join-requests`) into FEED-4's
`GroupSpaceSwitcher` entry points. Joining is by group **name**, not id (`CreateJoinRequestRequest`
has no `groupId` field), so `JoinGroupModal` searches/browses `GET /api/groups/public` rather than
taking a raw name. Mid-ticket scope addition (user decision): the Groups page's right rail now
matches Home Feed's exactly — required relocating `UpcomingMatch`/`TrendingHashtag`/`GroupBroadcast`
(types, mock hooks, and their components) from `home-feed/` to `shared/` the same way FEED-4 already
relocated `sportProfiles`, and deleting the now-empty `home-feed/mockData.ts`. `GroupSpaceSwitcher`'s
zero-groups buttons restyled to match `SportSwitcher`'s dashed "Add sport" pill, with search/plus
icons also added to the "..." dropdown's menu items. Mid-implementation refactor: the modals
initially called their data hooks directly, which broke Storybook testability and this project's
"presentational and controlled" component convention — refactored to presentational components fed
by `GroupsPage` (new `useJoinGroupModalData.ts` mirrors `useCommentsData`'s role for the join
search/mutation state); both modals reset their fields via a changing `key` prop on open rather than
an effect calling `setState` (React's own `react-hooks/set-state-in-effect` guidance). New MSW
`groups.ts` handler file (first ticket needing new group endpoints) is stateful, and moved
`GET /groups/user/:userId` out of `feed.ts` into it — that handler was static before, which would
have clobbered `useCreateGroup`'s optimistic cache write on the mutation's background refetch.
`tsc -b`/`eslint` clean, `pnpm test` 60/60 files (268/268 tests, up from 51/232 at FEED-4). Live-
verified in a real browser (temporary Playwright script, not committed): rail parity, menu/button
icons, created a group (appeared instantly, ramp-colored, auto-selected, composer shown), searched
and requested to join a group (row flipped to "Pending" in place). Caught and fixed one real bug
during that verification: `usePublicGroups` had no `enabled` gate, so the join modal's hook kept
fetching in the background even while closed.

**SPORT-1 DONE** (2026-07-15, `client/docs/SPORT-1_SPORT_SWITCHER_REAL.md`): de-mocked
`useSportProfiles()` against the real `GET /api/sports/profiles/user/{userId}`, closing out the last
mock-backed piece of HF-2's SportSwitcher. Mapping reuses `sportIdMap.ts`'s existing
`sportKeyForId()` (the same bridge FEED-1/FEED-4 already use for posts/groups) rather than a second
id↔key table; `label`/`icon`/`colorRamp` come from a new static `SPORT_PROFILE_CONFIG`, per the
ticket's own instruction to reuse sport-impl's A3 static-config approach instead of a
backend-driven mapping. Inactive profiles and any `sportId` outside the client's known `SportKey`s
are silently dropped rather than surfaced as an error. Found and fixed a latent bug along the way:
`UpcomingMatches.tsx` indexed `sportsByKey[match.sport]` unconditionally, safe only under the old
always-3-sport mock — now falls back to rendering without the sport badge (same pattern
`PostCard`/`Feed.tsx` already use), required by the ticket's own "zero sport profiles doesn't break
the page" acceptance criterion. **Scope addition mid-ticket:** "Add sport" was upgraded from a
callback-only no-op to a real flow — `AddSportModal` (sport + skill level required, years of
experience optional; same presentational/controlled shape as `CreateGroupModal`) and a new
`useAddSportProfile()` mutation wrapping `POST /api/sports/profiles`, cache-writing into
`useSportProfiles`' query via a shared `sportProfilesQueryKey` helper so the switcher updates without
a refetch round trip. Wired identically into HomeFeedPage and GroupsPage. New MSW `sport.ts` handler
file, stateful for all three endpoints (GET profiles, GET catalog, POST profiles) so a created
profile actually appears on refetch, same reasoning as `groups.ts`'s stateful group-creation handler.
`tsc -b`/`eslint` clean, `pnpm vitest run` 62/62 files (282/282 tests), `playwright --project=e2e`
29/29 passing. Live-verified against the real running backend and dev server (not MSW) in two passes:
registered a fresh user and confirmed the zero-profile state renders cleanly, then created 3 real
sport profiles via the API and confirmed all 3 pills render with the correct ramp/icon and "Add
sport" goes `aria-disabled` at the cap; separately, registered a second user and drove the actual
`AddSportModal` UI three times in a row (not the API) — submit gated on skill level, the pill appears
immediately without a reload, the picker correctly excludes already-added sports, and the real
backend's own cap makes "Add sport" unreachable after the third. Screenshots reviewed directly both
passes; verification scripts were temporary, uncommitted scratch files.

**Bug fix — Groups page composer 400s on every real group post** (2026-07-15, found while discussing
what to call FEED-3's composer area, not a backlog ticket): `useGroupsPageData.ts`'s `createPost`
called `createMutation.mutate({ content, groupId })` with no `postType`. `PostServiceImpl.createPost`
defaults an omitted `postType` to `USER_FEED`, then rejects `USER_FEED` + a non-null `groupId`
outright ("USER_FEED posts cannot be associated with a group") — so every group post was a guaranteed
400 against the real backend. FEED-4/FEED-5's own test suites never caught this because
`e2e/mocks/handlers/feed.ts`'s `POST /api/posts` handler didn't replicate that cross-field rule (it
happily accepted any `postType`/`groupId` combination) — exactly the gap `client/CLAUDE.md`'s testing
convention already calls out ("MSW passing does not prove the real backend still matches its
documented contract"). Fixed by sending `postType: 'GROUP_POST'` explicitly; also tightened the MSW
handler to enforce the same rule, so this exact bug class can't silently reappear and pass CI again.
`tsc -b`/`eslint` clean, full suite still 62/62 files (282/282 tests) — one existing test's expected
payload updated to include `postType: 'GROUP_POST'`. Live-verified against the real backend (not
MSW): registered a user, created a sport profile and a group via the API, then drove the actual
Groups page composer in a browser — confirmed `POST /api/posts` now returns `201` with
`postType: GROUP_POST` (previously would have been `400`), and the post renders in the group feed
immediately. Verification script was a temporary, uncommitted scratch file.

**FEED-6 DONE** (2026-07-15, `client/docs/FEED-6_TRENDINGHASHTAGS_REAL.md`): de-mocked
`shared/hooks/useTrendingHashtags.ts` against the real `GET /api/hashtags/trending`
(FEED-0's `useTrendingHashtags`), mapping the backend's no-leading-`#` `Hashtag` shape to the
client's `#`-prefixed `TrendingHashtag` convention. The click-through destination (unscoped by the
epic — no mockup covers it, same gap FEED-2 hit for comments) was resolved via a design
conversation: a **modal** (`HashtagPostsModal`, reusing `shared/ui/dialog.tsx` and `Feed` directly),
not a route — fully interactive (real like/unlike/delete/comment via a new
`useHashtagResultsData(tag, isOpen)` hook), wired identically into Home Feed and the Groups page.
Opening a post's comments from inside the hashtag modal closes it first, then opens
`CommentSection`, rather than stacking two dialogs. `usePostsByHashtag` gained an `enabled` param
(same reasoning as `useComments`) since the new hook is called unconditionally from the page.
**Bug found and fixed post-implementation (manual testing, before merge):** the first cut cleared
`activeHashtag` in the same handler that opened comments, which — because React batches both
state updates into one render — immediately swapped `useHashtagResultsData` to a different, empty
query before `activeCommentsPost`'s fallback lookup could read it, so `CommentSection` opened with
a null `post` (header/repeated content silently missing, comments themselves still worked). Fixed
by splitting "which tag to keep fetching" (`activeHashtag`) from "is the modal visually open"
(new `isHashtagModalOpen`) — opening comments now only hides the modal, leaving the tag's query
alive for the fallback; `activeHashtag` clears only on a real dismissal. Strengthened the existing
transition test to assert the post's name/content actually render, not just that a dialog exists.
`tsc -b`/`eslint` clean, `pnpm test` 64/64 files (298/298 tests, up from 62/282), `playwright
--project=e2e` 29/29 (rewrote `home-feed-journey.spec.ts` step 5, which previously asserted
hashtag clicks were inert no-ops, to assert the real modal + filtered content). Visual-regression
now shows all 9 Home Feed baselines legitimately stale — the Trending card renders 1 real row
instead of the old mock's 4, shortening the page; confirmed via image inspection this is the only
diff. Filed as **HF-17** (`client/docs/BACKLOG_MVP.md`, `TODO`), same HF-13/14/15/16 pattern rather
than regenerating locally (baselines are Linux-rendered via CI's `update-baselines` dispatch).

**FEED-6 follow-up — hashtags inline, post-like button in comment modal** (2026-07-15, same
ticket/branch, requested directly before merge): `PostCard` used to show a post's hashtags twice —
once inline in `post.content`'s plain text, and again as a separate row of pill buttons built from
the structured `post.hashtags` array. Replaced with a new shared `HashtagText` component that
parses any text for `#(\w+)` (the same pattern the backend's `HashtagServiceImpl` uses, so it
always matches what the backend actually indexed) and renders matches as inline clickable buttons
— `PostCard` no longer reads `post.hashtags` at all. Applied consistently to the comment modal's
repeated post content and to `CommentItem`'s comment bodies too (comments have no structured
hashtags field, but the same text-based approach works identically). Also found and fixed a real
gap while verifying this: the comment modal had no way to like the post itself — added a like
button (`onTogglePostLike`), wired to check the main feed cache first and only fall back to the
hashtag-results cache, so a post present in both never double-fires the like mutation. Caught one
`react-hooks/immutability` lint violation along the way (an early version mutated a shared
module-level regex's `lastIndex` inside the component) — fixed by switching to
`String.prototype.matchAll`, which clones the regex internally and never touches shared state.
`tsc -b`/`eslint` clean, `pnpm test` 65/65 files (310/310, up from 298), `playwright --project=e2e`
29/29. Visual-regression baselines gain a second (still-uncommitted) cause of drift — noted on the
already-filed **HF-17** rather than a new ticket, since it's the same "regenerate later, don't fix
now" situation.

**HF-17 DONE** (2026-07-15, `client/docs/BACKLOG_MVP.md`): executed the `update-baselines` dispatch,
downloaded `visual-baselines.zip`, and replaced all 9 `client/e2e/visual/__screenshots__/` PNGs
(confirmed via SHA-256 comparison before overwriting — all 9 changed, covering both FEED-6 causes:
the Trending card's real single row and the removed hashtag pill row). Human visual check across
`default`/`basketball`/`empty` at a spread of breakpoints confirmed correct rendering, nothing else
drifted. Local `pnpm exec playwright test --project=visual-regression` still reports all 9 as
"different" on Windows — expected per HF-12's own note — but diff ratios dropped back to the
established ~0.01–0.02 sub-pixel noise floor, consistent with font-rendering divergence only.

**FEED-7 DONE** (2026-07-16, `client/docs/FEED-7_GROUPBROADCASTS_REAL.md`): de-mocked
`shared/hooks/useGroupBroadcasts.ts` against the real `GET /api/posts/broadcast`
(FEED-0's `useActiveBroadcasts`), resolving each broadcast's group name/initials/sport-ramp via
`useUserGroups` (already mounted elsewhere, no extra network call). The "create broadcast" UI
(unscoped by the epic) was resolved via a design conversation: a **switcher inside
`CreatePostForm`** next to Tag sport, visible only for the selected group's owner/admin — not a
separate button or modal. The backend caps each group at one active broadcast at a time; rather
than block the switcher, submitting into a group that already has one open opens a new
`UpdateBroadcastConfirmDialog` instead, and confirming updates the existing broadcast's content via
a new `useUpdatePost()` mutation (echoing back its `locationName`/`sportId`/`visibility` — the
update endpoint isn't a partial patch, a real quirk documented but not fixed here).
`PostCard`'s comment button now renders disabled for `GROUP_BROADCAST` posts ("for now" — like
stays functional). `GroupBroadcast.id`/`.groupId` flipped from `string` to `number` to match the
real `Post` fields. `tsc -b`/`eslint` clean, `pnpm test` 67/67 files (326/326, up from 310),
`playwright --project=e2e` 29/29 (rewrote `home-feed-journey.spec.ts`'s broadcast-count assertions
from 2 to 1, matching the real MSW fixture). Live-verified end-to-end against the real running
backend (not MSW): registered a user, added a sport profile, created a group, and drove the actual
composer — broadcast creation, the confirm-update flow (second submission while one was active
correctly offered to replace it, verified in both the feed article and the rail card), disabled
comments, and working likes all confirmed. Found (but didn't need to fix — already FEED-3's
documented scope) a real, pre-existing gap during that verification: composer-created posts never
get a `sportId` (Tag sport is inert everywhere), so `Feed`'s own sport filter hides them under any
pill except "All" — only reachable in practice via a specific-group feed, worked around by picking
the group's sport inside `CreateGroupModal` instead of a sport pill (which resets group selection
per `feedSpaceStore`'s own coupling). Visual-regression baselines gain a third cause of drift (the
broadcasts card's real single row vs. the old mock's 2) — filed as **HF-18**
(`client/docs/BACKLOG_MVP.md`, `TODO`), same HF-13..HF-17 pattern.

**HF-18 DONE** (2026-07-16, `client/docs/BACKLOG_MVP.md`): executed the `update-baselines`
dispatch, downloaded `visual-baselines.zip`, and replaced all 9 `client/e2e/visual/__screenshots__/`
PNGs (confirmed via SHA-256 comparison before overwriting — all 9 changed, since the broadcasts
card is a global rail element present in every state). Human visual check across
`default`/`basketball`/`empty` at 1280px confirmed the single real "Friday Night Football" broadcast
row, correct group name/initials/message, correct posts/badges, and nothing else drifted. Local
`pnpm exec playwright test --project=visual-regression` still reports all 9 as "different" on
Windows — expected per HF-12's own note — diff ratios (0.01–0.04) consistent with the established
sub-pixel font-rendering noise floor.

**FEED-8 DONE** (2026-07-16, `client/docs/FEED-8_INTEGRATION_HARDENING.md`): loading skeletons +
error/retry states for every real-data rail surface on Home Feed and Groups (`Feed`,
`TrendingHashtags`, `GroupBroadcasts`, plus Groups-only `GroupSpaceSwitcher`), each retrying just its
own failed query rather than a page-level banner. `Feed` also handles the "pagination edge" case —
`isFetchNextPageError` swaps only the "Load more" control for a retry affordance, leaving
already-loaded posts on screen. Added MSW error-simulation plumbing (`e2e/mocks/apiErrors.ts` + 4
`simulate*ErrorOnNextLoad` fixtures) for FEED-10 to reuse. `tsc -b`/`eslint` clean, `pnpm test`
340/340 (up from 326), `playwright --project=e2e` 29/29, `--project=visual-regression` shows the same
pre-existing Windows/Linux noise as before this ticket (no new baseline-regen ticket needed).
Storybook `Loading`/`ErrorState`/`LoadMoreError` stories added and screenshotted for all 4 changed
components. Live-verified against the real running backend: Home Feed/Groups render correctly on the
golden path, no stuck loading or false error states. `SportSwitcher`'s equivalent loading gap and
`CommentSection`'s missing retry button were both flagged as out-of-scope follow-ups, not fixed here.

**FEED-10 DONE** (2026-07-16, `client/docs/FEED-10_E2E_FEED_GROUPS_JOURNEY.md`): new
`e2e/flows/feed-groups-journey.spec.ts` — the 8-step epic journey (pagination, like/comment/create,
group switching, group creation, trending/broadcasts incl. expiry exclusion, admin-vs-non-admin
broadcast toggle) plus the SPORT-1 delta (sport filtering + an isolated zero-profiles test). Found and
fixed a real latent bug along the way: `mockBroadcastPost`'s hardcoded `broadcastEndTime` had already
drifted into the past relative to "today," masked only because the old handler ignored dates entirely
— fixed to a relative `hoursFromNow(24)` and backed by a genuine expiry filter over a new
`mockExpiredBroadcastPost` fixture. Also wired up `CreatePostForm`'s previously-missing `isError` UI
(a small product fix, needed to make the epic's required "MSW-simulated error response" acceptance
criterion actually prove something). `GET /posts/feed` is now genuinely page-aware (harmless for every
existing spec's small fixture). `tsc -b`/`eslint` clean, `pnpm test` 341/341, `playwright --project=e2e`
31/31 (29 existing + 2 new, repeated 3× with no flakiness), `--project=visual-regression` unchanged
from before this ticket. Live-verified the real posting flow against the running backend shows no
false error state.

**FEED-9 DONE** (2026-07-17, `client/docs/FEED-9_QA_ACCEPTANCE_CHECKLIST.md`): manual QA pass against
a real running backend (not MSW) — registered real test accounts/group, seeded 21 posts to force a
genuine second feed page. All 5 checklist items pass: HF-3/5/6/2 real-data swaps show no visible
regression, pagination/optimistic-likes/comment-counts verified live, owner-vs-member broadcast
permission gating confirmed correct, SPORT-1's zero-profile and at-cap edge cases both verified live.
Found and fixed a real (if functionally harmless) React duplicate-key bug in `GroupsPage.tsx`
(`CreateGroupModal`/`AddSportModal` both keyed from a counter starting at `0`). Found and filed a real
backend bug, not fixed here: broadcast-expiry checks compare a JVM-local timestamp against the DB's
UTC clock (`A11`, `modules/social/post-impl/docs/BACKLOG_MVP.md`) — latent only, since the real
create-broadcast flow's `+24h` default margin masks the ~7h skew; would bite a future short-duration
broadcast feature. `pnpm e2e` 31/31, `pnpm test` 341/341, `tsc -b` clean, all local (CI run itself
unverified — no GitHub access this session, same caveat as AUTH-7).

**MSW-1 DONE** (2026-07-17, `client/docs/MSW-1_STANDALONE_MOCK_SERVER.md`): replaced MSW's
per-navigation browser Service Worker (a genuine race against the app's own bootstrap fetch, root-caused
during AUTH-8) with a standalone Node HTTP server, reusing the existing `e2e/mocks/handlers/*.ts` array
via `msw`'s own exported `getResponse()` — no new dependency. Surfaced and resolved a real design gap
the backlog entry didn't account for: `feed.ts`/`groups.ts`/`sport.ts`'s module-level mutable state
would corrupt across concurrently-running tests under one shared server process
(`fullyParallel: true`) — fixed via per-test session ids carried on a request header, with every
stateful handler now keyed through a new `sessionStore.ts`. AUTH-8's previously-skipped step 5
(reload-persistence) is restored and verified flake-free at `--repeat-each=10`; a real `Set-Cookie`
response is now genuinely honored by the browser, which a Service-Worker-mocked response never was.
`pnpm e2e` 32/32 (96/96 at `--repeat-each=3`), `pnpm test` 341/341, `tsc -b`/`eslint` clean,
`pnpm test:visual` shows only the same pre-existing Windows/Linux font-rendering noise documented
since HF-12 (confirmed via direct diff-image inspection, not a regression).

**FEED-12 DONE** (2026-07-17, `client/docs/FEED-12_COMMENT_MODAL_DEEP_LINK.md`): `/posts/:postId` is
now a real, URL-addressable route (Option A: renders `HomeFeedPage` underneath, dialog pre-opened) —
`CommentSection` gets its post from a new `usePost` hook instead of a feed-cache lookup, so a shared
link works even for a post the viewer's feed never fetched. New `toggleLikeForPost(post)` on
`useHomeFeedData`/`useGroupsPageData` fixes a real gap where liking a post from outside the owning
hook's own feed array silently no-op'd. Groups page adopts `usePost` too but stays local-state-only
(no route) — routing its opens through `/posts/:postId` would unmount Groups' own selected-group state
on close. Filed **ANON-1** in a new `client/docs/BACKLOG_V1.md` for the "should a shared link be
viewable while logged out" product decision, deliberately not answered here — MVP behavior is the
existing generic `ProtectedRoute` redirect-then-bounce-back. Live-verification against the real running
backend found and fixed a real bug: neither `usePost` nor the pre-existing `useComments` skipped
TanStack Query's default retry on a 404, so a deleted/bad-link post took ~7s to show "Couldn't load
this post." — fixed both, verified down to ~400ms. `pnpm e2e` 34/34 (new `post-deep-link.spec.ts`),
`pnpm test` 351/351, `tsc -b`/`eslint` clean. `client/docs/E2E_OVERVIEW.md` updated with the new spec.

**FEED-11 DONE** (2026-07-18, `client/docs/FEED-11_POST_MODAL_VISUAL_REGRESSION.md`): new
`e2e/visual/app-post-modal.spec.ts` — 9 baselines (empty/populated/draft × 3 breakpoints),
dialog-element-only screenshots (not full page), reusing `mockPost`/`mockComment` (a reply is added
live through the real "Reply" UI, no second fixture set). `tsc -b`/`eslint` clean, `pnpm e2e` still
34/34 (separate project, unaffected). Baselines generated via the `client-ci` `update-baselines`
dispatch (Linux-rendered, same as every HF-12–HF-18 precedent) and committed; human visual check of
`populated`/`draft`/`empty` confirmed correct nested-reply indentation, Post button disabled/enabled
treatment, and empty-state message. Local Windows `pnpm test:visual` shows the same established
~0.02–0.03 font-rendering noise floor as every other baseline set, not a content mismatch.

**Swagger — authorize with email + password** (2026-07-14,
`modules/auth/docs/SWAGGER_OAUTH2_PASSWORD_AUTH.md`, requested directly, not a backlog ticket):
replaced Swagger UI's plain `bearerAuth` scheme with an OAuth2 "password" flow
(`OpenApiConfig.java`) backed by a new adapter endpoint, `POST /api/auth/oauth-token`
(`SwaggerOAuth2TokenController`, `auth-impl`, `@Hidden` from the rendered docs) — accepts the
standard OAuth2 form fields, delegates to the same `AuthService.login()` the real
`/api/auth/login` uses, and returns the standard `{access_token, token_type, expires_in}` shape
(converting `expiresIn` from milliseconds to seconds, a real unit mismatch caught during
implementation). The real API's own auth mechanism is untouched — this only changes how Swagger
UI itself acquires a token for its "Try it out" calls. Live-verified: the issued token works
against a real protected endpoint, `/api/auth/oauth-token` is confirmed absent from `/api-docs`'s
rendered paths while `/api/auth/login` still appears, and a real browser walkthrough (Playwright)
confirmed the Authorize dialog now takes email + password and reaches "Authorized." `:modules:
auth:auth-impl:test` and `:server:test` both green.

**GRP-1 DONE** (2026-07-20, `client/docs/GRP-1_GROUP_PAGE_RESTRUCTURE.md`): first ticket of the
Groups-page epic flagged in `client/docs/BACKLOG_MVP.md`'s deferred-items table. Restructured
`GroupsPage.tsx` to match `design-reference-group-feed.html`: new `GroupCoverBanner`, a per-group
vertical tab nav (`GroupTabs`: Posts/Chat/Settings) replacing the always-visible composer+feed, and
`GroupDiscoveryPanel` for the "All groups" state. Settings tab ships gated to the real backend
(Privacy editable owner/admin, read-only member; Delete Group owner-only at the bottom; Leave Group
disabled for the owner) — three new mutations (`useUpdateGroup`/`useLeaveGroup`/`useDeleteGroup`).
Chat tab is a local-state-only UI (no backend exists) with a visible "not saved" disclaimer. Filed
**B7** (`modules/social/group-impl/docs/BACKLOG_MVP.md`) to audit the split settings-data contract
and **GRP-2** (client, blocked on B7) to extend Settings with the remaining `GroupSettings` fields.
67 new/updated tests, `tsc -b`/`eslint` clean, live-verified end to end against the real running
backend (register → add sport → create group → Posts/Chat/Settings tabs, owner-role Settings gating
confirmed with real API responses).

**GRP-2 DONE** (2026-07-21, `client/docs/GRP-2_SETTINGS_TAB_FULL_DATA_SET.md`): extended the Settings
tab with the three owner-only `GroupSettings` toggles (`allowMemberPosts`/`requirePostApproval`/
`allowMemberInvites`) plus a read-only group-type row — B7 shipped since GRP-1 filed this, replacing
the originally-planned settable `maxMembers` field with fixed group-type tiers, so no cap number is
shown at all (B10, not built, is what would make one meaningful again). Added a draft/Save flow
(disabled until something changed) and a Discard/Save confirmation guard covering three "leaving with
unsaved changes" triggers: tab/group switch, in-app navigation, and browser close/refresh (the last
can only ever show the browser's own native prompt, a hard platform limitation). The in-app-navigation
trigger needed `useBlocker`, which required migrating the whole app from `<BrowserRouter>` to
`createBrowserRouter`/`RouterProvider` — done first as an isolated, separately-verified step (not a
formally tracked ticket, referenced as "ROUTER-1" in code comments). A mid-ticket request to add
localization was deliberately deferred to its own unscoped **I18N-1** ticket
(`client/docs/BACKLOG_V1.md`) rather than bundled in. 417/417 Vitest (up from 395), `tsc -b`/`eslint`
clean, Storybook build clean, 35/35 Playwright `e2e` (34 pre-existing + a new `group-settings.spec.ts`
covering toggle+Save+persistence and both testable unsaved-changes-guard triggers);
`client/docs/E2E_OVERVIEW.md` updated to match. Also moved **B10** (group type change flow) from the
group-impl MVP backlog to its V1 backlog — B10 was the last remaining MVP ticket there, so the group
module's MVP backlog is now fully `DONE`.

**GRP-2 delta, same day:** reorganized the Settings tab into two default-expanded collapsible
sections — General ("group properties": name/description, Privacy, rules/schedule, Group type) and
Permission ("group settings": the three toggles) — and wired up `rules`/`schedule` as new editable
fields. These existed on the backend since B6b but were never readable client-side: `GroupResponse`
doesn't return them, only `GET /api/groups/{groupId}/info` does, which nothing called before this.
New `Collapsible`/`Textarea` UI primitives, new `useGroupInfo` hook, `useSettingsUnsavedGuard`
extended (not replaced) to track a second draft so rules/schedule share the *same* Save button and
unsaved-changes dialog as the toggles, per user decision. New MSW `PUT /api/groups/:groupId`
handler — didn't exist at all before, so Privacy's own e2e coverage had never exercised a real call
to it either. 430/430 Vitest (up from 417), clean `tsc -b`/`eslint`/Storybook build, 35/35 e2e.

**GRP-3 DONE** (2026-07-21, `client/docs/GRP-3_MEMBERS_TAB.md`): new Members tab in `GroupTabs`
(Posts → Chat → **Members** → Settings) — a "find member" filter + "Invite friend" button, then 5
status-grouped lists loaded together on tab activation: "Waiting for group approve" (owner/admin
only, real `GET/PUT /groups/{id}/join-requests*`, Accept/Decline), "Waiting for user accept" (B8's
`GET /groups/{id}/invitations/sent`, hidden when empty, per-row label distinguishing
`pending_owner`/`pending_user`), "Group administrator" (owner first) / "Members" (one
`GET /groups/{id}/members` fetch split client-side by role, size=100 — none of the 3 endpoints
support a keyword filter, a known MVP scaling limit), and "Blacklist" (permanent "Coming soon" — no
backend concept exists). `InviteFriendModal` ships mocked on purpose (pre-filled, static "coming
soon" results, no network call) — real search+invite is filed as **GRP-4**. Found and closed a real
gap: `a11y.spec.ts` had zero Groups-page axe coverage despite GRP-1/GRP-2 both claiming to extend it
— added one baseline check (owner role, Members tab, 1280px) rather than carrying the gap forward
again. Same-day follow-up: the signed-in user's own row in "Group administrator"/"Members" now shows
a muted "(you)" suffix (`GroupMembersTab`'s new `currentUserId` prop). 447/447 Vitest,
`tsc -b`/`eslint`/Storybook build clean, 38/38 Playwright `e2e` (new `group-members.spec.ts`, no
regression in `group-settings.spec.ts`). Verified live against a real running backend beyond MSW:
registered two users, created a group, ran a full
request→accept→re-fetch round trip via curl — every new endpoint's response shape matched the
client types exactly, no divergence from the design.

**GRP-6 DONE** (2026-07-21, `client/docs/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md`): supersedes
the narrower GRP-5 (static single-sport indicator, never built). `JoinGroupModal` header
center-aligned (3-column grid); new interactive multi-select sport-filter pill row seeded from page
context (page's active sport tab → just that pill; "All" → every one of the user's sports),
freely re-toggleable before searching. Search no longer runs on an empty input, including on modal
open — a deliberate change from FEED-5's original "browse with no query" default (confirmed:
`GroupDiscoveryPanel`'s "Join Group" button with an empty shared input now opens straight to "No
groups found." instead of a browsable list — accepted, not a regression). Backend dependency **A10**
(`modules/social/group-impl/docs/BACKLOG_MVP.md`) shipped first: `usePublicGroups` now sends
`sportIds` (plural) in one combined request instead of the originally-planned per-sport client-side
fan-out; results come back as a single flat page (already carrying `sportId` per row) and are
grouped client-side into one section per sport, ordered to match the filter pills. Found and fixed a
real bug while wiring this up: axios's default array-param serialization uses bracket notation
(`?sportIds[]=1`), which Spring's `List<Long> @RequestParam` binding does not understand — confirmed
via a quick Node/axios repro before writing any component code; fixed globally via
`apiClient`'s new `paramsSerializer: { indexes: null }` (repeated bare keys,
`?sportIds=1&sportIds=2`), not a per-call workaround. 455/455 Vitest passing, clean `tsc -b`/`eslint`,
Storybook build clean. Verified live against a real running backend beyond MSW/mocks: registered a
test user with Football+Tennis sport profiles, created matching public groups under a second user,
and drove the actual browser UI (Playwright, ad hoc — not a committed spec, no existing e2e coverage
touched `JoinGroupModal`) confirming all-pills-preselected-on-"All", pill deselection narrowing
results, grouped section rendering, and the empty-search "No groups found." state — all four
screenshotted and matched the intended design exactly.

**GRP-6 addendum (2026-07-21, same doc, "Addendum" section)** — same-session follow-on that grew
from "JoinGroupModal" into an app-wide `Dialog` primitive change, since every modal shares it: (1)
new `src/shared/lib/modalAnchor.ts` (`ModalAnchorProvider`/`useAnchorBottom`) — modals on Home Feed
now position below the sport pill row, modals on Groups below the group pill row ("All") or the
group cover banner (a specific group selected), instead of viewport-centered; falls back to centered
for any page without a provider. (2) Fixed height reversed from an initial "all modals get a flat
`h-[85vh]`" pass (explicitly accepted tradeoff of tiny confirm dialogs rendering mostly empty) to a
narrower final shape: only `JoinGroupModal`/`CommentSection` get a fixed `60vh` (`DialogContent`'s
new `fixedHeight` prop) — everything else shrink-to-fits as before, capped by whatever ceiling
applies. (3) New shared `DialogHeader` component, adopted by all 7 other title+close modals
(`CreateGroupModal`, `DeleteGroupConfirmDialog`, `InviteFriendModal`,
`SettingsUnsavedChangesDialog`, `AddSportModal`, `HashtagPostsModal`,
`UpdateBroadcastConfirmDialog`) plus `JoinGroupModal` itself, replacing 8 duplicate hand-rolled
header implementations — not applied to `CommentSection`, whose header shows post author context
rather than a single title. jsdom has no `ResizeObserver`; added a no-op stub to `src/test/setup.ts`.
455/455 Vitest, clean `tsc -b`/`eslint`/Storybook build after each round; live-verified all three
anchor contexts (sport pill, group pill, cover banner) plus the fixed-60vh case in a real browser
against the real backend.

**HF-19 DONE** (2026-07-22): regenerated the `post-modal-*` visual-regression baselines
(FEED-11/FEED-12's comment-modal suite) — GRP-6's addendum gave `CommentSection` a fixed 60vh
height, so its dialog renders differently. SHA-256-compared the provided `visual-baselines.zip`
against the committed set before overwriting: exactly the 9 `post-modal-*` files changed (all 3
states × 3 breakpoints), the 9 `home-feed-*` files (no modal open in those captures) were
byte-identical — same "only the causally-connected baselines move" pattern HF-16 established.
Human-verified the new captures show the intended fixed-height empty space, not a rendering bug.

**FRIEND-1 scoped, GRP-4 reverted** (2026-07-22, `client/docs/BACKLOG_MVP.md`): picking up GRP-4
(wire invite-friend search to the real backend) surfaced a real gap — its invite flow requires the
invitee already be the inviter's friend (backend `A6`'s `areFriends` gate), but the client had no
way to become anyone's friend at all, despite the backend friendship system (`U1`) having shipped
long ago with 8 real endpoints (`/api/users/friends/**`) never wired to any client UI. GRP-4 was
reverted from `IN PROGRESS` back to `TODO`. Filed **FRIEND-1** (Friends page — status-grouped rail,
directory search via `U6`, a 50/50 profile/chat content panel, real friend-request actions) and
inserted it ahead of GRP-4 in the queue; design reference
`client/design-reference/design-reference-friend.html`. Two real backend gaps surfaced and scoped
around, matching this backlog's existing precedent for partial backend coverage: no presence system
exists at all (Online section ships permanently empty, all friends render under Offline, same
treatment GRP-3 gave its Blacklist gap), and no direct-message backend exists at all — not even a
filed ticket like group chat's CHAT-1 — so the chat panel ships as a local-state mock (per user
decision, matching `GroupChatTab`'s pre-CHAT-2 precedent) with real wiring filed as **DM-1**
(backend)/**DM-2** (client), same lineage as CHAT-1/CHAT-2. Scoping only this session, no code —
pick up FRIEND-1 in a future `/workon`.

**FRIEND-1 DONE** (2026-07-22, `client/docs/FRIEND-1_FRIENDS_PAGE.md`): built exactly as scoped
above — `FriendRail` (search + Add-friend directory search + 4 collapsible status sections),
`FriendProfilePanel` (cover/avatar/sport pills/collapsible Achievements/`friendshipStatus`-driven
action bar), `FriendChatPanel` (local-state mock, `GroupChatTab`-pre-CHAT-2 precedent), all real
against `U1`'s 5 friend-request endpoints + `U6`'s user search + the public user/sport-profile GETs.
Found and fixed a real gap while composing the selected person's sports: `useSportProfiles` (SPORT-1)
was hardcoded to the current authenticated user — extracted a new `useSportProfilesForUser(userId)`
in `shared/hooks/` so FRIEND-1 can fetch an arbitrary selected friend/search-result's sports without
duplicating the sportId→SportKey mapping a second time; `useSportProfiles()` now delegates to it,
existing test unaffected. Also added `shared/hooks/useDebouncedValue.ts` (new, generic — no debounce
hook existed anywhere in this codebase before; every prior search flow used explicit-submit).
New `e2e/mocks/handlers/friends.ts` (stateful) + `friends-journey.spec.ts` (7 steps) +
`a11y.spec.ts` extension, all green. **Live-verified against the real running backend** (not just
MSW): two real users registered via the actual UI, one searched the real directory for the other,
sent a real friend request, the other saw and accepted it, both reloaded and confirmed the real
accepted-friend state on both sides. `pnpm test:visual`'s 18 failures are the pre-existing
Windows-vs-Linux font-rendering noise floor (HF-12..19's own precedent) on Home Feed/post-modal
baselines — FRIEND-1 touches neither. GRP-4 (blocked on this ticket) is now unblocked.

**GRP-4 DONE** (2026-07-22, `client/docs/GRP-4_INVITE_FRIEND_REAL.md`): `InviteFriendModal` now runs
a real debounced `GET /api/users/search` and wires "Invite" to `POST
/api/groups/{groupId}/invitations`. Non-friend results are dropped entirely (not shown disabled);
already-a-member/already-invited friends are sorted to the end of the list, badged instead of
actionable (both per user decision during pickup, superseding the ticket's original "surface the
400 inline" framing for the non-friend case). Found and fixed a real pre-existing type bug while
live-verifying against the real backend: `UserSearchResult.username` (FRIEND-1's type) is nullable in
practice, not always a string — FRIEND-1 never rendered it so the gap was latent; this ticket's
`@{username}` row is the first place it would have broken. Live-verified the full contract (search's
`friendshipStatus` transitions, exact 400 messages/check order, idempotent re-invite) against the
real running backend beyond MSW.

**GRP-7 filed** (2026-07-23, `client/docs/BACKLOG_MVP.md`): found while closing out GRP-4 that the
invitation lifecycle past "create" is entirely unwired client-side — `POST
/api/groups/{groupId}/invitations` always creates a `pending_owner` invitation (even one the group's
own owner sends), but none of the six endpoints that move it forward (`GET {groupId}/invitations` +
approve/decline for the owner, `GET invitations/user` + accept/reject for the invitee) are called
anywhere in the app. So a GRP-4 invitation can be sent but never resolves. All 6 endpoints are
already `DONE` server-side — this is a pure client gap. Filed as GRP-7, scoping only (no code) —
two design questions (whether pending-owner invitations fold into `GroupMembersTab`'s existing
"Waiting for group approve" section or get their own, and where/how the invitee sees + accepts an
invitation) are left open for pickup.

**JOIN_GROUP_ADR written** (2026-07-23, `documentation/md/adr/JOIN_GROUP_ADR.md`): while scoping
GRP-7, the question came up of merging `group_join_requests` and `group_invitations` into one table.
Documented all 13 use cases both flows support, both schemas (current two-table vs. a proposed
merged `group_membership_requests` with a `type` discriminator), and pros/cons of each.
**Recommendation: keep the two tables** — the two flows have genuinely different approval-chain
lengths (1 reviewer vs. 2 sequential) and gates (friends-only + `allowMemberInvites`, invitation-only),
so merging only consolidates the read/list side (which GRP-7 already handles via a client-side
merge, at negligible cost) while the write/transition side — the more complex half — stays separate
either way. No schema change made; GRP-7 proceeds against the current schema.

**B11 filed, GRP-7 reverted to TODO** (2026-07-23,
`modules/social/group-impl/docs/BACKLOG_MVP.md`): picking up GRP-7 for real surfaced three
unhandled race conditions between `group_join_requests` and `group_invitations` — user-specified,
confirmed absent by reading the actual service methods (`createInvitation` always starts at
`pending_owner` regardless of inviter role; `approveInvitation` never checks for an existing join
request; `createJoinRequest` never checks for an existing invitation). Filed as backend **B11**:
(1) an owner/admin's own invitation should start at `pending_user`, skipping the redundant
self-approval step; (2) whenever an invitation is about to enter `pending_user` (via approval, or
directly per rule 1), check for an already-pending join request from the same user and short-circuit
straight to `accepted` for both records instead of leaving two disconnected pending rows; (3)
creating a join request should check for an already-`pending_user` invitation and accept that
instead of creating a redundant row. GRP-7 reverted from `IN PROGRESS` to `TODO`, blocked on B11 —
same pattern as GRP-4 reverting for FRIEND-1. No client code was written before the revert (caught
during Phase 1/2 exploration, not after implementation).

**GRP-7 DONE** (2026-07-24, `client/docs/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`, resumed once
B11 shipped): wired all 6 previously-unused invitation endpoints. Owner/admin approval merges into
`GroupMembersTab`'s existing "Waiting for group approve" section — join requests and `pending_owner`
invitations combined into one `approvalQueue`, sorted oldest-first, both row types sharing the same
Accept/Decline buttons. Invitee acceptance gets a new "Invitations" section on
`GroupDiscoveryPanel`'s All-groups landing state, hidden entirely when empty, accepting navigates
straight into the new group (`setActiveSport('all')` first, since `GroupInvitationResponse` carries
no `sportId` and the groups list is sport-filtered). 6 new hooks, `useGroupMembersTabData` extended,
new `useGroupInvitationsData` + `GroupInvitationsSection`. Live-verified all 6 endpoints against the
real running backend (not just MSW) — every response field matched the client type exactly. Full
Playwright `e2e` suite (43 specs) passes at reduced worker parallelism (`--workers=2`) — full
parallelism produced 27 scattered, unrelated timeouts confirmed as this sandbox's resource
contention, not a regression. Along the way, the new fixture data exposed a real pre-existing bug in
`group-members.spec.ts` (an unscoped "Accept" button lookup that broke once the approval queue could
hold two rows) — fixed. Vitest 510/510, `tsc -b` clean, Storybook builds clean.

**GRP-7 follow-up fix** (2026-07-24, same doc): user-reported bug — owner invites someone who already
has a pending join request (B11 rules 1+2, resolves straight to `accepted` + real membership) and
"nothing happened" in the UI. Root cause: `useSendGroupInvitation` (built in GRP-4, before B11
existed) only invalidated `feedKeys.sentInvitations` — correct assumption at the time ("creating an
invitation doesn't touch membership"), broken once B11 gave `createInvitation` accept-like side
effects GRP-4 couldn't have anticipated. Fixed by switching to the same blunt `feedKeys.all`
invalidation `useAcceptJoinRequest`/`useApproveInvitation` already use. Live-verified through the
real UI against the real backend: before the fix, the invite dialog and Members/approval-queue
sections all stayed stale; after, everything updates immediately with no manual refresh.

**B12 DONE + GRP-7 addendum** (2026-07-24, `modules/social/group-impl/docs/BACKLOG_MVP.md` +
`client/docs/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`): user-requested — a "Cancel" button on
a sent invitation while it's still `pending_owner`. No backend endpoint existed for this side
(only `cancelJoinRequest`, A3); new `GroupService.cancelInvitation`/`DELETE
/invitations/{invitationId}` mirrors `cancelJoinRequest` exactly (ownership + active-group +
status checks, hard delete, no new status literal). Scope boundary confirmed with user: cancel is
`pending_owner`-only, not available once an owner/admin has approved (`pending_user`). Client: new
`useCancelInvitation` hook, `GroupMembersTab`'s "Waiting for user accept" row gets a Cancel button
gated on `status === 'pending_owner'`. Both live-verified against the real running backend — the
new endpoint directly (non-inviter 400s, inviter succeeds, post-approval cancel 400s) and the
button through the real UI (renders, clicks, row disappears, no manual refresh). Backend Spock (5
new cases mirroring `cancelJoinRequest`'s own 5) + `:server:test` green; client `tsc -b` clean,
Vitest green.

**GRP-7 copy fixes** (2026-07-24, user-requested): the B12 button's label renamed "Cancel" →
"Withdraw" (prop/handler names left as-is, matching the backend method name); the `pending_owner`
status subtitle "Awaiting owner approval" → "Invitation sent — waiting for owner approval", reading
clearly as the sender's own status rather than an ambiguous third-party state.

**feedSpaceStore persisted to sessionStorage** (2026-07-24, user-reported): reloading the browser
while on a specific group's tab in `GroupsPage` reset to the "All groups" landing state — `/groups`
carries no `:groupId` in the URL (unlike `/posts/:postId`, FEED-12's deep-link route), so
`selectedGroupId` lived only in `feedSpaceStore`, a plain in-memory Zustand store wiped on every
reload. User chose `sessionStorage` persistence (via Zustand's `persist` middleware) over a
URL-param route change — smaller change, no routing/shareable-link implications, survives reload
but clears on tab close. All three state fields (`activeSport`/`selectedGroupId`/
`selectedGroupSportId`) persist together so a restored session never lands with a mismatched sport
tab vs. selected group. `activeGroupTab` (which per-group tab, e.g. Settings vs. Posts) stays
page-local/unpersisted — out of scope, resets to Posts on reload same as before. Live-verified
through the real UI against the real running backend: selected a group, reloaded, confirmed the
per-group tabbed view (not the discovery panel) rendered immediately. Full Vitest suite (511/511)
and the group-touching e2e specs (`group-settings`, `group-members`, `group-invitations`,
`feed-groups-journey`) all green — none assumed the old reload-resets-to-All behavior.

**InviteFriendModal reopen flash fixed** (2026-07-24, user-reported): searching in the modal, closing
it, then reopening with no pre-fill briefly showed the *previous* search's stale results before
clearing. Two compounding causes in `useInviteFriendModalData`: (1) the input/state reset only ran
via a `useEffect` on *reopen* — an effect can't run before the first paint, so that first paint still
showed the old query text, and TanStack Query (keyed on that exact text) returned its cached stale
results instantly; (2) even after the effect fired and cleared the input, the actual search-driving
`debouncedQuery` value lagged behind by the full 300ms debounce window, keeping the stale results
visible a bit longer. Fixed both: the reset now also runs on *close* (so a later reopen's first paint
already reflects it), and `useDebouncedValue` gained an `immediate` param (new optional 3rd arg,
default `false`, the one other consumer — `useFriendsPageData` — unaffected) that
`useInviteFriendModalData` sets to `!isOpen`, force-settling the debounced value the moment the modal
closes instead of waiting out the timer — closes the race deterministically regardless of how fast
the user reopens, not just for reopens that happen to land after 300ms of real time. Confirmed
`useJoinGroupModalData` doesn't share this bug — its equivalent "seed on open" is a direct synchronous
call at click-time (`openSearch`), not a post-open effect. New regression test in
`useInviteFriendModalData.test.tsx` (rerender through open→search→close→reopen, assert `rows` is
already empty on the very next render, no artificial wait). Live-verified through the real UI against
the real running backend: search → 1 result → close → reopen with no pre-fill → confirmed empty
input and no stale result, immediately and 500ms later. Full Vitest suite (512/512) and the
InviteFriendModal-touching e2e spec (`group-members`) both green.

**B13 DONE** (2026-07-24, `modules/social/group-impl/docs/B13_INVITATION_REJECT_REASON.md`): invitee
rejecting a group invitation (`PUT /groups/invitations/{id}/reject`) can now optionally include a
`reason` (new `RejectInvitationRequest` body, `@Size(max=500)`, nothing required at the API layer),
persisted on `GroupInvitation.rejectReason` (new nullable `TEXT` column, V028). New owner/admin-only
`GET /groups/{groupId}/invitations/declined` surfaces those rows with their reason — added rather
than repurposing `getGroupInvitations` (which stays `pending_owner`-only on purpose, so GRP-3/GRP-7's
approval queue doesn't get polluted with resolved rows) or `getMemberSentInvitations` (member-facing,
not owner/admin-facing — the user chose owner/admin-only visibility). Filed alongside client ticket
**GRP-8** (`client/docs/BACKLOG_MVP.md`), which needs this for its reason-gated reject confirmation
dialog. Full Spock coverage (reason persisted/omitted, new endpoint's happy path + non-owner/admin +
group-not-found cases) plus new `GroupControllerTest` MockMvc cases for both changed/new endpoints;
`:server:test` green. Live-verified end-to-end against the real running backend (register two users,
friend them, create a group, self-approved owner invitation, reject with a reason, confirm the new
endpoint returns it, confirm a non-owner/admin gets 400).

**B14 DONE** (2026-07-25, `modules/social/group-impl/docs/B14_INVITATION_CO_INVITER_TRACKING.md`):
when a second group member invites someone who already has a pending invitation to the group, that
no longer silently no-ops — a new `group_invitation_inviters` join table (V029) records them as an
additional co-inviter on the **same** canonical `GroupInvitation` row, surfaced via
`GroupInvitationResponse.inviterFullNames: List<String>`. Deliberately one row with multiple
inviters, not duplicate rows bulk-actioned together — the duplicate-row design would reintroduce the
exact multi-row race **B11** was filed to eliminate. Owner/admin joining a still-`pending_owner`
invitation as a co-inviter auto-approves it (same B11-rule-1 reasoning as a brand-new self-approved
invitation); `getMemberSentInvitations` now matches any co-inviter, not just the row's original
creator; `cancelInvitation` withdraws only the caller's own co-invite, deleting the invitation itself
only once its last co-inviter withdraws (a real design change from B12, confirmed with the user, not
assumed). N+1-safe batched mapping across all invitation-listing endpoints. Filed alongside client
ticket **GRP-8** (`client/docs/BACKLOG_MVP.md`), which needs `inviterFullNames` for its merged
"Invited by X, Y, Z" display. Confirmed (unit tests + live verification) that a *terminal* prior
invitation (`declined_by_owner` or `declined_by_user`) never merges — a subsequent invite always
starts a fresh row, per explicit user request to cover both statuses. 132 Spock tests green,
`:server:test` green, five-scenario live verification against a real running backend (merge,
cascade-withdraw, fresh-row-after-decline, owner/admin auto-approve, co-inviter's own sent-invitations
view).

**B15 DONE** (2026-07-25, `modules/social/group-impl/docs/B15_INVITATION_SPORT_ID.md`):
`GroupInvitationResponse` gains `sportId`, resolved from the already-loaded `Group` row with zero
new queries (no `sportName` — sports are static reference data already fully exposed via the
public `GET /api/sports`, so the client resolves the display name locally instead of the backend
joining it in per-response, unlike `post-impl`'s A9 pattern). Filed a follow-up ticket
(`modules/social/post-impl/docs/BACKLOG_MVP.md`'s new **A12**) to revisit whether A9's `sportName`
join on `PostResponse` is still needed for the same reason — not executed, since that field is
already shipped and client-consumed, unlike B15's brand-new field. Unblocks client's GRP-7 (real
sport-switch on accept, instead of forcing "All") and GRP-8 (add-to-profile confirmation).
`./gradlew :modules:social:group-impl:test` 131 green (added coverage for two previously-untested
methods, `getGroupInvitations` and `getUserPendingInvitations`), `:server:test` 34 green.

**GRP-8 DONE** (2026-07-25, `client/docs/GRP-8_INVITATION_LIFECYCLE_POLISH.md`): five-part Groups-page
polish, all backend deps (B13/B14/B15) shipped before pickup. (1) opening a specific group now
switches `SportSwitcher`'s active pill to match (`feedSpaceStore.selectGroup` derives it), including
GRP-7's accept-invitation flow — no more forcing "All" first. (2) the invitee-facing Invitations
section renders every co-inviter (B14's `inviterFullNames`, Oxford-comma joined) and Reject now opens
a confirmation dialog with an optional reason (B13), not a required field. (3) new "Join requests"
section on the All-groups view — withdraw a pending join request directly, no confirmation. (4) the
Members tab's owner/admin approval queue gets the same merged-inviter display as (2). (5) accepting an
invitation for a sport the invitee has no profile for shows a plain intro dialog ("This {sport}
group…", single OK button — a mid-session revision from the ticket's original `AddSportModal`-note-prop
sketch) before opening the existing `AddSportModal` pre-selected to that sport. **Follow-up fix (same
day, user-reported, revised three times):** part 1 only synced group→sport, not the reverse —
clicking "All" on Home Feed never touched the group selected on the Groups page, so returning to
Groups showed a stale group's tabs under a mismatched "All" pill (and clicking "All" while viewing a
group did nothing). Two intermediate revisions (shared store always clears on "All", then a
one-directional guard + derived `effectiveActiveSport`) were each an improvement but still left
`activeSport` as one field shared cross-page. **Final revision (user-requested): full separation** —
`feedSpaceStore` split into two independent stores, `homeFeedStore.ts` (Home Feed's own `activeSport`)
and `groupsPageStore.ts` (the Groups page's own `activeSport`/`selectedGroupId`/`selectGroup`).
Switching sport on either page can now never affect the other, by construction, not by guard logic —
`effectiveActiveSport` became unnecessary and was removed. Home Feed's `goToGroup` (a group post's
"> groupname" link) writes into `groupsPageStore.selectGroup` directly as a deliberate one-off
cross-store call ("open this group there"), without touching its own `homeFeedStore.activeSport`.
`client/CLAUDE.md`'s cross-page-state guidance updated (the original "promote to a shared store"
paragraph struck through with a note on why it reversed) since this is a real architecture decision,
not just a bug fix. Also wired `GroupsPage`'s `SportSwitcher` through the existing
unsaved-Settings-changes guard, since a sport switch can silently discard an unsaved Settings draft the
same way any other group-deselecting action already guards against. `pnpm test` 529 green (93 files),
`tsc -b` clean, lint clean, Storybook build clean, **`pnpm e2e` 46/46 green** — the earlier "couldn't
verify" was a stray leftover dev-server process Playwright was silently reusing; killing it and
re-running clean surfaced and led to fixing 3 real issues (a locator bug in my own new test, a mock
server override that only faked a GET response instead of the real state, and 2 pre-existing
`feed-groups-journey.spec.ts` steps whose "sport pill stays on All" assumption part 1 legitimately
invalidates) — see the summary doc's Verification section for the full breakdown.

**e2e headless-parallelism follow-up (2026-07-25, user-reported "headless fails, headed passes"):**
found and fixed 2 genuine timing races that only reproduced under `pnpm e2e`'s full 8-worker
parallelism, never in isolation: (1) `feed-groups-journey.spec.ts`'s manual "Load more" click racing
against `useInfiniteScrollSentinel`'s own auto-fetch trigger (a real, benign race for actual users too);
(2) `feed-groups-journey.spec.ts` step 9 and `group-invitations.spec.ts`'s Home/Groups cross-page test
clicking an unscoped `SportSwitcher` locator that both pages share the identical accessible name for —
under a contended route transition the click could silently land on the previous page's pill. Both
fixed at the test level (tolerate the auto-load race; wait for Home Feed's page-unique heading before
touching its Sport filter). 7/7 consecutive full-suite runs green after, vs. 3/3 consecutive failures
at the same two spots before. Full root-cause writeup in `GRP-8_INVITATION_LIFECYCLE_POLISH.md`'s
"Follow-up" section.

**Chat tickets moved to V1 (2026-07-26, user decision):** CHAT-1/CHAT-2/CHAT-3/CHAT-4 (real-time
group chat via PubNub + persistence) deprioritized out of the MVP backlog in full. Backend queue file
renamed `modules/social/chat-impl/docs/BACKLOG_MVP.md` → `BACKLOG_V1.md` (CHAT-1, CHAT-3); client
queue moved CHAT-2/CHAT-4's full ticket entries from `client/docs/BACKLOG_MVP.md` into
`client/docs/BACKLOG_V1.md`. `documentation/md/CHAT_SERVICE_INTEGRATION.md` (the architecture spec)
and both backlogs' cross-references updated to point at the new V1 locations. No code changed —
`GroupChatTab.tsx` keeps shipping as GRP-1's local-state-only mock with its "not saved" disclaimer for
MVP. Pick up via `/workon chat v1` or `/workon client v1` once resumed.

**Chat plan archived in full, fresh re-plan starting (2026-07-26, user decision):** rather than
resuming the V1-deprioritized queue above, the entire PubNub-based chat plan — decision doc
(`documentation/md/CHAT_SERVICE_INTEGRATION.md`), CHAT-1/CHAT-3 (backend backlog, was
`modules/social/chat-impl/docs/BACKLOG_V1.md` — that module directory, which held only this docs
folder and no code, was deleted), CHAT-2/CHAT-4 (client backlog), and the same-lineage DM-1/DM-2
(1:1 direct-message stubs filed alongside FRIEND-1, `client/docs/BACKLOG_MVP.md`) — was collected
and moved to `documentation/md/archive/chat/` (4 files: `CHAT_SERVICE_INTEGRATION.md`,
`CHAT-1_CHAT-3_BACKEND_BACKLOG.md`, `CHAT-2_CHAT-4_CLIENT_TICKETS.md`, `DM-1_DM-2_TICKETS.md`), each
annotated as archived. Live backlogs (`client/docs/BACKLOG_V1.md`, `client/docs/BACKLOG_MVP.md`) and
this file's own "Real-Time Chat" roadmap entry (§5) updated to point at the archive instead of
carrying the ticket text directly. No code changed — `GroupChatTab.tsx` and FRIEND-1's
`FriendChatPanel` keep shipping as their existing local-state-only mocks. Rationale: group chat and
1:1 direct messages were being planned as two separate, disconnected lineages (CHAT-1..4 vs.
DM-1/DM-2, the latter barely scoped); a fresh plan will treat chat as one feature. Next step: a new
planning pass (via `/feature` or `/vision`) to produce the replacement plan.

**Chat service structural scaffold — Go + Postgres (2026-07-26, user decision, plan at
`services/chat/CLAUDE.md` + `services/chat/docs/SYNC_DESIGN.md`):** the fresh chat plan above
landed as a decision, not a 3rd-party vendor: a **self-hosted Go + Postgres service**, the first
service in this repo that is not a Java Gradle module or part of the React client. Structure only —
this is not a feature-ticket breakdown, that's still a follow-up planning pass.

- **Location & build:** new top-level `services/chat/` (sibling to `modules/`/`client/`/`server/`/`infra/`),
  plain Go toolchain (`go build`/`go run`/`go test`, no wrapping Makefile), idiomatic package-by-domain
  layout (`internal/{config,auth,sync,conversation,message,ws,api,db,platform}`), `golang-migrate` for
  schema (`migrations/000001..000003`, numbered like Liquibase). Deps: `pgx/v5`, `golang-jwt/jwt/v5`,
  `coder/websocket` (the maintained fork of the now-deprecated `nhooyr.io/websocket`), `redis/go-redis/v9`,
  `testify` — versions verified live against pkg.go.dev, not recalled from training data.
- **Auth:** verifies the monolith's HS256 JWTs independently via the shared `JWT_SECRET` — no callback to
  Spring for authentication, ever.
- **Cross-service sync (Spring → chat, one-directional):** Redis Streams (`sportconnect:domain-events`,
  consumer group `chat-service`), not plain Pub/Sub (no persistence, would silently miss events during a
  restart) or a Postgres outbox (would mean a direct cross-service DB coupling, worse than an event
  contract). New Java-side publish sites added: `GroupServiceImpl.finalizeMembership`/owner-path in
  `createGroup` (`group.member_added`), `removeMember`/`leaveMember` (`group.member_removed`),
  `deleteGroup` (`group.deleted`), `UserFriendServiceImpl.establishFriendship`/`removeFriend`
  (`friendship.*`), `UserServiceImpl.updateProfile` (`user.profile_updated`, only when a displayable
  field actually changed) — all via `StringRedisTemplate`, matching `PostServiceImpl`'s existing inline
  pattern (`group-impl`/`user-impl` both gained `spring-boot-starter-data-redis`). New cold-start
  bootstrap: `/internal/sync/{group-members,friendships,users}` (new `InternalGroupSyncController`/
  `InternalUserSyncController`, cursor/keyset-paginated, N+1-safe role-name batching), gated by a new
  `SecurityConfig` filter chain (`@Order(1)`, `securityMatcher("/internal/**")`) checking header
  `X-Internal-Service-Secret` against required env var `INTERNAL_SERVICE_SECRET` (no dev default —
  fails loudly, same posture as every other secret in this stack; test profile needs its own value,
  added to `application-test.yml`).
- **Schema (chat-owned, no FKs into the monolith's tables):** `conversations`/`conversation_participants`
  unify GROUP and DIRECT chat in one lineage (a join table, not two nullable user-id columns — GROUP
  needs an arbitrary-N member list, so a join table is the only shape that avoids a second table for
  DIRECT); `chat_messages` keyed by `conversation_id`. Local read-only cache of the monolith's data:
  `group_members_cache`/`friendships_cache`/`user_profiles_cache`/`sync_state` — joined at query time in
  Go, never via SQL FK, since there's no shared schema at all across the service boundary.
- **Routing:** client reaches this service directly (`/api/chat/**` in `client/vite.config.ts`'s proxy,
  registered before the broader `/api` entry) — Spring is never a gateway for it. Prod reverse-proxy
  path-routing for this doesn't exist in-repo yet for any service — an infra follow-up, not solved here.
- **Dev infra:** `infra/docker-compose.dev.yml`'s Postgres container now seeds a second database
  (`sportconnect_chat_dev`, via `infra/scripts/init-chat-db.sql`) on the same instance — mirrors
  production (one RDS instance, one DB per service), not a second Postgres container.
- **Repo/tooling:** root `CLAUDE.md` gained a `services/` row + Go in the tech-stack line;
  `.claude/commands/workon.md` gained a `chat` branch across Phase 0b/2/3/4/5/6 (backlog path,
  explore/design/implement/verify/doc-summary conventions), so `/workon chat mvp` works once a backlog
  file exists there.
- **Verification:** Java changes (all of the above except the Go service itself) compiled and passed
  their Spock suites (`group-impl`, `user-impl`, `auth-impl`). **Correction (2026-07-27, see below):**
  `:server:test` was reported here as having "a large pre-existing block of MockMvc 403 failures,
  confirmed unrelated to this work" — that conclusion was **wrong**. The "confirmation" reverted only
  `SecurityConfig.java` via `git stash push -- <file>`, but `InternalServiceAuthFilter.java` was a
  brand-new *untracked* file at that point, which plain `git stash` (no `-u`) never touches — so the
  filter's `@Component` bug (see the 2026-07-27 entry below) stayed active in both the "buggy" and
  "control" runs, producing the same 33 failures either way for the same reason and making the
  comparison worthless. The 403s were never pre-existing; they were this session's own bug the whole
  time, now fixed — see below. **The Go code itself is unverified — no Go toolchain was available in
  this environment.** Every dependency version was checked live against pkg.go.dev; `go.sum` was not
  generated (needs network + the real `go` CLI). First pickup of anything in `services/chat/` must run
  `go mod tidy && go build ./... && go vet ./... && go test ./...` before trusting any of it — flagged
  in `services/chat/CLAUDE.md`'s "Before committing" section as a standing requirement, not a one-time
  caveat.
- **Not done in this pass (explicitly deferred):** the fresh feature-ticket breakdown (which endpoints
  ship first, group vs. DM sequencing) — `services/chat/docs/BACKLOG_MVP.md` doesn't exist yet; prod
  reverse-proxy config for any service; `/internal/**` network-isolation (must never be reachable from
  outside the Docker network — an infra ticket).

**Chat service — Go toolchain acquired, full local environment stood up and live-verified
end-to-end (2026-07-27):** the "unverified Go code"/"missing go.sum" gaps flagged above are closed —
a working `go` install was located (`go1.26.5`, just not on the PATH the assistant's tools initially
saw) and used directly for the rest of this work. `go mod tidy`/`build`/`vet`/`test` all clean.
Stood up the full local loop: created `sportconnect_chat_dev` (the container's data volume predated
`infra/scripts/init-chat-db.sql`, so the fallback manual `CREATE DATABASE` was needed — expected per
`services/chat/CLAUDE.md`), installed `golang-migrate` and applied all 3 migrations, added
`services/chat/.env` (gitignored, from `.env.example`) and a matching dev-only
`app.internal-service-secret` literal in `server/src/main/resources/application-dev.yml` (same
treatment already given `app.jwt.secret` there) so neither side needs manual exporting locally.

Two real bugs surfaced only by actually running both services together, not by code review — both
fixed and re-verified:
1. **Go route-registration panic at startup**: `POST /conversations/{id}/messages` and
   `POST /conversations/group/{groupId}` are ambiguous under Go 1.22+'s `net/http.ServeMux` (same
   method, same segment count, crossed wildcard/literal positions — e.g.
   `/conversations/group/messages` matches both). Fixed by nesting the two open-conversation routes
   under an extra `open` segment (`POST /conversations/open/group/{groupId}`,
   `POST /conversations/open/direct/{userId}`) so their length never collides with the 3-segment
   `/{id}/...` routes. `services/chat/README.md` updated to match.
2. **`InternalServiceAuthFilter` was rejecting every request in the entire app, not just
   `/internal/**`**: it was a `@Component`, and Spring Boot auto-registers any bean implementing
   `Filter` as a global servlet filter regardless of which `SecurityFilterChain.addFilterBefore(...)`
   it's also wired into — a well-known Spring Boot gotcha, invisible from reading `SecurityConfig`
   alone since that config *looks* correctly scoped. Found only by testing an unrelated public
   endpoint (`GET /api/sports`) after the internal endpoints already tested fine, and noticing it
   was also being rejected with the internal filter's exact error message. Fixed by removing
   `@Component` and constructing the filter directly inside `SecurityConfig`
   (`new InternalServiceAuthFilter(secret)`) instead of injecting it as a bean — see
   `services/chat/docs/SYNC_DESIGN.md` for the full writeup and the general rule this establishes
   for any future filter meant to be scoped to one chain. **This bug turns out to be the actual
   cause of the "pre-existing 403 block" reported in the 2026-07-26 entry above** — that
   comparison stashed only `SecurityConfig.java`, but the new `InternalServiceAuthFilter.java` was
   untracked and untouched by the stash, so its `@Component` bug stayed active in both runs
   compared. `:server:test` is fully green now (confirmed by a full, not targeted, run) — see the
   correction on that earlier entry.

**Live-verified, not just unit-tested:** registered a real user via the real running monolith,
updated their profile, confirmed the `user.profile_updated` event landed on the real Redis Stream
with the correct payload shape, started a real chat service instance, and confirmed it consumed
that exact event and updated its own `user_profiles_cache` — the full cross-service pipeline
(Java publish → Redis Stream → Go consumer → chat's own Postgres) works end to end with zero manual
steps in between. Also directly verified (via live HTTP calls, not just code reading) that all
three `/internal/sync/**` endpoints work with the correct secret and correctly reject the wrong one,
and that the chat service's own HTTP routes (`/healthz`, both renamed open-conversation routes) are
reachable and correctly auth-gated. `auth-impl`/`group-impl`/`user-impl` Spock suites re-run green
after both fixes.

**Automated regression coverage added for everything in this monolith change-set (2026-07-27,
user-requested audit + follow-up):** an audit found the entire chat-sync change set (Redis event
publishing, internal sync endpoints, the auth filter) had essentially zero automated tests — the
bugs above were all found by manual live testing, and nothing would have caught them again if
reintroduced. Added, and **proved each one actually catches its target** by temporarily
reintroducing the exact bug, confirming the new test fails, then reverting and confirming green:

- `InternalServiceFilterScopeIT` (new, `server/src/test/java/com/sportconnect/integration/`) — a
  `webEnvironment = RANDOM_PORT` test (real embedded server + `TestRestTemplate`, deliberately not
  `BaseIT`'s `MOCK` + `MockMvc` setup, which cannot reproduce Spring Boot's real global-filter
  auto-registration). Extracted `RedisTestContainerBase` out of `BaseIT` so both can share the one
  Testcontainers Redis without duplicating it. Confirmed: fails with the `@Component` bug
  reintroduced, passes with the fix.
- 9 new Spock tests across `GroupServiceImplSpec` (5), `UserFriendServiceImplSpec` (2),
  `UserServiceImplSpec` (2) asserting the actual event type + payload each `publishDomainEvent`
  call site produces (previously only "the constructor still compiles" was tested). Switched all
  three specs' `objectMapper` field from `Mock()` to a real `ObjectMapper` so payload JSON could
  be asserted for real. `UserServiceImplSpec`'s "does not publish when only non-displayable fields
  change" test confirmed to fail (`TooManyInvocationsError`) when the conditional was temporarily
  forced to always-true.
- `InternalGroupSyncServiceSpec` (new, 8 tests) and `InternalUserSyncServiceSpec` (new, 10 tests) —
  cursor parsing (blank → start, non-blank → parsed), limit clamping to `MAX_LIMIT`, `next_cursor`
  null-vs-populated on last/full page, and the N+1 role-name-batching guard. Neither service had
  any test before this (not part of any public `-api` contract, so nothing exercised them
  incidentally).
- `InternalServiceAuthFilterSpec` (new, 6 tests, matching this module's existing
  `JwtAuthenticationFilterSpec` pattern) — correct/wrong/missing/blank-secret cases against the
  filter directly. Confirmed to fail (missing `Content-Type`, empty body) when the original
  `sendError(...)` bug was temporarily reintroduced — though notably *not* on status code, since
  `MockHttpServletResponse` doesn't simulate the real container error-page redispatch that produced
  the live 401; that half is uniquely covered by `InternalServiceFilterScopeIT` above. Together the
  two tests cover both halves of the original bug; neither alone would have.

**Important correction surfaced by this pass:** re-running the *full* `:server:test` suite (not
just a targeted test) after all the above now shows **zero failures** — including
`GroupControllerTest`/`PostControllerIntegrationTest`'s 403 block, previously logged above as
"pre-existing, confirmed unrelated to this work." That confirmation was invalid: it stashed only
`SecurityConfig.java`, and `InternalServiceAuthFilter.java` was untracked at the time (plain
`git stash` never touches untracked files), so the `@Component` bug stayed active in both the
"buggy" and "control" runs — the 403s were this session's own bug the whole time, not pre-existing,
and are now fixed along with everything else.

**Chat MVP + V1 backlogs filed, 3 infra tickets added (2026-07-27, user-requested):** with the
backend live-verified end to end, filed the actual ticket breakdown for what's left to call the
*feature* — not just the service — complete.

- **`services/chat/docs/BACKLOG_MVP.md`** (new, CHAT-5..12 — numbering starts at 5 to avoid
  colliding with the archived `CHAT-1..4` in `documentation/md/archive/chat/`): backend test
  coverage the live-verification session exposed as missing (CHAT-5 repository/cache integration
  tests, CHAT-6 WebSocket broadcast + sync resilience tests — the backend itself already works,
  these just cover it with automated regression tests), then the entire client side, which nothing
  in this whole effort had touched yet (CHAT-7 chat API client + hooks scaffold, CHAT-8 wire
  `GroupChatTab`, CHAT-9 wire `FriendChatPanel` for 1:1 DMs, CHAT-10 E2E + MSW handlers including a
  real decision on the WebSocket-mocking question the archived plan had left open, CHAT-11
  hardening, CHAT-12 QA). **Scope decision recorded:** both group chat and 1:1 DMs ship in this
  MVP (the one already-built schema covers both); editing/deleting, read receipts, typing
  indicators, and attachments are explicit non-goals here.
- **`services/chat/docs/BACKLOG_V1.md`** (new, CHAT-13..16): the four deferred features above,
  each filed with open questions to resolve at pickup (e.g. CHAT-13's edit/delete needs a
  soft-delete-vs-hard-delete call and a schema migration either way; CHAT-15's typing indicators
  are flagged as a poor fit for this service's persistence-first design — ephemeral, likely
  Redis/in-memory rather than a new table) rather than any real design — none of these are close to
  ready to build, filed only so the ideas aren't lost.
- **`infra/documentation/BACKLOG_MVP.md`** gained **INFRA-7/8/9**: reverse-proxy path-routing for
  `/api/chat/**` (INFRA-7 — INFRA-3's existing Nginx/Caddy scope only covered one origin, predating
  `services/chat`'s existence), a CI/publish workflow for `services/chat/Dockerfile` (INFRA-8,
  mirrors INFRA-4's shape), and enforcing that `/internal/**` is actually unreachable from outside
  the Docker network in prod (INFRA-9 — today only an application-layer secret check stands
  between the public internet and a full membership/friendship/profile data dump; the network-layer
  isolation this depends on doesn't exist yet). INFRA-6's deploy-pipeline ticket amended with a note
  that it needs to cover restarting the chat container too, once INFRA-7/8/9 land. None of these
  three block running the chat service locally — dev already routes around all of them (Vite proxy,
  `go run`, no network boundary on a single dev machine).

**Chat V1 backlog emptied — all 4 tickets moved to MVP (2026-07-27, user decision, same day as
filed):** editing/deleting messages, read receipts, typing indicators, and attachments (CHAT-13..16)
are no longer deferred — they're now part of the chat MVP, sequenced after the core wiring tickets
(CHAT-8/CHAT-9, since each builds on basic send/receive existing) and before the E2E/hardening/QA
tickets (CHAT-10/11/12, whose scope now covers the full feature set, not just basic messaging).
This was a priority/sequencing move only — none of the four were actually scoped in the process;
each still carries its original open questions (e.g. CHAT-13's soft-delete-vs-hard-delete call,
CHAT-15's likely-Redis-not-Postgres design for ephemeral typing state) and needs its own Phase
1/2/3 pass at pickup, per root `CLAUDE.md`'s ticket-writing convention. `services/chat/docs/
BACKLOG_V1.md` is now empty (kept as a file for future deferred ideas, per convention).

**CHAT-5 — Repository/cache integration tests + this service's first CI pipeline (2026-07-27,
`services/chat/docs/CHAT-5_REPOSITORY_CACHE_INTEGRATION_TESTS.md`):** `internal/conversation`'s,
`internal/message`'s, and `internal/sync`'s hand-written SQL now has real DB-backed test coverage
(previously only pure-validation unit tests existed) — idempotent `GetOrCreate*Conversation`,
`IsActiveParticipant`, `AuthorizeByID`'s three outcomes, keyset pagination, batched sender-profile
resolution (with an explicit one-query assertion), and every `CacheStore` upsert/delete. Required a
small, behavior-preserving refactor first: the three repositories now depend on a new
`internal/db.Querier`/`TxQuerier` interface instead of the concrete `*pgxpool.Pool`, so tests can
hand them an open `pgx.Tx` (rolled back via `t.Cleanup` after every test, full isolation, verified
via direct `psql` counts afterward — zero leaked rows) instead of the real pool — no production
call site changed. Also added `.github/workflows/chat-ci.yml`, this service's first CI pipeline
(build/vet/test against a `postgres:16-alpine` service container), added mid-ticket after the user
asked whether chat had CI parity with `server-ci.yml`/`client-ci.yml` (it didn't). H2 was
considered and ruled out for this service specifically — it's a JVM/JDBC-only database and this
service's driver (`pgx`) only speaks Postgres's native wire protocol, with no ORM here to abstract
the gap the way Hibernate does for the monolith's own H2 test profile. `go build`/`go vet`/
`go test ./...` all green locally. `chat-ci.yml`'s own steps (not just the tests) were separately
verified by reproducing them locally end to end — a throwaway fresh `postgres:16-alpine` container,
`golang-migrate` installed and run against it from empty, then build/vet/test — all green; only the
GitHub-Actions-specific mechanics remain unverified until a real PR runs it (same HF-12-style
conditional as every other CI ticket in this repo).

**CHAT-6 — WebSocket broadcast + sync resilience tests (2026-07-27,
`services/chat/docs/CHAT-6_WEBSOCKET_SYNC_RESILIENCE_TESTS.md`):** real WebSocket broadcast-fan-out
coverage (a real router + real `coder/websocket` clients over `httptest.NewServer`), plus
`internal/sync.Consumer`/`Bootstrapper` resilience coverage. Found and fixed a real bug while writing
the consumer test: `Consumer.Run` only ever read Redis Stream entries with `>`, which Redis never
redelivers once an entry has been delivered to a consumer group — so a same-identity restart never
actually retried a never-acked entry, contrary to what `CLAUDE.md`'s own "Known gaps" note implied.
Confirmed empirically via `redis-cli` before touching code. Fixed with `Consumer.reclaimPending` (one
`XREADGROUP ... 0` read at the top of `Run`, before the main `>` loop). `Consumer`'s stream/group and
`Bootstrapper`'s page size became per-instance fields (defaulting to the real production values, no
`main.go` changes) so tests use throwaway stream/group names and a small page size instead of
touching real shared infrastructure. Bootstrap pagination test runs against the **real monolith**
(user decision, after being shown the real cost — the monolith's `MAX_LIMIT`/the client's hardcoded
request limit are both 500, which would've needed 501+ seeded rows; the user's own follow-up
question, "what's the page size, should we reduce it?", is exactly what shipped — a small
test-overridable page size needing only ~5 seeded rows against the real `/internal/sync/users`).
`chat-ci.yml` had two real gaps only caught by re-simulating it end-to-end exactly like CHAT-5 did
(fresh containers, `.env` hidden, only the workflow's own env values exported): no Redis service
container at all (added `redis:7-alpine`) and no `JWT_SECRET` (added, CI-only literal). Also added a
**README maintenance convention** to `services/chat/CLAUDE.md` (none existed before, unlike the
client's `E2E_OVERVIEW.md` rule) and did a full accuracy pass on `README.md`, which had been stale
since initial scaffold (still said "no Go toolchain has verified this code" long after CHAT-5/6
proved otherwise). `go build`/`go vet`/`go test ./...` green locally and in the re-simulated CI
environment, including confirming the monolith-dependent test SKIPs (not fails) exactly the way
`chat-ci.yml` will hit it.

**CHAT-7 — Chat API client + data hooks scaffold, client side (2026-07-27,
`services/chat/docs/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`):** first client-side chat
code — `client/src/features/chat/` (`types.ts`, `chatApiClient.ts`, `queryKeys.ts`,
`useChatConversation`/`useGroupChatData`/`useDirectChatData`). Refactored `apiClient.ts` into a
shared `createAuthenticatedClient(baseURL)` factory (same auth-attach + 401-refresh-retry behavior
for both the monolith client and the new chat client) — existing `apiClient` tests unchanged.
**Found and fixed a real, previously-undiscovered bug while live-verifying:** the chat service's
`internal/auth.Verifier` only ever accepted HS256-signed JWTs, but JJWT 0.12.x's
`signWith(key)` (the monolith's own call site) auto-selects the strongest HMAC-SHA variant the
key's byte length supports — the actual dev `JWT_SECRET` is long enough to produce **HS512**
tokens, which the verifier had been rejecting outright. This meant the chat service's JWT
verification had never actually worked against a real monolith-issued token in this environment;
only this package's own tests (which mint their own HS256 tokens) masked it, and CHAT-5/CHAT-6's
prior "live-verified" claims either predate this secret's length or only exercised token-less
paths. Widened `jwt.WithValidMethods` to accept HS256/HS384/HS512. Also found (not a pre-existing
bug, a genuine gap in the ticket's own premise): a browser's native `WebSocket` cannot set an
`Authorization` header during the handshake, so `GET /conversations/{id}/ws` was unreachable from
a real client — added `Verifier.MiddlewareWS` (header first, falls back to a `?token=` query
param, scoped to this one route only) plus a `vite.config.ts` fix (`/api/chat`'s proxy entry needed
`ws: true`, which the string-shorthand form doesn't provide). User chose the query-param approach
over a `Sec-WebSocket-Protocol` subprotocol or a short-lived ticket endpoint, after a security
tradeoff discussion (query strings can land in default access-log formats; headers/subprotocols
generally don't). Live-verified end to end against the real running monolith + chat service: a
freshly registered user's real HS512 access token, two independent WebSocket connections opened
with the query-param token, a REST-sent message broadcast to and received by both. Reconnect policy
(user decision): auto-retry with capped exponential backoff, refetching history on reconnect to
fill any gap; sent messages and WebSocket-pushed messages merge into the same TanStack Query cache
deduped by message id (the backend broadcasts a sent message back to the sender's own open
connection too, not just other participants). No component wiring in this ticket — `GroupChatTab`/
`FriendChatPanel` remain local-state mocks until CHAT-8/CHAT-9.

**CHAT-8 — Wire `GroupChatTab` to the real chat service (2026-07-27,
`services/chat/docs/CHAT-8_WIRE_GROUP_CHAT_TAB.md`):** `GroupChatTab`'s local-state-only mock swapped
for CHAT-7's `useGroupChatData(groupId)` — group chat is now real, persisted, and delivers live over
WebSocket. `GroupChatTab` calls the data hook directly rather than `GroupsPage` (a deliberate
exception to this app's usual page-owns-the-hook convention), justified by `GroupsPage` already only
mounting the tab while active and remounting it per group — exactly the lifecycle the hook's
WebSocket connect/disconnect needs. **Older chat history added mid-ticket (user decision, not in
the original ticket text):** `useChatConversation` switched from a plain `useQuery` to
`useInfiniteQuery` for message history, reusing this app's existing `Feed.tsx`/
`useInfiniteScrollSentinel` pagination pattern rather than inventing a new one — a
`loadOlderMessages()` + `hasOlderMessages`/`isLoadingOlderMessages`/`isLoadOlderMessagesError` were
added to the hook. **Structural finding, not anticipated in the design:** no existing infrastructure
in this repo mocks a real network+WebSocket-backed hook inside Storybook (every other component with
this tension avoids it by having the page own the hook) — split the component into a thin
`GroupChatTab` container (calls the hook) and a new presentational `GroupChatTabView` (everything
visual, driven by plain props), matching this app's established container/presentational split.
Full client suite green: 96 test files / 550 tests. Live-verified the pagination mechanics against
the real running services (55 sent messages, page-1/page-2 fetch, reconstructed in correct order) —
**not verified this session:** the actual rendered UI in a real browser (no browser tooling
connected), flagged explicitly as a follow-up manual check rather than silently skipped.

**Real bug found via the user's own manual browser check, same day:** `GroupChatTab` failed
immediately in a real browser with "Couldn't load this group's chat." — `vite.config.ts`'s
`/api/chat` proxy entry had no `rewrite`, so it forwarded the full `/api/chat/conversations/**` path
unchanged to the chat service, whose router (`internal/api/router.go`) registers routes with **no**
`/api/chat` prefix at all — every proxied request 404'd at the Go service. Confirmed directly:
`/api/chat/conversations/open/group/1` through the Vite proxy → `404`; the same route hit directly
at `:8081` (no `/api/chat` prefix) → `401` (auth-rejected but route-matched, as expected with a fake
token) — proving the route was always fine and the proxy was the sole problem. **This bug predates
CHAT-8** — present since the proxy entry was first added (at latest CHAT-7) — and was masked by
every prior "live verification" in this whole effort, because those always called the chat service
directly at `:8081`, never through `:5173`'s actual dev proxy, which is the only path a real browser
uses. Fixed with `rewrite: (path) => path.replace(/^\/api\/chat/, '')`; re-verified the full flow
(open, WebSocket connect, send, receive, history re-fetch) through the actual proxy path this time.
**Lesson recorded for future chat tickets:** a "live-verified" claim must specify whether it went
through the real dev proxy (`:5173`) or direct to the service (`:8081`) — they are not equivalent.

**CHAT-9 — Wire `FriendChatPanel` to the real chat service, 1:1 DMs (2026-07-27,
`services/chat/docs/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md`):** `FriendChatPanel`'s local-state-only mock
swapped for CHAT-7's `useDirectChatData(userId)`, applying CHAT-8's exact pattern (thin container +
new presentational `FriendChatPanelView`, same reason: no Storybook infra for a real
network+WebSocket hook, and the panel needs to own the hook call so `FriendsPage`'s existing
`key={selectedPerson.id}` remount drives the WebSocket lifecycle) to the Friends page's chat panel.
Friends-only gate (`conversation.ErrNotFriends`) intentionally not re-implemented client-side — the
hook is always called, the server's real 403 drives the same generic error state a loading failure
would. Full client suite green: 97 test files / 560 tests. **Live-verified through the real dev
proxy (`:5173`) this time, per the binding note CHAT-8 left** — three users registered, two made
real friends via the monolith's friend-request/accept flow, a third left a stranger: the stranger's
`open/direct/{id}` correctly `403`s through the proxy, the real friend's succeeds (`200`), a
WebSocket opened through the proxy receives a REST-sent message, and 56 sent messages correctly
split across a 50/6 two-page fetch matching the client hook's pagination logic. Not verified this
session (same limitation as CHAT-8): the actual rendered UI in a live browser — flagged, not hidden.

**CHAT-13 — Editing and deleting messages (2026-07-28,
`services/chat/docs/CHAT-13_EDIT_DELETE_MESSAGES.md`):** filed unscoped with 5 open questions;
resolved with the user before any code: edit replaces content in place (+ nullable `edited_at`, not
a versioned history table), delete is soft (`deleted_at`, content also scrubbed to `''` server-side
so deleted text is never re-served), sender-only authorization (group-admin moderation would need
the documented role-sync gap closed first — deliberately out of scope), no time window, no delete
confirmation dialog (immediate, matching Slack/Messenger rather than this app's heavier
`DeleteGroupConfirmDialog` pattern). New migration (`edited_at`/`deleted_at` on `chat_messages`),
new `PATCH`/`DELETE /conversations/{id}/messages/{messageId}` routes. **Every WebSocket broadcast
now wraps in a `{type, message}` envelope** (`MESSAGE_CREATED`/`MESSAGE_EDITED`/`MESSAGE_DELETED`)
— a deliberate breaking change to the bare-message wire shape CHAT-7/8/9 shipped, updated in
lockstep on both ends since nothing external depends on the old shape yet. **UI change added
mid-ticket (user request):** own messages now align left, others' right (reversed from the usual
convention); group chat (only, not 1:1 DMs) shows a circular avatar next to other members'
messages, reusing the existing `Avatar` component already used by `FriendRail`/`PostCard`. Go suite
green (9 new tests). Full client suite green: 97 test files / 579 tests (29 new). Full `pnpm e2e`
green (46/46), no regressions. Live-verified edit/delete/re-edit-after-delete/WS-envelope-ordering
through the real dev proxy. Not verified this session (same outstanding gap since CHAT-8): the
actual rendered UI in a live browser.

**Two real bugs found via the user's own manual testing, same day, neither caught by the extensive
automated coverage above:** (1) sent messages could intermittently vanish —
`useChatConversation`'s WebSocket handlers guarded on a single shared `unmountedRef`, but React 18
`StrictMode` (enabled in `main.tsx`) double-invokes effects in dev, and the second mount resets that
ref before the first (torn-down) socket's async `onclose` necessarily fires — the stale `onclose`
then incorrectly triggered a reconnect whose `onopen` invalidated the messages query, racing a
just-sent message. Fixed by comparing socket identity (`socketRef.current !== socket`) in every
handler instead. (2) The actual reported symptom — **every message rendered as "Message deleted"
immediately, including ones just sent.** Root cause: `messageBody`'s `editedAt`/`deletedAt` Go
fields had `omitempty`, which omits a nil pointer field from the JSON entirely rather than emitting
`null`; the client's `message.deletedAt !== null` check then saw `undefined !== null` (`true`) for
every untouched message. Fixed by dropping `omitempty` — both fields are now always present,
explicit `null` when unset. Neither automated test suite caught either bug because both construct
fixtures as plain objects/structs, never round-tripping through actual JSON (de)serialization — new
regression tests added for both, confirmed to fail without their respective fix and pass with it
(temporarily reintroducing each bug to prove it), same verification method CHAT-6/CHAT-8 used: Go's
`internal/api/responses_test.go` (asserts actual marshaled JSON key presence, not struct values) and
client's `useChatConversation.test.tsx` (forces a real reconnect, then re-fires the stale socket's
close a second time). Client suite now 97/580, Go `internal/api` +1. Live-reverified through the
real proxy: a fresh sent message's raw JSON response now reads `"editedAt":null,"deletedAt":null`
explicitly.

**CHAT-14 moved back to `BACKLOG_V1.md` (2026-07-28, user decision, at pickup):** read receipts was
picked up first among the four unscoped CHAT-13..16 tickets, then moved back out of MVP scope before
any of its open questions were resolved — MVP now ships CHAT-13, CHAT-15, CHAT-16 only from that
original set of four. No code changed, backlog housekeeping only.

**CHAT-15 — Typing indicators (2026-07-28,
`services/chat/docs/CHAT-15_TYPING_INDICATORS.md`):** filed unscoped with 3 open questions; resolved
with the user before any code: purely in-memory/ephemeral (no schema change, no Redis key — a live
relay through the existing `internal/ws.Hub`), client-driven debounce (5s idle timeout after the last
keystroke, plus immediate stop on send/blur), group display shows name(s) up to a cap of two then a
count ("3 people are typing…"), never echoed back to the sender's own connection(s), no privacy
opt-out. New `Hub.BroadcastExcept` (skips every connection of a given user, not just one, covering
multiple open tabs) and `POST /conversations/{id}/typing` (reuses the existing membership/friendship
authorization, resolves the display name from the existing cache, no persistence). Client:
`useChatConversation` tracks `typingUsers` with a client-side ~8s safety-net expiry per user (guards
against a dropped stop signal or a mid-typing disconnect); both `GroupChatTabView`/
`FriendChatPanelView` got the debounce logic and a shared `formatTypingLabel` helper. Go suite green
(1 new integration test, real two-WS-client setup proving the exclusion). Full client suite green:
97 test files / 596 tests (17 new). `tsc -b`/`eslint`/`storybook build` all clean. **Not verified this
session:** a live two-browser-tab check through the real `:5173` dev proxy (no browser tooling
connected) — the new route follows the exact already-proxied `/conversations/{id}/...` shape, so the
risk is lower than CHAT-8's own discovered proxy bug, but it hasn't been re-confirmed with a real
browser; flagged in the ticket doc, not hidden.

**Real bug found via the user's own live testing of CHAT-15, same day:** a long unbroken run of
characters (e.g. digits with no spaces) in a message overflowed the chat bubble's background instead
of wrapping — pre-existing since CHAT-8/CHAT-13, not introduced by CHAT-15, just noticed while
testing it. Root cause: the bubble `<div>` in `GroupChatTabView.tsx`/`FriendChatPanelView.tsx` had
`max-w-[75%]` but no `overflow-wrap`, so a single "word" too long to fit rendered past the box's right
edge rather than breaking. Fixed by adding Tailwind's `break-words` to both bubbles. `tsc -b`/`eslint`/
Vitest (both view test files, 51 tests) all clean.

**Second real bug in the same bubbles, same day (user request → widen, then user-reported regression):**
asked to widen the bubble from 75% to ~85-90%; changing it to `max-w-[88%]` instead surfaced a
pre-existing, worse bug — short multi-word messages (e.g. `"sd s"`) started wrapping one word per line
even though nowhere near the intended width. Root cause: a percentage `max-width` has no reliable
containing-block width to resolve against in this component's nested flex-column layout (each message
row shrink-wraps to its own content rather than stretching to the panel's width), so the percentage
falls back to being sized by the bubble's *longest single word* rather than its actual line width —
the same ambiguity that (in a different manifestation) let the earlier long-digit-string bug through
too. Fixed by dropping the percentage entirely in favor of a fixed `max-w-sm` (384px, standard
Tailwind token) on both bubbles — the same fixed-cap pattern real chat UIs (WhatsApp Web, Slack, etc.)
already use, and one that has no containing-block ambiguity to resolve. `tsc -b`/`eslint`/Vitest (53
tests across both view files) all clean.

**Also grouped consecutive same-sender avatars (2026-07-28, user request):** `GroupChatTabView`'s
avatar now renders only on the last message of a consecutive run from the same sender (the earlier
messages in that run get an invisible same-size spacer instead, to keep bubble alignment stable) —
`FriendChatPanelView` untouched (a 1:1 DM never shows an avatar at all). 2 new tests.

**Friends page rail state persistence (2026-07-25, user-requested,
`client/docs/FRIEND-1_FRIENDS_PAGE.md`):** leaving the Friends page and coming back now restores the
rail's mode (friend list vs. directory search), search text, and selected person — previously all
three reset on every remount. New `friendsPageStore` (sessionStorage-persisted, same convention as
`feedSpaceStore`) replaces `useFriendsPageData`'s local `useState` for `query`/`isAddMode`/
`selectedPersonId`. The underlying friends/requests/search lists always refetch fresh on remount
already (TanStack Query's default `staleTime: 0`, shared cache across route changes) — no extra
wiring needed there. A restored selection that no longer resolves to anyone once the reloaded lists
settle clears back to "no selection" rather than lingering. `pnpm test` 529 green, `tsc -b`/lint clean.

**CHAT-10 — E2E + MSW handlers for chat (2026-07-28,
`services/chat/docs/CHAT-10_E2E_MSW_HANDLERS.md`):** picked up ahead of its listed order — CHAT-16
(file/image attachments) was picked up first per the backlog table, but its Phase 1 research found the
"reuse the existing media-upload path" premise false (no such pipeline exists anywhere in this app);
the user chose to swap CHAT-10 and CHAT-16's order rather than block on that. Resolved this repo's
first WebSocket-vs-MSW gap: `useChatConversation`'s socket is receive-only (every mutation is REST), so
a fake, in-page `WebSocket` (`e2e/mocks/fakeChatSocket.ts`, overrides `window.WebSocket` via
`page.addInitScript`) is a complete substitute for a live second client, not a partial one — the mock
server itself needed no WebSocket support. New `e2e/mocks/handlers/chat.ts` (stateful, raw JSON, no
`ApiResponse<T>` — chat is a separate backend) plus `group-chat.spec.ts`/`direct-chat.spec.ts` (7 steps
each: empty state, send, reload-persists, edit, delete, simulated real-time push, simulated typing).
Happy-path only (user decision) — error/edge states are CHAT-11's scope. `playwright.config.ts` also
gained `VITE_CHAT_PROXY_TARGET` for the mock server's dev-server webServer entry — without it,
`/api/chat/**` e2e requests silently targeted a real, absent `:8081` chat service. Full e2e suite green
(48 tests), `tsc -b`/`eslint`/Vitest all clean. A manual (uncommitted) axe probe found zero critical/
serious violations on either chat surface — `a11y.spec.ts` itself not extended, per its own
"only if it actually does" criterion; CHAT-11 still owns the full a11y pass.

**Chat service decision** (2026-07-22, archived 2026-07-26 —
`documentation/md/archive/chat/CHAT_SERVICE_INTEGRATION.md`): **PubNub**
chosen for real-time group chat transport, superseding the "Real-Time Chat" roadmap entry's original
self-hosted WebSocket/Spring STOMP plan (see that section below) — self-hosting a stateful realtime
layer would compete for RAM with the app itself on the single free-tier EC2 box
(`infra/documentation/INFRA-3_HOSTING_DECISION.md`), whereas a pub/sub SaaS offloads that entirely.
Verified current free-tier terms live (not from training-data recollection, since vendor pricing
shifts often): PubNub (200 MAU, permanent free, 7-day history) and Ably (similar, 1-day history) are
both genuinely free indefinitely at this project's scale; Stream Chat's free tier is dev-only and
jumps to $399+/mo, Sendbird's advertised free tier is mostly a 30-day trial — both rejected.
Architecture: headless PubNub JS client under the already-built `GroupChatTab.tsx` (GRP-1) — no
second UI system; short-lived (~1hr) membership-scoped backend-minted tokens, no active revocation
for MVP (bounded exposure via the short TTL instead); our own Postgres persists messages as the
source of truth, PubNub's own 7-day store bridges the gap until that ships. Scoped as 4 tickets
across two backlogs — CHAT-1/CHAT-3 (backend, `modules/social/chat-impl/docs/BACKLOG_MVP.md`,
new module) and CHAT-2/CHAT-4 (client, `client/docs/BACKLOG_MVP.md`) — sequenced
CHAT-1 → CHAT-2 → CHAT-3 → CHAT-4. Decision + ticket scoping only this session, no code — pick up
CHAT-1 in a future `/workon`.

**HF-13 DONE** (2026-07-09, `client/docs/HF-13_REGENERATE_VISUAL_BASELINES.md`): regenerated
HF-10b's 9 committed visual-regression baselines via the `update-baselines` CI dispatch, following
AUTH-1's `cn()` fix. Diffed old vs. new before replacing (all 9 genuinely changed, not a no-op) and
did a human visual check on two of them — borders now render correctly on post cards, sport-switcher
pills, match cards, and CTAs, nothing unintentionally broken.

**Infrastructure decisions** (2026-07-08, `infra/documentation/INFRASTRUCTURE_LAYOUT_AND_CICD.md`):
hybrid infra layout (artifact-scoped files stay in `client/`/`server/`, environment-scoped in
`infra/`, workflows must stay in `.github/workflows/`); **GitHub Actions is the CI/CD platform —
no Jenkins** (GHCR for images, Environments + approval gates + OIDC for deploys). Infra docs live
in `infra/documentation/` (deliberate amendment to the docs-placement rule). Gaps + proposed
tickets now on a real backlog: `infra/documentation/BACKLOG_MVP.md` — INFRA-1 (backend CI),
INFRA-2 (dev docker-compose), INFRA-3 (deploy pipeline, blocked on hosting decision) — picked up
via `/workon infra mvp` (workon command extended for the infra module).
- **INFRA-1 (2026-07-08):** Backend CI workflow — `.github/workflows/server-ci.yml` (JDK 21,
  `./gradlew build`, no service containers needed: H2 for schema, `BaseIT`'s Testcontainers Redis
  from A8 self-provisions via Docker already on `ubuntu-latest`); decoupled root `./gradlew build`
  from the client's pnpm/Vite build at the source (removed `build.dependsOn` wiring in both root
  `build.gradle` and `client/build.gradle`, rather than excluding it CI-side) so `./gradlew build`/
  `test` are backend-only by construction; generated the previously-missing POSIX `gradlew` wrapper
  (only `gradlew.bat` was tracked) with a `.gitattributes` LF/CRLF rule so it doesn't break on
  Linux runners. **Bootstrap confirmed:** `server-ci` went green on its first run (PR #4) — no
  baseline-bootstrap step needed, unlike `client-ci`'s HF-12. Required-check marking is still not
  mechanically enforceable on this repo (branch protection unavailable, GitHub Free + private).
- **INFRA-2 (2026-07-08):** Dev environment docker-compose — `infra/docker-compose.dev.yml`
  (`postgis/postgis:16-3.4` + `redis:7-alpine`, config values read directly from
  `application-dev.yml`, not guessed), deps-only per explicit scope discussion (server/client keep
  running natively — no Dockerfiles exist yet, and building them now would risk duplicating
  INFRA-3's eventual, hosting-decision-dependent work). Verified beyond the ticket's own bar: not
  just `docker compose up`, but a full `./gradlew :server:bootRun` against the stack — all 24
  Liquibase migrations succeeded, PostGIS dialect initialized, app served a real `200` on
  `/api/sports`.
- **Hosting decision (2026-07-08, `infra/documentation/INFRA-3_HOSTING_DECISION.md`):** AWS,
  free-tier-first — single EC2 instance (Docker + Nginx/Caddy + self-hosted Redis) + RDS
  PostgreSQL/PostGIS + S3/CloudFront for the client, GHCR for images, GitHub OIDC for deploy
  credentials; no ALB/NAT Gateway/ElastiCache/Fargate (all cost money outside free tier). Only
  `production` deploys to AWS for now — `dev`/`staging` stay local-only (INFRA-2). Unblocked and
  split the old INFRA-3 into **INFRA-3** (AWS foundation) → **INFRA-4** (server image/GHCR) +
  **INFRA-5** (client S3/CloudFront) → **INFRA-6** (`deploy.yml` orchestration), all `TODO` on
  `infra/documentation/BACKLOG_MVP.md`.
- **Swagger/OpenAPI integration (2026-07-08, `documentation/md/SWAGGER_OPENAPI_INTEGRATION.md`):**
  documented all 96 endpoints across 9 controllers (`@Tag`/`@Operation`/`@ApiResponses`, new
  `OpenApiConfig` registering a JWT bearer security scheme) — springdoc was already wired but had
  zero annotations anywhere. Also fixed `SecurityConfig` permitAll not covering the app's
  customized `/api-docs` path (was 401ing unauthenticated `/api-docs` fetches despite Swagger UI
  itself loading). Response codes verified per-endpoint against actual `throw new`/`orElseThrow`
  calls, not templated — surfaced that `post-impl`/`group-impl` use 400 (not 403) for every
  ownership/permission check, and that friend-request accept/decline/cancel are 404 (not 403) for
  a non-owner since the repository lookup itself is scoped by receiver/sender id. Live-verified:
  96 operations/9 tags in the generated spec, `/api-docs` reachable unauthenticated, and 4
  documented response codes (401/200/404/200) matched real requests against a running server.
Full detail in `client/docs/BACKLOG_MVP.md` — one ordered queue merging the two refined epics
(`client/docs/sporthub-home-feed-tickets.md` + `client/docs/sporthub-auth-feed-integration-tickets.md`),
same format as the server module backlogs (`/workon client mvp`).

| Phase | Tickets | Summary |
|---|---|---|
| 0 | HF-00, HF-0, HF-10a | Vite/TS/Tailwind scaffolding, shared types + mock data, visual-regression harness |
| 1 | HF-1..HF-6 | Home Feed components (TopBar/NavTabs, SportSwitcher, Feed, Matches, Hashtags, Broadcasts) |
| 2–4 | HF-7, HF-8, HF-10b, HF-11, HF-9 | Page integration, responsive/a11y, VR CI gate, E2E, QA |
| 5 | MSW-0, AUTH-0..8, AUTH-7 | Real auth integration (memory token + httpOnly cookie) |
| 6 | FEED-0..10, FEED-9, **SPORT-1** | De-mock feed/hashtags/broadcasts/groups — and the sport switcher (new SPORT-1 ticket) |

**Corrections found while creating the backlog (verified against source 2026-07-06):**
- `SportController` now exists (sport-impl A1–A4 all DONE) — the epics' "sport switcher stays mock" claim is stale; new ticket SPORT-1 de-mocks it. Only matches (HF-4) remain mock-only.
- BE-1 (refresh token → httpOnly cookie) and BE-2 (logout trusts client-supplied `userId`) were unshipped and untracked — ticketed as **A2/A3 in `modules/auth/docs/BACKLOG_MVP.md`**. **Both DONE as of 2026-07-08** — see below.
- Post-impl's old F1 (frontend personalized feed) is absorbed by FEED-1.

### Auth A2 + A3 DONE (2026-07-08) — client Phase 5 (AUTH-3/AUTH-5/AUTH-4) unblocked

**A2** (`modules/auth/docs/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md`): refresh token moved to an
httpOnly `Set-Cookie` (profile-conditional `Secure`, `SameSite=Strict`, `Path=/api/auth`);
`AuthResponse.refreshToken` now `@JsonIgnore`d, never in the JSON body. Verified live against a
running server (Docker Postgres/Redis), not just mocked tests.

**A3** (`modules/auth/docs/A3_FIX_LOGOUT_AUTHORIZATION.md`): `/api/auth/logout` now derives the
caller from the JWT principal (401 without one) instead of trusting a client-supplied `userId`.

**Verifying A3 live surfaced and fixed several genuinely unrelated pre-existing bugs**, all with
explicit go-ahead at each step (full story in A3's summary doc):
- A circular Spring bean dependency between `PostServiceImpl` ↔ `GroupServiceImpl` that prevented
  the app from starting at all (`@Lazy`-annotated constructor fix in `GroupServiceImpl`).
- An N+1 query in `GroupServiceImpl.getGroup()`/`.getPinnedPosts()` (previously flagged-but-not-
  ticketed in group-impl's A8) — fixed via a new batch `PostService.getPostsByIds()`.
- `server:test` was 23/27 red: `schema.sql` (H2 test fixture) hadn't tracked ~4 migrations' worth
  of columns/tables (`users.height_cm` etc., `posts.post_type` etc., the whole `hashtags` table) —
  fixed; and `@WithMockUser`'s principal shape doesn't match this app's userId-string convention,
  breaking ~21 integration tests — fixed via a new `BaseIT.authenticateAs()` helper.
- Found a real, separate gap: `getGroup()` has no private-group/membership enforcement at all —
  filed as **A9** in `modules/social/group-impl/docs/BACKLOG_MVP.md` (needs a product decision).
- Left one test failing on purpose: `server:test`'s Redis dependency has no test-time Redis
  available — filed as **A8** in `modules/social/post-impl/docs/BACKLOG_MVP.md`.
- `server:test` final state: 25/27 (the 2 remaining are `JavaRevisionTest`, unrelated environment
  noise, and the now-ticketed A8 Redis gap).

### Immediate Next (other backend completions)
- **Complete forgot-password** — wire up UserService lookup in `AuthController`
- **Notifications service** — in-app notifications for likes, comments, friend requests, group events

### Partner Finding System (designed, not implemented)
- `partner_requests` table: sport, skill level, location, preferred dates/times, status
- `partner_matches` table: match score (0–100), accept/decline workflow
- `partner_ratings` table: skill/punctuality/sportsmanship ratings
- Matching algorithm: skill + location proximity + availability overlap
- Key endpoints: `POST /api/partner-requests`, `GET /api/partner-requests/matches`, `POST /api/partner-requests/{id}/accept`, `POST /api/partner-ratings`

### Facility Booking System (designed, not implemented)
- `vendors`, `facilities`, `facility_sports` (many-to-many), `operating_hours`, `bookings` tables
- ACID booking transactions (no double-booking)
- `booking_tokens` table: cryptographic QR codes, immutable transfer history
- QR verification endpoint for vendors
- Booking transfer marketplace
- Full vendor dashboard API

### Payment Integration (designed, not implemented)
- Stripe Connect (platform aggregator)
- 10% platform commission deducted before vendor payout
- Escrow for equipment marketplace
- Weekly automated vendor payouts, refund processing

### Equipment Marketplace (designed, not implemented)
- Equipment listings (buy/sell/rent)
- Offer/negotiation workflow
- Escrow-backed transactions
- Seller ratings and reviews

### Real-Time Chat (backend live-verified + regression-tested; client foundation landed 2026-07-27)
- **Status:** the vendor-based (PubNub) plan was archived 2026-07-26 (user decision) to
  `documentation/md/archive/chat/`; the replacement is a **self-hosted Go + Postgres service**
  (`services/chat/`, the first non-Java-module/non-client service in this repo) — see
  `services/chat/CLAUDE.md` and `services/chat/docs/SYNC_DESIGN.md`. Backend: live-verified
  end to end (real Redis Stream sync, real HTTP/WebSocket API) and now has automated regression
  coverage (CHAT-5 repository/cache integration tests, CHAT-6 WebSocket broadcast + sync resilience
  tests, both `DONE`), plus its own CI pipeline (`chat-ci.yml`). Client: CHAT-7 (`DONE`) landed the
  API client + `useGroupChatData`/`useDirectChatData` data hooks. CHAT-8 (`DONE`) wired
  `GroupChatTab.tsx` to `useGroupChatData` for real (split into a thin container + a presentational
  `GroupChatTabView`, plus older-history pagination) — group chat is real and live now, not a mock.
  CHAT-9 (`DONE`) gave `FriendChatPanel.tsx` the same treatment for 1:1 DMs
  (`useDirectChatData`/`FriendChatPanelView`) — both chat surfaces are now real and live, neither is
  a mock anymore. CHAT-13 (`DONE`) added editing (replace-in-place + `edited_at`) and soft-deleting
  (`deleted_at`, content scrubbed server-side) messages, sender-only, no time window — every
  WebSocket broadcast now wraps in a `{type, message}` envelope
  (`MESSAGE_CREATED`/`MESSAGE_EDITED`/`MESSAGE_DELETED`) to support it. Also reversed both surfaces'
  message alignment (own left, others' right) and added a circular avatar for other group members'
  messages (group chat only), per user request. CHAT-15 (`DONE`) added typing indicators (in-memory
  WebSocket relay, no persistence, client-driven 5s debounce). CHAT-10 (`DONE`, picked up ahead of
  CHAT-16 — see that entry above) gave both chat surfaces real e2e coverage (`group-chat.spec.ts`/
  `direct-chat.spec.ts`) against a new MSW backend (`e2e/mocks/handlers/chat.ts`) and resolved the
  WebSocket-vs-MSW gap via a fake in-page `WebSocket`. Full remaining breakdown (attachments,
  hardening, QA): `services/chat/docs/BACKLOG_MVP.md`.
- History: originally scoped as self-hosted WebSocket/Spring STOMP (dependency still sits unused in
  `server/build.gradle`), superseded 2026-07-22 by a PubNub-based plan
  (`documentation/md/archive/chat/CHAT_SERVICE_INTEGRATION.md`, scoped as CHAT-1..4 + DM-1/DM-2),
  archived in turn 2026-07-26 in favor of the Go service above.

### Group Advanced Features (not implemented)
- System posts (auto-generated for admin actions)
- Group search and discovery UI
- Member invitation flow
- Post approval workflow for private groups
- Notifications for join request status changes
- Group analytics dashboard

### Frontend Pages (not yet created)
- Email verification page (`/verify-email?token=xxx`)
- Forgot password + reset password pages
- User profile page (click-through from avatar)
- Group detail / member list / admin panel UI
- Partner finding UI
- Facility search and booking UI
- Vendor dashboard UI
- Notifications UI

### Phase 4–5 (Future) — Mobile App
- React Native app, targeting 60–70% code sharing
- QR code scanner for booking verification
- Push notifications (Firebase)
- Camera integration for game photos/videos

### Long-Term
- Video upload and shorts (TikTok-style)
- AI-powered recommendations (Python microservice, collaborative filtering)
- Elasticsearch for full-text search
- Group challenges and leaderboards
- Events and tournaments
- Coaching marketplace
- Optional blockchain/NFT booking verification (post-MVP if demand exists)

---

## 6. Key Technical Constraints & Notes

| Topic | Detail |
|---|---|
| Java version | 21 (toolchain enforced in root `build.gradle`) |
| Spring Boot | 3.2.0 |
| JWT | JJWT 0.12.x — API differs from 0.11.x (use `Jwts.parser().verifyWith()`) |
| Geospatial | PostGIS `geography(Point, 4326)`, JTS `Point`. Use `GeometryFactory(new PrecisionModel(), 4326)`. Coordinate order: longitude=X, latitude=Y |
| DB migrations | Liquibase only (`ddl-auto: validate`). Never use `create`/`update`. Register new files in `db.changelog-master.xml` |
| Testing | Spock 2.3 (Groovy 4.0) only. Files in `src/test/groovy/`. `useJUnitPlatform()` required in build.gradle |
| SecurityConfig | Lives in `auth-impl`, not `server`. Roles are prefixed `ROLE_` in Spring Security context |
| Frontend API calls | Always use `client/src/utils/api.js` (single axios instance with interceptor). Never import `axios` directly |
| Token storage | `localStorage` (`accessToken`, `refreshToken`). Note: design docs recommended httpOnly cookies for refresh tokens; current impl uses localStorage |
| CORS | Allowed origins: `http://localhost:3000`, `http://localhost:5173` |
| Duplicate migration filenames | Several V007–V010 filenames exist with different suffixes — only files listed in `db.changelog-master.xml` are applied |
| Swagger | Available at `http://localhost:8080/swagger-ui.html` (dev) |
