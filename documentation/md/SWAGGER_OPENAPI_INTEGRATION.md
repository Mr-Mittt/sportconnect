# Swagger/OpenAPI Integration — Documenting All 96 Endpoints

**Status:** Done
**Date:** 2026-07-08

## Design

`springdoc-openapi-starter-webmvc-ui:2.3.0` was already a `server` dependency and
`application.yml` already exposed `/api-docs` + `/swagger-ui.html`, so bare auto-generated docs
existed — but with zero annotations anywhere (confirmed via a repo-wide search before starting).
Every one of the app's 96 endpoints across 9 controllers showed up in Swagger UI with no summary,
no grouping, no documented error responses, and no way to authenticate as a user from the UI (no
security scheme registered).

**Also found and fixed as part of this work, not a separate ticket — it directly blocked the
security-scheme piece:** `application.yml` customizes `springdoc.api-docs.path` to `/api-docs`,
but `SecurityConfig`'s permitAll matchers only allowed the springdoc default path
(`/v3/api-docs/**`). Unauthenticated callers were getting a 401 fetching the actual OpenAPI JSON
document, even though the Swagger UI HTML itself loaded fine.

## Scope

Confirmed with the user before starting: **tags + summaries + response codes**, not full per-DTO
field documentation.

- `@Tag` per controller class (Swagger UI grouping)
- `@Operation(summary=..., description=...)` per endpoint — reused existing Javadoc text as the
  source where a method already had it
- `@ApiResponses` documenting realistic status codes per endpoint, derived systematically and
  verified against the actual code (see below) — not templated or guessed
- DTO fields: relied on springdoc's automatic schema inference from Java types + existing
  `jakarta.validation` annotations. Two narrow exceptions promoted existing trailing comments to
  `@Schema(description=...)`: `CreatePostRequest.visibility` and `.broadcastEndTime`, since that
  content already existed, just in the wrong place for springdoc to surface it.

## What was built

### Global OpenAPI config

`server/src/main/java/com/sportconnect/config/OpenApiConfig.java` (new) — registers a named
`bearerAuth` HTTP-bearer security scheme (matching `JwtAuthenticationFilter`'s
`Authorization: Bearer <token>` convention exactly) and applies it as the API-wide **default**
security requirement. Individual public endpoints opt out per-method with `@Operation(security = {})`
rather than every protected endpoint opting in — a missed opt-out only shows an unnecessary padlock
in Swagger UI, whereas a missed opt-in would silently document a protected endpoint as public.

### `SecurityConfig` fix

Added `/api-docs/**` (the actual customized path) alongside the existing `/v3/api-docs/**` in the
permitAll matchers.

### Per-controller annotation pass

All 9 controllers, 96 endpoints:

| Module/domain | Controller(s) | Endpoints |
|---|---|---|
| auth | `AuthController` | 7 |
| sport | `SportController` | 13 |
| user | `UserController`, `UserPreferenceController`, `UserFriendController` | 19 |
| social/post | `PostController`, `HashtagController` | 19 |
| social/group | `GroupController` | 36 |
| server (non-domain) | `HealthController` | 2 |
| **Total** | **9 controllers** | **96** |

Response codes were derived from two verified sources, not assumed:
- `GlobalExceptionHandler`'s exact exception-to-status mapping: `BadRequestException`→400,
  `ForbiddenException`→403, `UnauthorizedException`→401,
  `{NotFoundException, ResourceNotFoundException}`→404, `MethodArgumentNotValidException`→400.
- Each controller method's actual service call(s), grepped for `throw new`/`orElseThrow` to find
  every exception it can realistically produce, rather than templating a generic set per HTTP verb.

**Real, non-obvious findings this verification surfaced** (documented in the code, not silently
"corrected" to what might seem more conventional):
- **`post-impl` and `group-impl` use `BadRequestException` (400), not `ForbiddenException` (403),
  for every single ownership/permission check** — "only the owner can delete this," "only
  group admins can...", etc. all resolve to 400 in the actual code across both modules, verified
  by grepping every `throw new` in `PostServiceImpl`, `CommentServiceImpl`, and
  `GroupServiceImpl`. This is consistent enough to be a deliberate (if debatable) convention, not
  a one-off bug — documented as 400 to match reality, with a note in the affected `@Operation`
  descriptions so a consumer isn't surprised.
