# A3 · Fix `/api/auth/logout` authorization — implementation summary

**Ticket:** A3 (`modules/auth/docs/BACKLOG_MVP.md` #2), origin: BE-2 in the client's AUTH/FEED epic
**Date:** 2026-07-08
**Status:** DONE

## Approved design

`logout(@RequestParam UUID userId)` trusted a client-supplied id with no principal check — any
caller who could reach the endpoint could revoke a different user's session. Fix: derive the
caller from the authenticated principal via the app-wide `SecurityUtils.extractUserId(Authentication)`
pattern (same as `GroupController`/`PostController`), drop the `userId` param entirely, and require
authentication on this one route (`/api/auth/**` is otherwise public for login/register/refresh).

**Decision confirmed in Phase 1:** remove the `userId` parameter from the method signature
entirely (not "accept but ignore") — matches the ticket's own instruction and the app's existing
cross-domain-controller precedent.

## What was built

- `AuthController.logout`: `logout(Authentication authentication)`, calls
  `authService.logout(SecurityUtils.extractUserId(authentication))`. Same method also attaches
  A2's cookie-clearing header — both tickets touch this file, done together per the backlog's own
  "consider doing them in the same session" note.
- `SecurityConfig`: `.requestMatchers(HttpMethod.POST, "/api/auth/logout").authenticated()` added
  **before** the broader `.requestMatchers("/api/auth/**").permitAll()` (Spring Security is
  first-match-wins).

## Verification — and why this ticket grew into a much larger session

Spock's standalone MockMvc (used for `AuthControllerSpec`, since `auth-impl` has no Spring
context) can't exercise the real `SecurityConfig` filter chain, so this fix's actual authorization
behavior — "no token → 401" — needed either a real running server or a `server`-module
`@SpringBootTest` test. The design phase assumed the latter wasn't available either (see A2's
summary — that assumption was wrong, discovered here). Verification proceeded as follows, and each
step surfaced a genuinely separate, pre-existing bug — all fixed with the user's explicit
go-ahead at each step, none of it originally in scope for A2/A3:

### 1. Manual live verification (the original plan)

`./gradlew :server:bootRun` against temporary Docker Postgres/Redis containers. First attempt
**failed to start the app at all**:

> Circular dependency: `postController → postServiceImpl → groupServiceImpl → postServiceImpl`

`PostServiceImpl` depends on `GroupService` (9 call sites — membership/permission checks) and
`GroupServiceImpl` depends on `PostService` (3 call sites, all `getPostById` for pinned-post
resolution) — a genuine circular bean dependency, unrelated to A2/A3, in code that predates this
session (the group-spaces work). **Fixed:**
- `GroupServiceImpl`'s `postService` field marked `@Lazy` via an explicit hand-written
  constructor (Lombok's `@RequiredArgsConstructor` doesn't reliably copy `@Lazy` onto generated
  constructor parameters without a `lombok.config` entry — written out by hand instead of relying
  on that).
- **Bonus fix, found in the same code:** `GroupServiceImpl.getGroup()` and `.getPinnedPosts()`
  both called `postService.getPostById()` **inside a `.stream().map()` over a list** — an N+1
  query this repo's own `CLAUDE.md` explicitly forbids, and one A8 (group-impl backlog) had
  already flagged-but-not-ticketed as "much lower severity" due to the max-3 pin cap. Added
  `PostService.getPostsByIds(List<Long>, UUID): Map<Long, PostResponse>` (post-api + post-impl,
  batching via a new `PostRepository.findByIdInAndIsActiveTrue`), refactored both
  `GroupServiceImpl` call sites to batch. Also
  widened `PostServiceImpl`'s existing `getHashtagsForPage(Page<Post>)` helper to
  `getHashtagsForPosts(List<Post>)` so the new batch method could reuse it. Updated
  `GroupServiceImplSpec`'s two affected mocks accordingly.

