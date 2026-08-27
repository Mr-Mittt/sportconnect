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
- **Push notifications (confirmed 2026-08-17, at NTF-3 pickup):** Firebase Cloud Messaging, for the
  mobile app specifically — an OS-level, backgrounded/closed-app delivery mechanism that a web
  WebSocket session structurally cannot provide (iOS forbids background WebSocket connections
  outright). This is not a replacement for the web client's STOMP-over-RabbitMQ live delivery
  (`modules/notification`'s NTF-3) — the two are complementary, scoped to different reachability
  cases. Not yet scoped as a ticket; full rationale and open implementation questions in
  `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`'s hybrid-delivery decision and open
  questions.

### 2.8 Payment
- **Decision:** Stripe Connect (platform aggregator model), 10% commission, escrow for equipment marketplace, weekly vendor payouts.

### 2.9 MVP Phase Order (revised after competitive analysis)
- **Final decision:** Partner Finding + Booking first (unique differentiation, revenue from day 1), then Social Feed, then Equipment Marketplace.
- **Rejected original order:** Social feed first — competes directly with Strava with no differentiation for 16 weeks, no revenue.
- **What was actually built first:** Social feed and groups (implemented before partner/booking).

### 2.10 Sport Thumbnails
- **Decision:** Embedded PNG resources in `sport-impl` for MVP; migrate to S3 + CloudFront for production.
- V013 migration updates sports with `icon_url` paths.

### 2.11 Resource Access — Availability vs. Visibility Gates
- **Decision (2026-08-10, design only, not yet implemented):** any domain with per-item read/write
  rules on a resource answers two separate questions, in order — is it **available** (existence/
  lifecycle, unavailable → `NotFoundException`), then is it **visible** to this caller (authorization,
  not-visible → `ForbiddenException`). Every such resource implements a new shared-shape-only
  interface, `common`'s `ResourceGate<T>` (two boolean methods + a `require()` default) — service-impl
  layer, no shared logic across domains, each domain's own cross-domain `-api` calls compose the
  check (e.g. a `Post`'s availability checking its parent `Group`'s active status via `group-api`).
  Full design, code sketches, and rationale: `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md`.
  Summarized as a durable rule in root `CLAUDE.md`'s "Resource access" section.
- **Rejected, then reversed 2026-08-12 (twice):** a session's discussion thread modeled as a `Post`
  (`PostType.SESSION_POST`) to reuse comment/like/cache infra for free — originally rejected as a
  stronger form of something `SESSION_COMMENTS_VISION.md` already rejected, on the grounds that it
  would weld `session-impl` to `post-impl` at the schema level and require a bidirectional `-api`
  dependency. Reopened and accepted for **SESSION-10** after direct discussion with the user — an
  interim pass built exactly the bidirectional shape the ADR warned about (justified at the time
  since `group-impl` ↔ `post-impl` already has the same shape via B3/B9), then was replaced
  same-day with a stricter **one-way** design at the user's request: `post-impl` carries zero
  dependency on `session-api`, a `SESSION_POST` is unconditionally invisible via `/api/posts/**`
  for every caller, and `session-impl` reaches `post-impl`'s comment infra only through internal
  bypass methods it alone calls, after its own `SessionGate` authorizes the caller. See §3's Session
  module entry and `modules/session/docs/MVP/SESSION-10_SESSION_POST_COMMENTS.md` for the full path.
  Also rejected, unchanged: a fully generic annotation/AOP visibility framework (no reusable logic
  across domains to justify the ceremony) and controller-layer/query-only checks.
- **Concrete bugs found while designing this:** `GroupServiceImpl.isGroupMember/isGroupOwner/
  isGroupAdmin` never check `group.isActive` — a former member of a soft-deleted group can still pass
  every one of these checks (8 call sites in `post-impl`, 1 in `session-impl`); fix belongs in
  `group-impl` at the source, not per-caller. Also: `post-impl` inconsistently throws
  `BadRequestException` (A2) vs. `ForbiddenException` (A3) for the same category of access denial —
  to be standardized on `ForbiddenException` going forward via this gate's convention.
- **Delta on `SESSION_COMMENTS_VISION.md`:** a group-linked session's comment thread (SESSION-10,
  `DONE` 2026-08-12) should also be visible to group members, not just `SessionParticipant`s — the
  vision doc's original decision was participant-only even for group-linked sessions.
- **Tickets filed (2026-08-11):** `group-impl` **B18** (active-group fix), `common` **C2**
  (`ResourceGate<T>`), `post-impl` **A14** redesigned against this ADR, `session-impl` **SESSION-10**
  gating redesigned to build against it from the start (including the group-member widening delta).
  See the ADR's §9 for detail.
- **C2 (2026-08-11):** `ResourceGate<T>` implemented in `modules/common` exactly per the ADR §4 shape
  — `isAvailable`/`isVisibleTo` plus a `require()` default throwing `NotFoundException`/
  `ForbiddenException` in that fixed order; zero domain dependency, no logic, shape only. `DONE`.
  Details: `modules/common/docs/MVP/C2_RESOURCE_GATE.md`. `PostGate` implemented 2026-08-12
  (`post-impl` A14, `modules/social/post-impl/docs/MVP/A14_POST_RESOURCE_GATE.md`). SESSION-10
  (2026-08-12) *does* implement the standalone `SessionGate` this ADR originally specced — an
  interim design routed gating through `PostGate` calling into `session-api` instead, but was
  replaced same-day per the reversal note above.

---

## 3. What Is Fully Implemented

### 3.1 Backend Modules (all building successfully)

