# A7 · Audit the public API surface and clean up unused endpoints

**Status:** `TODO`
**Type:** Enhancement (Security)
**Depends on:** none. Overlaps `user-impl` **U11** — see *Relationship to U11* below; the two are
complementary and can land in either order.
**Filed:** 2026-08-20, from an audit run while verifying sport `A9`. A9 needed
`GET /api/sports/{id}/attribute-schema` to be authenticated and discovered that `/api/sports/**` is
blanket-`permitAll`, so the endpoint would have answered anonymous callers unless explicitly
annotated. Pulling that thread surfaced (a) that `permitAll` and "public" are not the same thing
anywhere in this app, (b) an app-wide bug where every `@PreAuthorize` denial returned 500 instead of
403 (fixed in A9), and (c) that 13 of the 21 genuinely-public endpoints have no client caller at all.

## Why

`SecurityConfig`'s public allowlist dates to the **initial commit** — `git log -L` on the
`/api/sports/**` line shows one entry, `16a7cd4`, and no commit has revisited it since. No ticket
ever decided it. The only rationale anyone ever wrote down is in
`modules/sport/docs/SPORT_THUMBNAIL_IMPLEMENTATION.md:169` — *"`/api/sports/**` is already configured
as public, allowing unregistered users to load the sport list for profile initialization"* — and note
the framing: it observes an existing fact rather than deciding one. `CLAUDE.md:189` documents the
allowlist as convention, again after the fact.

So the app's public surface is an inherited default that has never been reviewed, while the surface
itself has grown to span auth, sports, users, hashtags and posts.

## Finding 1 — `permitAll` does not mean public

A path in the allowlist only passes the *filter chain*; `@PreAuthorize` on the handler can still
reject the caller. **Nine endpoints sit on `permitAll` paths but are gated**: the four `/api/sports`
admin operations, the three sport-profile write operations, both new attribute-schema endpoints, and
`GET /api/users/search`.

This split is precisely what hid a real bug. `GlobalExceptionHandler`'s `Exception.class` catch-all
swallowed Spring Security's `AccessDeniedException`, so every `@PreAuthorize` denial in the whole
application returned **500 "An unexpected error occurred"** instead of 403 — for as long as that
catch-all has existed. It went unnoticed because no integration test had ever exercised a
method-security denial: every existing `isForbidden()` assertion comes from the app's own domain
`ForbiddenException`, and the three unauthenticated tests assert 401 via *filter-chain* rejection on
non-`permitAll` paths. Fixed in sport A9; the structural cause — blanket path rules that don't
reflect actual intent — is this ticket.

## Finding 2 — the genuinely-public surface, and who uses it

21 endpoints are reachable with no authentication (excluding infrastructure: `/images/**`,
`/actuator/health`, Swagger, `/ws/**`). Cross-referenced against every non-test call site in
`client/src`:

**Used by the client — 8**

| Endpoint | Client call site |
|---|---|
| `POST /api/auth/register` | `features/auth/useRegister.ts` |
| `POST /api/auth/login` | `features/auth/useLogin.ts` |
| `POST /api/auth/refresh` | `app/apiClient.ts`, `useSessionBootstrap.ts` |
| `GET /api/sports` | `shared/hooks/useSportCatalog.ts` (SPORT-3) |
| `GET /api/sports/profiles/user/{userId}` | `useSportProfiles.ts`, `useSportProfilesForUser.ts` |
| `GET /api/users/{userId}` | `features/friends/hooks/useUserProfile.ts` |
| `GET /api/hashtags/trending` | `useTrendingHashtags.ts` |
| `GET /api/posts/hashtag/{tag}` | `features/feed/hooks/usePostsByHashtag.ts` |

**No client caller — 13**

| Endpoint | Note |
|---|---|
| `POST /api/auth/verify-email` | Email verification never completed from the UI |
| `POST /api/auth/forgot-password` | No recovery route exists in the client |
| `POST /api/auth/reset-password` | ″ |
| `POST /api/auth/oauth-token` | Swagger token helper, not a product endpoint |
| `GET /api/sports/{sportId}` | |
| `GET /api/sports/category/{category}` | |
| `GET /api/sports/profiles/{profileId}` | |
| `GET /api/sports/profiles/user/{userId}/sport/{sportId}` | |
| `GET /api/users/email/{email}` | Unauthenticated PII lookup by email — U11 |
| `GET /api/users/username/{username}` | U11 |
| `GET /api/users/check/email` | Existence oracle; **not covered by U11** |
| `GET /api/users/check/username` | Existence oracle; **not covered by U11** |
| `GET /api/hashtags/suggest` | |