With the app actually starting, **A2 and A3 were both verified live** (see A2's summary for the
A2 half): unauthenticated `POST /api/auth/logout` → 401; authenticated logout → 200 +
`Set-Cookie: refreshToken=; Max-Age=0`; a subsequent `/refresh` with that now-revoked cookie → 401
(proving the derived userId was correct and the revocation real, not just a green HTTP status).

### 2. `server:test` — chasing a full green backend build

Running the whole backend's tests (prompted by wanting a clean state before closing out) surfaced
`server:test`: 23 of 27 tests failing, `Column "height_cm" not found`. `server/src/test/resources/
schema.sql` (used by the `test` Spring profile — H2, `ddl-auto: none`, no Liquibase) is a **snapshot
from early in the project** (~8 tables, matching roughly migrations V001–V004) that was never kept
in sync with the other 21 migrations. Since almost every `BaseIT` test persists a `User` first,
one missing column family broke nearly everything. **Fixed (with explicit go-ahead, scoped to
what the actual failures needed — not a full 25-migration schema.sql audit):**
- `users`: added `height_cm`, `weight_kg`, `shoe_size_cm` (V024).
- `posts`: added `post_type`, `last_interaction_at`, `broadcast_end_time` (V016/V020/V023).
- Added the `hashtags` table entirely (schema.sql had `post_hashtags` but never `hashtags` itself)
  and the missing FK from `post_hashtags.hashtag_id`.

This dropped failures from 23 → 4, revealing they weren't all the same root cause:

### 3. The remaining 4 — three more distinct, unrelated bugs

- **`JavaRevisionTest`** — asserts a hardcoded JDK patch-revision string against `JavaRevision
  .memoryManagement()`; fails because this machine's JDK (21.0.10) differs from whatever the
  assertion was written against (21.0.1). Pure environment noise — **not touched.**
- **`GroupControllerTest` (~20 of the 23 original failures) + `PostControllerIntegrationTest
  .shouldCreatePost`** — `@WithMockUser`'s default principal is a Spring Security `UserDetails`/
  `User` object, but this app's entire identity convention (both `SecurityUtils.extractUserId`
  and `@AuthenticationPrincipal String`) assumes the principal is a bare userId string — exactly
  matching what `JwtAuthenticationFilter` really sets. Under `@WithMockUser` this threw
  `ClassCastException` (`SecurityUtils.extractUserId`) or silently bound `null`
  (`@AuthenticationPrincipal String` → `NullPointerException` on `UUID.fromString(null)`).
  **Fixed:** added `BaseIT.authenticateAs(UUID, String... roles)` — populates
  `SecurityContextHolder` with a `UsernamePasswordAuthenticationToken` whose principal is the raw
  userId string, matching production exactly — plus a paired `@AfterEach clearSecurityContext()`.
  Replaced all 25 `@WithMockUser(roles="USER")` occurrences in `GroupControllerTest` and the 1 in
  `PostControllerIntegrationTest` with a call to `authenticateAs(userId)` in each class's
  `@BeforeEach`. (Every test in both files uses the exact same caller identity — no test needed a
  second/different identity, so one call per `@BeforeEach` was sufficient.)
- **`GroupControllerTest.createGroup_Success`** — separate bug: `CreateGroupRequest.sportId` is
  now `@NotNull` (part of the group-sport-association work) but the test's shared `createRequest`
  fixture never set it. One-line fix (`.sportId(1L)` added to the builder).

### 4. The last failure — a real product-policy question, not a mechanical bug

`getGroup_WithoutUserId_Success` expected an **unauthenticated** `GET /api/groups/1` to succeed
with `getGroup(1L, null)`. Investigation showed `GroupServiceImpl.getGroup()` has **no
privacy/membership check at all** — it returns full group details (including pinned posts) to any
caller regardless of `isPrivate` or membership; the only actual gate is `SecurityConfig` requiring
*some* authenticated user (not membership-specific) for this endpoint, since `/api/groups/**`
isn't in the `permitAll()` list. So "anonymous viewing" was never actually supported by the
current security policy, and the test's premise was stale.

