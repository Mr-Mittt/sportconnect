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

**Chat service decision** (2026-07-22, `documentation/md/CHAT_SERVICE_INTEGRATION.md`): **PubNub**
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

### Real-Time Chat (designed, not implemented)
- **Group chat transport superseded 2026-07-22** (`documentation/md/CHAT_SERVICE_INTEGRATION.md`):
  the self-hosted WebSocket/Spring STOMP plan below is no longer the approach — cost/hosting
  reasoning made a 3rd-party pub/sub vendor (**PubNub**) the chosen transport instead, scoped as
  CHAT-1..4 across `modules/social/chat-impl/docs/BACKLOG_MVP.md` and `client/docs/BACKLOG_MVP.md`.
  Left below for historical context, not as the active plan.
- ~~WebSocket (Spring STOMP) — dependency already in `server/build.gradle`~~ (superseded, see above)
- 1-on-1 direct messages — still unscoped, genuinely future work (PubNub decision only covers group
  chat; see the decision doc's explicit scope boundary)
- Group chats — **now scoped**, see CHAT-1..4 above
- Read receipts, typing indicators, message reactions — still out of scope (matches
  `GroupChatTab.tsx`'s current UI, which has none of these)
- ~~Tables needed: `conversations`, `conversation_participants`, `messages`, `message_reactions`~~
  — superseded by `chat_message` (CHAT-3), a single denormalized table, not this 4-table shape

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
