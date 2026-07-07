# A1 · JWT-based identity

**Module:** `modules/social/post-impl`  
**Type:** Enhancement (Security)  
**Completed:** 2026-06-30

## What was built

Replaced all caller-identity `@RequestParam UUID userId` / `currentUserId` params in `PostController` with JWT-principal extraction. No service-layer changes.

**9 write endpoints** — `@RequestParam UUID userId` replaced with `@AuthenticationPrincipal String userIdStr`, then `UUID.fromString(userIdStr)` at the call site. Spring Security resolves the principal from the validated JWT via `JwtAuthenticationFilter`.

**5 read endpoints** — `@RequestParam(required = false) UUID currentUserId` replaced with `Authentication authentication` passed to `SecurityUtils.extractUserId(authentication)` (returns `null` for unauthenticated callers, preserving existing open-access behaviour for feed/post reads).

**Endpoint rename** — `GET /api/posts/user/{userId}` removed. Replaced with `GET /api/posts/mine` (`@PreAuthorize("hasRole('USER')")`). The authenticated userId is used as both the target and viewer, so unauthenticated calls return 401 rather than exposing any user's posts.

## Key decisions

- **Pattern reuse** — identical to group-impl A1: `@AuthenticationPrincipal String userIdStr` for required-auth endpoints, `Authentication` + `SecurityUtils.extractUserId()` for optional-auth reads.
- **Controller-only scope** — service interfaces and implementations are unchanged; the userId still flows in as a `UUID` parameter so no service contracts were broken.
- **`GET /api/posts/mine` viewer = caller** — passes `userId` as both the `targetUserId` and `viewerUserId` arguments to `postService.getUserPosts()`, which is correct: you can always see your own posts regardless of visibility.

## Non-obvious constraints

- `SecurityUtils.extractUserId()` is in `com.sportconnect.common.auth` — import it from `common`, not from any `-impl` module.
- The old `GET /api/posts/user/{userId}` endpoint is now dead. Any frontend or API client using it will receive 404. Frontend migration to `/api/posts/mine` is out of scope for this ticket.