#### `modules:common`
- `ApiResponse<T>` — standard wrapper for all REST responses
- Shared exceptions: `ResourceNotFoundException`, `BadRequestException`, `UnauthorizedException`
- **C1 (2026-07-03):** Global exception handler — new `GlobalExceptionHandler` (`@RestControllerAdvice`) maps all 5 shared exception types to their correct HTTP status (400/403/401/404) plus `MethodArgumentNotValidException` → 400 with field-level errors and a catch-all `Exception` → 500 (no leaked details), all wrapped in `ApiResponse`; before this fix, every one of these fell through to Spring's default 500 across the **entire application** since none had a handler or `@ResponseStatus`; auto-registered via component scan, zero changes needed at any of the ~100+ existing throw sites; first test infrastructure of any kind added to `modules/common` (MockMvc standalone setup, 7 new Spock tests)
- **C2 (2026-08-11):** `ResourceGate<T>` — shared availability/visibility check shape (`com.sportconnect.common.access`), two boolean methods (`isAvailable`, `isVisibleTo`) plus a `require()` default enforcing availability-before-visibility and the `NotFoundException`/`ForbiddenException` convention; zero domain dependency, no shared logic, `modules/common` has never imported a domain type here. See `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md`.
- **C3 (2026-08-17):** Generic transactional-outbox mechanism (`com.sportconnect.common.outbox`) — `OutboxEvent` `@MappedSuperclass` (eventType/payload/status/attemptCount/timestamps, no table of its own) + `OutboxRelay<T>`, a reusable poll-publish-mark-sent component each domain instantiates from its own `@Scheduled` job (same shape as `session-impl`'s `SessionGenerationJob`), publishing via `RabbitTemplate` with publisher confirms. First JPA entity and first RabbitMQ dependency in `modules/common`; added a `rabbitmq` service to `infra/docker-compose.dev.yml` and `spring.rabbitmq.*` config to all three `application*.yml` profiles. No exchange/queue topology declared — that stays NTF-2's job. Prerequisite for `post-impl` B7, `group-impl` B21, `session-impl` SESSION-15, `user-impl` U13. See `modules/common/docs/MVP/C3_TRANSACTIONAL_OUTBOX.md`.
- **MVP backlog:** 3 tickets (C1, C2, C3) in `modules/common/docs/BACKLOG_MVP.md`, all **`DONE`**

#### `modules:auth:auth-api` + `modules:auth:auth-impl`
- JWT access + refresh token generation/validation (JJWT 0.12.x)
- `RefreshToken` entity stored in database (UUID user reference, no circular JPA dependency)
- `JwtAuthenticationFilter` — extracts and validates Bearer tokens
- `JwtAuthenticationEntryPoint` — 401 JSON responses
- `SecurityConfig` — stateless, CORS for localhost:3000/5173, public endpoints configured
- `AuthController` endpoints: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/forgot-password` (placeholder), `/reset-password`
- `EmailVerificationService`, `PasswordResetService`, `EmailService`
- **A6 (2026-08-10, `DONE`, `modules/auth/docs/MVP/A6_DROP_AUTH_TABLES_USER_ID_FKS.md`):** dropped the
  3 cross-domain DB-level FKs found in the 2026-08-10 sweep (following post-impl's A13
  precedent) — `email_verifications_user_id_fkey`, `password_reset_tokens_user_id_fkey`,
  `refresh_tokens_user_id_fkey` — via `V044__drop_auth_tables_user_id_fks.sql`. Schema-only;
  confirmed no code path relies on `ON DELETE CASCADE` (`UserServiceImpl.deleteUser` is a soft
  delete).
- **MVP backlog:** 5 tickets (A2–A6) in `modules/auth/docs/BACKLOG_MVP.md` — A2–A4/A6 `DONE`, A5
  `TODO`

#### `modules:user:user-api` + `modules:user:user-impl`
- `User` entity: UUID PK, email/username unique, profile fields, PostGIS `geography(Point, 4326)` for location, soft delete (`isActive`), roles (ManyToMany eager)
- `Role` entity: USER, VENDOR, GROUP_OWNER, ADMIN
- `UserRepository` custom queries, `UserServiceImpl` full CRUD + soft delete + geospatial updates
- `UserController` at `/api/users/**`
- `UserPreference` entity
- **U1 (friendship system, DONE):** see `modules/user/user-impl/docs/MVP/U1_FRIENDSHIP_SYSTEM.md`
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
  flow — see `client/docs/MVP/FRIEND-1_FRIENDS_PAGE.md`.
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
- **U12 filed (2026-08-10, `TODO`):** Revoke sessions on deactivation — found while discussing what
  "delete account" does today. `UserServiceImpl.deleteUser()` only flips `is_active = false`; it
  never revokes the user's refresh tokens (`user-impl` doesn't even depend on `auth-api` yet) or
  their already-issued access token (`JwtAuthenticationFilter` only checks signature/expiry, no
  active-status recheck — up to a 1hr window where a deactivated user's JWT still authenticates).
  Fix 1 (required): wire `deleteUser()` to call the existing `AuthService.logout(userId)`. Fix 2
  (access-token gap): DB lookup vs. Redis deny-list per request — tradeoff to confirm at pickup,
  may split into its own ticket; worth coordinating with whoever picks up auth's A5 (also about to
  add a per-request Redis check, for rate limiting).
- **MVP backlog:** 12 tickets (U1–U12) in `modules/user/user-impl/docs/BACKLOG_MVP.md`, 10 `DONE`,
  U11/U12 `TODO`

#### `modules:sport:sport-api` + `modules:sport:sport-impl`
- `Sport` entity: name, description, category, icon_url, min/max players, soft delete
- `UserSportProfile` entity: skill level, experience, preferred position, unique `(user_id, sport_id)`
- Full CRUD services; `SportController` at `/api/sports/**`
- V013 migration: updates sports table with thumbnail URLs and metadata
- **A1 (2026-07-03):** JWT-based identity — `POST /api/sports/profiles`'s `@RequestParam UUID userId` replaced with `@AuthenticationPrincipal String userIdStr`; corrected the ticket's suggested reuse target (`SecurityUtils.extractUserId`) to match the established required-auth-write-endpoint pattern (`@AuthenticationPrincipal` + `UUID.fromString`) instead, verified against group-impl/post-impl's own `DONE` A1 tickets; no service-layer changes; new **A4** ticket logged (batch sport lookup in `getUserProfiles()` — bounded to ≤3 items by the existing max-3-profiles rule, ticketed for cleanliness not performance, per user's explicit request)
- **A2 (2026-07-03):** Sport profile ownership check — `PUT /api/sports/profiles/{profileId}` and `DELETE /api/sports/profiles/{profileId}` previously had no ownership check (any authenticated user could edit/delete anyone's profile); `UserSportProfileService.updateProfile()`/`deleteProfile()` gained a `callerId` param, throw `ForbiddenException` on mismatch after fetching (fetch-then-check, so not-found still 404s correctly); 2 new Spock tests (non-owner update/delete → `ForbiddenException`)
- **A3 (2026-07-03):** Flexible per-sport attributes — `attributes JSONB` column added to `user_sport_profiles` (V025) for sport-specific data (e.g. dominant hand, stroke style) that doesn't fit a fixed schema; first JSONB column in the codebase, uses Hibernate 6's native `@JdbcTypeCode(SqlTypes.JSON)` mapping (no extra library needed, verified against the project's actual Hibernate version before implementing); `updateProfile()` merges new attribute keys rather than replacing wholesale; serialized size capped at ~4KB (`BadRequestException` if exceeded); 4 new/changed Spock tests. **Verification gap:** the JSONB column/Hibernate JSON mapping could not be validated against a live Postgres in this sandbox — recommend a real DB run before merging.
- **A4 (2026-07-03):** Batch sport lookup in `getUserProfiles` — replaced a per-profile `sportRepository.findById()` with one `findAllById()` call; ticketed and fixed for cleanliness/consistency only, not performance (confirmed this list can never exceed 3 items, per the max-3-profiles rule — never a real N+1 scaling risk); 1 new Spock test (empty-input guard)
- **A5 (2026-08-07,
  `modules/sport/sport-impl/docs/MVP/A5_CACHE_SPORT_LOOKUPS.md`):** cached sport lookups —
  `spring-boot-starter-cache` + `ConcurrentMapCacheManager`, one cached master map
  (`SportLookupCache.getAllSportsById()`, own bean to avoid an AOP self-invocation trap) backing
  `getSportById`/`getSportsByIds`/`getAllActiveSports`/`getAllSports` instead of independently
  `@Cacheable`-annotating each (would have made `getSportsByIds`'s `List<Long>` argument part of its
  cache key); evict-on-write on `createSport`/`updateSport`/`deleteSport`, no TTL. Live-verified
  against real Postgres: cache miss queries once, cache hit queries zero times. Also fixed, found
  while trying to verify this ticket's own tests: `sport-impl/build.gradle` was missing
  `test { useJUnitPlatform() }` (every other module has it) — this module's Spock suite had never
  actually executed under Gradle; once fixed, surfaced ~76 pre-existing `UUID`-instead-of-`Long` id
  bugs across all 4 of this module's test files, all fixed.
- **A6 (2026-08-07,
  `modules/sport/sport-impl/docs/MVP/A6_MVP_SPORT_RESTRICTION.md`):** MVP sport restriction — user
  decision to launch with only Badminton + Pickleball active; migration `V043` deactivates all 10
  other seeded sports (data-only `UPDATE`, no explicit rollback block — the inverse is trivially
  symmetric). Audited every `Sport`/`SportResponse` read path against the module's own documented
  "no global `isActive` filter" gotcha: the public catalog (`getAllActiveSports`,
  `getSportsByCategory`) and admin catalog (`getAllSports`) were already correct; `getSportById`/
  `getSportsByIds` stay deliberately unfiltered (existing profiles for a now-deactivated sport must
  keep resolving a name, not degrade to "Unknown"). Fixed the one real gap found:
  `createProfile()` only checked the sport *exists*, never that it's *active* — now throws
  `BadRequestException` for a deactivated sport, before the max-3-profiles check. 1 new Spock test.
  **Non-obvious interaction with A5:** its no-TTL cache assumes every write funnels through
  `SportServiceImpl` (which evicts) — this migration's raw `UPDATE` bypasses that, so it only takes
  effect on the next app restart, not the next `PUT /api/sports/{id}`. Live-verified against real
  Postgres + a running server: catalog shrank to exactly 2 sports, `POST /api/sports/profiles`
  correctly 400s for Soccer (now inactive) and 201s for Badminton (active). Filed alongside
  **SPORT-3** (`client/docs/BACKLOG_MVP.md`, `TODO`, unaffected by this change) — client-side audit
  found the entire client sport catalog (`SPORT_PROFILE_CONFIG`/`ALL_SPORT_KEYS`/`SPORT_ID_BY_KEY`)
  is a hardcoded football/basketball/tennis config that never actually calls `GET /api/sports`;
  neither Badminton nor Pickleball exist in the client yet.
- **A7 (2026-08-08, filed):** generalizes A6's read/write split beyond `sport-impl` itself — a
  read-only survey of `group`/`location`/`session` domains' create paths (`createGroup`,
  `createLocation`, `createSession`) found none of them check `isActive` on the sport they tag,
  unlike `UserSportProfileServiceImpl.createProfile` (A6). `hasProfileForSport` (used by
  `createGroup`) is existence-only and doesn't substitute — a profile created while a sport was
  active still passes it after that sport is later deactivated. Ticketed for later; no code
  changed yet.
- **A8 filed (2026-08-10, `TODO`):** repo-wide sweep for cross-domain DB-level FKs (following
  post-impl's A13 precedent) found 1 in this module — `user_sport_profiles.user_id`, pre-dating the
  2026-07-07 cross-domain-refs rule, already a plain `UUID` field at the JPA layer.
- **MVP backlog:** 8 tickets (A1–A8) in `modules/sport/sport-impl/docs/BACKLOG_MVP.md` — A1–A6
  `DONE`, A7/A8 `TODO`

#### `modules:social:post-api` + `modules:social:post-impl`
- `Post` entity: content (5000 chars), geolocation, sport, visibility, post type, soft delete
- `Comment` (nested replies, max 1 level enforced in B A4), `PostLike`, `CommentLike` entities
- `Hashtag`, `PostHashtag`, `UserFollow` entities (tables exist; UserFollow → replaced by Friendship in B1)
- `PostServiceImpl`, `CommentServiceImpl`
- `PostController` — 16 endpoints: create/read/update/delete posts, like/unlike, comment CRUD, feed, group posts, active broadcasts, broadcast end-time extension
- **A14 (`DONE`, 2026-08-12, `modules/social/post-impl/docs/MVP/A14_POST_RESOURCE_GATE.md`):** filed
  2026-08-08 while designing SESSION-10's participant-status comment gating, redesigned 2026-08-11
  against `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md`. Implemented `PostGate`
  (`com.sportconnect.social.post.access`), `post-impl`'s own `ResourceGate<Post>` — `isAvailable`
  checks not-soft-deleted + parent group still active (B18's `isGroupActive`); `isVisibleTo`
  switches on `postType` (owner/public/friends for `USER_FEED` via `UserFriendService.areFriends`,
  group membership for `GROUP_POST`/`GROUP_BROADCAST`/`GROUP_SYSTEM`). Applied to 7 single-item
  paths (`getPostById`, `getPostComments`, `createComment`, `likeComment`, `unlikeComment`,
  `likePost`, `unlikePost` — the last two only 5 were originally named, see delta below) —
  `ForbiddenException` replaces the previous silent pass-through for a visible-but-unauthorized
  caller. Three deltas beyond the ADR's own text, all user-directed: `likeComment`/`unlikeComment`
  now also gate the comment's own availability (new `CommentRepository.findByIdAndIsActiveTrue`)
  before the parent-post gate — closing a gap where a comment on an unavailable post stayed
  likeable, and where `unlikeComment` had no existence check at all; `friends`-visibility is
  now genuinely enforced (not deferred) since `UserFriendService.areFriends` already existed with
  no new dependency; and `PostServiceImpl.likePost`/`unlikePost` — never named in this ticket or
  the ADR, spotted as a post-merge follow-up in the same session — had the identical unguarded
  pattern (`likePost` checked existence only, `unlikePost` checked nothing about the post at all)
  and were fixed the same way. New `PostGateSpec` unit-tests the gate directly;
  `PostServiceImplSpec`/`CommentServiceImplSpec` updated for the new fetch-then-gate shape plus
  `Forbidden`/`NotFound` cases per method. Also added real IT coverage (post-merge, asked whether
  it existed — it didn't): 19-case `PostAccessGateIntegrationTest` exercising all 7 gated methods
  over real `MockMvc` HTTP + real Spring wiring + H2, which surfaced and fixed three latent gaps in
  `server/src/test/resources/schema.sql` (missing `groups.recurrence_*` columns from
  `GROUP-RECUR-1`, a missing `comment_likes` table, a missing `friendships` table — none previously
  exercised by any IT test). `:modules:social:post-impl:test` and `:server:test` (incl.
  `PostControllerIntegrationTest` and the new class) both green.
- **A15 (`DONE`, 2026-08-10, `modules/social/post-impl/docs/MVP/A15_DROP_POST_CROSS_DOMAIN_FKS.md`),
  absorbed A13 (2026-08-10, user decision):** originally filed 2026-08-07 as A13 —
  `posts.sport_id` is the one cross-domain `sport_id` column with a real DB-level FK
  (`REFERENCES sports(id)`), unlike `groups`/`locations`/`sessions`' plain unenforced `BIGINT`s
  (confirmed via `git log`: `posts`, V004, predates the 2026-07-07 cross-domain-refs rule by ~4
  months, never retrofitted, same story as this module's own A5). The 2026-08-10 repo-wide FK
  sweep then found 6 more in this module — `posts.user_id`/`group_id`, `comments.user_id`,
  `comment_likes.user_id`, `post_likes.user_id`, `post_shares.user_id` — all the same "predates
  the rule" story. Rather than ship two near-identical migrations touching overlapping tables,
  A13 was merged into A15: dropped all 7 constraints in one changeset,
  `V048__drop_post_tables_cross_domain_fks.sql`. Schema-only; confirmed no code path relies on any
  of the three domains' cascade/set-null behavior (`UserServiceImpl.deleteUser`,
  `GroupServiceImpl.deleteGroup`, `SportServiceImpl.deleteSport` are all soft deletes).
  `post_reports`' matching `reporter_id`/`reviewed_by` FKs deliberately excluded — that table has
  zero owning code (no entity/service/controller anywhere), same "dead schema" status as
  `notifications`/`social_accounts`/`user_blocks`/`user_sessions` found in the same sweep (flagged
  separately, not ticketed against any domain).
- **A11 (`DONE`, 2026-08-10,
  `modules/social/post-impl/docs/MVP/A11_BROADCAST_TIMEZONE_INVESTIGATION.md`) — re-investigated,
  closed not reproducible, no code change:** the original 2026-07-17 report claimed
  `broadcastEndTime`'s JVM-local write vs. Postgres `CURRENT_TIMESTAMP`-UTC read caused a
  near-future broadcast to read as instantly expired. Before implementing the proposed fix,
  `application.yml`'s `hibernate.jdbc.time_zone: UTC` (present since the initial commit, per
  `git blame`) was found to already correctly normalize every naive `LocalDateTime` write to true
  UTC. Empirically re-verified against real dev Postgres (not mocked): created a
  `GROUP_BROADCAST` with an explicit 30s-future `broadcastEndTime`, confirmed it read as active
  throughout the window and correctly expired only after the real 30s elapsed — no premature
  expiry at any point. Likely root cause of the original report: an 8-second test window plus
  ~55s of real elapsed time during manual `curl`/`psql` verification, misdiagnosed as a timezone
  bug. Also corrected a factual claim in the original report — `PATCH
  /api/posts/{postId}/broadcast-end-time` already exists and is reachable today, not a
  hypothetical future risk as originally framed. No regression test added:
  `:server:test` runs against H2 in-memory (Liquibase disabled), which shares the JVM's own clock
  and structurally cannot reproduce this class of bug (app-clock vs. a *separate* DB-server
  clock) — flagged as a testing-infrastructure limitation rather than worked around.
- **A12 (`DONE`, 2026-08-10,
  `modules/social/post-impl/docs/MVP/A12_REMOVE_POSTRESPONSE_SPORTNAME.md`) — removed
  `PostResponse.sportName`, both backend and client:** confirmed before any code change that the
  client's sport badges resolve entirely from `sportId` via `useSportCatalog()`/`sportKeyForId()`
  (SPORT-3) — `Post.sportName` was dead on the wire since SPORT-3 shipped, its only remaining trace
  a stale pre-A9 comment. Removed `SportResponse`/`SportService`/`getSportsForPosts()` from
  `PostServiceImpl` entirely (all 8 `mapToResponse` call sites), dropped the now-unused `sport-api`
  Gradle dependency from `post-impl`, removed `Post.sportName` from the client type and swept every
  other client reference (21 `src/` files + `e2e/mocks/fixtures.ts`/`paginatedFeedFixture.ts`) —
  verified each ambiguous `sportName:` occurrence individually rather than bulk-deleting, since
  `Session`/`Location`/`SportProfile` have their own real, actively-used `sportName` fields.
  `:modules:social:post-impl:test`, `:server:test`, client `tsc -b`, and client Vitest (793/793)
  all pass. 12 of 26 e2e specs failed on a `seedAuthenticatedSession` login timeout — confirmed
  pre-existing/environmental by re-running the same specs against a stashed pre-A12 baseline
  (identical failure count and point), not a regression from this change.
- **MVP backlog:** 21 tickets (A1–A12, A14–A17, B1–B6) in
  `modules/social/post-impl/docs/BACKLOG_MVP.md` — A13 no longer a standalone entry (merged into
  A15); all 21 `DONE`
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
- **A16 (2026-08-12, `DONE`, `modules/social/post-impl/docs/BACKLOG_MVP.md`):** user spotted this
  module's own four `groupService.isGroupOwner(...) || groupService.isGroupAdmin(...)` call sites
  (`createPost`'s `GROUP_BROADCAST` guard, `updatePost`/`deletePost`/`updateBroadcastEndTime`'s
  moderator checks) right after group-impl's **B20** eliminated the identical composition
  internally — migrated all four to the new `canManagePosts(groupId, userId)` cross-domain call
  instead. Pure call-count reduction, no behavior change. `:modules:social:post-impl:test` and
  `:server:test` both green.
- **A17 (2026-08-12, `DONE`, `modules/social/post-impl/docs/MVP/A17_SESSION_POST.md`):** this module's
  half of `session-impl`'s **SESSION-10** — new `PostType.SESSION_POST` + internal-only
  `PostService.createSessionPost` (spoof-guarded like B9's `GROUP_SYSTEM`) + four `CommentService`
  bypass methods for `session-impl` to call. `PostGate.isAvailable` makes `SESSION_POST`
  unconditionally unavailable — this module carries **no** dependency on `session-api`, by design
  (an interim version did add one; reverted same-day). See the session module's §3 entry and §2.11
  above for the full cross-module design record and both ADR reversals.

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
- **B8 (2026-07-20, `modules/social/group-impl/docs/MVP/B8_INVITATION_STATUS_FILTER.md`):** `GET /api/groups/{groupId}/invitations/sent` previously hardcoded its status filter to `pending_owner` only, so it could never return an invitation waiting on the invitee's response — filed for the client's upcoming GRP-3 (Members tab, "waiting for user accept"/"waiting for group approve" sections). Shipped as a single, unfiltered call: the endpoint now always returns both `pending_owner` and `pending_user` rows together in one page, distinguished by each row's `status` (revised same-day from an initial `status` query-param design, once the user compared it against GRP-3's total request count and wanted both statuses in one request rather than one call per status). `GroupService.getMemberSentInvitations` is now `(groupId, inviterId, pageable)`; new `GroupInvitationRepository.findByGroupIdAndInviterIdAndStatusIn`. `:server:test` green (26/26 `GroupControllerTest` cases unaffected). Live `bootRun` verification skipped both times — port 8080 already held by a pre-existing process not started this session, not restarted to avoid disrupting a possibly-in-use dev server.
- **B7 (2026-07-20, `modules/social/group-impl/docs/MVP/B7_GROUP_TYPE_TIERS.md`):** started as an audit-and-confirm ticket for the client's GRP-1 Settings tab (privacy/permission-model checks against `UpdateGroupRequest`/`updateGroupSettings`/`deleteGroup`/`getGroupSettings` — all confirmed already correct, just under-tested; added the missing admin/member Spock cases). The one real finding — `group_settings.max_members` was stored but never validated or enforced anywhere, not on write, not at join time — turned into schema work once a floor-check on the raw value wouldn't have made the cap meaningful: new `group_types` table (migration `V026`) with 3 fixed tiers, DEFAULT/50 (every group's silent default, existing rows backfilled), STANDARD/100, PREMIUM/500; `group_settings.max_members` dropped in favor of `group_settings.group_type_id`; `UpdateGroupSettingsRequest.maxMembers` removed (no more manual cap setting — changing type is a separate flow, filed as **B10**). Cap enforcement — not in the original scope, raised as an explicit decision with the user and built now rather than deferred — added via `GroupServiceImpl.enforceMemberCapacity()`, called from `addMember`/`acceptJoinRequest`/`acceptInvitation`. `:modules:social:group-impl:test` green; full backend `compileJava`/`compileTestJava`/`compileTestGroovy` green (confirms no breakage in `GroupControllerTest`, which never referenced `maxMembers`). `:server:test`'s Testcontainers-backed `GroupControllerTest` not run — no Docker daemon in this environment, pre-existing limitation. No live `bootRun` walkthrough this session — flagged for B10 pickup.
- **B10 (filed 2026-07-20, `modules/social/group-impl/docs/BACKLOG_MVP.md`):** `TODO` — group type change flow (upgrade/downgrade). Filed directly out of B7: groups are silently `DEFAULT` forever today with no way to move to `STANDARD`/`PREMIUM`. Design questions flagged for pickup: who can change type (owner-only vs. an approval/payment gate — tiers read like a monetization surface), the downgrade-below-current-member-count case, and endpoint shape (`PUT .../settings` field vs. dedicated `PUT .../type`).
- **B9 (2026-07-21, `modules/social/group-impl/docs/MVP/B9_GROUP_WELCOME_SYSTEM_POST.md`):** new `GROUP_SYSTEM` post type (migration `V027`), auto-created welcome message ("{name} joined the group 👋" / "...— invited by {inviter} 👋") on `acceptJoinRequest`/`acceptInvitation`, authored by the group's *current* owner (resolved dynamically, no dedicated system-user account — that idea from the original ticket draft was dropped during scoping). `createPost` rejects caller-supplied `GROUP_SYSTEM` (closes the impersonation hole); new internal-only `PostService.createSystemPost`; `updatePost`/`deletePost` reject `GROUP_SYSTEM` unconditionally, even for the nominal author. Bigger-than-planned change: `addMember` no longer inserts a member directly — it now creates a self-approved (`pending_user`) `GroupInvitation` that still requires the friends-only gate and the target's acceptance, collapsing its trigger into the same `acceptInvitation` path (roleName param dropped; promote via `updateMemberRole` after accept). `:modules:social:post-impl:test`, `:modules:social:group-impl:test`, `:server:test` all green (30/30 on `:server:test`, Docker started mid-session).
- **A10 (2026-07-21, `modules/social/group-impl/docs/MVP/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md`):** filed mid-scoping of the client's GRP-6 (Join Group modal multi-select sport filter) once a client-side per-sport fan-out was reversed in favor of a real backend filter. `GET /api/groups/public` gained an optional `sportIds` (`List<Long>`) param alongside the existing single `sportId` (kept for back-compat) — `sportIds`, when non-empty, takes priority over `sportId` rather than the two being combined. Resolved to one canonical list in `GroupServiceImpl` before the repository is touched; both `searchPublicGroupsWithCounts`/`searchPublicGroupsAnon` JPQL changed from `= :sportId` to `IN :sportIds` (a pattern already used elsewhere in this repository for nullable list params, so not a new risk). `:modules:social:group-impl:test` and `:server:test` both green; live-verified against a running `bootRun` instance with 3 real sport-scoped groups (multi-value filter, legacy single filter, no-filter, and priority-when-both-present all confirmed correct against real HTTP responses, not just mocked tests). Unblocks GRP-6 (`client/docs/BACKLOG_MVP.md`).
- **B11 (2026-07-23, corrected 2026-07-24, `modules/social/group-impl/docs/MVP/B11_JOIN_INVITATION_RACE_CONDITIONS.md`):** reconciled the three race conditions between `group_join_requests` and `group_invitations` filed while scoping the client's GRP-7 (full rule diagrams: `documentation/md/adr/JOIN_GROUP_ADR.md` §5). Three rules in `GroupServiceImpl`: (1) `createInvitation` — an owner/admin's own invitation skips `pending_owner`, created directly at `pending_user` (or `accepted`, if rule 2 fires in the same call); (2) every place an invitation is about to enter `pending_user` checks for an existing `pending` join request from the same person first — if found, the invitation goes straight to `accepted` and the join request is marked `accepted` too, not left dangling; (3) `createJoinRequest` — if the requester already has a `pending_user` invitation, a `GroupJoinRequest` row is still created (no synthetic response, no contract change) but directly as `accepted`, crediting the invitation's approver as `reviewedBy`. New shared `finalizeMembership()` helper replaces the capacity+insert+welcome-post block that was about to be duplicated a 4th time. Deliberate consequence, confirmed with the user: rules 2/3 can leave two `accepted` rows (one invitation, one join request) for the same real join event — no merge/suppression added; noted on GRP-7's backlog entry for the client's future display decision. **Follow-up fix (2026-07-24):** the initial pass wired rule 2 into only the two call sites the ADR named, missing a third — `addMember` (B9's owner/admin direct-add) also creates a self-approved `pending_user` invitation and needed the same check; caught by the user re-reviewing the rules against the code, not by the original tests. Fixed by reusing the same `acceptJoinRequestAsSideEffect` helper. `:modules:social:group-impl:test` (117 tests) and `:server:test` both green; all races — including the `addMember` one — live-verified against a running `bootRun` instance with real registered users, friend requests, and group invitations/join requests. Unblocks GRP-7 (`client/docs/BACKLOG_MVP.md`).
- **B16 (2026-08-10, `DONE`, `modules/social/group-impl/docs/MVP/B16_GROUPS_SPORT_ID_PARTIAL_INDEX.md`):**
  `groups.sport_id` (`V015`) had no index at all; the two real consumers
  (`searchPublicGroupsWithCounts`/`searchPublicGroupsAnon`) always filter
  `isActive=true AND isPrivate=false` alongside it — added a partial index
  (`idx_groups_sport_id_public_active`) matching that exact predicate via
  `V047__add_groups_sport_id_public_active_partial_index.sql`. Also removed the confirmed-dead
  `findByIsActiveTrueAndIsPrivateFalseAndSportId` derived method (superseded by A10's list-based
  queries, zero callers). On the live dev data (25 rows) the planner correctly picks a seq scan
  over the index — expected at this row count; forcing `enable_seqscan=off` confirmed the index
  itself is valid and picked (`Index Cond: (sport_id = 1)`).
- **B17 (2026-08-11, `DONE`, `modules/social/group-impl/docs/MVP/B17_DROP_GROUP_TABLES_CROSS_DOMAIN_FKS.md`):**
  filed 2026-08-10 from a repo-wide sweep for cross-domain DB-level FKs (following `post-impl`'s
  A15/A13 precedent), found 5 in this module — `groups.created_by`,
  `groups.recurrence_location_id`, `group_members.user_id`, `group_join_requests.user_id`/
  `reviewed_by` — all pre-date the 2026-07-07 cross-domain-refs rule, all already plain `UUID`/
  `Long` fields at the JPA layer, no `@ManyToOne` anywhere. Dropped via
  `V049__drop_group_tables_cross_domain_fks.sql`, schema-only, no entity/service/DTO change.
  Confirmed `UserServiceImpl.deleteUser()` is soft-delete-only before dropping
  `groups.created_by`'s `ON DELETE CASCADE` — that cascade has never fired in practice. Verified
  live: constraints confirmed via `\d <table>` before/after against the running `sportconnect_dev`
  container, migration applied cleanly via `:server:bootRun` (23ms), server booted and served a
  clean `401` on `/api/groups/public`. `:modules:social:group-impl:test` and `:server:test` both
  green.
- **B18 (2026-08-11, `DONE`, `modules/social/group-impl/docs/MVP/B18_GROUP_ACTIVE_PERMISSION_GATE.md`):**
  `isGroupMember`/`isGroupOwner`/`isGroupAdmin` never checked `group.isActive` — a former member of
  a since-soft-deleted group could still pass every one of these live gates (create posts in it,
  moderate it, list its posts, pass `session-impl`'s group-linked-session gate). Fixed via a new
  `isGroupActive(groupId)` (new `GroupRepository.existsByIdAndIsActiveTrue`, deliberately distinct
  from the existing `findByIdAndIsActiveTrue` to avoid doubling that method's call count in the ~5
  call sites that already fetch the group and then check permissions in the same method) that the
  three permission checks now call first. **Diverged from the ticket's own two suggested
  approaches** — both would have broken a large swath of the 143-test `GroupServiceImplSpec` for
  reasons the ticket didn't anticipate (colliding with ~30 existing `1 *` cardinality assertions on
  `findByIdAndIsActiveTrue`, or with 130 lines already stubbing the `GroupMemberRepository` lookup
  methods for unrelated permission-gating). The distinct-method design needed only one new line in
  `setup()` to keep all 143 existing tests green unchanged. Implemented and verified incrementally
  per explicit user request (add methods → confirm zero impact → wire in → confirm predicted
  74/143 failures → add the `setup()` stub → confirm 143/143 green again → add 8 new dedicated
  tests → 151/151 green). `isGroupActive` is interface-only, no controller endpoint (same
  precedent as `getGroupsWithAutoGenerateSessionsEnabled`) — confirmed with the user before
  building. Live-verified end-to-end against a running `bootRun` instance and the real dev
  Postgres: created a group, confirmed `is-owner`/`is-member` both `true`, soft-deleted the group
  via the existing owner-only `DELETE` endpoint, re-checked all three permission endpoints — all
  now correctly `false`. `:modules:social:group-impl:test` (151) and `:server:test` both green.
- **B19 (2026-08-11, `DONE`, `modules/social/group-impl/docs/MVP/B19_GROUP_GENERAL_DATA_ENDPOINT.md`):**
  new `PUT /api/groups/{groupId}/generalData` (`UpdateGroupGeneralDataRequest`:
  `groupName`/`description`/`avatarUrl`/`coverUrl`/`rules`/`schedule`), alongside the existing `GET
  /{groupId}/info` — closes the asymmetry where that read endpoint had no scoped write counterpart
  and the client had to write `rules`/`schedule` through the generic `updateGroup`/`PUT
  /{groupId}` (`GroupResponse`, which never carries those fields) and manually patch its query
  cache from what it *sent* rather than the server's actual response. `GroupInfoResponse` expanded
  with `description`/`avatarUrl`/`coverUrl` for read/write symmetry.
  `GroupServiceImpl.updateGroupGeneralData` mirrors `updateGroup`'s exact permission
  (owner-or-admin)/partial-update/name-conflict-backstop shape; `getGroupInfo` and this method now
  share one `mapToGroupInfoResponse` helper. `isPrivate` deliberately excluded — stays on
  `updateGroup` as its own immediate-apply toggle. `UpdateGroupRequest`/`PUT /{groupId}` keeps
  accepting `rules`/`schedule` too (not removed) — back-compat precedent, same reasoning as A10
  keeping the legacy `sportId` filter param. Confirmed with the user via two decisions before
  implementing: add alongside (not replacing) `GET /info`, and scope the write DTO to the full
  field set now rather than just `rules`/`schedule`, so future UI doesn't need another backend
  ticket. Unblocks client **GRP-9**. `:modules:social:group-impl:test` and `:server:test`
  (`GroupControllerTest`) both green.
- **B20 (2026-08-12, `DONE`, `modules/social/group-impl/docs/MVP/B20_CAN_MANAGE_SELF_CONTAINED_QUERY.md`):**
  `canManageMembers`/`canManagePosts` composed `isGroupOwner || isGroupAdmin`, each of which
  independently re-checked `isGroupActive`, re-fetched the caller's `GroupMember` row, and
  re-resolved a role by name — redundant work on every non-owner caller (the `||` only
  short-circuits when the caller *is* the owner). Refactored both to a new private
  `hasManagerRole(groupId, userId)` helper: one `isGroupActive` check, one
  `findByGroupIdAndUserId`, one `findById(roleId)` role lookup (mirroring `getUserRoleInGroup`'s
  existing pattern) compared against `"group_owner"`/`"group_admin"`. `isGroupOwner`/
  `isGroupAdmin`/`isGroupMember`/`isGroupActive` themselves unchanged — confirmed they still have
  standalone callers (`/permissions/is-owner`/`is-admin` endpoints, B7 tier logic) so weren't
  touched. Confirmed with the user before implementing that the client doesn't consume the
  standalone `/permissions/is-owner`/`is-admin` endpoints (only a planned future check for a
  not-yet-built "create broadcast" action), so this was a safe internal-only refactor with no
  client-facing behavior change. `:modules:social:group-impl:test` green. Same-session follow-up:
  `post-impl` **A16** migrated its own 4 identical `isGroupOwner || isGroupAdmin` call sites to
  `canManagePosts` too.

#### `modules:notification:notification-api` + `modules:notification:notification-impl`
- **NTF-1 (2026-08-17, `DONE`, `modules/notification/docs/MVP/NTF-1_MODULE_SCAFFOLDING.md`):** new module scaffolding — `Notification` entity (`V053` migration, replaces the dead `V005` table which had zero owning code and cross-domain FKs to `users(id)`) with ID-only `recipientUserId`/`entityId` (`entityId` is a `String`, deliberately untyped — spans domains with incompatible id types, `Long` for `Post`/`Group`/`Session`, `UUID` for `FriendRequest`/`Friendship`), aggregation upsert keyed on `(recipientUserId, type, entityType, entityId)` scoped to unread, bounded 3-entry `actorIds` via a small `UuidListConverter` (no array-column precedent in this codebase); `NotificationGate implements ResourceGate<Notification>` (trivial `isAvailable`, ownership-only `isVisibleTo`); `GET /api/notifications`, `GET /api/notifications/unread-count`, `PUT /api/notifications/{id}/read`. **Delta from the ticket's own text:** no explicit `isActive` re-check added (locked in with the user before design) — inherits the same app-wide JWT-only gating gap (U12) every other endpoint has today, rather than being the first module to close it. First real caller of `recordEvent` will be NTF-2's RabbitMQ consumer. Depends on C3 (`modules/common`'s transactional outbox).
- **NTF-2 (2026-08-17, `DONE`, `modules/notification/docs/MVP/NTF-2_RABBITMQ_CONSUMER.md`):** `sportconnect.events` consumer — **scoped to session events only** (the ticket's original text covered all 4 domains, but only `session-impl`'s SESSION-15 has a real producer; `post-impl`/`group-impl`/`user-impl`'s outbox tickets are still `TODO`, so their consumption is deferred to follow-on tickets, matching the vision doc's session > post > group > friend rollout priority). `SessionEventsConsumer` (`@RabbitListener`, queue `notification.events.session`, pattern `session.*.*`) deserializes SESSION-15's 6 event DTOs and delegates to `SessionEventProcessor` (a separate `@Transactional` bean — `@Transactional` on a self-invoked method would've silently never gone through the Spring proxy). **Duplicate-delivery dedup built now, not deferred:** `common`'s `OutboxRelay` gained a deterministic AMQP `messageId` (`routingKey:rowId`); a new `processed_messages` marker table (`V055`) makes a RabbitMQ redelivery a safe no-op in the same transaction as the resulting `recordEvent` call(s). Fan-out events (comment created, participant joined) resolve recipients via a new `SessionService.getParticipantIdsByStatuses` (session-api), gated on the session's own status — no notifications at all for a `CANCELLED`/`COMPLETED` session, even for an event published before the status changed; single-recipient events skip self-notification. Malformed/unroutable messages are logged and dropped (permanent failures), while a genuine processing failure is left to propagate for RabbitMQ's normal retry. **Bean-name collision caught by `:server:test`, not module tests:** `session-impl`'s `SessionOutboxRabbitConfig` and this ticket's first draft both declared a `@Bean TopicExchange sportconnectEventsExchange()` — fine in isolation, `BeanDefinitionOverrideException` in the real merged `server` context. **Dedup mechanism itself was broken on the first pass — added `SessionEventsConsumerIntegrationTest` (new `RabbitMqTestContainerBase`, chained onto the existing `RedisTestContainerBase`) after the user asked whether IT coverage existed, and it immediately caught two compounding JPA bugs no Spock spec could see:** (1) `ProcessedMessage.messageId` has no `@GeneratedValue`, so Spring Data's default new-entity check silently routed `save()` through `merge()` (select-then-update) instead of `persist()` — a genuine duplicate never actually threw, it just quietly updated the same row, so redelivery doubled `actorCount` instead of being deduped; (2) forcing `persist()` via `Persistable.isNew()` surfaced that catching the resulting `DataIntegrityViolationException` in application code doesn't help — Spring/JPA marks the transaction rollback-only the instant the low-level exception occurs, so it still failed to commit with `UnexpectedRollbackException`. Fixed by replacing both with `ProcessedMessageRepository.insertIfAbsent`, a native `INSERT ... ON CONFLICT DO NOTHING` that never throws — a duplicate just returns 0 affected rows. Live-verified end-to-end against the real dev stack too: a real HTTP-triggered session invite produced a real `Notification` row; a real join produced the correctly-resolved fan-out (recipient = the other `JOINED` participant, actor correctly excluded from its own notification). Unblocks nothing further yet — NTF-3 (STOMP delivery) and the deferred post/group/friend consumption are next.
- **NTF-3 (2026-08-17, `DONE`, `modules/notification/docs/MVP/NTF-3_STOMP_LIVE_DELIVERY.md`):** STOMP-over-RabbitMQ live delivery — Spring WebSocket STOMP in broker-relay mode (`/ws`, no SockJS), auth via `StompAuthChannelInterceptor` reading the JWT off the CONNECT frame's `Authorization` header (`auth-api`'s `JwtTokenService`, same interface `JwtAuthenticationFilter` uses internally — no query-param workaround needed, unlike `services/chat`'s WS route, since STOMP frames support custom headers). **Mid-ticket architecture pivot, confirmed with the user:** raised the question of whether STOMP makes sense given the future mobile phase — iOS forbids background WebSocket entirely, structurally the same gap FCM/APNs exist to solve. Decided **hybrid**: STOMP stays scoped to web/in-app/connected-session delivery only, FCM deferred to the (already-`PROGRESS.md`-earmarked) mobile phase as a separate future ticket — documented in the vision doc's Client delivery bullet, `PROGRESS.md` §2.7, and this ticket's own Delta note so a future reader doesn't assume STOMP extends to mobile. `SessionEventProcessor` publishes a `NotificationLiveUpdateEvent` per recipient after `recordEvent` (now returning `NotificationRecordResult(notificationId, unreadCount)` instead of `void`); `NotificationLiveUpdateListener` (`@TransactionalEventListener(AFTER_COMMIT)` — a different concern from the vision doc's earlier outbox-durability discussion of the same annotation, documented as such) pushes via `NotificationPushService`/`SimpMessagingTemplate.convertAndSendToUser`, fanning out to every tab/device the recipient has open. Payload is a lightweight ping (`notificationId`, `unreadCount`), not the full `NotificationResponse`. **`reactor-netty` had to be added** — `StompBrokerRelayMessageHandler` needs it and it doesn't come transitively from `spring-boot-starter-websocket`; missing it broke every `@SpringBootTest` in the server module, not just this ticket's own. Client: minimal `useNotificationLiveSocket`/`useUnreadNotificationCount` hooks (`@stomp/stompjs`, new dependency) wired into `AppShell`, a placeholder unread badge on `TopBar` (CLIENT-NOTIF-1 replaces it with the real dropdown), new `/ws` Vite proxy entry. New `NotificationStompIntegrationTest` (real `@SpringBootTest(RANDOM_PORT)`, real RabbitMQ+STOMP via a new `RabbitMqStompTestContainerBase`) proves a consumed session event produces a real STOMP frame end to end — hit and fixed three Windows/Testcontainers-specific gotchas along the way (file-mounting the STOMP plugin was unreliable on this host, fixed via a live `rabbitmq-plugins enable` call instead; the default host-port wait strategy was flaky, switched to a log-message wait; the broker-relay's own connection is async, needed an `isBrokerAvailable()` poll before the test's client connects). Also live-verified against the actual running dev stack (`docker compose` RabbitMQ recreated with the plugin, real `:server:bootRun`, real `@stomp/stompjs` script) both directly and through the real Vite dev proxy — full browser-visual confirmation wasn't possible in this environment (no Chrome extension connection), but everything upstream of the TopBar's own rendering (already Vitest/RTL-covered) is verified. Closes out the notification module's MVP backlog (NTF-1/2/3 all `DONE`).
- **NTF-4 (2026-08-18, `DONE`, `modules/notification/docs/MVP/NTF-4_NOTIFICATION_RESPONSE_ENRICHMENT.md`):** filed mid-pickup of the client's `CLIENT-NOTIF-1` — NTF-1 deliberately shipped `NotificationResponse` with zero enrichment (raw `actorIds`/`entityId`), which would leave the client dropdown unrenderable. `NotificationResponse` gains `actors: List<NotificationActorSummary>` (`id`/`fullName`, batch-resolved via `user-api`'s existing `getUsersByIds`) and `entityTitle` (nullable; the session's `title` for today's SESSION-only scope, via a new `SessionService.getSessionTitlesByIds` batch method on `session-api`, `null` for any future entityType). `NotificationServiceImpl.getNotifications` collects every distinct actor/session id across the whole page before mapping, one batch call each (skipped entirely on an empty page) — same no-N+1 shape as `SessionServiceImpl`'s existing batch-resolution pattern. Same "server denormalizes a display name" precedent as `SessionResponse.createdByFullName`.

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

**HF-00 (scaffolding) is DONE** (2026-07-06, `client/docs/MVP/HF-00_PROJECT_SCAFFOLDING.md`): Vite 7 +
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
- `notifications` — dead, will be **dropped and replaced** (not reused) by a new domain-owned table
  under `modules/notification`, per `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`
  (2026-08-16) — this table's cross-domain FKs and stale `type`/`entity_type` enum predate current
  rules and don't cover `group`/`session`
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

**HF-0 DONE** (2026-07-06, `client/docs/MVP/HF-0_SHARED_TYPES_AND_MOCK_DATA.md`): home-feed types +
mock data ported from the approved mockup (dynamic timestamps, coverage criteria encoded as Vitest
assertions).

**HF-10a DONE** (2026-07-06, `client/docs/MVP/HF-10a_VISUAL_REGRESSION_HARNESS.md`): visual-regression
harness — reference mockup moved to `client/design-reference/` with the Tabler icon font vendored
(the mockup's CDN link was a 404), 9 committed baselines (375/768/1280px × default/basketball/empty)
under `e2e/visual/__screenshots__/`, deterministic re-runs verified. Phase 0 is complete —
HF-1..HF-6 component tickets are unblocked and parallelizable.

**HF-1 DONE** (2026-07-06, `client/docs/MVP/HF-1_TOPBAR_NAVTABS.md`): TopBar + NavTabs in `src/shared/`
plus the shadcn/ui foundation (token-styled Button/Avatar, `cn()`, `components.json`, `@/` alias),
`@tabler/icons-react`, new design-system utilities (`border-hairline`, `max-w-frame`, 11/13px type
steps), and an `AppShell` layout route giving every page the shared shell with real NavTabs
navigation. 13/13 unit tests, e2e click-through, Storybook stories all green.

**HF-2 DONE** (2026-07-06, `client/docs/MVP/HF-2_SPORTSWITCHER.md`): shared SportSwitcher — controlled
pill row with synthetic "All" pill, 2px accent active border, always-visible dashed "Add sport"
(aria-disabled at the 3-sport cap — mockup parity decision, supersedes the spec's hide-at-cap rule),
pills wrap on narrow screens. Sport types re-homed to `src/shared/types/sport.ts`; shared
`getSportIcon()` registry added. 18/18 tests, 4 Storybook stories verified against the mockup.

**HF-3 DONE** (2026-07-06, `client/docs/MVP/HF-3_POSTCARD_FEED.md`): PostCard + Feed — controlled like
toggle (parent owns state), ramp sport badges, clickable hashtags, per-sport empty state, relative
time via date-fns behind a shared `formatRelativeTime()` helper; new `rampStyles` static class map
and directional `border-hairline-t/b` utilities (fixing a border-stacking bug that also affected
NavTabs). 27/27 tests, 7 Storybook stories, badge colors verified by computed style.

**HF-4 DONE** (2026-07-06, `client/docs/MVP/HF-4_UPCOMINGMATCHES.md`): UpcomingMatches right-rail card —
sport-filtered match list capped at 4 visible (`maxVisible` prop; spec's open question resolved),
open/full CTAs distinct by text, per-match `aria-label`s, new shared `formatStartTime()` (future
counterpart of `formatRelativeTime`). Mock-backed for the whole MVP — no matches backend exists.
40/40 tests, 5 Storybook stories verified against the mockup.

**HF-5 DONE** (2026-07-07, `client/docs/MVP/HF-5_TRENDINGHASHTAGS.md`): TrendingHashtags right-rail
card — full-row clickable hashtag buttons (tag accent left, muted count right), caller-provided
order enforced by test, long tags truncate, muted empty state. Stays global (epic open question #1
resolved: no activeSport filter); FEED-6 later swaps mock for `GET /api/hashtags/trending`.
44/44 tests, 3 Storybook stories verified against the mockup.

**HF-6 DONE** (2026-07-07, `client/docs/MVP/HF-6_GROUPBROADCASTS.md`): GroupBroadcasts right-rail card —
clickable broadcast rows (spec wins over the mockup's static divs), ramp initials avatars,
shared relative time, `line-clamp-2` messages (screenshot check caught that `block` +
`line-clamp-2` silently disables clamping — never combine them). Global like HF-5; FEED-7 later
swaps mock for `GET /api/posts/broadcast`. 48/48 tests, 3 Storybook stories.

**HF-7 DONE** (2026-07-07, `client/docs/MVP/HF-7_HOMEFEEDPAGE.md`): HomeFeedPage assembled — the full
Home Feed screen is now live at `/`. `useHomeFeedData()` hook (CLAUDE.md `{ data, isLoading,
isError }` shape supersedes the epic's flat sketch — this is the FEED/SPORT de-mock seam),
page-local `activeSport` driving Feed + UpcomingMatches in one render pass, synchronous like
toggle, md (768px) rail-stacking breakpoint. Verified in a real browser at 1280/375px.
55/55 tests. **Phase 2 (page integration) complete.**

**HF-8 DONE** (2026-07-07, `client/docs/MVP/HF-8_RESPONSIVE_A11Y_PASS.md`): responsive + a11y pass —
committed axe/overflow gate (`e2e/flows/a11y.spec.ts`, @axe-core/playwright) at 375/768/1280.
Sport ramps pass AA (8.3–8.9:1); two real failures found and fixed: `text-muted` darkened
#888780→#6e6d66 (was 3.4:1; reference HTML updated, 9 baselines regenerated) and NavTabs
overflowed 375px (now scrolls within itself). Keyboard walk verified. 8/8 e2e, 9/9 visual, 55/55 unit.

**HF-10b DONE** (2026-07-07, `client/docs/MVP/HF-10B_VISUAL_REGRESSION_CI_GATE.md`): full-page visual
regression + the repo's **first CI** (`.github/workflows/client-ci.yml`: lint/tsc/unit/e2e/visual
on PRs touching `client/**`, + PR template). One-time human mockup-parity review passed, then
baselines re-taken from the real page (frozen clock) — ongoing gate is tight self-regression
diffing (mockup pixel-match is impossible: computed times, SVG vs webfont icons). Token audit
clean. Manual bootstrap remains: Linux baseline artifact swap + marking the check required
(documented in the summary).

**HF-11 DONE** (2026-07-07, `client/docs/MVP/HF-11_E2E_HOME_FEED_JOURNEY.md`): 7-step Home Feed E2E
journey (`e2e/flows/home-feed-journey.spec.ts`) — load, sport filter, clear, like round-trip,
hashtag/CTA reachability (no-op callbacks asserted as such — premise corrections vs the epic),
Add-sport at-cap state. No MSW (all mock-driven); the MSW handler follow-ups for FEED/SPORT
tickets are recorded on the spec + backlog. 9/9 e2e, 55/55 unit.

**HF-9 DONE — HOME FEED EPIC CLOSED** (2026-07-07, `client/docs/MVP/HF-9_QA_ACCEPTANCE_CHECKLIST.md`):
all 7 acceptance items executed — 6 pass with evidence (Storybook build, 56/56 unit incl. new
repeated-toggle math test, 9/9 e2e, 9/9 visual, HF-10b token audit); item 7 (E2E green *in CI*)
conditional — CI has never executed. Follow-up **HF-12** (CI bootstrap + first green run, mostly
manual GitHub steps) added to the backlog as the epic's release condition. All 14 HF tickets done;
next is Phase 5 (MSW-0/AUTH-0; re-verify auth backlog A2 first).

**HF-12 DONE — CI LIVE AND GREEN** (2026-07-08, `client/docs/MVP/HF-12_CI_BOOTSTRAP.md`): repo work
pushed to GitHub; first `client-ci` runs caught a real bug (`**/lib` gitignore swallowed
`client/src/shared/lib` — CI-only TS2307s, fixed with scoped negation); Linux baselines swapped
via the update-baselines dispatch artifact (PR #2); **fully green run merged**. HF-9 item 7
resolved → Home Feed epic release condition met. Caveat: branch protection unavailable (GitHub
Free + private repo) — red checks block by convention only.

**AUTH-0 DONE** (2026-07-08, `client/docs/MVP/AUTH-0_TYPES_API_CLIENT_STORE.md`): auth types
(`src/features/auth/types.ts`), shared `ApiResponse<T>` envelope (`src/shared/types/api.ts`, new),
axios `apiClient` (`withCredentials`, `/api` proxy, separately-testable `attachAuthHeader`
interceptor), Zustand `authStore` (no persist middleware — the point). Resequenced ahead of MSW-0
(user decision — MSW-0's own acceptance criteria needs this ticket's types first). Backend gap
found and fixed along the way: `AuthServiceImpl.toUserResponse()` was missing `avatarUrl`/
`phoneNumber` entirely (only 6 of the real `UserResponse`'s fields), which the epic doc's own
"reality check" had missed — added both, `HashMap` replacing the null-hostile `Map.of(...)`.
8/8 new unit tests, 64/64 full suite, strict `tsc`, lint, and build all clean.

**MSW-0 DONE** (2026-07-08, `client/docs/MVP/MSW-0_MOCK_SERVICE_WORKER_HANDLER_SETUP.md`): browser-mode
MSW wired into a Playwright fixture (`e2e/mocks/test.ts`, `page.addInitScript` dynamic-imports
`e2e/mocks/server.ts` by URL — `src/` never imports MSW, zero production bundle impact). Scoped to
auth handlers only (`e2e/mocks/handlers/auth.ts`) — feed/groups/sport handlers deferred to
FEED-0/FEED-6/FEED-7/SPORT-1, same resequencing principle as AUTH-0. Self-verifying proof spec
(`e2e/flows/msw-setup.spec.ts`, 4/4 passing) asserts `response.fromServiceWorker()` since no login
UI exists yet to drive this through. 13/13 e2e, 64/64 unit, clean build.

**AUTH-1 DONE** (2026-07-09, `client/docs/MVP/AUTH-1_LOGIN.md`): Login — two-column card
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

**AUTH-2 DONE** (2026-07-09, `client/docs/MVP/AUTH-2_REGISTER.md`): Register — `RegisterPage`/
`RegisterForm` against `POST /api/auth/register` (auto-logs-in, same `AuthResult` shape as login).
Extracted `AuthShell` from `LoginPage`'s inlined two-column shell so Login and Register share the
same illustration/tagline panel (no `design-reference-register.html` exists; user confirmed reusing
Login's shell plus a disabled OAuth row for visual parity). Found jsdom hardcodes
`tooShort: () => false`, so `minLength` never blocks submission under Vitest/RTL — replaced that
test with an attribute assertion and verified the real constraint manually against a live browser +
the real backend instead. Verified against the real running backend via a throwaway Playwright spec
(fresh registration → auto-login → Home Feed; duplicate email → real `"Email already registered"`
inline, no redirect). 91/91 unit tests, clean build.

**AUTH-3 DONE** (2026-07-09, `client/docs/MVP/AUTH-3_SESSION_BOOTSTRAP.md`): Session bootstrap on app
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
— see **A4** (`modules/auth/docs/MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`). 95/95 client unit tests,
auth-impl suite green, clean build.

**AUTH-4 DONE** (2026-07-10, `client/docs/MVP/AUTH-4_PROTECTED_ROUTE_LOGOUT.md`): ProtectedRoute +
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

**HF-14 DONE** (2026-07-10, `client/docs/MVP/HF-14_REGENERATE_VISUAL_BASELINES.md`): regenerated
Home Feed's 9 committed visual-regression baselines via the `update-baselines` CI dispatch,
following AUTH-4's TopBar avatar-menu change (same pattern as HF-13's `cn()` follow-up). Diffed old
vs. new before replacing (all 9 genuinely changed) and human-reviewed two of them — the avatar
chevron renders correctly, nothing else shifted.

**AUTH-5 DONE** (2026-07-11, `client/docs/MVP/AUTH-5_401_REFRESH_RETRY_INTERCEPTOR.md`): 401
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

**AUTH-6 DONE** (2026-07-12, `client/docs/MVP/AUTH-6_AUTH_HARDENING.md`): auth hardening — scope split
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

**AUTH-8 DONE** (2026-07-13, `client/docs/MVP/AUTH-8_E2E_AUTH_JOURNEY.md`): E2E auth journey — ships 6 of
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

**AUTH-7 DONE** (2026-07-13, `client/docs/MVP/AUTH-7_QA_ACCEPTANCE_CHECKLIST.md`): QA/acceptance pass
for the whole auth epic — 5/5 items pass. Drove the real UI (no MSW) against a real running backend
with a standalone Playwright script: register → auto-login → reload-persists-session → logout →
deep-link-redirect → re-login, 8/8 assertions green, zero tokens ever in `localStorage`/
`sessionStorage`. Re-verified BE-1/BE-2 directly against `AuthController.java` source (cookie-based
refresh, header-derived logout with no query param — confirmed live via `curl`, not just trusted from
the backlog note). `pnpm e2e` (29/29, including both `auth-journey.spec.ts` tests), `pnpm test`
(124/124), clean `tsc -b`/lint used as a local proxy for the "passes in CI" item, since this session
has no GitHub Actions access — flagged as a follow-up for a human to confirm on the actual
`client-ci` run. **Phase 5 (auth integration) is now fully closed.**

**FEED-0 DONE** (2026-07-13, `client/docs/MVP/FEED-0_TYPES_TANSTACK_QUERY_HOOKS_SCAFFOLD.md`): Phase 6
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

**A9 DONE** (2026-07-13, `modules/social/post-impl/docs/MVP/A9_POSTRESPONSE_MISSING_FIELDS.md`): fixed
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

**A10 DONE** (2026-07-14, `modules/social/post-impl/docs/MVP/A10_FIX_HASHTAG_ENDPOINT_500.md`): fixed
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

**FEED-1 DONE** (2026-07-14, `client/docs/MVP/FEED-1_FEED_POSTCARD_REAL.md`): de-mocked Home Feed's
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

**HF-15 DONE** (2026-07-14, `client/docs/MVP/FEED-1_FEED_POSTCARD_REAL.md`): regenerated Home Feed's
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

**FEED-2 DONE** (2026-07-14, `client/docs/MVP/FEED-2_COMMENTSECTION_REAL.md`): built a new real comment
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

**FEED-2 addendum** (2026-07-14, same day, `client/docs/MVP/FEED-2_COMMENTSECTION_REAL.md`): a
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

**FEED-3 DONE** (2026-07-14, `client/docs/MVP/FEED-3_CREATEPOSTFORM_REAL.md`): built the real post
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

**FEED-4 DONE** (2026-07-15, `client/docs/MVP/FEED-4_GROUP_SWITCHING_REAL.md`): built group switching as
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

**FEED-5 DONE** (2026-07-15, `client/docs/MVP/FEED-5_GROUP_CREATE_JOIN_MODALS.md`): wired real group
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

**SPORT-1 DONE** (2026-07-15, `client/docs/MVP/SPORT-1_SPORT_SWITCHER_REAL.md`): de-mocked
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

**FEED-6 DONE** (2026-07-15, `client/docs/MVP/FEED-6_TRENDINGHASHTAGS_REAL.md`): de-mocked
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

**FEED-7 DONE** (2026-07-16, `client/docs/MVP/FEED-7_GROUPBROADCASTS_REAL.md`): de-mocked
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

**FEED-8 DONE** (2026-07-16, `client/docs/MVP/FEED-8_INTEGRATION_HARDENING.md`): loading skeletons +
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

**FEED-10 DONE** (2026-07-16, `client/docs/MVP/FEED-10_E2E_FEED_GROUPS_JOURNEY.md`): new
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

**FEED-9 DONE** (2026-07-17, `client/docs/MVP/FEED-9_QA_ACCEPTANCE_CHECKLIST.md`): manual QA pass against
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

**MSW-1 DONE** (2026-07-17, `client/docs/MVP/MSW-1_STANDALONE_MOCK_SERVER.md`): replaced MSW's
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

**FEED-12 DONE** (2026-07-17, `client/docs/MVP/FEED-12_COMMENT_MODAL_DEEP_LINK.md`): `/posts/:postId` is
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

**FEED-11 DONE** (2026-07-18, `client/docs/MVP/FEED-11_POST_MODAL_VISUAL_REGRESSION.md`): new
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

**GRP-1 DONE** (2026-07-20, `client/docs/MVP/GRP-1_GROUP_PAGE_RESTRUCTURE.md`): first ticket of the
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

**GRP-2 DONE** (2026-07-21, `client/docs/MVP/GRP-2_SETTINGS_TAB_FULL_DATA_SET.md`): extended the Settings
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

**GRP-3 DONE** (2026-07-21, `client/docs/MVP/GRP-3_MEMBERS_TAB.md`): new Members tab in `GroupTabs`
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

**GRP-6 DONE** (2026-07-21, `client/docs/MVP/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md`): supersedes
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

**FRIEND-1 DONE** (2026-07-22, `client/docs/MVP/FRIEND-1_FRIENDS_PAGE.md`): built exactly as scoped
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

**GRP-4 DONE** (2026-07-22, `client/docs/MVP/GRP-4_INVITE_FRIEND_REAL.md`): `InviteFriendModal` now runs
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

**GRP-7 DONE** (2026-07-24, `client/docs/MVP/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`, resumed once
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
`client/docs/MVP/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`): user-requested — a "Cancel" button on
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

**B13 DONE** (2026-07-24, `modules/social/group-impl/docs/MVP/B13_INVITATION_REJECT_REASON.md`): invitee
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

**B14 DONE** (2026-07-25, `modules/social/group-impl/docs/MVP/B14_INVITATION_CO_INVITER_TRACKING.md`):
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

**B15 DONE** (2026-07-25, `modules/social/group-impl/docs/MVP/B15_INVITATION_SPORT_ID.md`):
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

**GRP-8 DONE** (2026-07-25, `client/docs/MVP/GRP-8_INVITATION_LIFECYCLE_POLISH.md`): five-part Groups-page
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

**GRP-9 DONE** (2026-08-11): moved the Settings tab General section's rules/schedule save off the
generic `useUpdateGroup`/`PUT /{groupId}` and onto the new dedicated `useUpdateGroupGeneralData`/
`PUT /{groupId}/generalData` (backend **B19**, filed and shipped same session). Removed a
workaround along the way: the old path patched the `groupInfo` query cache manually from what was
*sent*, since `updateGroup`'s `GroupResponse` return shape never carries `rules`/`schedule`; the
new endpoint returns a real `GroupInfoResponse`, so the cache is now set from the server's actual
response, matching every other mutation hook in the codebase. `currentUserId` dropped from
`useSettingsUnsavedGuard`'s signature (dead once the old `useUpdateGroup(currentUserId)` instance
was removed) — `GroupsPage.tsx`'s call site updated. `GroupInfo`/`UpdateGroupGeneralDataPayload`
types expanded to match B19's DTO (`description`/`avatarUrl`/`coverUrl` alongside
`rules`/`schedule`) — no new UI for those fields yet, matching B19's own scope decision. New MSW
handler for `PUT /api/groups/:groupId/generalData`. `pnpm vitest run` 795/795 green, `tsc -b`
clean, lint clean.

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
`services/chat/docs/MVP/CHAT-5_REPOSITORY_CACHE_INTEGRATION_TESTS.md`):** `internal/conversation`'s,
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
`services/chat/docs/MVP/CHAT-6_WEBSOCKET_SYNC_RESILIENCE_TESTS.md`):** real WebSocket broadcast-fan-out
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
`services/chat/docs/MVP/CHAT-7_CHAT_API_CLIENT_AND_DATA_HOOKS_SCAFFOLD.md`):** first client-side chat
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
`services/chat/docs/MVP/CHAT-8_WIRE_GROUP_CHAT_TAB.md`):** `GroupChatTab`'s local-state-only mock swapped
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
`services/chat/docs/MVP/CHAT-9_WIRE_FRIEND_CHAT_PANEL.md`):** `FriendChatPanel`'s local-state-only mock
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
`services/chat/docs/MVP/CHAT-13_EDIT_DELETE_MESSAGES.md`):** filed unscoped with 5 open questions;
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
`services/chat/docs/MVP/CHAT-15_TYPING_INDICATORS.md`):** filed unscoped with 3 open questions; resolved
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
`client/docs/MVP/FRIEND-1_FRIENDS_PAGE.md`):** leaving the Friends page and coming back now restores the
rail's mode (friend list vs. directory search), search text, and selected person — previously all
three reset on every remount. New `friendsPageStore` (sessionStorage-persisted, same convention as
`feedSpaceStore`) replaces `useFriendsPageData`'s local `useState` for `query`/`isAddMode`/
`selectedPersonId`. The underlying friends/requests/search lists always refetch fresh on remount
already (TanStack Query's default `staleTime: 0`, shared cache across route changes) — no extra
wiring needed there. A restored selection that no longer resolves to anyone once the reloaded lists
settle clears back to "no selection" rather than lingering. `pnpm test` 529 green, `tsc -b`/lint clean.

**CHAT-10 — E2E + MSW handlers for chat (2026-07-28,
`services/chat/docs/MVP/CHAT-10_E2E_MSW_HANDLERS.md`):** picked up ahead of its listed order — CHAT-16
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
(`infra/documentation/MVP/INFRA-3_HOSTING_DECISION.md`), whereas a pub/sub SaaS offloads that entirely.
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

**HF-13 DONE** (2026-07-09, `client/docs/MVP/HF-13_REGENERATE_VISUAL_BASELINES.md`): regenerated
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
- **Hosting decision (2026-07-08, `infra/documentation/MVP/INFRA-3_HOSTING_DECISION.md`):** AWS,
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

**A2** (`modules/auth/docs/MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md`): refresh token moved to an
httpOnly `Set-Cookie` (profile-conditional `Secure`, `SameSite=Strict`, `Path=/api/auth`);
`AuthResponse.refreshToken` now `@JsonIgnore`d, never in the JSON body. Verified live against a
running server (Docker Postgres/Redis), not just mocked tests.

**A3** (`modules/auth/docs/MVP/A3_FIX_LOGOUT_AUTHORIZATION.md`): `/api/auth/logout` now derives the
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
- **Notifications service** — vision scoped 2026-08-16:
  `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`. New `modules/notification` domain
  (event-driven via RabbitMQ, not direct cross-domain calls), a shared transactional-outbox
  mechanism in `modules/common` (C3) that each producing domain builds on, aggregated
  per-recipient notifications (resets on read), STOMP-over-RabbitMQ live delivery to the client.
  Replaces the dead `V005` `notifications` table. v1 event scope, in rollout priority order:
  session (comments, join requests/invites — closes `NOTIF-1`) > post (likes, comments, thread
  replies) > group (join requests/invites) > friend (request received/accepted, closes `U1`'s
  `// TODO: notify` stub). Tickets filed: `common` C3, `modules/notification` NTF-1..3, `post-impl`
  B7, `group-impl` B21, `session` SESSION-15, `user-impl` U13, `client` CLIENT-NOTIF-1 — all `TODO`.

### Session & Location System (backend implemented 2026-07-30; client fully landed 2026-07-31)
- Full design: `documentation/md/SESSION_LOCATION_DESIGN.md`. Two new domains:
  **`modules/location`** (LOC-1, `DONE`) — a shared, crowdsourced, sport-scoped venue directory.
  Any authenticated user can add a `Location` (name, address, optional PostGIS point). No paid
  map API: a "Find on Google Maps" link-out button + paste-the-share-link-back flow, with the
  backend parsing (or, for short `maps.app.goo.gl` links, resolving via an SSRF-guarded
  domain-allowlisted redirect follow) coordinates out of the pasted URL — rendering is a free
  OpenStreetMap/Leaflet preview on the client. `claimedByVendorId` is a bare placeholder for a
  future Vendor/Facility feature to claim a `Location`.
  **`modules/session`** (SESSION-1/SESSION-2/SESSION-3, all `DONE`) — scheduled sports
  activities, group-linked (owner/admin-gated) or standalone (open to any user), always
  referencing a `Location` by id validated to match the session's sport. Minimal join/leave
  participation. Full status lifecycle: `SCHEDULED` → `ONGOING` → `COMPLETED` (automatic,
  job-driven) or `CANCELLED` (manual only, soft — `deleteSession` was removed entirely in
  SESSION-3, replaced by `cancelSession`/`POST /api/sessions/{id}/cancel`, which records
  `cancelReason`/`cancelledBy`/`cancelledAt`). `GROUP-RECUR-1` (`DONE`, in `group-impl`) added
  structured recurring-session-schedule fields to `Group` (day-of-week/time/duration/
  `recurrenceLocationId`, alongside the untouched free-text `schedule`) and an
  `autoGenerateSessions` toggle on `GroupSettings`; SESSION-2 added this repo's first
  scheduled-job infrastructure (`SchedulingConfig` + `SessionGenerationJob`, hourly generate the
  next occurrence / 15-min start `ONGOING` + close past sessions).
- New endpoints: `/api/locations/**`, `/api/sessions/**`, `GET`/`PUT /api/groups/{id}/recurrence`.
- **Client:** `CLIENT-LOC-1` (`DONE`, 2026-07-31, `client/docs/MVP/CLIENT-LOC-1_LOCATIONPICKER_COMPONENT.md`)
  — the shared `LocationPicker` component (search + Google-Maps-link paste-and-resolve +
  draggable OSM/Leaflet preview pin + Get Directions deep-link). New client dependency:
  `leaflet` + `react-leaflet@^4` (pinned to v4.x — v5 needs React 19, this app is on React 18.3.1).
  `CLIENT-SESSION-1` (`DONE`, 2026-07-31, `client/docs/MVP/CLIENT-SESSION-1_SESSION_UI.md`) — the real
  `/matches` page (replacing `ComingSoonPage`; nav tab was already wired to it), fully de-mocking
  `UpcomingMatches`: list (caller's standalone sessions + every group they belong to's sessions —
  no batch/discovery endpoint exists, a flagged backend gap), sport filter, create (standalone or
  for a group the caller owns/admins, via `LocationPicker`), detail dialog with join/leave and
  creator/owner/admin-gated cancel. Fixed a real integration bug found while wiring this up:
  `useLocationPickerData`'s returned field names never matched `LocationPickerProps`' expected
  names (CLIENT-LOC-1 shipped with no page consuming it, so nothing caught the mismatch).
- Deferred: full Calling System (Session Calling/Game Calling posts, slot-filling),
  geo-proximity/nearby search, Vendor/Facility claiming, `Location` editing, in-app routing,
  `TOURNAMENT`/`TRAINING` session types (enum reserved only), capacity/waitlist, session edit UI
  (hook exists, no UI), wiring group recurrence config into the Groups page Settings tab.
- **`LOC-2` (`DONE`, 2026-08-02, `modules/location/docs/MVP/LOC-2_FAVORITE_LOCATIONS.md`)**
  — favorite/unfavorite a `Location` + list favorites by sport (`user_favorite_locations` join
  table, no `sportId` column — always resolved via a join to `Location.sportId`). Favoriting
  requires an active `UserSportProfile` for the location's sport (`hasProfileForSport`, the same
  gate `createGroup` uses). Found and fixed a real pre-existing bug while verifying against a live
  server: a missing required `@RequestParam` (e.g. `sportId`) fell through to the generic 500
  handler instead of 400 — `GlobalExceptionHandler` had no `MissingServletRequestParameterException`
  mapping; added one, which also fixes the same latent bug on `GET /api/locations/search`. Client
  follow-up (favorites dropdown in `CreateSessionModal`, favorite-heart toggle in `LocationPicker`)
  not filed yet.