- **Friend-request accept/decline/cancel are 404, not 403, for a non-owner.** `UserFriendServiceImpl`
  scopes the lookup itself by receiver/sender id (`findByIdAndReceiverId`, `findByIdAndSenderId`),
  so a request id that exists but wasn't addressed to the caller returns empty →
  `NotFoundException`, never reaches an ownership check that could throw 403.
- **`GroupController`'s 4 permission-check endpoints (`is-owner`/`is-admin`/`is-member`/`user-role`)
  and `getPublicGroups`/`getUserGroups`/`getUserJoinRequests`/`getUserPendingInvitations` never
  throw at all** — a nonexistent group or non-membership resolves to `false`/`null`/an empty page,
  not a 404. Documented as such rather than assuming a 404 "should" exist.
- **`GET /api/groups/public` is not actually public**, despite the controller defensively handling
  a null caller id (`userIdStr != null ? ... : null`). `/api/groups/**` isn't in `SecurityConfig`'s
  permitAll list, so the URL-level filter requires authentication before the controller code ever
  runs — the null-handling is dead code under the current config. Documented as requiring auth
  (401), matching actual behavior over the code's apparent intent.
- **`GET /api/health` and `GET /api/info` require authentication**, unlike `/actuator/health` —
  neither is in the permitAll list. Flagged in the `HealthController`'s `@Tag` description as a
  likely-unintended gap; not fixed here (a behavior change beyond this ticket's scope).

### Gradle

No new dependency on `server` (already gets swagger-annotations transitively via springdoc). Added
`compileOnly 'io.swagger.core.v3:swagger-annotations-jakarta:2.2.19'` to every `*-impl` module with
controllers (`auth-impl`, `sport-impl`, `user-impl`, `post-impl`, `group-impl`) and to `post-api`
(for the `CreatePostRequest` `@Schema` additions) — version confirmed via
`./gradlew :server:dependencies` (springdoc 2.3.0 resolves swagger-core 2.2.19), not guessed.

### Small doc corrections found along the way

`modules/auth/docs`'s `CLAUDE.md` and `modules/sport/sport-impl/CLAUDE.md` both still documented a
`?userId=` query param on endpoints where JWT-identity tickets (A1 in each module) had already
removed it. `modules/social/group-impl/CLAUDE.md` said "24 endpoints" — the actual, now-recounted
total is 36. Fixed all three while already reading these files closely for the response-code work.

## Verification

1. `./gradlew build` — full backend build (compile + all Spock suites across every module +
   packaging) succeeded, zero regressions.
2. `./gradlew :server:bootRun` against the dev docker-compose stack (Postgres+PostGIS, Redis);
   confirmed live:
   - `GET /api-docs` → `200` unauthenticated (the `SecurityConfig` fix)
   - Parsed the generated spec: **96 operations across 78 paths, 9 tags** — matches the inventory
     exactly; `components.securitySchemes.bearerAuth` present; global `security: [{"bearerAuth":[]}]`
   - Registered a real user via `POST /api/auth/register`, used the returned JWT to spot-check
     documented codes against live behavior:
     - `GET /api/posts/mine` with no token → `401` (matches doc)
     - Same request with `Authorization: Bearer <token>` → `200` (matches doc)
     - `GET /api/sports/99999` (nonexistent id) → `404` (matches doc)
     - `GET /api/hashtags/trending` (no token) → `200` (matches doc — genuinely public)
   All four spot-checks matched the documented response codes exactly.

## Non-obvious constraints for future endpoints

- New endpoints inherit the global `bearerAuth` requirement automatically — only add
  `@Operation(security = {})` for genuinely public endpoints (verify against `SecurityConfig`'s
  permitAll matchers first, not just the presence/absence of `@AuthenticationPrincipal`/
  `Authentication` in the method signature — `getPublicGroups` proved that heuristic alone isn't
  reliable).
- Before documenting a response code, grep the actual service method(s) for `throw new`/
  `orElseThrow` — this repo's permission-check pattern (400 vs. the more conventional 403) isn't
  something you'd get right by guessing from the message text alone.