**User decision:** `GET /api/groups/{id}` requiring authentication is correct behavior — the test
should prove that boundary, not fight it. **Fixed:**
- Rewrote the test as `getGroup_WithoutAuthentication_ReturnsUnauthorized` — asserts 401 and that
  `groupService.getGroup` is never called.
- **Real content-level privacy/membership enforcement is a separate, deeper gap** (private groups
  currently leak full details to any logged-in user, member or not) — filed as **A9** in
  `modules/social/group-impl/docs/BACKLOG_MVP.md`, explicitly flagged as needing a product
  decision (what should happen for a non-member viewing a private group?) before implementation.

**One test-writing lesson from this step, worth keeping:** `SecurityContextHolder.clearContext()`
called manually inside a test method is **not reliably respected** by MockMvc's Spring Security
Test integration — the `@BeforeEach`-established authentication reappeared for the request
regardless (confirmed by adding a temporary diagnostic print inside `SecurityUtils.extractUserId`,
removed after). The correct, supported mechanism is
`.perform(request.with(SecurityMockMvcRequestPostProcessors.anonymous()))`, which is what the
final test uses.

### 5. One failure left, deliberately not fixed

`PostControllerIntegrationTest.shouldCreatePost` still fails: `PostServiceImpl.createPost` touches
Redis (the B3/B4 like-counter/comment-preview-cache features), and `application-test.yml`'s
`spring.data.redis.enabled: false` is **not a real Spring Boot property** — a no-op, same category
as `spring.security.enabled: false` in the same file. **Deliberately left failing** — filed as
**A8** in `modules/social/post-impl/docs/BACKLOG_MVP.md` with two candidate fixes (Testcontainers
Redis in `BaseIT`, likely paired with `infra/documentation/BACKLOG_MVP.md`'s **INFRA-2**
docker-compose ticket; or making the counter path test-profile-aware) — genuinely different
problem class from everything else in this detour, stopped rather than scope-creeping further.

## Final state

`server:test`: 25/27 passing. The 2 remaining failures are both filed as separate, unrelated
follow-up tickets (`JavaRevisionTest` is environment noise, not ticketed — see above). Every other
module (`common`, `auth-impl`, `group-impl`, `post-impl`, `user-impl`, `sport-impl`) passes in
full, confirmed via `--rerun-tasks` (not just Gradle's UP-TO-DATE cache) for every module touched
today.

---

**Status:** `DONE` (2026-07-08) · **Summary:** `modules/auth/docs/MVP/A3_FIX_LOGOUT_AUTHORIZATION.md`  
**Type:** Bug Fix (Security)  
**Origin:** BE-2 in `client/docs/sporthub-auth-feed-integration-tickets.md`.

`logout(@RequestParam UUID userId)` trusts a client-supplied `userId` with no auth check — any
caller who can reach the endpoint can revoke another user's refresh token. Verified still present in
`AuthController.java` on 2026-07-06.

**Fix:** derive the user from the authenticated principal (same `SecurityUtils.extractUserId()` /
`@AuthenticationPrincipal` pattern as post-impl/sport-impl's A1 tickets) and drop the `userId`
request param entirely.

**SecurityConfig check:** `/api/auth/**` is currently public (needed for login/register/refresh).
Logout must instead require an authenticated caller — add an explicit rule for
`POST /api/auth/logout` ahead of the broader `/api/auth/**` permit (same override pattern as
`GET /api/posts/feed` vs the public-GET convention). Verify rule ordering during Phase 2 explore.

**Client impact:** the new client's AUTH-4 ticket calls `POST /api/auth/logout?userId=` per the
current contract — once this ships, the call becomes `POST /api/auth/logout` with only the Bearer
header. Update `client/docs/BACKLOG_MVP.md`'s AUTH-4 note when this lands.

**Tests:** authenticated logout revokes the caller's own token; unauthenticated call → 401; a
supplied `userId` param (if tolerated at all) cannot revoke a different user's session.

---