- **`SESSION-4` (`DONE`, 2026-08-02, `modules/session/docs/MVP/SESSION-4_STANDALONE_DISCOVERY.md`)**
  — `GET /api/sessions/discover`: standalone, `SCHEDULED` sessions the caller can browse and join,
  gated to sports the caller holds an active `UserSportProfile` for (via `getUserProfiles`, not
  the non-active-filtered `hasProfileForSport`), excluding sessions the caller created or
  currently has joined. Bundles **`SESSION-7`** (`sport_id`/`status`/`scheduled_start` partial
  index, its shape deliberately deferred until this query existed) in the same migration, which
  also promotes `sessions.sport_id` to `NOT NULL` — an invariant `createSession` already enforced
  at the app layer since SESSION-1. Also adds `GET /api/sessions/joined` (required `status` param,
  spans both session types) for a not-yet-built matches page's other two sections. Client
  follow-up (discover UI, matches page) not filed yet.
- **`SESSION-5` (`DONE`, 2026-08-02, `modules/session/docs/MVP/SESSION-5_CAPACITY_AND_FEE.md`)** —
  `Session` gains `capacity` (informational only — `joinSession` never enforces it, no waitlist)
  and fee fields (`feeType` enum `FREE`/`SPLIT`/`FIXED`, `feeAmountVnd` required only when
  `FIXED`, cross-field-validated in `SessionServiceImpl`). Both mandatory on
  `CreateSessionRequest`, editable via `updateSession`. Existing rows and auto-generated
  `GROUP_RECURRING` sessions (no capacity/fee input) backfill to `capacity=9999`
  (sentinel = uncapped) / `feeType=FREE` via `@Builder.Default`. Client follow-up (capacity/fee
  display + `CreateSessionModal` inputs) not filed yet.
