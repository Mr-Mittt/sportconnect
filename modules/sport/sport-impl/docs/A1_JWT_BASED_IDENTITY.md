# A1 · JWT-based identity

**Status:** DONE
**Module:** `modules/sport/sport-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation, corrected from the ticket's original text:

The ticket named `SecurityUtils.extractUserId(Authentication)` as the reuse target, but checking
the established, already-`DONE` convention in group-impl/post-impl's own A1 tickets showed two
distinct patterns depending on the endpoint:
- **Required-auth write endpoints** → `@AuthenticationPrincipal String userIdStr` +
  `UUID.fromString(userIdStr)` at the call site.
- **Optional-auth read endpoints** (anonymous access allowed) → `Authentication authentication`
  param + `SecurityUtils.extractUserId(authentication)` (returns `null` if unauthenticated).

`POST /api/sports/profiles` is `@PreAuthorize("hasRole('USER')")` — a required-auth write endpoint,
so it matches the first pattern, not the one the ticket named. Corrected design:
```java
@PostMapping("/profiles")
@PreAuthorize("hasRole('USER')")
public ResponseEntity<ApiResponse<UserSportProfileResponse>> createProfile(
        @AuthenticationPrincipal String userIdStr,
        @Valid @RequestBody CreateUserSportProfileRequest request) {
    UUID userId = UUID.fromString(userIdStr);
    UserSportProfileResponse response = profileService.createProfile(userId, request);
    return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Sport profile created successfully", response));
}
```
No service-layer changes (matches the ticket's stated scope: `SportController.java` only).

Implementation matched this corrected design exactly — no further divergence.

## What was built

- `POST /api/sports/profiles` — `@RequestParam UUID userId` replaced with
  `@AuthenticationPrincipal String userIdStr` (parsed via `UUID.fromString`). The caller's identity
  now comes from the validated JWT principal instead of a client-supplied, spoofable request param.
- All other `SportController` endpoints were left unchanged — confirmed via reading the full
  controller that every other `userId` is a `@PathVariable` identifying the *target* user being
  looked up, not the caller, so they're out of scope per the ticket.
- Removed the now-unused `org.springframework.web.bind.annotation.RequestParam` import.

## Key decisions

- **Corrected the ticket's suggested reuse target** (see Design) rather than following it literally
  — verified against the actual proven pattern in two already-`DONE` sibling tickets instead of
  assuming the ticket text was authoritative.

## Non-obvious constraints

- No service-layer or DTO changes — `UserSportProfileService.createProfile(UUID, CreateUserSportProfileRequest)`
  keeps its existing signature; only the controller's *source* of the `userId` argument changed.

## Tests

No test changes needed: `UserSportProfileServiceImplSpec` tests the service layer directly (calls
`createProfile(userId, request)`, unaffected by the controller change), and no controller-level or
integration test exists for `SportController` in this codebase (confirmed via search).

Run: `./gradlew :modules:sport:sport-impl:test` — all pass (no test changes, so this just confirms
nothing else broke). `./gradlew :modules:sport:sport-impl:compileJava` succeeds. `:server:bootRun`
reaches the expected local-Postgres connection failure (no local Postgres running in this sandbox,
same environmental limitation noted throughout this session) — no risk here regardless, since this
ticket added no new query, only an annotation-level identity-source change.