The auth-recovery group is a **product gap, not a security one** — the endpoints work server-side but
no client screen calls them, so a user who forgets their password currently has no route to recovery.
Almost certainly wanted later; call it out rather than delete it.

## Scope

1. **Review every `permitAll` matcher in `SecurityConfig`** and confirm each endpoint under it is
   gated as intended. Narrow blanket matchers where a whole-namespace rule isn't justified —
   `/api/sports/**` being the clearest case, since it now spans public reads, user writes and admin
   operations.
2. **Decide each of the 13 unused endpoints explicitly**, recording the reasoning per endpoint. Three
   buckets: **delete** (no use and no plan), **keep but authenticate** (wanted later, but shouldn't be
   public), **keep public** (deliberate, e.g. signup-time checks). Do not apply a blanket rule — that
   is what would wrongly remove the recovery endpoints.
3. **Record the outcome** so the public surface stops being an undocumented inherited default: update
   `CLAUDE.md:189`'s allowlist line if it changes.

## Relationship to U11

`user-impl` **U11** (`TODO`, *Protect user data — scope public user-lookup endpoints away from full
PII*) already owns narrowing `GET /api/users/{userId}`, `/email/{email}` and `/username/{username}` to
a `PublicUserResponse`. **This ticket does not re-do that** — leave the response-shape work to U11.

Two things this audit adds that U11 should know about:

- `GET /api/users/check/email` and `/check/username` are **not in U11's scope** and are pure existence
  oracles (is this address registered?). They belong to whichever ticket picks up first — decide at
  pickup, don't do it twice.
- **All three of U11's endpoints have zero client callers.** U11 assumes they are in use and narrows
  their response; the removal option was never considered there. If they are being removed rather than
  narrowed, U11 becomes moot for those three and should be updated, not silently overtaken.

## Edge cases

- **Deactivated callers.** Converting a public endpoint to authenticated does not by itself exclude a
  deactivated (`isActive = false`) user — `JwtAuthenticationFilter` validates signature and expiry
  only, with no `isActive` recheck (CLAUDE.md, `user-impl` U12). Any endpoint moved behind auth here
  inherits that gap; note it per endpoint rather than assuming authentication closes it.
- **Removing an endpoint is a breaking change** for anything outside `client/src` — the audit covered
  the React client only. Confirm no other consumer (`services/chat`, Swagger-driven manual tooling,
  scripts) depends on an endpoint before deleting it.
- **`ADMIN`-only accounts.** Nothing in the codebase grants `ADMIN` (it is provisioned directly in the
  DB), so an account holding only `ADMIN` fails every `hasRole('USER')` endpoint — 99 of them — with a
  403. Verified empirically. If this audit moves anything to `hasRole('USER')`, that asymmetry applies.
  A `RoleHierarchy` bean (`ADMIN > USER`) would remove the sharp edge; not proposed here, since admins
  genuinely not acting as users may be intended.

## Out of scope

- The `PublicUserResponse` narrowing itself — U11's job.
- Rate limiting on public endpoints — A5's job.
- The pre-existing 400-before-403 ordering: Spring validates `@Valid @RequestBody` during argument
  resolution, *before* the proxied method where `@PreAuthorize` fires, so an anonymous caller sending
  an invalid body to an admin endpoint gets a 400 listing the failing fields instead of a 403.
  Long-standing, affects every validated admin endpoint, and changing handler-vs-security ordering is a
  much larger change than this ticket.
- `/internal/**` — a separate `@Order(1)` filter chain guarded by `InternalServiceAuthFilter` with a
  shared secret, not part of the user-facing public surface.
- A duplicate noticed during the audit and unrelated to security: `useTrendingHashtags.ts` exists twice
  in the client (`features/feed/hooks/` and `shared/hooks/`, from HF-5 and FEED-6), both calling the
  same endpoint. Client-side cleanup, not this ticket.

**Tests:** each endpoint that changes gating needs an integration test asserting the new status through
the real pipeline, per root `CLAUDE.md`'s authorization-boundary rule. Note the suite currently has
**zero** wrong-role coverage — sport A9's `put_rejectsNonAdmin_withForbidden` is the first such test in
the codebase — so a `hasRole` denial case is new ground, not a pattern to copy from.

---
