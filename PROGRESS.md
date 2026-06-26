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

#### `modules:sport:sport-api` + `modules:sport:sport-impl`
- `Sport` entity: name, description, category, icon_url, min/max players, soft delete
- `UserSportProfile` entity: skill level, experience, preferred position, unique `(user_id, sport_id)`
- Full CRUD services; `SportController` at `/api/sports/**`
- V013 migration: updates sports table with thumbnail URLs and metadata

#### `modules:social:post-api` + `modules:social:post-impl`
- `Post` entity: content (5000 chars), geolocation, sport, visibility, soft delete
- `PostMedia`, `Comment` (nested replies), `PostLike`, `CommentLike` entities
- `Hashtag`, `PostHashtag`, `UserFollow` entities (tables exist, services not yet implemented)
- `PostServiceImpl`, `CommentServiceImpl`
- `PostController` — 12 endpoints: create/read/update/delete posts, like/unlike, comment CRUD

#### `modules:social:group-api` + `modules:social:group-impl`
- `Group`, `GroupMember`, `GroupRole` (pre-seeded: owner/admin/member), `GroupJoinRequest`, `GroupSettings` entities
- `GroupServiceImpl` (600+ lines): full business logic, permission checks, ownership transfer, settings
- `GroupController` — 24 endpoints: group CRUD, member management, join request workflow, settings, permission checks
- Business rules enforced: unique names, owner-only delete, one pending request per user per group, owner cannot leave without transferring

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

### 3.2 Frontend (React 18, TailwindCSS, Lucide React icons)

**Authentication UI** (fully connected to backend):
- `LoginPage.jsx` — email/password, error handling
- `RegisterPage.jsx` — full validation, success redirect
- `AuthContext.jsx` — global state, localStorage token persistence, `isAuthenticated`
- `ProtectedRoute.jsx` — redirects unauthenticated users
- `client/src/utils/api.js` — axios instance with auth interceptor + automatic 401 token refresh

**Social Feed UI** (fully connected to backend):
- `CreatePostForm.jsx` — content, location, visibility
- `PostCard.jsx` — avatar, content, media grid, like/comment/share buttons, relative timestamps, delete own post
- `CommentSection.jsx` — nested comments, like comments
- `SocialFeed.jsx` — paginated feed, "Load More", empty state

**Groups UI** (fully connected to backend):
- `GroupContext.jsx` — state management for user groups and selected space
- `GroupSidebar.jsx` — navigation between User Space and groups, role badges
- `CreateGroupModal.jsx`, `JoinGroupModal.jsx` — modals with validation

**App Routing** (`App.js`):
- `/login`, `/register` (public) → `/feed` (protected, `FeedPage` + `GroupSidebar`)
- Unauthenticated users redirected to `/login`

### 3.3 Test Coverage (all Spock Framework, Groovy)

| Module | Tests | Coverage |
|---|---|---|
| auth-impl | ~35 (4 files) | JWT lifecycle, refresh token, auth filter, token entity |
| user-impl | 23 (3 files) | UserService CRUD, User/Role entity, geospatial |
| sport-impl | ~20 (4 files) | SportService, UserSportProfileService, entities |
| social/post-impl | 13 (1 file) | PostService CRUD, likes, feed, auth checks |
| social/group-impl | 45 (2 files) | GroupService + GroupController, permission system |

**Total: ~136 unit tests, all passing.**

---

## 4. In-Progress / Partially Implemented

### 4.1 Forgot-password endpoint is a placeholder
`AuthController.forgotPassword()` returns success but does not look up the user by email or send a reset email. Needs integration with `UserService.getUserByEmail()`.

### 4.2 Social feature tables exist but no service implementation
These tables were created in V004/V005 but have no business logic or API:
- User following/followers (`user_follows`)
- Hashtag extraction and search (`hashtags`, `post_hashtags`)
- Post sharing (`post_shares`)
- Notifications (`notifications`)
- User blocking (`user_blocks`)
- Post reporting (`post_reports`)

### 4.3 Sport thumbnail images not placed yet
The directory `modules/sport/sport-impl/src/main/resources/images/sports/` and V013 migration exist, but the 12 PNG image files need to be placed there and a `WebMvcConfigurer` ResourceHandler needs to be configured.

### 4.4 Scratch files in production modules
- `SportConnectApplication.java` contains an unrelated `lengthOfLongestSubstring()` LeetCode method
- `modules/user/user-impl/src/main/java/com/sportconnect/user/leetcode.java` and its Spock spec are scratch files

---

## 5. Planned / Upcoming Features

### Immediate Next (backend completions)
- **Complete forgot-password** — wire up UserService lookup in `AuthController`
- **User following system** — follow/unfollow API, follower/following counts, followed-user feed filter
- **Hashtag service** — extract hashtags on post create, hashtag search endpoint
- **Feed algorithm** — relevance scoring: `(Relevance × 0.4) + (Engagement × 0.3) + (Recency × 0.2) + (Social × 0.1)`
- **Notifications service** — in-app notifications for likes, comments, follows, group events
- **Post sharing** — repost to own feed, share to group

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
- WebSocket (Spring STOMP) — dependency already in `server/build.gradle`
- 1-on-1 direct messages, group chats
- Read receipts, typing indicators, message reactions
- Tables needed: `conversations`, `conversation_participants`, `messages`, `message_reactions`

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
