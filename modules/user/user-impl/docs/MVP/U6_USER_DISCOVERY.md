# U6 · User discovery — find people to add as friends

**Status:** DONE
**Module:** `modules/user/user-api` + `modules/user/user-impl`
**Date:** 2026-07-02

## What was built

A keyword search over other users so the caller can find people and send them a friend request —
distinct from the deferred partner/skill-matching feature (no sport/skill/geospatial filtering, just
name/username lookup).

- `GET /api/users/search?q={keyword}&page=&size=` (`ROLE_USER`)
- New `UserRepository.searchActiveUsers()` — JPQL `LIKE` match (case-insensitive, partial) on
  `firstName`/`lastName`/`username`, excludes the caller and soft-deleted users
- `keyword` is required — blank or under 2 characters (after trimming) throws `BadRequestException`
- New `UserSearchResponse` DTO: `id`, `fullName`, `username`, `avatarUrl`, `city`, `country`,
  `friendshipStatus`
- New `UserFriendshipStatus` enum (`NONE`/`PENDING_SENT`/`PENDING_RECEIVED`/`FRIENDS`) — distinct from
  the existing `FriendRequestStatus` enum (which describes a single request's state, not the caller's
  overall relationship to a specific other user, and can't distinguish sent-vs-received direction on
  its own)
- Friendship-status enrichment batches 3 existing `UserFriendService` calls once per page
  (`getAcceptedFriendIds`, `getPendingSentRequests`, `getPendingReceivedRequests`) rather than querying
  per search result — avoids N+1

## Key decisions

- **No `SecurityConfig` change needed.** `GET /api/users/**` has a filter-chain-level `permitAll()`,
  but confirmed (rather than assumed, per the ticket's explicit flag) that `@PreAuthorize("hasRole('USER')")`
  still independently rejects anonymous callers at the method level — this is the exact same pattern
  already proven working by the sibling `UserFriendController.getFriends()` in this same package.
- **`UserFriendService` injected directly into `UserServiceImpl`** — both interfaces live in the same
  `user` domain (`user-api`), so this is an intra-domain call, not a cross-domain violation. Confirmed
  no circular bean dependency: `UserFriendServiceImpl` only depends on repositories, not `UserService`.
- **`fullName` fallback**: `firstName + " " + lastName` when both present, else `username`, else
  `"Unknown"`. Deliberately does **not** fall back to email (unlike `UserResponse.getFullName()`,
  which does) — a public-ish search result shouldn't leak another user's email address.
- **`city`/`country` read directly from the `User` entity**, not via `UserResponse` — that DTO doesn't
  expose those fields today, and this ticket didn't need to change it.

## Non-obvious constraints

- No migration/entity changes — searches the existing `User` table as-is.
- **Found and fixed a missing dependency**: `modules/user/user-api/build.gradle` was missing
  `spring-data-commons`, so `Page`/`Pageable` couldn't be used in the `UserService` interface (unlike
  sibling `-api` modules like `post-api`, which already had it). Added it — needed regardless of this
  ticket's specific feature, since any `-api` interface returning `Page<T>` requires it.

## Tests

8 new tests in `UserServiceImplSpec.groovy` (34 → 42): default `NONE` status, `FRIENDS` when accepted,
`PENDING_SENT` when caller sent a request, `PENDING_RECEIVED` when caller received one, `fullName`
fallback to username, blank keyword rejected, too-short keyword rejected, keyword trimmed before
querying. Full module suite: 79 → 87 tests, 0 failures, 0 errors.

Run with: `./gradlew :modules:user:user-impl:test`

---

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