- **`SESSION-6` (`DONE`, 2026-08-02, `modules/session/docs/MVP/SESSION-6_JOIN_APPROVAL_AND_INVITES.md`)**
  — `ParticipantStatus` gains `REQUESTED` (self-initiated join, awaiting creator/owner-admin
  decision via new `POST /api/sessions/{id}/participants/{userId}/approve`|`reject`) and
  `INVITED` (pre-seeded from `CreateSessionRequest.inviteeIds`, resolved only by the invitee's
  own `joinSession` call, bypassing approval). `Session` gains `autoApprove` (existing sessions
  backfilled to `true` to preserve their instant-join behavior; new sessions default `false`).
  The session creator is now auto-added as a `JOINED` participant at creation for standalone
  sessions (not group-linked). Approval queue reuses `GET .../participants` with a `status`
  filter rather than a new route. No second table/reconciliation layer, unlike the group module's
  join-request+invitation precedent this ticket was scoped against — justified since only one
  table (`SessionParticipant`) can ever target a given (session, user) pair here. No
  notifications, matching that same precedent's own unbuilt scope. Client follow-up (invite
  search, auto-approve checkbox, approval queue UI) not filed yet.
- **`CLIENT-SESSION-2` (`DONE`, 2026-08-03,
  `client/docs/MVP/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`)** — `CreateSessionModal`
  redesign: standalone-only (mode toggle removed), widened `max-w-2xl`, sport pre-selected from
  context, 4 rows (Sport/Title 2:8; Location/Location-note 7:3, selected name + button on one
  line; Starts-at/Duration 7:3; Description alone), collapsible sections styled after the Friends
  rail's own section headers. New `SessionStartTimePicker` — three independent native `<select>`s
  (Date/Hour/Minute) defaulting to Today/one-hour-from-now/:00, **not** a Radix Popover wheel:
  nesting Radix floating UI (Popover, DropdownMenu) inside this modal's own Dialog caused two
  separate confirmed-live bugs (a stuck pointer-events lock on outside-click; a DropdownMenu that
  silently never opened), so both the wheel and a favorites-dropdown location shell were reverted
  to plain primitives with no portal/dismissable-layer involved. "Create session" is always
  clickable; submitting while invalid shows per-field errors instead of disabling the button.
  Split into 4 backend-dependent follow-ups (capacity/fee, invite/auto-approve, favorites,
  discover — all backend-`DONE`, all client-`TODO`): CLIENT-SESSION-3/4/5/6. The rail CTAs
  (`UpcomingMatches` empty-state buttons + create-session hook extraction across pages), originally
  also in scope, split out as CLIENT-SESSION-7 (`TODO`) instead — not started this session.
- **`CLIENT-SESSION-3` (`DONE`, 2026-08-03,
  `client/docs/MVP/CLIENT-SESSION-3_CAPACITY_AND_FEE.md`)** — capacity + fee/pricing fields added to
  `CreateSessionModal` (SESSION-5's `capacity`/`feeType`/`feeAmountVnd`) and to the 3 read-side
  displays (`SessionListCard`, `UpcomingMatches`, `SessionDetailModal`). Capacity input is split
  into "Taken slot" (the creator + whoever's already with them, defaults to 1 when blank since the
  creator always auto-joins) + "Open slot" (required), summed into the single backend `capacity`
  field at submit time, with a live `"{taken}/{capacity} slots"` summary shown under the two inputs.
  Fee is a checkbox each for Free/Split cost plus a label+number-input for Fixed amount (not a
  button/select group) — typing into the amount field is what selects `FIXED`. The Fixed-amount
  field formats a thousand-space separator while typing (`"50 000"`), and every numeric field in
  the form (Duration, Taken/Open slot, Fixed amount) rejects non-digit keystrokes and pastes at the
  DOM event level, not just via `type="number"`. Read-side displays hide the capacity denominator
  for the backend's `9999` "uncapped" sentinel. `SessionListCard`'s session-type/group-name row was
  also removed (user decision) — `SessionDetailModal`'s own "Standalone"/"Group session" badge is
  untouched. Known consequence, not separately ticketed (user decision): the new `UpcomingMatches`
  text shifts Home Feed's visual-regression baselines, same class of drift HF-13..HF-19 each
  tracked — regen needs the same manual GitHub Actions dispatch those tickets used.
- **`CLIENT-SESSION-4` (`DONE`, 2026-08-04,
  `client/docs/MVP/CLIENT-SESSION-4_INVITE_APPROVAL.md`)** — `CreateSessionModal` gains "Invite your
  friend" (client-side fullname filter over `useFriends()`, 3+ characters, dismissible badges,
  feeding `inviteeIds`) and "Auto approve join request" (unchecked by default, inline warning on
  check, feeding `autoApprove`) — both plain conditional `<div>`s, not a Popover/DropdownMenu
  (same nested-Dialog focus-trap conflict CLIENT-SESSION-2 already hit twice). `SessionDetailModal`
  gains a "Waiting for approval" section (creator/owner-admin only, hidden when empty or once the
  session is no longer SCHEDULED/ONGOING) listing `REQUESTED` participants with
  Approve/inline-reject-reason actions, wired to SESSION-6's `?status=REQUESTED` +
  approve/reject endpoints. E2E fixture correction found during verification: the 3 pre-existing
  session fixtures needed `autoApprove: true` (matching SESSION-6's real backfill of pre-existing
  rows), not `false` — the join/leave e2e step broke until this was fixed.
- **`CLIENT-SESSION-5` (`DONE`, 2026-08-04,
  `client/docs/MVP/CLIENT-SESSION-5_FAVORITE_LOCATIONS.md`)** — favorite-toggle heart on
  `LocationPicker`'s search results + a real `DropdownMenu` favorites list replacing
  `CreateSessionModal`'s plain "Choose location" button (LOC-2). CLIENT-SESSION-2 had reverted an
  earlier DropdownMenu attempt after it appeared to "never open" live; this ticket found the real
  cause via a live investigation harness — `DropdownMenu`'s default `modal={true}` calls the same
  `hideOthers()`/`aria-hidden` mechanism the outer `Dialog` uses, and since the menu's portal is a
  DOM sibling of the Dialog's (not a descendant), opening it aria-hid the *entire parent Dialog*.
  Fixed with `modal={false}` on the nested menu, confirmed via a real browser interaction test
  (open/select/reopen/Escape/outside-click all verified). Also found and fixed two real bugs along
  the way: `shared/ui/button.tsx`'s `Button` was missing `React.forwardRef` (broke `asChild`
  ref composition app-wide, not just here), and an MSW route-ordering collision where
  `GET /api/locations/:locationId` was intercepting `GET /api/locations/favorites` before it
  (caused a permanently-stuck "Loading…" in e2e, masked by TanStack Query's retry backoff).
- **`CLIENT-SESSION-6` (`DONE`, 2026-08-05,
  `client/docs/MVP/CLIENT-SESSION-6_STANDALONE_DISCOVERY.md`)** — `/matches` rebuilt into two panels: a
  **Discover** grid (`GET /sessions/discover`, sport-filtered, client-side search) and a collapsible,
  calendar-day-grouped **"My sessions"** panel (created/managed/joined, any status). Layout built
  from a user-provided design export, not the backlog's original "modal or dedicated view, TBD".
  Backend delta: `GET /api/sessions/joined`'s `status` param is now optional (omitted returns every
  status in one page) — added so "My sessions" needs one query instead of a 4-call fan-out per
  `SessionStatus`; fully backward compatible.
- **`CLIENT-SESSION-7` (`DONE`, 2026-08-06,
  `client/docs/MVP/CLIENT-SESSION-7_RAIL_CTAS_AND_HOOK_EXTRACTION.md`)** — `UpcomingMatches`'s empty
  state gains "Create a match"/"Join a match" CTAs on Home Feed/Groups/Friends. Scope grew at
  pickup (user decision): "Join a match" opens a new `SessionDiscoverModal` (reusing a
  `SessionDiscoverPanel` extracted out of `MatchesPage`) rather than just navigating to `/matches`
  as originally specced. `useCreateSessionModalData` (extracted out of `useMatchesPageData`) and
  the new `useDiscoverModalData` are each a self-contained hook shared by all four pages, so there's
  exactly one create-session and one Discover implementation, not four diverging copies.
  `FriendsPage` gained `ModalAnchorProvider` (anchored to its own hidden `<h1>`, no pill row to use
  instead) — the only rail-hosting page that didn't have one yet.
- **Session comments (`/vision` session held 2026-08-07,
  `documentation/md/vision/SESSION_COMMENTS_VISION.md`)** — a participant discussion thread below
  the session details in `SessionDetailModal`, reusing Post's comment shape (one-level nesting,
  likes) as a new domain-scoped `SessionComment` entity (not a reuse of `post-impl`'s `Comment`
  table). Gated to `JOINED`/`REQUESTED`/`INVITED` participants, participants-only read, refetch-based
  (no live updates), applies to both standalone and group-linked sessions. Filed as **SESSION-10**
  (`modules/session/docs/BACKLOG_MVP.md`, `TODO`) and **CLIENT-SESSION-8**
  (`client/docs/BACKLOG_MVP.md`, `TODO`, depends on SESSION-10). Open questions (not resolved):
  new-comment notifications, success metric.
- **MVP sport restriction (filed 2026-08-07)** — user decision to launch with only Badminton +
  Pickleball active; all other seeded sports deactivated. Filed as **A6**
  (`modules/sport/sport-impl/docs/BACKLOG_MVP.md`, `DONE`) — data migration + a real gap found in
  `createProfile()` (checked sport exists but not that it's active) — and **SPORT-3**
  (`client/docs/BACKLOG_MVP.md`, `DONE` 2026-08-07,
  `client/docs/MVP/SPORT-3_SPORT_CATALOG_REAL_FETCH.md`).
- **SPORT-3 (2026-08-07):** the client's sport catalog (`SPORT_PROFILE_CONFIG`/`ALL_SPORT_KEYS`/
  `SPORT_ID_BY_KEY`) was a hardcoded football/basketball/tennis config that never actually called
  `GET /api/sports`. Resolved the open design question left at filing (`SportKey` union vs. derived
  `string`) in favor of **`SportKey = string`, no compile-time closed set** — the id↔key map is now
  derived from the live catalog at runtime instead of hand-copied off a migration file. New
  `useSportCatalog()` hook + `sportCatalogStore` (a plain, non-hook-readable Zustand store —
  needed because `groupsPageStore.ts`'s `selectGroup` action resolves a sport synchronously and
  can't call a hook); every production call site of the old static config migrated (full scope,
  user decision, not split into a follow-up). **Found and fixed mid-implementation:** a real race —
  `sportKeyForId`/`sportIdForKey` read the catalog store via a plain non-reactive snapshot, so any
  page mounting before `AppShell`'s catalog fetch resolved would silently map every sport profile to
  nothing, with no re-render ever correcting it. Fixed by gating `AppShell`'s `<Outlet />` behind
  the catalog's `isLoading` and syncing the store synchronously in the render body (not a
  `useEffect`). **Also reshaped the entire MSW/e2e fixture graph** (`e2e/mocks/fixtures.ts`,
  `paginatedFeedFixture.ts`, 10 spec files, `client/docs/E2E_OVERVIEW.md`) from the old
  football/basketball/tennis universe to the real 2-sport one — user decision, made after the true
  cost (not just "10 files, minor tweaks") was surfaced explicitly; the old "user at the 3-sport
  cap" fixture is no longer representable at all with only 2 real sports. `pnpm test`
  (793/793), `pnpm e2e` (49/49), typecheck, and lint all green; visual baselines regenerated
  locally — Linux-rendered CI baselines still need the usual post-merge `update-baselines` dispatch
  (same HF-13..HF-19 precedent).
- **SESSION-9 (`DONE`, 2026-08-08,
  `modules/session/docs/MVP/SESSION-9_CALLER_PARTICIPATION_STATUS.md`)** — scope re-clarified at pickup:
  beyond the original "expose caller's status via `getSessionParticipants`" text, the user confirmed
  the caller's status needs to drive real Accept/**Decline**/**Cancel** actions (not just a disabled
  "waiting" state), on both the session card and `SessionDetailModal`. Design pivoted accordingly:
  `SessionResponse.callerParticipation` (batch-resolved, every session endpoint) instead of wrapping
  `getSessionParticipants` — which has real shipped client consumers that would have broken.
  `leaveSession` widened to accept `INVITED`/`REQUESTED` (not just `JOINED`), doubling as
  decline/cancel via the existing `DELETE /sessions/{id}/leave` — no new endpoint.
  `getSessionParticipants` itself ships unchanged. Live-verified against a running backend +
  Postgres (not just Spock): null/JOINED/INVITED→decline/REQUESTED→cancel all confirmed via curl.
  Client follow-up filed as **CLIENT-SESSION-9** (`client/docs/BACKLOG_MVP.md`, `TODO`).
- **SESSION-10 (`DONE`, 2026-08-12,
  `modules/session/docs/MVP/SESSION-10_SESSION_POST_COMMENTS.md`)** — session comments, but not as
  originally specced: instead of a new domain-scoped `SessionComment`/`SessionCommentLike` entity
  pair, every `Session` now gets a companion `Post` (`PostType.SESSION_POST`, post-impl's **A17**),
  created synchronously in the same transaction as the session, used purely as a comment-thread
  anchor. This reverses both `SESSION_COMMENTS_VISION.md` and the ADR §7 rejection of the same idea
  (both docs carry supersession notes) — see §2.11 above. Shipped in two passes: an **interim**
  design routed gating through `PostGate` calling into new `session-api` methods (bidirectional
  `-api` dependency, and the client called `post-impl`'s `/api/posts/{postId}/comments` directly
  via `SessionResponse.postId`) — this produced a real circular Spring bean dependency (`PostGate →
  SessionServiceImpl → PostServiceImpl → PostGate`), fixed with `@Lazy` on `SessionServiceImpl`'s
  `PostService` dependency, same fix `GroupServiceImpl` already uses for its own `group-impl ↔
  post-impl` cycle. The user then asked for a **one-way** dependency instead: `post-impl` now
  carries **zero** dependency on `session-api` — `PostGate.isAvailable` makes `SESSION_POST`
  unconditionally unavailable via `/api/posts/**` for every caller. `post-api`'s `CommentService`
  gained four bypass methods (`createSessionComment` etc., skipping `PostGate`, same shape as B9's
  `createSystemPost`); `session-impl` finally implements the standalone `SessionGate implements
  ResourceGate<Session>` the ADR originally specced, and new `session-api` endpoints
  (`GET/POST /api/sessions/{sessionId}/comments`, `.../comments/{commentId}/like`) are the client's
  only path to a session's comments. `session-api` gained a new `post-api` dependency (to reference
  `CommentResponse`/`CreateCommentRequest`, same precedent as `group-api`). With the bidirectional
  edge gone, so is the circular bean — `SessionServiceImpl` reverted to plain
  `@RequiredArgsConstructor`. The interim version of `SessionPostAccessGateIntegrationTest` (real
  MockMvc + Spring wiring + H2) is what caught the bean cycle before Spock (mocked collaborators)
  could have; it was rewritten for the final design. `V050`/`V051` migrations unchanged across both
  passes; `V051` truncates `sessions`/`session_participants` (no dev data worth a backfill) to add
  `sessions.post_id NOT NULL UNIQUE`. **Post-ship IDOR fix (same day):** a user question ("should
  the bypass methods check post type too?") surfaced a sharper gap — `likeSessionComment`/
  `unlikeSessionComment` took a client-supplied `commentId` never cross-checked against the
  session the caller was actually authorized for, so a participant of session A could like/unlike
  a comment belonging to session B's thread (or any other post's) by id alone. Fixed by adding a
  `postId` parameter `SessionServiceImpl` fills with its own resolved `session.getPostId()`
  (never client-supplied) and `CommentServiceImpl` verifies against the comment's real parent post;
  `createSessionComment`/`getSessionPostComments` also gained a `postType == SESSION_POST` check.
  Two new IT tests reproduce the exact cross-session and cross-post-type scenarios. **Also same
  day:** new `POST/DELETE /api/sessions/{sessionId}/like` (same bypass shape as comments, applied
  to the `SESSION_POST` anchor itself — `PostService.likeSessionPost`/`unlikeSessionPost`); and a
  `SessionController` auth-extraction cleanup — every endpoint now uses `@PreAuthorize
  ("hasRole('USER')")` + `Authentication authentication` + `SecurityUtils.extractUserId()`,
  uniformly (deliberately simpler than `PostController`'s own mixed A1 convention, which pairs
  `@AuthenticationPrincipal` with mutation/"MY OWN" endpoints and `Authentication`+`SecurityUtils`
  with "viewing a resource by id" ones) — `@PreAuthorize` and the extraction mechanism are
  orthogonal (an AOP gate evaluated before the method runs vs. how the method reads the
  already-authenticated principal), so combining `@PreAuthorize` with `Authentication`+
  `SecurityUtils` instead of `@AuthenticationPrincipal` is a valid, deliberate choice, not a
  workaround.
- **SESSION-11 (`DONE`, 2026-08-10,
  `modules/session/docs/MVP/SESSION-11_DROP_CROSS_DOMAIN_FKS.md`):** dropped the 4 cross-domain
  DB-level FKs found in the 2026-08-10 sweep — `sessions_created_by_fkey`,
  `sessions_cancelled_by_fkey`, `sessions_location_id_fkey`, `session_participants_user_id_fkey`
  — via `V046__drop_session_tables_cross_domain_fks.sql`. Unlike A13/A6/A8/A15/B17, this one isn't
  a "predates the rule" story: `sessions`/`session_participants` (`V031`/`V032`) were both first
  committed 2026-07-30, nearly a month *after* the 2026-07-07 cross-domain-refs rule, and the same
  migration's `sessions.sport_id` already gets it right (plain `Long`, no FK) — `created_by`/
  `cancelled_by`/`location_id` were missed despite that. Schema-only; all four were already
  `NO ACTION` (no cascade to lose) and already plain `UUID`/`Long` fields at the JPA layer.
- **SESSION-12 (`DONE`, 2026-08-12,
  `modules/session/docs/MVP/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md`):** added
  `idx_sessions_scheduled_status_only` — a partial index on `sessions(scheduled_start) WHERE
  status = 'SCHEDULED'` (`V052`) — targeting `SessionGenerationJob.startOngoingSessions`'s
  15-minute `findSessionsToStart` query. Sessions are never purged, so the existing unscoped
  `idx_sessions_status_scheduled_start` grows with the table's whole history; the new partial
  index tracks only the live/pending slice instead, kept alongside the old one (which still
  serves `findSessionsToComplete`'s `status IN (SCHEDULED, ONGOING)` query). Schema-only, no
  code changes; confirmed via `EXPLAIN` that the planner picks the new index.
- **LOC-3 (`DONE`, 2026-08-10,
  `modules/location/docs/MVP/LOC-3_DROP_LOCATION_CROSS_DOMAIN_FKS.md`):** dropped the 2
  cross-domain DB-level FKs found in the 2026-08-10 sweep — `locations_created_by_fkey`,
  `user_favorite_locations_user_id_fkey` — via `V045__drop_location_tables_cross_domain_fks.sql`.
  Same "not predates the rule" finding as SESSION-11 — `locations.created_by` (`V030`,
  2026-07-30) and `user_favorite_locations.user_id` (`V038`, LOC-2, 2026-08-02) both post-date the
  rule, both missed despite `locations.sport_id` (same file as `created_by`) getting it right.
  Schema-only; confirmed no code path relies on `ON DELETE CASCADE` (same
  `UserServiceImpl.deleteUser` soft-delete finding as auth's A6).
- **Sweep also found 4 orphaned tables with zero owning code** (no entity/repository/service/
  controller anywhere in the repo, confirmed by grep): `notifications`, `social_accounts`,
  `user_blocks`, `user_sessions` (all from the initial `V001`/`V002`/`V005` migrations), plus
  `post_reports` (`V005`, noted on `post-impl`'s A15 instead). Not ticketed against any domain —
  no module actually implements them, so there's no owning backlog to file a fix-the-schema ticket
  against; flagged here in case someone wants to scope either "build the feature" or "drop the dead
  table" later, same "leftover placeholder, leave it alone" status as `sport-impl`'s `FacilityType`.
- **MVP backlog (session module):** as of 2026-08-19, 19 of 21 tickets `DONE`; `TODO` remain
  SESSION-8 and SESSION-21.
- **CLIENT-SESSION-8 (`DONE`, 2026-08-12,
  `client/docs/MVP/CLIENT-SESSION-8_SESSION_COMMENTS.md`):** an inline "Discussion" section in
  `SessionDetailModal` (list + post + delete-own-comment, one-level reply nesting, per-comment
  likes — reuses `CommentItem`, now with `onHashtagClick` made optional since session comments
  render as plain text). Rendered inline, not a second nested Dialog (this codebase's
  `SessionDetailModal` is already one, and stacking two broke earlier `CreateSessionModal`
  attempts) — unlike Post's own `CommentSection`. Visibility gate is the backend's real 403, not a
  client-side approximation: the client has no `callerParticipation` yet (CLIENT-SESSION-9,
  `TODO`), so `useSessionCommentsData` always attempts the fetch and hides the section entirely on
  a 403 rather than showing an error. Wired through the two hooks that actually assemble
  `SessionDetailModal`'s props (`useMatchesPageData`, `useDiscoverModalData` — shared by
  Home Feed/Groups/Friends). Found and fixed a real pre-existing test-hygiene gap along the way:
  `MatchesPage.test.tsx`'s `afterEach` reset the auth store's `user` to `null` without an explicit
  `cleanup()` first (Vitest runs `afterEach` hooks inside-out), harmless until this ticket's
  `currentUser` prop started dereferencing `user` — fixed with the same explicit `cleanup()`
  `HomeFeedPage.test.tsx`/`FriendsPage.test.tsx` already had. **Same-day delta:** also added the
  "like the session" heart button (originally out of scope) at direct user request — found a real
  backend gap first (`SessionResponse` had no `likeCount`/`isLikedByCurrentUser`; SESSION-10's
  like endpoints were write-only with no way to read state back), filed and shipped as backend
  ticket **SESSION-13** (`modules/session/docs/BACKLOG_MVP.md`, `DONE`) before building the
  client button against it.
- **SESSION-13 (`DONE`, 2026-08-12,
  `modules/session/docs/BACKLOG_MVP.md` § SESSION-13):** `PostService.getSessionPostLikeInfo`
  (new cross-domain batch method, `post-api`/`post-impl`) + `SessionResponse.likeCount`/
  `isLikedByCurrentUser` (`session-api`), batch-resolved in `SessionServiceImpl.mapToResponses`
  alongside the existing creator/sport/location/participant-count batch resolution — same no-N+1
  discipline applied across the `session-impl` ↔ `post-impl` boundary. Uses a real batch DB query
  rather than the per-post Redis-cache pattern regular posts use for likeCount — that cache was
  never populated for `SESSION_POST` likes in the first place, since nothing ever called
  `getCount` on that path. Filed and shipped mid-pickup on CLIENT-SESSION-8, the client ticket
  that needed it.
- **CLIENT-SESSION-9 (`DONE`, 2026-08-13,
  `client/docs/MVP/CLIENT-SESSION-9_PARTICIPATION_ACTION.md`):** the session card
  (`SessionListCard`/`UpcomingMatches`) and `SessionDetailModal` now derive their
  Join/Accept/Decline/Cancel/Leave action from `SessionResponse.callerParticipation` (SESSION-9)
  instead of the modal's old `participants`-array lookup. Card gets one new sibling button next to
  "View details" (Accept-only for INVITED — Decline stays modal-only, user decision); shared
  derivation logic lives in `shared/lib/sessionParticipation.ts`. E2E updated but could not be run
  live in this sandbox (pre-existing environment limitation, confirmed via an unmodified spec
  failing identically) — full unit/component suite (822 tests), `tsc`, and `lint` all green.
  **Same-day follow-up:** the Upcoming rail's "View details" (Home Feed/Groups/Friends) used to
  navigate to `/matches?session={id}`, switching the user away from whatever page they were on —
  now opens `SessionDetailModal` in place instead, reusing each page's existing
  `discoverModalData.onViewDetails` (view + Join/Leave only, no Cancel/approval queue, by user
  decision — full manager parity stays reachable only via the Matches page).
  **Same-day bug fix (user-reported):** adding a sport profile from inside the zero-profile
  "add a sport first" gate (SessionDiscoverModal/CreateSessionModal/rail) left the Discover
  session list showing 0 results — `GET /sessions/discover` is gated server-side to the caller's
  active sport profiles, and `useAddSportProfile` never invalidated that cached (empty) query
  after adding one, only the profiles query itself. Fixed by also invalidating every
  `sessionKeys.discover(*)` entry on settle.
  **Same-day delta (user-reported, reverses the "view + Join/Leave only" scope choice above):**
  the rail's in-place modal now has full manager parity with the Matches page (Cancel session +
  approval queue, when the caller manages that session) — extracted the whole `SessionDetailModal`
  data slice (real `canManage`, join/leave/cancel, approval queue, likes, comments) out of
  `useMatchesPageData` into a new shared `useSessionDetailModalData(sessionId)` hook, now used by
  both `useMatchesPageData` and `useDiscoverModalData` instead of the latter's old hardcoded
  `canManage: false`/inert cancel-approval stubs.
  **Same-day bug fix (found live via `home-feed-journey.spec.ts`):** any modal on a
  `ModalAnchorProvider` page (Home Feed/Groups/Friends), opened after the user scrolled the sport
  switcher/pill row out of the viewport, rendered entirely off-screen — `DialogContent`
  (`shared/ui/dialog.tsx`) trusted `useAnchorBottom`'s viewport-relative value unclamped, so a
  scrolled-off anchor produced a negative `position: fixed` `top`. Fixed by falling back to the
  existing centered layout whenever the anchor isn't currently within the viewport, reasoned
  through against 2 other options with the user first. New `shared/ui/dialog.test.tsx` (this
  component had no tests before); verified against the original failure end-to-end (full e2e
  suite, 49/49 passing).
- **CLIENT-SESSION-10 (`DONE`, 2026-08-14,
  `client/docs/MVP/CLIENT-SESSION-10_SESSION_MODAL_UX_UI_PASS.md`):** `SessionDetailModal` UX/UI pass —
  custom header with a sport chip, a capacity meter + collapsible "Players" section (renamed from
  "Participants") with avatar-stack/roster-chip views, the "waiting for approval" queue wrapped in
  a new amber card (first real use of the amber warning token), icons + a loading spinner on the
  Join/Accept/Decline/Cancel/Leave buttons, and the comment composer extracted into its own
  `SessionCommentComposer` component pinned in the dialog's footer. Modal-only by user decision —
  `SessionListCard`'s own layout/status-badge questions stay a follow-up. Full suite green
  (832 Vitest, 49 e2e via real Chromium, `tsc`/`lint` clean); Storybook not visually screenshotted
  (browser extension unavailable in this sandbox, same as prior tickets).
- **SPORT-4 (client-side `DONE`, 2026-08-15, `client/docs/MVP/SPORT-4_REAL_SPORT_ICONS.md`):** replaced
  the Tabler icon stand-ins (Badminton→tennis-ball, Pickleball→tournament-bracket) with the real
  backend-served `Sport.iconUrl` PNGs everywhere a sport badge renders (new shared `SportIcon`
  component, 8 call sites, `sportIcons.ts`'s lookup table deleted). Surfaced and fixed a real
  client/backend origin gap along the way: `iconUrl` is a server-relative path, and neither the Vite
  dev proxy nor the e2e mock server forwarded `/images/**` (only `/api` was proxied) — both fixed;
  production has the same gap for a different reason (S3/CloudFront client vs. EC2 backend, per
  INFRA-3), tracked as a delta on **INFRA-5** rather than solved here. Full suite green (837 Vitest,
  `tsc`/`lint` clean, Storybook builds); visual-regression baselines (18 affected) regenerated via
  the `update-baselines` CI dispatch and human-verified against the real render.
- **CLIENT-SESSION-11 (`DONE`, 2026-08-15,
  `client/docs/MVP/CLIENT-SESSION-11_SHARED_SESSION_CARD.md`):** de-duped `UpcomingMatches`' right-rail
  row and `SessionListCard` (Matches page) into one shared `SessionCard` component with a
  `compact`/`full` size variant — the two had been hand-kept-in-line since CLIENT-SESSION-10 rather
  than sharing an implementation, a real drift risk. Pure refactor, zero visual change: 838 Vitest
  passing, 49/49 e2e passing, visual-regression showed only Windows-vs-Linux font-rendering noise
  (confirmed via direct diff-image inspection — no baseline regen needed).
- **SESSION-14 (`DONE`, 2026-08-16,
  `modules/session/docs/MVP/SESSION-14_REDUCE_MAPTORESPONSES_ROUND_TRIPS.md`):** shipped narrower than
  originally scoped — only merge #1 (post-like count + caller-liked flag →
  `PostLikeRepository.countAndCallerLikedGroupedByPostIdIn`, one conditional-aggregation query
  replacing two) landed; merge #2 (participant JOINED-count + caller's row) was deliberately
  deferred at pickup, by user decision, given its payload tradeoff and bigger blast radius on
  `session-impl`'s core batch path — still `TODO`-shaped in the backlog entry, not filed as a new
  ticket. **Bundled addition (same pickup, user-requested):** `leaveSession` now rejects a
  standalone session's own creator (`BadRequestException`) — they're auto-`JOINED` at creation
  (`createSession`) but can't leave via this endpoint, only `cancelSession`. Scoped to standalone
  only; a group-linked session's creator isn't auto-joined and can still leave normally if they
  joined like any other member.
- **SESSION-15 (`DONE`, 2026-08-17,
  `modules/session/docs/MVP/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md`):** notification outbox wiring —
  new `session_outbox_events` table (`V054`, C3's `OutboxEvent` shape) + 6 event types (`session.
  comment.created`, `session.join_request.created/approved/rejected`, `session.invitation.created`,
  and `session.participant.joined` — the last one a real gap the user caught mid-session, not in
  the original ticket text or `NOTIFICATION_USE_CASES.md`). Includes the full producer pipeline,
  not just row-writing: `SessionOutboxRelayJob` (`@Scheduled`) actually drains and publishes to a
  self-declared `sportconnect.events` topic exchange — SESSION-15 is the first ticket in the app to
  publish to RabbitMQ for real, chosen specifically so this could be live-verified against the real
  dev broker instead of waiting for NTF-2. Live-verified end-to-end via real HTTP calls (register
  users, create a session with an invitee, confirm the outbox row reached `SENT`; had the invitee
  join, confirmed exactly `session.participant.joined` fired). Found and fixed a real latent bug in
  `joinSession` along the way (`SessionParticipant.status`'s `@Builder.Default = JOINED` meant a
  brand-new participant's "previous status" silently read as `JOINED`, not absent) — caught by two
  failing tests before it shipped. Found and *documented but did not fix* a second, unrelated
  pre-existing bug in the same method (an already-`JOINED` caller re-invoking `joinSession` on a
  non-`autoApprove` session gets silently demoted to `REQUESTED`) — defensively guarded in the new
  outbox-firing code only, flagged for a separate ticket. Unblocks NTF-2.
- **SESSION-17 (`DONE`, 2026-08-17,
  `modules/session/docs/MVP/SESSION-17_OUTBOX_PENDING_PARTIAL_INDEX.md`):** found while walking through
  SESSION-15's sequence diagram — its own `idx_session_outbox_events_status_created` (`V054`) was a
  full composite index over every row regardless of status, but `SessionOutboxRelayJob.drain()`
  only ever queries `status = 'PENDING'`, and `SENT` rows are never archived. Replaced (`V056`) with
  a partial index scoped to `WHERE status = 'PENDING'`, same technique already established by
  `SESSION-12`/`B16`. Verified via `EXPLAIN` with `enable_seqscan` off, same as `B16`'s check.
- **CLIENT-NOTIF-1 (`DONE`, 2026-08-18, `client/docs/MVP/CLIENT-NOTIF-1_NOTIFICATION_BELL_DROPDOWN.md`):**
  the real bell + dropdown in `TopBar`, replacing NTF-3's bare badge placeholder — unread badge (live
  via NTF-3's STOMP subscription), a `Popover`-backed dropdown listing `GET /api/notifications`
  (paginated, fetched only once opened), click-to-mark-read + open the session's detail, and a
  client-side "Mark all read" fanning out one `PUT /{id}/read` per currently-loaded unread row (no
  bulk endpoint exists). **Surfaced and closed a real backend gap at pickup, filed and built as its
  own ticket (NTF-4) before any client code:** NTF-1 had deliberately shipped zero
  actor-name/entity-title enrichment on `NotificationResponse`, which would have made the dropdown
  unreadable — `notification-impl` now batch-resolves `actors`/`entityTitle` per page via
  `user-api`/`session-api`, no N+1. Mid-build correction: the first `NotificationBell` draft
  self-fetched its own data, caught against `client/CLAUDE.md`'s presentational/controlled
  convention and refactored into a shell-level `useNotificationBellData()` hook (owned by
  `AppShell`, same as `useSportCatalog`/`useNotificationLiveSocket`) feeding a fully prop-driven
  component. **Two post-ship corrections, same day, before merge:** (1) bold styling scoped to just
  the actor name(s)/`entityTitle` (`getNotificationText` now returns segments, not a string) plus a
  light-blue-bullet-and-black-text (unread) / gray-bullet-and-gray-text (read) treatment; (2)
  clicking a notification no longer navigates to `/matches?session={id}` — the user caught both the
  unwanted page switch and a real bug it had (`MatchesPage`'s `?session=` param is read once at
  mount, so navigating there again while already on `/matches` silently did nothing). Fixed by
  giving `AppShell` its own shell-level `SessionDetailModal` (reusing `useSessionDetailModalData`),
  opened via a plain callback with zero URL change, on whatever page the caller is on. Full suite
  green: `:server:test` (backend), 878 Vitest, `tsc`/lint clean, Storybook builds, 51/51 e2e
  (including a dedicated already-on-`/matches` regression case).
- **Backlog file structure convention (2026-08-18, `documentation/md/BACKLOG_STRUCTURE_CONVENTION.md`):**
  `client/docs/BACKLOG_MVP.md` had grown to ~3,260 lines (every ticket's full write-up inline),
  costing ~100K tokens — past the read-truncation cap — just to locate one ticket during a
  `/workon` pickup. Restructured (and documented as a repo-wide convention for any module's
  backlog) into a thin index — Open tickets in curated order, Done sorted by completion date
  descending — with full per-ticket detail moved into one file per ticket under
  `client/docs/MVP/<TICKET-ID>_<slug>.md` (no status in the filename — that would mean a rename on
  every status change and a third source of truth alongside the index row and the file's own
  `**Status:**` line). 74 tickets migrated, zero content loss, all cross-references repo-wide
  updated. **Known gap, flagged not fixed:** `.claude/commands/workon.md`'s Phase 6 still writes new
  ticket summaries to the old flat path — needs updating before `/workon` is relied on to keep a
  retrofitted module's backlog clean going forward.
- **Backlog file structure convention rolled out repo-wide (2026-08-18):** retrofitted the
  remaining 10 flat `BACKLOG_MVP.md` files onto the thin-index + per-ticket-file shape
  (`documentation/md/BACKLOG_STRUCTURE_CONVENTION.md`) — `services/chat`, `infra/documentation`,
  `modules/common`, `modules/location`, `modules/notification`, `modules/auth`,
  `modules/sport/sport-impl`, `modules/user/user-impl`, `modules/session`,
  `modules/social/post-impl`, `modules/social/group-impl` — done at the user's explicit request
  even for the three smallest backlogs (common/location/notification, 3-4 tickets each) that the
  convention's own "when to bother" guidance would otherwise have left flat. Built and reused a
  generic Node retrofit script rather than hand-editing: parses each flat file's Implementation
  Order table + per-ticket `###`/`##` sections, splits into Open/Done tables (Done sorted by
  completion date, best-effort-parsed per ticket) plus one file per ticket under a new `MVP/`
  subfolder, merging with any pre-existing standalone ticket doc (moved + backlog text appended
  under a `---`, not rewritten) or synthesizing a new file where none existed. Two content-loss
  bugs caught and fixed mid-run via dry-run verification before they touched real files: cross-cutting
  prose sitting between the table and the `## Tickets` heading (a "Dependencies" block, in
  auth/sport/infra/services-chat) was initially discarded silently; a ticket heading present in the
  file but deliberately absent from the Implementation Order table (`services/chat`'s CHAT-14, a
  "moved back to BACKLOG_V1.md" tombstone) was initially dropped instead of preserved as an
  untracked note. All 11 module/service backlogs now verify with zero missing/unlinked/duplicate
  links between each index and its `MVP/` folder. Fixed all 92 moved-file cross-references
  repo-wide (PROGRESS.md, session logs, other backlogs, source comments, a Java integration test,
  `server/src/test/resources/schema.sql`) via literal path substitution, confirmed zero stale refs
  remain by a full-repo grep. Left one pre-existing, unrelated stray file untouched:
  `modules/social/post-impl/docs/B3_THREE_POST_TYPES.md` — its content matches `group-impl`'s B3
  ticket, not `post-impl`'s own (coincidentally reused) B3 id, so it was never referenced by
  `post-impl`'s Implementation Order table in the first place; not this task's to resolve.
- **A7 (`DONE`, 2026-08-20,
  `modules/sport/sport-impl/docs/MVP/A7_ENFORCE_ISACTIVE_ON_SPORT_TAGGED_CREATE_PATHS_IN.md`):** filed
  as a three-line business-rule fix (reject a deactivated `sportId` on the group/location/session
  create paths); grew, on the user's direction, into the sport module's read/write policy being
  rewritten. **The bug the ticket itself got wrong:** it described
  `UserSportProfileService.hasProfileForSport` as "existence-only... by design", but the `sport-api`
  Javadoc, `LocationServiceImpl.favoriteLocation`'s error string, and `LocationService`'s Javadoc all
  described it as an *active-profile* check — three docs contradicting a one-line
  `existsByUserIdAndSportId` that checked neither the profile's nor the sport's `isActive`. Live
  consequence: `deleteProfile` only soft-deletes, so a user who deleted their Badminton profile kept
  every permission it granted (creating groups, favouriting locations) indefinitely. Renamed
  `hasActiveProfileForActiveSport` — the name stating both conditions is the fix for *why* it went
  unnoticed. Beyond that: a deactivated sport is now indistinguishable from a missing one
  (`getSportById` → **`requireActiveSportById`**, active-only, `ResourceNotFoundException`/404 rather
  than a 400 about a sport `GET /api/sports` never offered); `SportLookupCache` loads only active
  sports so hiding is the default rather than each caller's job, with the admin "includes inactive"
  listing bypassing the cache entirely (asserted by test) and `updateSport`/`deleteSport` already
  going straight to the repository, so reactivation still works; profiles under a deactivated sport
  are omitted from `getUserProfiles` and 404 individually instead of rendering a `"Unknown"` sport
  name; the max-3-profiles cap was removed (which invalidates A4's recorded "never a real N+1 risk
  because bounded to ≤3" reasoning — corrected in place, the batching is now load-bearing); and
  re-adding a deleted profile **reactivates the existing row** rather than being rejected —
  `(user_id, sport_id)` is `UNIQUE`, so the soft-deleted row both blocked a fresh insert and
  satisfied the old duplicate check, making `deleteProfile` a one-way door in both directions. Also
  moved every sport lookup in `UserSportProfileServiceImpl` off `sportRepository` onto the
  cache-backed `SportService` (A4/A5 had done this for `getUserProfiles` only), dropping the
  `SportRepository` dependency from that class. Corrected the ticket's session-gating instruction:
  it said to check "the request-supplied-`sportId` branch", but the group branch also honours
  `request.getSportId()` when present, so gating on `sessionType` would have let a caller-supplied
  inactive sport through — gated on `request.getSportId() != null` instead. **Deliberately not
  done:** caller `isActive` (all three endpoints still accept a deactivated caller — inherited U12
  gap, user's explicit call), and hiding groups/sessions/locations tagged with a deactivated sport
  from their own list endpoints (a bigger cross-domain product decision; raised, left unfiled).
  Verification: full `./gradlew test` green, plus a new 5-case
  `SportActiveGateIntegrationTest` through real MockMvc/beans/H2 — it exists because mocks cannot
  prove the two things that actually broke (that the active-scoped query really excludes a
  soft-deleted row, and that reactivation avoids the `UNIQUE` violation), and it required adding
  `user_sport_profiles`/`group_types`/`group_settings` to the hand-maintained H2 mirror. A late
  user review caught one more instance of the same root cause: `getProfileById`,
  `getUserProfileForSport` and `updateProfile` used unfiltered finders, so a soft-deleted profile
  `getUserProfiles` omits was still individually fetchable and editable — all three are now
  active-scoped, while `deleteProfile` and the reactivation lookup deliberately keep the
  unfiltered finders because they need to see the deleted row. That review also flagged that the
  sport check in those getters *read* as a name lookup despite being a real gate; both call sites
  now say so, with a test asserting the gate fires. The same misreading recurring twice was itself
  the signal that drove the final renames — `getSportById` → `requireActiveSportById` (a `get` that
  throws hides its enforcement at the call site) and `getSportsByIds` → `getActiveSportsByIds` (whose
  Javadoc managed to be wrong in *both* directions inside this one ticket, which is exactly why the
  contract now lives in the name). A second review pass found the sharper version of
  the same thing in `updateProfile`: its sport gate sat *after* `save()`, so a profile under a
  deactivated sport had every field mutated and saved before the throw, with only `@Transactional`
  rollback preventing a persist — correct by accident, and one refactor away from a real
  write-then-fail. Hoisted above every mutation, with a test pinning the ordering.
- **A12 (`DONE`, 2026-08-24,
  `modules/sport/sport-impl/docs/MVP/A12_SCHEMA_V2_DEFINITION_TYPES.md`):** schema v2 core — a
  sport-local `definitions` registry plus `DEFINITION`/`DEFINITION_LIST` type kinds, so an attribute
  value can be a record (or a list of records) instead of only a string/enum/list. Five DTO changes
  in `sport-api`, a three-pass registry validator addition to `SportAttributeSchemaValidator`, a
  record-cascade addition to the shared `SportAttributeValues`
  (`isValidRecord`/`filterScalarOrRecord`), and `DEFINITION_LIST`-aware dispatch in
  `ProfileAttributeFilter`. **No migration, no entity change** — `objectMapper.convertValue` already
  round-trips the whole DTO tree through `Sport.attributesSchema`'s untyped `Map`. **No cycle
  detection was written**, per the design doc's own instruction: the depth-2 rule (a definition
  referenced by another definition's field may hold only primitive fields) makes a cycle a direct
  contradiction caught by one pass, no traversal needed — proven by dedicated self-reference and
  two-node-cycle specs. **A design bug caught before any code shipped:** routing a nested
  `DEFINITION` field through a boolean-only validity check (mirroring the primitive types) would have
  stored the *raw* nested record on success rather than its *filtered* survivors, silently keeping
  junk fields the record-level "drop undeclared keys" rule was supposed to remove — fixed by having
  the shared dispatcher return the filtered value, not a boolean. **`version` was added, then removed
  entirely, same session.** A12's own ticket text initially omitted a rule item 10 already stated (a
  document using any v2 feature must declare `version: 2`) — caught mid-implementation and added. Then
  removed outright on review: nothing anywhere reads `version` to decide anything, so the gate rejected
  otherwise-valid documents over a labeling mismatch with zero behavioral effect, and there is no
  concrete plan to version the schema syntax — speculative machinery for a need that doesn't exist,
  against this codebase's own "don't design for hypothetical future requirements" rule. Deleted the
  DTO field, the gate, its three specs, and every `.version(...)`/raw `version:` fixture across five
  spec files — including two **pre-existing A9-era specs**
  (`UserSportProfileServiceImplSpec`, `SportServiceImplSpec`) found only by a repo-wide grep after the
  obviously-related files were already fixed. **A real asymmetry surfaced while doing this, checked
  live rather than assumed:** the stored-document read path (`objectMapper.convertValue`) has
  `FAIL_ON_UNKNOWN_PROPERTIES` on and threw for a stray `version` key in a fixture, but the `PUT`
  endpoint's `@RequestBody` binding is a different, lenient code path — verified against a running
  server, a `PUT` of the client's already-shipped `ADMIN-2` empty-prefill literal
  (`{"version":1,"groups":[]}`) still returns 200 with the field silently dropped, so that shipped
  client is unaffected. Verification: `SportAttributeSchemaValidatorSpec` **50 cases** (peaked at 53
  with the version-gate trio, net −3), `ProfileAttributeFilterSpec` +13, two new
  `SportAttributeSchemaIntegrationTest` cases (v2 round trip + atomic rejection of an unresolved
  `definitionRef`) — no new authorization boundary, so no new IT class. `:server:test` **118/118, 0
  failures**, re-run after the removal. Live-verified against a running server and real Postgres
  **twice** — once for the v2 core (registered a real admin, `PUT` a real v2 document, confirmed it in
  `jsonb_pretty(attributes_schema)`, proved atomic rejection, created a real profile exercising every
  branch of the cascade at once, output matched the specs exactly) and again after the `version`
  removal to prove the client-compatibility claim above. All test data removed afterward both times.
  **A third addition, same session: a default 10-item cap** (`SportAttributeValues.MAX_LIST_ITEMS`)
  on every `LIST`/`DEFINITION_LIST` value — a hardcoded default, not a new admin-configurable schema
  field, same YAGNI call as everything else deferred in this ticket; there is no real profile anywhere
  near the 4KB cap this protects (§13.2 measured 17.5% at a realistic maximum), so it bounds unbounded
  growth in principle, not a live size problem. Over the cap invalidates the **whole value**, gated on
  the **submitted** count rather than the surviving count — checking after per-element filtering would
  let a flood of malformed elements slip past the cap as long as few enough happened to be valid, which
  a dedicated 100-junk-elements Spock case proves does not happen. Also bounds an admin's `defaultValue`
  on a `LIST` attribute for free, via the shared `isValid`. Third live verification, on the same
  restarted server: a 500 on a schema `PUT` turned out to be a stale-classloader artifact from repeated
  recompiles against a JVM running since before several rebuilds, not a defect — resolved by a clean
  restart; then live-proved the exact boundary against a real profile (10 rackets kept in full; 11
  submitted as an update dropped the whole write, with the **original** 10 surviving completely
  unchanged, confirming A3's merge-keeps-prior-value semantics under this new cap). `sport-impl`
  **155/155**, `:server:test` unchanged at 118/118 (no new authorization boundary). **Client tickets
  updated in place** (still pre-merge) rather than filed separately: `SPORT-2` and `SPORT-6` both now
  require mirroring `10` as a hardcoded constant and blocking further additions client-side — same
  strict-client/lenient-server split as `isRequired`, higher-stakes here since an over-cap write drops
  the *entire* value, including edits to items that were individually fine.
- **Sport attribute schema v2 design (2026-08-24,
  `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md`; tickets A12–A16 backend, SPORT-2 rescoped
  + SPORT-6 client):** A9's format could not express a hand-written Badminton schema the user
  drafted — a shoe with a name *and* a size, several rackets each structured, bilingual labels, and
  "link this racket to a known item if we have one". v2 adds exactly one new **kind**: a
  **definition** (a named record shape declared once in a sport-local `definitions` registry and
  referenced by name), in two flavours — `DEFINITION` and `DEFINITION_LIST`. **The central invariant
  survives**: attribute keys stay unique per sport and `UserSportProfile.attributes` stays a *flat*
  `Map<String, Object>` — only the *value* under a key gains structure, and values were always
  untyped, so A3's entity, V025, the 4KB cap and merge-by-top-level-key are untouched, and **no
  migration is needed at all**. Four decisions carry the design: (1) the type reference is a
  **field** (`type: "DEFINITION"` + `definitionRef`), never a sigil syntax like `"#Shoe"`, so `type`
  stays a Jackson-deserializable closed enum and both the validator's and the renderer's `switch`
  stay exhaustive — v1 §2.3's trust boundary intact; (2) **`LIST` is not overloaded** — it means
  multi-select over `options` and keeps its shipped validation path literally unchanged, so repeating
  records get their own member rather than a conditionally-relaxed rule; (3) **depth 2** — a
  definition referenced *by* a definition holds only primitives, which makes cycles *structurally
  unrepresentable* rather than merely detectable, so no visited-set, no depth counter, no traversal
  is written; (4) **`isRequired` per definition field with a drop-the-record cascade** (a missing
  required field invalidates the whole record; an invalid optional field is dropped alone), scoped to
  records only so A9's contract that a profile write never fails on `attributes` content survives.
  That flag is deliberately **asymmetric** — the client blocks the save and shows an error, the
  server silently drops — so the server never assumes the client validated and the client never reads
  a 200 as "all of it stored". **Labels become locale maps** with a `defaultLocale`, resolved
  server-side from `Accept-Language`: attribute labels are admin-authored *dynamic* content and
  cannot live in a client translation bundle, which makes placement independent of the app having no
  i18n yet — and the authoring window is now, while the bilingual draft exists. Resolution maps onto
  the **two endpoints A11 already built** (user-facing resolves, admin twin returns raw maps) and must
  sit in the controller, *not* in `getAttributeSchema`, which `UserSportProfileServiceImpl` calls on
  every profile write and which must stay locale-independent for `SportLookupCache`. **`Reference`
  (`{ id?, value }`) is an entity link with a free-text fallback** — `id` is declared now though
  nothing populates it, making "unlinked" first-class from day one so a future Equipment domain needs
  **no backfill**; `url` was considered and **dropped**, since a linked item's URL belongs to the
  catalogue and an unlinked one is a user-pasted-link surface (scheme allowlisting, spam/phishing)
  bought for nothing. Before any catalogue exists, typeahead is bootstrapped from **what users
  already typed**, pooled by an admin-authored `searchScope` on the *attribute* (rackets don't pool
  across sports, court shoes do — product knowledge the server cannot infer), gated by a
  **frequency floor of N distinct users** that simultaneously filters typos and guarantees nothing a
  single user typed is shown to anyone else. Suggestions are **spelling convergence, not linking** —
  picking one still stores `id: null` — and the search response carries an optional `id` from day one
  so the client is unchanged when real items arrive. The payoff is concrete: equipment is a planned
  **partner-matching filter**, filtering works on `id` and not on free text, so the link rate decides
  whether that roadmap feature is buildable. **The window that forces sequencing:** A9 shipped
  unseeded and all 12 sports still carry `NULL`, so changing `label` from `String` to a map is free
  *today* and stops being free the moment anything is seeded — hence an earlier plan to seed
  Badminton in v1 format was **withdrawn**, and A15 seeds once, in v2, after A12 and A13.
  Deliberately out: `isAvailable` on definitions/fields, a cross-sport registry, per-attribute
  requiredness, `defaultValue` on record types, optimistic locking, and the delete-a-key path (still
  **A10**, which v2 *sharpens* rather than closes — `DEFINITION_LIST` can be cleared with an empty
  list while `STRING`/`ENUM` still cannot). **ADMIN-2 needs no ticket**: it shipped as a JSON textarea
  over the raw document, so it keeps working against v2 unchanged.
- **A11 (`DONE`, 2026-08-21,
  `modules/sport/sport-impl/docs/MVP/A11_ADMIN_SCHEMA_READ_AND_RENAME_COLLISION_GUARD.md`):** two
  gaps found while building client ADMIN-2 and fixed in that same branch rather than deferred.
  **(1) A9's schema read and write disagreed about inactive sports.** `replaceAttributeSchema`
  resolves via `findById` and edits a deactivated sport happily; `getAttributeSchema` reads the
  active-only cache and 404s for one — A9 recorded that asymmetry deliberately but not its
  consequence: **the admin editor could write a schema it could never read back**, breaking the
  configure-a-sport-before-activating-it flow. Fixed *additively* — new
  `getAttributeSchemaForAdmin` + `GET /api/sports/all/{sportId}/attribute-schema` (admin-only),
  leaving `getAttributeSchema` untouched for two independent reasons: it is called on **every**
  profile write and must keep its in-memory cache hit, and its active-only behaviour is what keeps a
  deactivated sport invisible to member-facing reads (A6/A7), which client SPORT-2 depends on. Path
  follows this controller's own `GET /api/sports` (active-only) vs `/all` (admin twin) convention.
  Worth recording because it looked like a risk and wasn't: that active-only resolution is **not**
  what enforces `isActive` on profile writes — `createProfile` calls `requireActiveSportById` first
  and throws there. **(2) A duplicate-name rename returned 500.** `sports.name` is `UNIQUE NOT NULL`
  but `updateSport` had no `existsByName` guard and `GlobalExceptionHandler` has no
  `DataIntegrityViolationException` case, so the most likely mistake in an admin rename form fell
  through to the catch-all and surfaced as "An unexpected error occurred". Added the guard (same
  message `createSport` produces), skipped when the name is unchanged so a form posting every field
  isn't a false collision. Tests: 6 new Spock, **5 new integration** — mandatory here, since this
  adds an authorization boundary and `/api/sports/**` is blanket `permitAll`, so only a real request
  proves anonymous callers are rejected; one asserts the member-404 and admin-200 **as a pair**, so a
  future "fix" that weakens the member read fails. `:server:test` and `./gradlew build` green, and
  every before/after case reproduced against a running server. **Not addressed:** a deactivated admin
  can still call these until their token expires (unchanged from A9; closes with U12), and
  `GlobalExceptionHandler` still has no `DataIntegrityViolationException` case, so any *other* unique
  constraint in the app still surfaces as a 500 — worth its own ticket.
- **A9 (`DONE`, 2026-08-20,
  `modules/sport/sport-impl/docs/MVP/A9_PER_SPORT_ATTRIBUTE_SCHEMA.md`):** per-sport attribute schema
  moved server-side — `sports.attributes_schema JSONB` (V059, nullable, deliberately unseeded), five
  typed DTOs in `sport-api` (`SportAttributeSchema`/`Group`/`Definition`/`Option`/`Type`),
  `SportService.getAttributeSchema` + `replaceAttributeSchema`, and two endpoints
  (`GET .../attribute-schema` authenticated, `PUT` admin-only). Reverses A3's "no schema table" call
  because the requirements changed, not the cost estimate. **Validation is deliberately asymmetric:**
  the admin `PUT` is strict and atomic (`SportAttributeSchemaValidator` — known types, leaf keys
  unique across the *whole* sport, non-empty unique options, `defaultValue` valid for its own node,
  key pattern, 16KB cap), while profile writes are lenient (`ProfileAttributeFilter` — unknown keys,
  wrong-shaped values and switched-off attributes are **silently dropped**, never rejected). That
  overrides the ticket's and design doc's stated "unknown key → reject", on explicit product
  decision; merge semantics are retained too, so an absent key keeps its stored value and a stale key
  survives. Both halves share one `SportAttributeValues.isValid`, so a schema can never declare a
  `defaultValue` the profile path would then silently drop. `Sport.attributesSchema` is an **untyped
  `Map`** on purpose: the entity rides the hot `SportLookupCache` path, so a typed field would make a
  no-longer-deserialisable document take down the whole cached catalogue rather than one endpoint.
  Admin writes bypass the active-only cache (`findById`, like `updateSport`/`deleteSport`) so an
  inactive sport stays editable, while the `GET` reads the cache and 404s for one (A7's collapse);
  zero new cache wiring. The `GET` is the **one non-public GET in `SportController`** — `/api/sports/**`
  is blanket-`permitAll` (an untickered initial-commit default), so it needed
  `@PreAuthorize("isAuthenticated()")`, chosen over `hasRole('USER')` because nothing in the codebase
  grants `ADMIN` and an admin-only account may not hold `USER`. **Scope expansion, fixed on the
  user's call:** writing the IT found that `GlobalExceptionHandler`'s `Exception.class` catch-all
  swallowed Spring Security's `AccessDeniedException`, so **every `@PreAuthorize` denial in the whole
  app returned 500 instead of 403** — including four already-shipped `SportController` admin
  endpoints. It hid because no IT had ever exercised a method-security denial: existing `isForbidden`
  assertions all come from domain `ForbiddenException`, and the three unauthenticated tests assert
  401 via filter-chain rejection on non-`permitAll` paths. Added an `AccessDeniedException` handler in
  `modules/common`. **Deliberately not done:** Badminton/Pickleball schemas left `NULL` (feature is
  inert until client ADMIN-2 ships), no delete-a-key path (**A10** filed — merge means a stored key
  can never be removed, and stale keys still consume the 4KB profile cap), no caller `isActive`
  checks (matches A7, closes with U12), no `NUMBER`/`BOOLEAN` types, schema kept out of
  `SportResponse` so the catalogue fetch stays lean. Verification: `sport-impl` 104/104 (up from 59)
  plus a 6-case `SportAttributeSchemaIntegrationTest` covering non-admin/anonymous 403s, the admin
  round trip through the real JSON column, atomic rejection, and the inactive-sport 404. Existing
  `UserSportProfileServiceImplSpec` cases needed a stubbed schema: their free-text keys would
  otherwise have been dropped, silently turning them into tests of the filter's drop path.
- **A8 (`DONE`, 2026-08-20,
  `modules/sport/sport-impl/docs/MVP/A8_DROP_DB_LEVEL_FK_ON_USER_SPORT_PROFILES.md`):** dropped the
  cross-domain DB-level FK `user_sport_profiles_user_id_fkey` → `users` (V058) — `users` is owned by
  `user-impl`, so the constraint was a hard schema coupling against "domain-scoped tables /
  cross-domain references use IDs only", and a blocking pre-step for ever extracting `sport` into its
  own service. Schema-only: `UserSportProfile.userId` was already a plain `UUID` (no `@ManyToOne`), so
  no entity/service/DTO/test change. Fifth migration of this kind, following V045 (location), V046
  (session), V048 (post — the A13 this ticket was filed alongside) and V049 (group).
  `user_sport_profiles.sport_id` deliberately kept: `sports` is this module's own table, so that FK is
  intra-domain and correct. **The cascade question, confirmed not assumed:** dropping the FK removes
  its `ON DELETE CASCADE`, but `UserServiceImpl.deleteUser()` is a soft delete (`isActive = false`) and
  a repo-wide grep finds zero `userRepository.delete`/`deleteById` callers — there is no
  hard-delete-user path, so the cascade has never fired; app-level orphan cleanup was deliberately not
  added, since it would mean a new `user-impl` → `sport-api` cross-domain call deserving its own
  ticket. The `:server:test` H2 mirror needed no change — A7 had already written
  `user_sport_profiles` there without this FK, anticipating A8. Live-verified against real Postgres:
  constraint name confirmed via `pg_constraint` before writing the migration, changeset applied
  through `:server:bootRun` (`Rows affected: 1`, app started), and post-state checked — only the
  `sport_id` FK remains, V058 recorded `EXECUTED`, all 5 indexes (incl. the load-bearing
  `UNIQUE(user_id, sport_id)`) and all 40 existing profile rows intact.
- **A13 (`DONE`, 2026-08-24,
  `modules/sport/sport-impl/docs/MVP/A13_LOCALIZED_ATTRIBUTE_SCHEMA_LABELS.md`):** localized
  attribute-schema labels — `label` became `Map<String, String>` on every labeled node
  (`SportAttributeGroup`/`Definition`/`Option`/`Field`), `SportAttributeSchema` gained
  `defaultLocale`, and `SportAttributeSchemaValidator` now rejects a missing/malformed
  `defaultLocale` and any labeled node whose map lacks that locale's entry or carries a malformed
  locale key. Resolution (exact locale tag → language-only → `defaultLocale`) lives in a new
  standalone `SportAttributeSchemaLabelResolver`, called only from `SportController.getAttributeSchema`
  — never from `SportService.getAttributeSchema`, which `UserSportProfileServiceImpl` also calls on
  every profile write and which must stay locale-independent for `SportLookupCache`. The caller's
  locale comes from a plain `Locale` controller-method parameter, resolved by Spring's default
  `AcceptHeaderLocaleResolver` from `Accept-Language` — no manual header parsing. Since the two
  `GET` endpoints (A11) now genuinely return different shapes, added six `Resolved*` DTOs
  (`ResolvedSportAttributeSchema`/`DefinitionType`/`Group`/`Definition`/`Option`/`Field`, mirroring
  `location-api`'s `ResolvedMapsUrlResponse` naming) rather than widening `label` to `Object` —
  confirmed with the user before implementing rather than decided unilaterally. The member-facing
  `GET /api/sports/{sportId}/attribute-schema` now returns `ResolvedSportAttributeSchema`
  (`label: String`); the admin `GET /api/sports/all/{sportId}/attribute-schema` is unchanged, still
  the raw `SportAttributeSchema` (`label: Map<String, String>`). This was a breaking DTO change with
  a closing window (v2 design §11): free today only because A9 shipped unseeded and A15 (seeding)
  hasn't landed yet. No entity/migration change — `objectMapper.convertValue` already round-trips
  the new shape through `Sport.attributesSchema`'s untyped `Map`. Tests: `SportAttributeSchemaValidatorSpec`
  +13 (65 total), new `SportAttributeSchemaLabelResolverSpec` (11 cases: exact/language/default
  precedence, default-only resolves for any locale, full-tree resolution, every non-label field
  carried through unchanged), `SportAttributeSchemaIntegrationTest` +3 (16 total — the resolved-vs-raw
  pair asserted together per the ticket's own instruction, since a future change resolving the admin
  endpoint would silently break ADMIN-2). `ProfileAttributeFilterSpec`/`SportServiceImplSpec`/
  `UserSportProfileServiceImplSpec` fixed for the DTO shape change only, no behavioral changes needed.
  `:modules:sport:sport-impl:test` **179/179**, `:server:test` **121/121**, 11/11 real IT classes (no
  new authorization boundary — `@PreAuthorize` unchanged on both endpoints, only response
  shape/content changed). Unblocks **A15** (seeding) and client **SPORT-2**.
- **i18n readiness tracker filed (2026-08-24, `documentation/md/I18N_READINESS.md`):** app-wide i18n
  (static UI copy, locale switcher, `User.preferredLocale`) is **not built or designed anywhere in
  this codebase** — no library in `client/package.json`, only one unanswered question in
  `ARCHITECTURE_PROPOSAL.md`. Filed a `NOTIFICATION_USE_CASES.md`-style running list (numbered
  `I18N-<n>` entries) so the interactions surfaced while building A13 aren't lost before app-wide
  i18n is ever scoped: the UI's chosen locale must drive the `Accept-Language` header sent on
  attribute-schema requests (client `SPORT-2`) or the two go out of sync; a future
  `User.preferredLocale` field should feed A13's resolver, not exist in isolation; A13's BCP 47
  locale codes should be the one code system the app uses, not reinvented; backend error/validation
  messages are English-only today and unaddressed; the client's ~15 hand-mirrored backend enums are
  translatable surface too; the client stack (Vite, not Next.js) rules out Next-specific i18n
  libraries.
- **A15 (`DONE`, 2026-08-25,
  `modules/sport/sport-impl/docs/MVP/A15_SEED_BADMINTON_AND_PICKLEBALL_SCHEMAS.md`):** seeded
  Badminton's real v2 attribute schema — **no code change**, pure operational data-seeding via the
  admin `PUT` (through the client's `ADMIN-2` page, done by the user directly — no standing admin
  credentials in this environment, and a direct DB role-grant was correctly blocked by the auto-mode
  classifier as a mutating action). Verified independently afterward: the stored document is a
  structural match to `A15_BADMINTON_SCHEMA_V2.json`; the member `GET` resolves correctly for both
  the default locale and `Accept-Language: vi` (A13's resolver working end-to-end against real
  content for the first time); the raw locale maps were confirmed directly against the Postgres row;
  a real profile write exercising the deepest nesting the schema offers (`footwear` →
  `DEFINITION_LIST` of `Shoe` → nested `ShoeSize`) round-tripped correctly with the top-level
  `attributes` map still flat, then was deleted (no leftover test data). **Pickleball stays
  unseeded** — no real content exists for it anywhere, and the ticket explicitly sanctions seeding
  Badminton alone rather than inventing attribute names for a sport with immutable keys. Every key
  in the seeded document (`handedness`, `playstyle`, `rackets`, `racketString`, `shuttlecocks`,
  `footwear`, plus the `Reference`/`ShoeSize`/`Shoe` definitions) and all four `searchScope` pools
  (`equipment.racket.badminton`, `equipment.string.badminton`, `equipment.shuttlecock`,
  `equipment.shoe.court`) are now live and load-bearing for the first time since A9 shipped
  unseeded. Unblocks client `SPORT-2` with real content to render against, and gives the postponed
  **A14** real `searchScope` values to design against once it resumes.
- **Client SPORT-2 (`DONE`, 2026-08-26, `client/docs/MVP/SPORT-2_SPORT_ATTRIBUTE_CONFIG.md`):**
  `SportAttributesFields` — the v2 schema-driven renderer for a user's per-sport attribute fields,
  built against A15's real Badminton content. Reworked `shared/types/sport.ts` from the v1 shape to
  the full v2 tree (5-member `SportAttributeType` union, the `definitions` registry,
  `SportAttributeField`/`SportAttributeDefinitionType`, dropped the removed `version` field) and
  added the **resolved** twins (`ResolvedSportAttributeSchema` etc., 1:1 with the `Resolved*` Java
  DTOs — plain string labels, no locale maps) that the new `useSportAttributeSchema` hook consumes
  from the member-facing `GET /api/sports/{sportId}/attribute-schema`. Two scope decisions locked in
  before building: SPORT-2 itself builds the generic `DEFINITION_LIST` add/remove-row mechanic
  (plain STRING/ENUM/LIST controls per field, including a `Reference` row as two plain text boxes —
  SPORT-6 later only swaps those for its search combobox), and a nested `DEFINITION` record renders
  **inline** as an indented sub-section, never a sub-modal (this codebase has hit the nested-dialog
  aria-hide bug three times already). `isAvailable` parent-wins at both levels, an unknown `type` is
  skipped rather than crashed on, `LIST`/`DEFINITION_LIST` are capped client-side at
  `MAX_LIST_ITEMS = 10` (the server silently drops the whole value over the cap instead of
  erroring), and a `defaultValue` is seeded as a real controlled value via a one-time `onChange` on
  mount rather than a display-only illusion a save could silently omit. Required-field hints
  (`isRequired` on definition fields) are visual only — no Save action exists in this ticket to
  gate; that's PROFILE-4's job once it hosts this component. Retyping `SportAttributeSchema` to v2
  required fixing every place that constructed one: ADMIN-2's `AttributeSchemaEditor` empty-document
  constant (`version: 1` → `defaultLocale: 'en'`), its Storybook fixture, two admin test fixtures,
  and the MSW mock handler (`e2e/mocks/handlers/sport.ts`) — which also gained a small label
  resolver so the member-facing mock endpoint now genuinely returns the resolved shape instead of
  the raw admin one, matching A13's real split. Verified: 16 new Vitest/RTL tests plus the full
  suite (950/950 passing, no regressions), `tsc -b` clean, ESLint clean, Storybook production build
  clean (proves every new story renders without a runtime error). No live browser/Storybook-dev
  walkthrough — the Claude-in-Chrome extension wasn't connected this session. **No page hosts this
  component yet** — `PROFILE-4` (filed 2026-08-26, `client/docs/PROFILE_PAGE_DESIGN.md`) is the
  follow-up that finally does, alongside making `skillLevel`/`yearsOfExperience`/`preferredPosition`
  editable for the first time.
- **Client PROFILE-0 (`DONE`, 2026-08-26, `client/docs/MVP/PROFILE-0_TYPES_AND_HOOKS_SCAFFOLD.md`):**
  `/profile` page types + data-hooks scaffold — new `features/profile/` folder
  (`useMyProfile`/`useMySportProfilesRaw`/`useMyPosts`, `profilePageStore.ts`), no UI yet. Found and
  fixed a real backend gap along the way: `UserResponse` (`GET /api/users/{userId}`) never mapped
  `city`/`country` even though `UpdateProfileRequest` already persisted them — `toUserResponse()`
  was silently dropping both since day one (fixed in `user-api`/`user-impl`, new Spock coverage);
  see `modules/user/user-impl/docs/MVP/U11_...md`'s 2026-08-26 update for why this doesn't need
  rework once U11's public-endpoint PII narrowing ships. Also found `useUserPosts(userId)`
  (PROFILE-0's original spec) doesn't match the real `PostController` — there is no
  `GET /api/posts/user/{userId}`, only self-scoped `GET /api/posts/mine` — shipped as `useMyPosts()`
  instead, matching the page's own "own profile only" scope. Relocated `useUserProfile` from
  `features/friends/hooks/` to `features/profile/` (a generic by-id public-profile lookup, not
  friends-specific); Friends keeps using it unchanged for now. Filed two follow-ups (user decision):
  backend **U14** and client **FRIEND-2**, to give Friends its own purpose-built profile contract
  instead of continuing to borrow this one. Verified: new Vitest coverage for every hook/store,
  `tsc -b` clean, ESLint clean, `:modules:user:user-impl:test` and `:server:test` both green.
- **Client PROFILE-1 (`DONE`, 2026-08-26, `client/docs/MVP/PROFILE-1_PROFILE_HEADER.md`):**
  `shared/components/ProfileHeader.tsx` — the `/profile` page's cover-banner card (name, `@username`,
  city, bio, Edit profile button). Delta from spec: prop type is `UserResponse` (what PROFILE-0
  actually shipped), not the spec's assumed `MyProfile`. Design decision at pickup (user choice):
  the mockup's cover fallback is a dark band with a diagonal stripe pattern that exists nowhere else
  in this codebase — built the plain `GroupCoverBanner`/`FriendProfilePanel`-style band instead
  (`coverUrl` overlays when set, no pattern), avoiding a new token and a first-of-its-kind decorative
  treatment. `username`/`city` each render only if non-null, with the whole handle line omitted if
  both are null (bio's existing "no placeholder" rule extended to the two fields the spec didn't
  cover). 8 Vitest/RTL tests, 5 Storybook stories, production Storybook build green. No live browser
  walkthrough (Claude-in-Chrome not connected this session).
- **Client PROFILE-2 (`DONE`, 2026-08-26, `client/docs/MVP/PROFILE-2_POSTS_TAB.md`):** Posts tab —
  composer + the caller's own posts, fully real (`features/profile/usePostsTabData.ts` +
  `components/PostsTab.tsx`, reusing `CreatePostForm`/`Feed`/`CommentSection`/`HashtagPostsModal`
  unchanged). Two real bugs found and fixed before any UI landed. **(1)** `useLikePost`/
  `useUnlikePost`/`useDeletePost`/`useCreatePost` only reach query-cache buckets tagged in
  `optimisticFeedUpdates.ts`'s `POST_FEED_TAGS`, all under the `feedKeys` prefix — PROFILE-0's
  `profileKeys.myPosts()` lived under a separate `profile` prefix, invisible to all three. Fixed by
  repointing it at `feedKeys.all` and adding `'my-posts'` to `POST_FEED_TAGS` — no changes needed
  inside the mutation hooks themselves. **(2)** `PostServiceImpl.getUserPosts()` (`/posts/mine`, the
  first-ever client consumer of that endpoint) queried with no `postType` filter at all, so it could
  return `GROUP_SYSTEM`/`SESSION_POST` rows — internal anchors `post-impl/CLAUDE.md` documents as
  never reachable via `/api/posts/**`. Fixed server-side (user decision): new
  `PostRepository.findByUserIdAndPostTypeInAndIsActiveTrue`, scoped to `USER_FEED` only —
  `GROUP_POST`/`GROUP_BROADCAST` belong to a specific group's own feed, not a personal post history
  (narrowed from an initial 3-type list, user correction same day); 2 new Spock cases. Hashtag
  click-through wired to
  `HashtagPostsModal` (not left inert) for parity with every other post surface. 8 Vitest/RTL cases
  (composer sport-tagging incl. `'all'` omission, sport-pill filtering, like/delete/comment/hashtag
  wiring); no `PostsTab.stories.tsx` (every visual state already covered by `Feed`/`CreatePostForm`'s
  own stories, matching the `HomeFeedPage`/`GroupsPage` precedent of no stories for page-shaped
  composition components). `:modules:social:post-impl:test` + `:server:test` both green.
- **Client PROFILE-3 (`DONE`, 2026-08-27, `client/docs/MVP/PROFILE-3_MEMORIES_TAB_PLACEHOLDER.md`):**
  Memories tab placeholder — `features/profile/components/MemoriesTab.tsx` renders the existing
  `ComingSoonPage` with `title="Memories"`, no mock data or backend design attempted (no plausible
  data source exists yet for "on this day" memories). Built in isolation, same as `PROFILE-1`/
  `PROFILE-2` before page integration exists — `PROFILE-6` will mount it inside the assembled
  `ProfilePage`. 1 Vitest/RTL case; no Storybook story (matches `PostsTab`'s precedent, no new
  visual state to capture).
- **Client PROFILE-5 (`DONE`, 2026-08-27, `client/docs/MVP/PROFILE-5_EDIT_PROFILE_MODAL.md`):** Edit
  Profile modal — `shared/components/EditProfileModal.tsx` + `features/profile/useUpdateMyProfile.ts`
  + `features/profile/profileEditDraft.ts` (diff-only payload, `sportFieldsDraft.ts`'s pattern).
  **Widened at pickup (user decision)** from the original 8 fields to all 14 non-sport-profile
  `UpdateProfileRequest` fields — `phoneNumber`/`dateOfBirth`/`gender`/`heightCm`/`weightKg`/
  `shoeSizeCm` live on the same row/endpoint, so a planned `/ticket` split was folded in instead.
  Verified the live `PUT /api/users/{userId}/profile` contract directly against a running backend
  (curl, throwaway registered user) and found a pre-existing, repo-wide error-shape split
  (bean-validation `@Size` failures return the generic "Validation failed" in `message` with the
  real text under `data`; manually-thrown `BadRequestException` like U7's bounds checks put the
  real text directly in `message`) — `useRegister`/`useUpdateSport`/`useLogin` share the same
  extraction and the same gap, left as a known app-wide limitation, not fixed here. Built in
  isolation (no page hosts it yet — `PROFILE-6`); `ProfileHeader`'s `onEditProfile` stays a no-op
  until then. 9 new Vitest/RTL cases, 4 Storybook stories, production Storybook build green.
- **Client PROFILE-4 (`DONE`, 2026-08-27, `client/docs/MVP/PROFILE-4_SETTINGS_TAB_SPORT_PROFILE_EDITOR.md`):**
  Settings tab — per-sport profile editor (`skillLevel`/`yearsOfExperience`/`preferredPosition` +
  `SPORT-2`'s `SportAttributesFields`, finally hosted). **Scope grew at pickup (user decision):**
  `/profile` drops the `'all'` sport pill entirely, not just for this tab — retrofitted
  `profilePageStore` (`activeSport: SportKey | 'all'` → `SportKey | null`) and `PostsTab`
  (`PROFILE-2` delta) in the same pickup rather than leaving master inconsistent. New shared
  `useProfileActiveSport()` hook resolves the page's active sport, defaulting to the caller's first
  sport profile. Switching sport silently re-seeds/discards the draft (no confirm dialog) — this
  tab is built in isolation, before `ProfilePage` (`PROFILE-6`) exists, so it can't intercept the
  `SportSwitcher` click itself; noted for `PROFILE-6` to build a page-level guard if still wanted.
  `SportSwitcher` gained `showAllPill` (default `true`, unused by any page yet). Verified the real
  `PUT /api/sports/profiles/{profileId}` contract (including attribute-merge) against a running
  backend. 16 net new/changed Vitest/RTL tests, full suite green (150 files/1000 tests).
- **Client PROFILE-6 (`DONE`, 2026-08-27, `client/docs/MVP/PROFILE-6_PROFILE_PAGE_INTEGRATION.md`):**
  `/profile` page integration — `features/profile/ProfilePage.tsx` assembles `PROFILE-1`..`5` into
  the real page (`router.tsx`'s `/profile` now renders it instead of `ComingSoonPage`), plus a new
  `ProfileTabs.tsx` vertical rail nav (direct `GroupTabs` port). `PostsTab`/`MemoriesTab`/
  `SportProfileSettingsTab` needed zero prop wiring (already self-contained); the right rail wires
  the full `CreateSessionModal`/`SessionDiscoverModal`/`SessionDetailModal` stack verbatim, same as
  every other rail-hosting page, since `UpcomingMatches`' CTAs require it. Two decisions made
  explicit at pickup: added page-level Storybook stories despite no precedent on the three prior
  page-integration tickets (user decision — new pattern, since no `msw-storybook-addon` exists here:
  `apiClient.get` reassigned to a fixture map at story-module scope); and declined to build a
  `PROFILE-4`-flagged unsaved-Settings-changes guard on sport switch, since that would be new logic
  beyond this ticket's composition/wiring scope (left as a real known gap, not designed around
  silently). **Delta (post-push, user-flagged):** added the same "zero-sport-profile gate on page
  access" `GroupsPage`/`MatchesPage` have (auto-opens `AddSportModal` once if the caller has no
  sport profiles) — `ProfilePage`'s Settings tab is unusable without one, same reasoning as those
  two pages; direct port of the existing effect + `MatchesPage.test.tsx`'s two gate tests. Full
  Vitest suite green (152 files/1008 tests), `build-storybook` green, `tsc -b`/lint clean. No
  browser extension connected this session — could not visually confirm Storybook or walk the live
  page in a browser; `PROFILE-7` will produce the first real screenshot evidence.
- **Client PROFILE-10 (`DONE`, 2026-08-27, `client/docs/MVP/PROFILE-10_PROFILE_PAGE_ENHANCEMENTS.md`):**
  `/profile` page enhancements — 6 independent items filed together from a `/ticket` session, built
  one commit per item. (1) Hide the redundant sport badge on the Posts tab. (2) Raise `shoeSizeCm`'s
  bound 35→500, backend (`UserServiceImpl`) + client (`EditProfileModal`) together, folded into this
  ticket rather than a separate backend ticket (small change, user decision). (3) Settings-tab
  unsaved-changes guard — the big piece: converted `SportProfileSettingsTab` from self-contained to
  **controlled** (`ProfilePage` now owns `useSportProfileSettingsTabData()`, mirrors
  `GroupSettingsTab`/`GroupsPage`), exactly the refactor `PROFILE-4`'s own doc comment predicted
  would eventually be needed. New shared `useUnsavedChangesGuard` (`useBlocker` + `beforeunload`,
  extracted from `GroupsPage`'s `useSettingsUnsavedGuard`) guards tab switches, `SportSwitcher` pill
  switches (the exact case `PROFILE-6` had declined), and in-app navigation away from `/profile`.
  (4) Post composer unsaved-changes guard, app-wide — `CreatePostForm` itself uses the same shared
  guard hook, so Home Feed/Groups/`/profile` all get it for free; rippled into upgrading
  `CreatePostForm`'s/`HomeFeedPage`'s/`PostsTab`'s tests (and `CreatePostForm`'s stories) to a data
  router, since `useBlocker` requires one. (5) Bio renders italic, quoted. (6) `SportSwitcher` pills
  scale ~10% on hover/selected (raised from ~5% post-close, user decision), with `motion-reduce`
  overrides. Full Vitest suite green (153 files/1029 tests, +23 net new, no regressions),
  `tsc -b`/lint clean, `build-storybook` green, `:modules:user:user-impl:test` green. No browser
  extension connected — could not visually confirm;
  `PROFILE-7` remains the first real screenshot evidence.
- **Client PROFILE-7 (`DONE`, 2026-08-27,
  `client/docs/MVP/PROFILE-7_RESPONSIVE_A11Y_VISUAL_REGRESSION.md`):** `/profile` page hardening —
  responsive check + a11y gate (`a11y.spec.ts`) + visual-regression spec (`app-profile.spec.ts`, 4
  states × 3 breakpoints) against `design-reference-profile.html`, the first real screenshot evidence
  for this page. This was also the first ticket to run `/profile` through Playwright/MSW at all,
  which surfaced and fixed a real MSW test-infra gap (`GET /api/posts/mine` didn't exist; `GET
  /api/users/:userId` returned too narrow a shape for the caller's own profile) and two real bugs: a
  nested `<main>` landmark on the Memories tab (`ComingSoonPage`'s only call site left it stranded as
  a top-level component nested inside `ProfilePage`'s own `<main>`), and a composer overflow at
  375px in `CreatePostForm` (also latent on the already-shipped Groups page, never caught there since
  no overflow assertion existed for it — fixed with the same `overflow-x-auto`/`shrink-0` idiom
  `NavTabs` established in `HF-8`, verified via a stash/pop isolation that it changes nothing in
  Home Feed's/Groups' own baselines beyond pre-existing local Windows font-rendering noise). Full
  Vitest suite green (153 files/1029 tests, no regressions), `tsc -b`/lint clean, `build-storybook`
  green, full `--project=e2e` green (73/73), `--project=visual-regression app-profile.spec.ts` stable
  (12/12). Baselines are Windows-rendered locally, pending the usual `client-ci` `update-baselines`
  dispatch swap before merge.
- **Client PROFILE-8 (`DONE`, 2026-08-27,
  `client/docs/MVP/PROFILE-8_E2E_PROFILE_JOURNEY.md`):** `/profile` page's E2E functional journey —
  header/bio, `SportSwitcher`, posting from the composer, the comment modal, Settings tab save
  (skillLevel + a `SportAttributesFields` attribute), Edit Profile save, Memories placeholder — one
  `test()`, 7 `test.step`s, `e2e/flows/profile-journey.spec.ts`. Found and fixed two more real MSW
  mutation gaps (same class `PROFILE-7` found on the GET side): `PUT /api/sports/profiles/:profileId`
  and `PUT /api/users/:userId/profile` neither existed — `PROFILE-7`'s baselines only ever exercised a
  clean load, never a save. The latter also made `friends.ts`'s `GET /api/users/:userId` own-id branch
  session-scoped (`myProfileState`, seeded from `PROFILE-7`'s `mockMyProfile`) instead of a fixed
  constant, so a save now actually changes what the next `GET` returns. Full Vitest suite green (153
  files/1029 tests, no regressions), `tsc -b`/lint clean, `build-storybook` green, the new spec stable
  3/3 on repeat, full `--project=e2e` 73/74 (the one failure, unrelated to this ticket, passed in
  isolation on re-run).
- **SESSION-22 (`TODO`, 2026-08-20,
  `modules/session/docs/MVP/SESSION-22_FLAKY_SESSION_EVENTS_CONSUMER_RABBITMQ_IT.md`):** filed while
  verifying A7 — `SessionEventsConsumerIntegrationTest` fails intermittently with
  `AmqpIOException` connecting to its RabbitMQ Testcontainer, all 6 tests as a block, ~50% of runs
  (6 of 12), passing in isolation and on immediate retry with identical code. Initially
  **mis-attributed to A7** on the strength of one clean-tree run that passed; disproved when it
  failed again after a change that was nothing but a method rename, and passed again on re-run. The
  ticket records that cautionary detail explicitly, since the same wrong inference is easy to repeat.
- **Sport attribute schema design (2026-08-20,
  `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md`; tickets A9 backend + ADMIN-1/ADMIN-2
  client):** A3 (`DONE`) shipped `UserSportProfile.attributes` as a schema-less JSONB map with no
  per-key validation, explicitly rejecting a `sport_attribute_definitions` table and assigning the
  key list to a static frontend config. Three gaps followed: typo'd keys persist forever, there is
  no delete-a-key path (merge semantics can overwrite a value but not drop it, because the server
  doesn't know the legitimate key set), and adding a sport needs a client deploy before it has any
  attributes. Design moves the key set server-side as a per-sport, admin-managed **tree** of
  attribute definitions (level-1 group → level-2 attributes, e.g. Badminton's `Gear` holding
  `racket`/`shuttlecock`/`shoes`). **A3's "no schema storage" call is deliberately reversed and
  recorded as such** — what changed is the requirements (runtime admin management, per-attribute
  soft delete, display grouping), not the cost estimate. Key property preserved: the schema is a
  tree but **stored profile data stays flat** — leaf keys are unique per sport, so A3's entity,
  its V025 migration, and its merge semantics are untouched. Storage is a single
  `sports.attributes_schema` JSONB document rather than a definitions table: a table needs an
  adjacency list plus assembly for the tree, row-level CRUD screens for an admin surface the user
  explicitly wants built fastest-first, and a Liquibase migration for every new config property —
  where JSONB makes "we can add more later" free, and rides the existing `SportLookupCache`
  (already caches whole `Sport` entities, already evicts on admin write) so schema lookups during
  profile-write validation cost nothing. Not literal JSON Schema — a constrained descriptor tree
  with a closed `type` set (`STRING`/`ENUM`/`LIST`), since JSON Schema carries no label/order/widget
  and would need an `x-ui` layer plus validator dependencies on both sides; the closed set is also a
  trust boundary, because admin-authored data drives client rendering. Evolution policy decided up
  front so existing rows never need migrating: deactivate rather than delete, options are additive,
  keys are immutable (rename = add new + retire old), and stale keys pass through on read while only
  writes are validated. Schema is deliberately kept out of `SportResponse` so `GET /api/sports`
  doesn't carry every sport's tree. **Rescopes client SPORT-2** rather than replacing it: SPORT-2
  was briefly closed as superseded and reinstated the same day (user decision) at #3, because A9 and
  ADMIN-2 store and admin-edit the schema but neither renders it to a normal user on their own sport
  profile — that is SPORT-2's job. It now renders A9's fetched schema instead of the static config it
  originally proposed; that rescope was mandatory, since its original spec was keyed on
  football/basketball/tennis (deactivated by A6) and assumed the closed `SportKey` union SPORT-3
  replaced with a live-derived `string`, so it could not have been built as written. ADMIN-2 and
  SPORT-2 are siblings over the same schema: admin edits it, SPORT-2 renders it. Also filed
  ADMIN-1, the app's **first admin surface** (`/admin` route + role guard + shell): the guard is
  nearly free because `ProtectedRoute` already has a built-but-unused `requiredRole` prop, and roles
  are stored unprefixed (`ADMIN`) with `JwtAuthenticationFilter` adding `ROLE_` server-side.
- **Client SPORT-5 — re-read the sport catalogue on "Add sport", and say so when there is nothing
  to add (2026-08-23,
  `client/docs/MVP/SPORT-5_REFRESH_THE_SPORT_CATALOG_ON_ADD_SPORT_AND_SPEAK_UP_WHEN_THERE_IS_NOTHING_TO_ADD.md`):**
  a sport activated mid-session was invisible until something happened to refetch — the catalogue
  query is `staleTime: 0` and so refetches on mount and on window focus, but nothing refetched at
  *click* time, so a mounted, focused session kept serving whatever it last saw. The pill now
  re-reads `GET /sports` and only then decides what to open. **Reverses HF-2's `aria-disabled` pill:**
  holding every catalogue sport used to swallow the click entirely, explaining itself only through a
  hover `title` — invisible on touch and to keyboard users. It now opens `NoSportsToAddDialog`.
  Three corrections found at pickup and recorded rather than designed around: (1) `maxSports` is the
  **catalogue size**, not 3, so "at the cap" and "every sport held" were always the *same* state —
  which dissolved two of the ticket's own open questions; (2) `AddSportFields`' pre-existing "you
  already have every sport" message was unreachable in the normal path and *wrong* where it was
  reachable (only when the catalogue failed to load), which is why the new dialog splits on
  **availability**, not cap-vs-exhausted — a failed re-read falls back to the cached list and never
  claims completeness; (3) the backend's real 3-profile cap (`UserSportProfileServiceImpl`) is still
  unsurfaced client-side and would only bind if the catalogue grew past 3 — noted, unfiled. The
  nested zero-profile gates in `CreateSessionModal`/`SessionDiscoverModal` have no pill to intercept,
  so they re-read on modal open instead.
- **Client CLIENT-MODAL-1 — stale mutation error survives modal close/reopen (2026-08-23,
  `client/docs/MVP/CLIENT-MODAL-1_STALE_MUTATION_ERROR_ON_MODAL_REOPEN.md`):** a failed submit's
  error stayed on screen the next time a dialog opened. `AddSportModal`'s doc comment said it
  "resets on every open via a changing `key` prop" — and it did, but a remount only clears state the
  *child* owns; `isError` is a **prop** off the parent's mutation and survived untouched. **Widened
  at filing** to audit the class, and the audit found a clean discriminator worth reusing:
  **mutation-derived errors leak, query-derived ones do not** (a query refetches on reopen, so its
  error reflects live state). Of ten candidate dialogs, **8 leaked and 2 were cleared**
  (`HashtagPostsModal`, `CommentSection` — both purely query-backed). Fixed per-owner with
  `mutation.reset()` on close, preserving SPORT-1's presentational-modal + parent-owned-mutation
  split; three hooks that own both mutation and close handler took the reset internally, fixing
  every consuming page at once. Two findings beyond the ticket's framing: the add-sport error also
  feeds **nested** zero-profile gates inside `CreateSessionModal`/`SessionDiscoverModal` (`FriendsPage`
  renders no standalone `AddSportModal` at all), and `SessionDetailModal` reopens for a *different*
  session, so a failed join on session A was rendering its error against session B — wrong-entity
  attribution, not just staleness. All 8 fixes carry a regression test, each verified to fail with
  its fix reverted; `GroupsPage`'s two inline-JSX resets are covered by Playwright because no RTL
  test in this repo has ever rendered that page.
- **Client ADMIN-4 — logout from the admin area (2026-08-21,
  `client/docs/MVP/ADMIN-4_LOG_OUT_FROM_THE_ADMIN_AREA.md`):** `ADMIN-1` put `/admin` outside
  `AppShell` on purpose (no TopBar, no NavTabs), and TopBar's dropdown was the app's only logout
  control — so the admin area shipped with **no session exit at all**, an admin had to edit the URL
  bar to get out. Adds a Log out button to `AdminLayout`'s header, reusing `AUTH-4`'s existing
  `useLogout()` untouched (no new endpoint, no contract change). **Widened at filing** to include the
  unsaved-changes guard the admin forms never had: both `SportFieldsForm` and `AttributeSchemaEditor`
  already tracked `isDirty` internally but reported it nowhere, so any navigation silently discarded
  edits. Dirty state now travels child-route → parent via `<Outlet context>` (props cannot flow
  upward across an `<Outlet />`), and the confirm dialog is **Discard-only** — unlike GRP-2's, two
  independent forms with separate endpoints can be dirty at once here, so a single "Save" would have
  to fire both mutations and resolve partial failure. Key correction the ticket records: GRP-2's
  `useBlocker` is the *wrong* half of that precedent to copy, because logout POSTs first and only
  navigates in `onSettled` — a blocker would fire after the session was already cleared. Guards
  logout only; general `/admin` navigation still discards silently (pre-existing, still unfiled,
  along with a "back to app" link).
- **Current app version + slash-command version fallback (2026-08-20, `CLAUDE.md` § Current App
  Version, rules in `documentation/md/BACKLOG_STRUCTURE_CONVENTION.md` § Version resolution):**
  `/workon`, `/ticket` and `/list` were the only three commands taking a `<version>` argument, and
  every invocation had to repeat it even though all 12 backlogs are on `MVP` (only client, auth,
  group, post and chat have a second, `V1` file). Declared a single current app version in
  `CLAUDE.md` — chosen over a `.claude/settings.json` env var because CLAUDE.md is already in
  context every session (so the fallback resolves with zero extra file reads), is git-versioned and
  human-visible, and cannot drift per-machine the way a `settings.local.json` copy would. Made the
  rule a **ladder**, not a flat default: explicit argument wins → else the declared version *if that
  backlog file exists for the resolved scope* → else the scope's only `BACKLOG_<VERSION>.md` → else
  ask. The existence check on rung 2 is the point of the design: an unconditional fallback is
  correct only while every scope carries the declared version, and breaks the moment modules start
  finishing a version at different times (flip the declaration to `V1` and `/workon sport`, which
  has only an MVP backlog, aims at a file that does not exist). A resolved-not-typed version must be
  announced with its path before the command acts on it. `/list` is a documented exception and keeps
  its "report every version found" default — it is a read-only survey, and applying the ladder would
  narrow `/list client` from MVP + V1 down to MVP, dropping real rows from the one command whose job
  is showing what is open.
- **SESSION-16 (`DONE`, 2026-08-18,
  `modules/session/docs/MVP/SESSION-16_FIX_JOINSESSION_DEMOTING_AN_ALREADY_JOINED_CALLER_BACK.md`):**
  fixed the pre-existing bug SESSION-15 had documented but deliberately not fixed — an already-
  `JOINED` caller re-invoking `joinSession` on a non-`autoApprove` session was silently demoted back
  to `REQUESTED`. `joinSession` now returns immediately as a true no-op (no save, no outbox event)
  once `previousStatus == JOINED` is resolved, before the autoApprove ternary runs. Let the now-dead
  outer `previousStatus != JOINED` guard around the outbox-firing block (added defensively by
  SESSION-15 to suppress a spurious notification from this exact bug) be removed, since the early
  return now guarantees that precondition. Two Spock tests (`autoApprove` true/false) assert
  `0 * save` + `0 * outbox`, replacing the old single test that had only asserted the outbox side
  and accepted the demote-then-save as expected. No migration/DTO/controller changes; no new IT test
  (not an authorization-boundary change).
- **SESSION-18 (`DONE`, 2026-08-18,
  `modules/session/docs/MVP/SESSION-18_NOTIFY_JOINED_PARTICIPANTS_WHEN_A_SESSION_TRANSITIONS_TO.md`):**
  new `session.status.started` outbox event, fired by `SessionGenerationService.startOngoingSessions`
  (the scheduled job, not a request) when it flips a session `SCHEDULED`→`ONGOING`; notifies every
  `JOINED` participant, no client change. Resolved the ticket's 3 previously-open design questions:
  (1) **no-actor shape** — `SessionStatusStartedEvent` carries no `actorId` field at all (the first
  session event DTO without one), the consumer passes a literal `null` through the already-nullable
  `ParsedSessionEvent.actorId`; `NotificationServiceImpl.recordEvent` got a small guard skipping the
  `actorIds` list mutation on a null actor (still bumps `actorCount`) — confirmed and fixed the real
  NPE this would otherwise hit in `UuidListConverter` (`.map(UUID::toString)` over a list containing
  a null entry); `SessionEventProcessor`'s existing recipient filter needed no change, already
  null-safe. (2) the `recordEvent` fix shipped **as part of this ticket**, not a separate one — small
  and single-caller. (3) **extracted `SessionOutboxWriter`**, a new shared `session.service`
  component both `SessionServiceImpl` and `SessionGenerationService` inject, replacing
  `SessionServiceImpl`'s own private `recordOutboxEvent`/`buildOutboxEvent` pair (SESSION-15) —
  flagged and user-approved up front given the blast radius: ~11 existing `SessionServiceImplSpec`
  outbox tests converted from asserting on serialized-JSON payloads via a real `ObjectMapper` to
  asserting directly on the mocked writer's typed payload argument (a net simplification, not just a
  mechanical rename). No migration (reused the existing `session_outbox_events` table and
  `session.*.*` queue binding), no controller/client change. **Follow-up (same day, user asked "do
  we have enough IT?"):** identified that every Spock test for the null-actor fix mocks
  `NotificationRepository`, so none of them actually exercise the real `UuidListConverter` path
  that was the source of the NPE risk. Added a new real-RabbitMQ-testcontainer IT test to
  `SessionEventsConsumerIntegrationTest` — publishes a real `session.status.started` message,
  asserts a real `Notification` row persists with empty `actorIds`/`actorCount == 1` via a genuine
  Hibernate/DB round trip, closing both that gap and the new routing key's lack of real
  exchange/queue/binding coverage. Surfaced (not newly caused) that this sandbox's Testcontainers
  needs `DOCKER_HOST=npipe:////./pipe/docker_engine` set to find Docker — a pre-existing, already-
  documented `server/README.md` Troubleshooting entry, not a new gap.
- **SESSION-19 (`DONE`, 2026-08-19,
  `modules/session/docs/MVP/SESSION-19_NOTIFY_JOINED_PARTICIPANTS_ON_LEAVE.md`):** new
  `session.participant.left` outbox event, fired from `SessionServiceImpl.leaveSession` only on a
  genuine `JOINED`→`LEFT` transition — `previousStatus` is read before the in-place status flip,
  since afterward there's no way to tell which of the three allowed source states the leave came
  from. The `INVITED`→`LEFT` (declining an invite) and `REQUESTED`→`LEFT` (cancelling a request)
  outcomes the same method serves deliberately notify nobody. Recipients: other currently-`JOINED`
  participants, via the existing shared `getParticipantIdsByStatuses`; actor-exclusion was already
  free in `SessionEventProcessor`. Consumer half (`SessionEventsConsumer`) mandatory, not optional —
  its switch drop-and-logs unknown routing keys, so a producer-only change would have written outbox
  rows that silently never became notifications. **Status gate settled at pickup:** the ticket left
  it implicit; explored as possibly `SCHEDULED`-only, then confirmed by the user as
  `(SCHEDULED, ONGOING)` — exactly the shared method's existing behavior, so the event reuses it
  unchanged with **no new gate, no migration, no index change**. Two related questions were raised
  and answered along the way: (1) widening `idx_sessions_scheduled_status_only` to
  `IN (SCHEDULED, ONGOING)` was considered and **rejected** — the notification gate is an in-memory
  check after a `findById` PK lookup and never touches that index; the index's sole query
  (`findSessionsToStart`) is hardcoded to `SCHEDULED` and could never match `ONGOING` rows; and the
  `(SCHEDULED, ONGOING)` case is already served by the unscoped `idx_sessions_status_scheduled_start`
  that V052 deliberately kept alongside. (2) `SESSION-20` is genuinely independent under its
  confirmed scope (remove the gate for the **comment event only**), though its ticket was updated —
  the shared method now has **four** fan-out callers, not the three its text names. **Client gap
  found, filed not fixed:** `getNotificationText` has no case for this type, so it renders the
  generic fallback — and checking that switch revealed `session.status.started` (SESSION-18) has had
  the same gap since it shipped. Both filed together as **CLIENT-NOTIF-3**, honoring this ticket's
  own "no client/UI change" scope. **IT added after the fact (user asked "was IT included?" — it
  wasn't):** the approved plan said none was needed since this ticket changes no authorization
  check, but that read CLAUDE.md too literally — both Spock specs mock their collaborators, so
  nothing proved the real RabbitMQ→gate→DB path for the new routing key. Added
  `sessionParticipantLeftEvent_...notifiesRemainingJoinedParticipantsButNotTheLeaver` to
  `SessionEventsConsumerIntegrationTest` (leaver seeded as a `LEFT` row, the real post-leave state;
  asserts the remaining `JOINED` participant is notified and the leaver isn't). SESSION-18 needed
  nothing — its own `status.started` IT already covers its path. Verification: both module suites
  plus the mandatory `:server:test`, all green (`SessionServiceImplSpec` 85,
  `SessionEventsConsumerSpec` 10, `SessionEventsConsumerIntegrationTest` 4). One `:server:test` run
  failed broadly on `NoClassDefFoundError: Could not initialize class SharedRedisContainer` across
  ITs untouched by this change — attributed at the time to "container contention from three
  back-to-back container-heavy suites". **That explanation was wrong** — SESSION-20 root-caused it
  as intermittent Testcontainers *Docker discovery* failure, amplified by the containers' `static`
  initializers, and fixed it by restarting Rancher Desktop. See `server/README.md`'s Troubleshooting
  section. Not a code regression either way.
- **SESSION-20 (`DONE`, 2026-08-19,
  `modules/session/docs/MVP/SESSION-20_COMMENT_NOTIFICATION_STATUS_GATE_BUG.md`):** bug fix —
  `SessionServiceImpl.getParticipantIdsByStatuses` hardcoded a `(SCHEDULED, ONGOING)` session-status
  gate internally, so a comment on a `COMPLETED` session (post-game recap, which `SessionGate`
  explicitly permits) wrote its outbox row correctly and then fanned out to **zero** recipients.
  Fixed by making the session-status filter an explicit third parameter, with each of the four
  fan-out callers declaring its own set in `SessionEventsConsumer`: `session.comment.created` gets
  `ANY_SESSION_STATUS`, while `participant.joined`/`participant.left`/`status.started` keep
  `(SCHEDULED, ONGOING)` byte-for-byte. **Two alternatives rejected:** a separate
  `getCommentRecipientIds` (two near-identical methods on the cross-domain `-api` contract plus a
  branch in the processor) and removing the gate outright (explicitly out of scope — changes the
  other three events). **No 2-arg overload was kept** — an implicit default is precisely the trap
  the bug came from. `ANY_SESSION_STATUS` is built from `SessionStatus.values()` so a future fifth
  status is included by default, rather than being silently excluded the way `COMPLETED` was.
  **`CANCELLED` resolved at pickup:** it notifies too — the confirmed rule is now "if you can
  comment on it, your comment notifies". **The regression test was verified to actually regress:**
  the old gate was temporarily reinstated and the class re-run, failing exactly the two new
  parameterized cases and passing the other four — necessary because every Spock spec on this path
  mocks the collaborator that was broken (`SessionEventProcessorSpec` mocks `SessionService`,
  `SessionEventsConsumerSpec` mocks the processor), which is how the bug survived three tickets'
  worth of test-writing. Verification: both module suites plus the mandatory `:server:test`, all
  green (`SessionServiceImplSpec` 89, `SessionEventsConsumerSpec` 10,
  `SessionEventsConsumerIntegrationTest` 6). Hit the same intermittent Testcontainers failure
  SESSION-19 did, and **root-caused it this time — SESSION-19's "container contention" explanation
  was wrong.** Testcontainers was intermittently failing Docker *discovery* before any container
  existed; because each container starts from a `static` initializer, the throwing `<clinit>`
  poisons the class for the rest of the JVM, so dozens of unrelated ITs then fail with
  `NoClassDefFoundError` and the single real error is buried. Retrying is provably useless
  (`FAIL_FAST_ALWAYS` latches it), and neither unpinning `docker.client.strategy` nor raising
  `client.ping.timeout` helped. **Restarting Rancher Desktop fixed it** (daemon had 12+ days
  uptime): ~1-in-3 failure rate → 6 consecutive clean runs. A lazy-container-startup code change
  was built and deliberately dropped — it made the failure legible but couldn't prevent it, and the
  cause was environmental. Full write-up in `server/README.md`'s Troubleshooting section; no infra
  ticket filed, since it's a dev-environment issue rather than a repo one.
  **`NOTIFICATION_USE_CASES.md` updated:** NOTIF-1 marked `BUILT` with the correction recorded,
  NOTIF-3 logged retroactively (SESSION-19's write-up referenced that number but no entry existed),
  and **NOTIF-4** filed as a new `CANDIDATE` — fan-out currently notifies participants whose account
  is deactivated, since nothing filters recipients by `isActive`; cross-cutting across every
  trigger, and related to user-impl's U12.
- **SESSION-21 (`DONE`, 2026-08-19,
  `modules/session/docs/MVP/SESSION-21_SYSTEM_COMMENTS_IN_SESSION_THREAD.md`):** system comments in
  a session's discussion thread — server-written entries at the three moments that already emit
  outbox events (participant joined, participant left, session started), surfacing through
  SESSION-10's existing `SESSION_POST` comment-read path with no new API. **The ticket's one
  deliberately-unresolved question — a system comment has no author, but `Comment.user_id` is NOT
  NULL — was answered by precedent, not re-derived:** B9 had already solved the identical problem
  for `GROUP_SYSTEM` posts, and its shipped design settled almost everything (real user in the NOT
  NULL column + a type discriminator, *not* a nullable column, a sentinel UUID, or a separate
  table; additive CHECK migration; server-templated content with the name baked in; edit/delete
  blocked unconditionally "not even for the nominal author"; a CLAUDE.md rule so future trigger
  points don't miss it). Applied here as: author = `session.getCreatedBy()` (simpler than B9's
  `resolveGroupOwnerId` — `Session` already carries it), new `CommentType.USER`/`SESSION_SYSTEM` on
  `CommentResponse.commentType` (`V057`, `DEFAULT 'USER'` backfill, no truncation). B9's spoofing
  guard has **no analogue** — `CreateCommentRequest` has no type field, so there's nothing to spoof.
  Two things B9 didn't decide went to the user: one `SESSION_SYSTEM` value rather than one per event
  (faithful to `GROUP_SYSTEM`, content carries the specifics), and likes/replies **blocked** — the
  one place the ticket's expectation and B9 disagreed (a `GROUP_SYSTEM` post stays likeable),
  resolved in the ticket's favour. No dedupe on repeat join/leave; one entry per genuine transition,
  matching the outbox events' existing guards exactly (SESSION-16's already-`JOINED` early return,
  SESSION-19's `JOINED`-only leave). **Must-not-double-notify verified, not assumed:** the three
  paths never touch `session.comment.created`, asserted by `0 * ...record("session.comment.created")`
  in every new spec plus a positive test that a *real* user comment still emits it.
  `startOngoingSessions` writes its 200-per-pass batch through one `createSystemSessionComments`
  call (one validation query, one `saveAll`) rather than a call per session. The Redis
  comment-count increment is kept deliberately — that key's DB fallback counts system rows, so
  skipping it would make the cached count disagree with the uncached one. Two points the plan didn't
  cover, settled while implementing: `requireRequestedParticipant` now takes the resolved `Session`
  rather than an id (the first cut double-fetched, relying on Hibernate L1 cache — the mocked test
  flagged the extra `findById`), and two pre-existing specs were updated because the reply guard
  genuinely replaced `existsById` with `findById`. **Test-harness landmine found and documented:** `BaseIT.authenticateAs` only takes
  effect before a test method's *first* MockMvc request — a mid-test identity switch silently keeps
  the previous principal, which made an early version of the ordering IT pass for the wrong reason;
  now noted on `BaseIT.authenticateAs` itself. Verification: `:modules:social:post-impl:test` (152),
  `:modules:session:session-impl:test` (128), `:server:test` (100, incl. the new
  `SessionSystemCommentIntegrationTest`) all green, plus `V057` confirmed applied against the real
  dev Postgres. Client rendering stays out of scope, unfiled — `commentType` is the field it will
  branch on.
- **GRP-10 (`DONE`, 2026-08-18, `client/docs/MVP/GRP-10_GROUP_PAGE_VISUAL_REGRESSION.md`):** new
  `client/e2e/visual/app-groups.spec.ts` — closes the visual-regression gap GRP-1 flagged and never
  followed up on. 6 states × 3 breakpoints = 18 baselines (discovery, owner-posts with the Broadcast
  toggle on, member-posts, members-tab, settings-tab, chat-tab), full-page, same shape as
  `app-home-feed.spec.ts`. **Delta found at pickup:** the ticket's own "out of scope" note claiming
  `GroupChatTab` is still a local-state mock was stale — it's wired to the real chat service
  (CHAT-8) — so the `chat-tab` baseline seeds a message sent live through the real composer instead
  of a static mock render. **Real flakiness found and fixed, not local-Windows noise** (reproduced
  3x before the fix, 0x in 3 runs after): screenshotting before this page's several independent
  queries (settings, group info, members, approval queue, hashtags, broadcasts) all resolved raced
  `toHaveScreenshot`'s stability check — fixed with a `waitForContentSettled` helper that waits out
  every shared `Skeleton`/"Loading…" placeholder first. `client/docs/E2E_OVERVIEW.md` updated (§3 +
  new §6 entry). Full `pnpm exec vitest run` (878/878, 129 files) and `eslint .` both green — this
  ticket adds no unit-tested code, so that just confirms nothing else broke. **Remaining step for
  whoever merges this PR:** the 18 committed baselines are Windows-rendered (verified stable
  locally, 3/3 runs) — same "chicken and egg" HF-10b/SPORT-4 both hit, since triggering a GitHub
  Actions `workflow_dispatch` isn't possible from this environment. Needs the `client-ci` workflow's
  `update-baselines` dispatch → download `visual-baselines` artifact → replace
  `client/e2e/visual/__screenshots__/groups-*.png` → commit, before CI's real Linux runs of this
  spec will pass clean.
- **CLIENT-SESSION-12 (`DONE`, 2026-08-18,
  `client/docs/MVP/CLIENT-SESSION-12_SESSION_MODALS_VISUAL_REGRESSION.md`):** dialog-scoped visual
  regression for `SessionDetailModal` (7 states) and `CreateSessionModal` (3 states), two spec
  files matching `app-post-modal.spec.ts`'s shape, 30 baselines. Two real Phase 2 findings reshaped
  the plan: `SessionDetailModal`'s Cancel session button was removed entirely (CLIENT-SESSION-10),
  so there's no live path to a `CANCELLED` session anymore; and this mock backend has no second
  live identity (every joinable session has `autoApprove: true`, mockUser is never anyone else's
  invitee), so mockUser's own `INVITED`/`REQUESTED` states aren't reachable live either. Added 3
  new MSW fixtures (`mockInvitedSession`, `mockRequestedSession`, `mockCancelledSession`) as pure
  seed data to close both gaps — same "pre-seed the other side" precedent as
  `mockSessionJoinRequest` — confirmed with the user first since it was a real scope expansion
  beyond state selection. Fixed two real bugs found via `tsc -b`/live blinking-caret flakiness:
  `page.evaluate(() => document...)` doesn't typecheck under `e2e/**`'s DOM-less `lib`, fixed by
  matching the existing `document.fonts.ready` string-argument convention; a focused text input's
  blinking caret was a genuine pre-screenshot flakiness source, fixed by blurring
  `document.activeElement` first. **Cross-ticket ripple found by actually running the full `e2e`
  project, not just the new specs:** the 2 new group-linked fixtures also count as "upcoming"
  wherever `useUpcomingMatches` renders (Home Feed/Groups/Friends rails) — correct real behavior,
  but broke `home-feed-journey.spec.ts`'s hardcoded rail counts and made GRP-10's already-merged
  `groups-*.png` baselines stale. Fixed both (test counts + comment, regenerated all 18 GRP-10
  baselines) — user-approved before proceeding, given it touched an already-shipped ticket's
  output. **Same ripple bit a second time, more subtly**, in `friends-journey.spec.ts` (which also
  renders the shared rail): its `page.getByRole('button', { name: 'Accept' })` (non-exact) became
  ambiguous against the new session card's `"Tuesday drop-in — Accept"` button. Initially looked
  pre-existing (failed consistently, unrelated-looking locator/fixture text) — a network-trace
  check (zero `PUT` requests logged) plus an isolated A/B repro proved it was this ticket's own
  ripple, not pre-existing; fixed with `exact: true`, verified stable 3/3 runs, grepped every other
  spec for the same unscoped pattern (none found). Full verification: `tsc -b`/`eslint .` clean,
  `vitest run` 878/878, and — new for this ticket — a full `playwright test --project=e2e` run
  (51 specs): **51/51 passed** after both ripple fixes. `E2E_OVERVIEW.md` updated throughout.
  **Remaining step (same as GRP-10):** both this ticket's 30 new baselines and GRP-10's 18
  regenerated ones are Windows-rendered locally; need the `client-ci` `update-baselines` dispatch
  swap before CI's Linux runs pass clean.
- **CLIENT-NOTIF-2 (`DONE`, 2026-08-18,
  `client/docs/MVP/CLIENT-NOTIF-2_NOTIFICATION_BELL_VISUAL_REGRESSION.md`):** dialog-scoped visual
  regression for the `NotificationBell` popover (`empty`/`populated`/`with-load-more`, 9 baselines),
  matching `app-post-modal.spec.ts`'s shape — confirmed Radix's `Popover.Content` also renders
  `role="dialog"`, so the ticket's open "Popover vs Dialog" crop question resolved to "same harness,
  unchanged." Curated down from `NotificationBell`'s 6 Storybook states (user decision): `loading`/
  `error` stayed out, already covered by Storybook. New mock-server plumbing, all mirroring existing
  exact patterns: `notificationsEmpty` override, `seedNotificationsState` + an 11-item
  `paginatedNotificationsFixture.ts` for the load-more state. **One real Phase 5 finding:** the first
  `with-load-more` baseline didn't actually show the "Load more" button — it sits below the fold in
  the row list's own internal scroll container (`max-h-96 overflow-y-auto`), so `toBeVisible()`
  passed without the button ever entering the crop; fixed with `scrollIntoViewIfNeeded()` before the
  screenshot. Verification: `tsc -b`/`eslint .` clean, `vitest run` 878/878, new spec's own 9/9
  passed (visually reviewed all three states), full `playwright test --project=e2e` 51/51 passed
  (includes `notification-bell.spec.ts`'s own functional journey against the modified handlers — the
  strongest signal the new override/seed plumbing didn't regress anything). `E2E_OVERVIEW.md`
  updated. **Remaining step (same as every prior visual-regression ticket):** the 9 baselines are
  Windows-rendered locally; need the `client-ci` `update-baselines` dispatch swap before CI's Linux
  runs pass clean.
- **CLIENT-NOTIF-3 (`DONE`, 2026-08-19,
  `client/docs/MVP/CLIENT-NOTIF-3_NOTIFICATION_TEXT_FOR_MISSING_SESSION_TYPES.md`):**
  `getNotificationText` handled 6 of the 8 session routing keys the backend actually emits, so
  `session.status.started` (shipped by SESSION-18) and `session.participant.left` (SESSION-19) both
  rendered the generic "You have a new notification" fallback — a degraded-display bug, live since
  each event launched. Two new cases: `[actor, ' left ', entity]` mirroring
  `session.participant.joined`, and `[entity, ' has started']` which deliberately does **not** use
  `actorSegment` (SESSION-18 passes `actorId = null`, so `actorSegment` would render the
  bold-suppressed `'Someone'` and read as if a person started the session). **Gap enumerated rather
  than assumed at pickup:** every emitted routing key was grepped against every client case —
  exactly 2 missing, and the `group.*`/`user.profile_updated` keys that also turn up are chat-service
  sync events on a separate Redis Stream pipeline, not notification gaps. **Scope widened by the user
  at pickup** beyond the ticket's own out-of-scope list: the MSW default fixture gained both types
  (seeded `isRead: true` deliberately, so the unread count stays 2 and `notification-bell.spec.ts`'s
  badge/mark-all-read assertions kept testing what they were written to test), the fallback branch
  gained a dev-only `console.warn` naming the unmapped type (silent degradation is exactly how this
  hid twice), and `NotificationRow` gained `SessionStarted` + `UnknownType` stories. **One
  forward-looking test fix:** the fallback test asserted on `'post.comment.created'`, which
  `post-impl` B7 is queued to make a *real* routing key — swapped for `'not.a.real.routing.key'` so
  the test keeps meaning "genuinely unknown" rather than silently becoming
  "known-but-unimplemented." Verification: `vitest run` 884/884, `tsc -b`/`eslint .` clean,
  `playwright --project=e2e` 51/51 with `notification-bell.spec.ts` **unmodified**. **Baselines
  regenerated and committed the same day:** the bell list grows 3 rows → 5, so
  `notification-bell-populated-{375,768,1280}.png` were refreshed via the `client-ci`
  `update-baselines` dispatch (they were confirmed *not* regenerable locally — all 75 visual specs
  fail on this Windows host, verified by stashing every change and reproducing byte-identical diffs
  on a pristine tree, i.e. the documented Windows-vs-Linux font-rendering noise floor). SHA-256
  comparison of the artifact against the committed set showed **exactly the 3 predicted files
  changed and the other 72 byte-identical** — which incidentally confirms the committed baselines
  already matched CI, so the "still Windows-rendered, pending a dispatch" caveats on CLIENT-NOTIF-2,
  GRP-10 and CLIENT-SESSION-12 were stale rather than outstanding. Follow-up **CLIENT-NOTIF-4** filed
  for the recurrence risk: B7/B21/U13 will add 11 more notification types between them, each able to
  repeat this gap.
- **CLIENT-SESSION-13 (`DONE`, 2026-08-19,
  `client/docs/MVP/CLIENT-SESSION-13_SYSTEM_COMMENTS_IN_SESSION_THREAD.md`):** backend SESSION-21
  writes system entries into a session's discussion thread (participant joined/left, session
  started), authored by `session.getCreatedBy()` and marked `commentType = SESSION_SYSTEM` — but the
  client dropped the field, so those entries rendered as ordinary comments and a "Priya Shah joined
  the session" record was indistinguishable from Priya Shah having typed it. Fixed with an early
  return in the **shared** `CommentItem` (user decision at filing, over a session-local component)
  rendering a centered, avatar-less, muted row with no like/reply/delete — suppressing those is
  correctness, not styling, since SESSION-21 rejects all three server-side, so rendering them would
  offer the caller something the API refuses. **An estimate in the ticket was corrected before
  building:** it predicted adding a required `commentType` would ripple into ~27 files; measured via
  `tsc`, the real cost was 17 errors across 16 files, **all tests/stories/MSW fixtures and zero app
  source** (production code only spreads a `Comment`, never builds one), which made "required" cheap
  rather than costly. Also added a test for the nominal-author case specifically — the creator
  viewing their own session would otherwise pass `isOwnComment` and be offered a Delete the API
  rejects. Verification: `vitest` 891/891, `tsc -b`/`eslint` clean, `playwright --project=e2e`
  51/51; the rendered system row was confirmed by inspecting Playwright's `-actual.png` from a
  deliberately-failing visual run rather than by touching baselines. **A 9-failure e2e run was
  investigated rather than waved through** — all `a11y.spec.ts` `page.goto` timeouts caused by CPU
  contention with a concurrent `vitest` run (`retries: 0` locally), clean 51/51 on re-run.
  **Baselines regenerated and committed 2026-08-20** via the `client-ci` `update-baselines`
  dispatch (the thread gained a row; not producible on a Windows host) — SHA-256 comparison showed
  exactly the 3 predicted `session-detail-discussion-*` files changed, other 72 byte-identical.
  Two post-merge styling refinements landed on the same branch first (user feedback after seeing it
  running): content and timestamp on one italic line, then a `content - timestamp` dash separator —
  so the committed crops read *"Priya Shah joined the session - just now"*, which is also how the
  visual check confirmed the dispatch ran on the branch head rather than the original feature commit.

- **ADMIN-2 (`DONE`, 2026-08-21,
  `client/docs/MVP/ADMIN-2_SPORT_ADMIN_MASTER_DETAIL_PAGE.md`):** the first admin section with real
  behavior — a master-detail screen at `/admin/sports` for **updating existing sports**: a table of
  every sport (via the admin-only `GET /api/sports/all`, inactive ones included) beside a side panel
  editing both the sport's own fields (`PUT /api/sports/{id}`) and its A9 attribute schema as raw
  JSON (`PUT .../attribute-schema`). **Rescoped at pickup, by user decision**, from the filed
  "attribute schema editor only" — which explicitly excluded sport fields — because that scope had a
  dead end: the picker was specced to list inactive sports so an admin could configure one *before*
  activating it, but with no UI over `PUT /api/sports/{id}` nothing could then activate it, and the
  sport-catalog CRUD half was unfiled anywhere. `isActive` is a plain field on that same endpoint, so
  one form fixes both. **Two Save buttons, not one:** fields and schema are separate endpoints, and a
  combined save would fire two requests that cannot succeed or fail together — a schema rejection
  after a committed field write would leave a partial save with no rollback available. **Three
  backend constraints found by reading `SportServiceImpl` and then confirmed against a live
  server**, not inferred: (1) `getAttributeSchema` resolves through the active-only cache and **404s
  for an inactive sport** while `replaceAttributeSchema` uses `findById` and **accepts one** — so the
  panel gates on the catalogue's own `isActive` and never fires the doomed `GET`, because treating
  the 404 as "no schema yet" would prefill an empty document over a real stored schema and the next
  Save would destroy it; (2) `updateSport` is null-means-skip, so `description`/`category`/`iconUrl`
  cannot be cleared to `null` (the form sends only changed fields); (3) a duplicate-name rename
  returns **500, not 400** — no `existsByName` guard and no `DataIntegrityViolationException` handler.
  All three reproduced live, along with A9's verbatim validator messages and `data: null` for a
  schema-less sport (which is why the empty prefill is `{version:1,groups:[]}`, never `{}`).
  **Gaps (1) and (3) were then fixed in this same branch** as backend ticket **A11** (user decision
  mid-ticket, rather than deferring them) — so the screen's inactive-sport special case was deleted
  again before shipping, and an inactive sport now edits like any other. Gap (2) stands: expressing
  "unset a field" is a design decision, not a missing guard.
  Verification: `tsc -b` clean, lint 0 errors, Vitest **907/907**, Playwright e2e **57/57**.
  **Pre-existing e2e breakage found and cleared:** the entire suite was failing at login — confirmed
  by stashing this ticket's changes and reproducing — caused by a stale Vite process on port 5174
  that `reuseExistingServer` adopted without `VITE_API_PROXY_TARGET`, proxying `/api` to a dead
  :8080. **Outstanding:** no manual browser walk (Chrome extension not connected) and Storybook not
  visually reviewed, so the side-panel layout at 375px is unseen; creating/deleting sports still has
  no UI (out of scope by user decision). **SPORT-2 must not redeclare** the schema types — they now
  live in `src/shared/types/sport.ts` — and, since this editor treats the document as opaque JSON,
  the client-visible-enum obligation on `SportAttributeType` is in practice SPORT-2's alone. Note
  SPORT-2 reads the **member-facing** schema endpoint, which A11 deliberately left active-only, so it
  must decide what a member holding a profile for a since-deactivated sport should see — today that
  read 404s.
- **ADMIN-1 (`DONE`, 2026-08-21,
  `client/docs/MVP/ADMIN-1_ADMIN_AREA_ROUTE_AND_GUARD.md`):** the app's first admin surface — a
  `/admin` route guarded by `ProtectedRoute requiredRole="ADMIN"`, rendering a plain `AdminLayout`
  shell (heading, empty nav slot, `<Outlet />`) with an `AdminIndex` empty state until ADMIN-2 lands.
  **No new guard component:** `ProtectedRoute` already implemented `requiredRole` exactly as needed
  and its own comment noted "no route uses requiredRole yet" — this is that first use, and not a line
  of it changed. `requiredRole="ADMIN"` not `"ROLE_ADMIN"`: the backend stores roles unprefixed and
  `JwtAuthenticationFilter` adds the prefix server-side only. `/admin` sits **outside** `AppShell`
  (admin is not member-facing chrome, so no TopBar/NavTabs) but **inside** `RootLayout`, because that
  is where `useSessionBootstrap` runs — outside it, an admin hard-refreshing on `/admin` would be
  bounced to `/login` before the refresh-cookie check resolved. Two pickup decisions, both as filed:
  a non-admin keeps the **silent redirect to `/`** (a 403 page would be a `ProtectedRoute`-level
  change serving every future role-gated route, not something `/admin` invents), and the index renders
  an explicit empty state rather than a bare outlet. Deliberately **not linked** from anywhere.
  **Test scope expanded beyond the ticket, on the user's call:** the ticket listed only RTL +
  Storybook, but the e2e suite had **zero authorization coverage** — every spec logs in as `mockUser`
  with `roles: ['USER']` and no route had ever used `requiredRole`, so that branch had never executed
  in a browser. The same blind spot as the backend's 500-instead-of-403 bug found the day before.
  Added `e2e/flows/admin-route-guard.spec.ts` (2 cases, both roles), which required a second MSW
  account **and a second refresh-token string**: `/api/auth/refresh` returned a fixed `mockUser`, and
  since `page.goto('/admin')` is a full app mount the bootstrap refresh runs on arrival — with one
  shared token the admin would have been re-identified as a plain USER and redirected, failing for a
  reason unrelated to the guard. The handler now resolves the account from the cookie. Existing specs
  are byte-for-byte unaffected. **Divergence during implementation:** the RTL tests initially failed
  all 6 cases with `No QueryClient set` — rendering the real `routes` includes `RootLayout`, which
  calls `useSessionBootstrap()` on mount; fixed by matching `App.test.tsx`'s existing `renderApp`
  pattern. That is the cost of testing through the real `routes` export rather than a hand-built tree,
  and it is the right trade: a local tree proves `ProtectedRoute` works in isolation while saying
  nothing about whether `/admin` is actually nested under it. Verification: `tsc -b` clean, lint 0
  errors, Vitest **897/897**, Playwright e2e **53/53** (including the 4 `msw-setup` cases that
  exercise the changed login/refresh handler). Backend contract confirmed by reading the source:
  `UserResponse.roles` is a `Set<String>` mapped from `role.getName()`, so the wire shape is
  `["USER","ADMIN"]` — the one link MSW cannot prove. **Outstanding:** the manual browser walk was not
  done (Chrome extension not connected, port 8080 held by an unrelated server) — one manual pass is
  worth doing before merge. Also updated `client/docs/E2E_OVERVIEW.md` �3/�5/�6 for the new spec and
  fixture. **ADMIN-2 and SPORT-2 are now fully unblocked** (A9 merged 2026-08-20; ADMIN-1 shipped the
  shell).
- **CLIENT-NOTIF-4 (`DONE`, 2026-08-20,
  `client/docs/MVP/CLIENT-NOTIF-4_NOTIFICATION_TYPE_COVERAGE_GUARD.md`):** closes the gap that
  produced CLIENT-NOTIF-3 — a backend routing key shipping with no client text case, silently
  absorbed by `getNotificationText`'s fallback. The ticket deliberately left three approaches open;
  **chosen at pickup: the type guard + the process checklist, rejecting the contract guard.** Two
  codebase findings drove it. First, `Notification.type` was a bare `string` while the client
  hand-mirrors ~15 other backend enums as union types (a convention `client/CLAUDE.md` endorses) —
  so a backend-exposed contract would have been a novel mechanism for one concern while fifteen
  siblings stayed hand-mirrored; typing this one properly was both consistent and cheaper. Second,
  **neither guard alone catches the real failure**: the type guard makes it a compile error to add a
  union member without a case, but in both incidents nobody touched the client at all, so only the
  process checklist covers "backend shipped, client untouched." Built: an 8-member `NotificationType`
  union sourced from `SessionEventsConsumer`'s switch, a `const unhandled: never` exhaustiveness
  assertion in the `default:` branch (which now names the missing type in the build error), the
  runtime fallback deliberately retained for version skew, and a client-visible-enum check added to
  `.claude/commands/ticket.md` and `workon.md`. **Checklist scope widened at pickup (user decision)**
  from notification routing keys to any client-visible backend enum — CLIENT-SESSION-13 was the same
  bug arriving via `commentType`, so the narrower wording would have caught 2 of 3 recent incidents
  instead of 3. **The guard was proven to fire rather than assumed**: temporarily adding
  `post.like.created` to the union failed the build with `Type '"post.like.created"' is not
  assignable to type 'never'`, then reverted. Ripple measured, not estimated — 4 errors across 2
  files, all deliberate out-of-union literals. Verification: `tsc -b`/`eslint` clean, `vitest`
  891/891, e2e `notification-bell` 2/2 (an earlier 2-failure run was CPU contention with a concurrent
  `vitest` run, confirmed by re-running clean). No baselines move — nothing rendered changed.

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
- Push notifications (Firebase — see §2.7's confirmed decision and the notification vision doc's
  hybrid-delivery note for why this is a separate concern from the web client's STOMP delivery)
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
| STOMP relay port 61613 (Windows only) | `bootRun` can fail with `Connection refused: 127.0.0.1:61613` while RabbitMQ is healthy and `docker ps` shows the port published — Windows/Hyper-V has *reserved* the port, so Docker never bound the host side (`docker ps` prints the requested mapping either way, which is the misleading part). Ranges are dynamic and shift on reboot; 61613 sits inside the default `49152–65535` range. Fix + end-to-end verification: `server/README.md`'s Troubleshooting section. Container recreates, the STOMP plugin, and the `:::61613` IPv6 bind are all red herrings |
