# U11 · Protect user data — scope public user-lookup endpoints away from full PII

**Status:** `DONE`  
**Type:** Security Fix  
**Scope:** `UserController` (3 endpoints) + a new `user-api` DTO — no change to `UserService`'s
internal contract or any cross-domain caller

**Found while discussing FRIEND-1's data model.** Returning a user's `id` (a random
`gen_random_uuid()` value, not a sequential integer) to a client is not itself a security problem —
it's normal REST practice and not enumerable. The real problem is what three of `UserController`'s
endpoints do once a caller has (or doesn't even need) an id:

- `GET /api/users/{userId}`
- `GET /api/users/email/{email}`
- `GET /api/users/username/{username}`

All three are `security = {}` (public, no authentication at all — `SecurityConfig`'s
`GET /api/users/**` permit-all rule) and all three return the **full `UserResponse` DTO** — the same
shape a user's own `/profile` view would get: `email`, `phoneNumber`, `dateOfBirth`, `gender`,
`heightCm`/`weightKg`/`shoeSizeCm`, `location` (lat/long), `lastLoginAt`, `isEmailVerified`, `roles`.
No distinction between "a stranger looking someone up" and "the user viewing their own profile."

Two compounding factors make this a real, not theoretical, exposure:
1. **The email/username lookups don't even require an id** — anyone can type in any email address
   (guessed, scraped, bought) and get that person's full PII back, unauthenticated.
2. **User ids are now genuinely everywhere in the app** — post/comment authors, group members,
   friends list, search results (FEED-1, GRP-3, FRIEND-1, ...). "An attacker would need to already
   have the id" is not a meaningful barrier once every social feature surfaces ids by design.

**Fix approach (not yet fully designed — confirm at pickup):**
1. New `PublicUserResponse` DTO in `user-api` — safe subset only: `id`, `fullName`, `username`,
   `avatarUrl`, `coverUrl`, `bio`. (Deliberately close to FRIEND-1's own `FriendUser` client type —
   `client/src/features/friends/types.ts` — which already only models this subset; narrowing the
   backend to match should need little-to-no client change.)
2. `getUserById`/`getUserByEmail`/`getUserByUsername` in `UserController` return `PublicUserResponse`
   instead of `UserResponse` for every caller, authenticated or not — no "return full for self"
   special case, since these 3 endpoints have no reliable way to know who's asking (two of them
   don't even require auth) and mixing return shapes on one endpoint contract complicates every
   typed client that already consumes it.
3. **Confirmed safe to narrow — nothing legitimate depends on the full shape from these 3
   endpoints today:** grepped every caller. `AuthServiceImpl`/`CommentServiceImpl`/`PostServiceImpl`
   all call `UserService.getUserById()`/`getUserByEmail()` directly as an **in-process Java method**
   (the `-api` interface, cross-domain convention) — never through the public REST controller — so
   narrowing the controller's HTTP response touches none of them. No "view my own full profile"
   client screen exists yet either (Profile page is still a `ComingSoonPage` stub) to depend on the
   wider shape.
4. **A real "get my own full profile" endpoint doesn't exist anywhere** (confirmed in AUTH-3's own
   summary: no `/api/users/me`, the refresh response's `user` object doubles as who-am-I). If/when
   the Profile page is scoped, it will need one — flagging this as a related future gap, not solved
   here, since nothing currently depends on it.

**Tests:** update `UserControllerTest`/`UserServiceImplSpec` wherever these 3 endpoints' response
shape is asserted; add a case confirming `PublicUserResponse` never serializes `email`/
`phoneNumber`/`dateOfBirth`/`gender`/`heightCm`/`weightKg`/`shoeSizeCm`/`location`/`lastLoginAt`/
`roles`.

**Out of scope:** a dedicated authenticated "my own full profile" endpoint (flagged above, not
built here — nothing depends on it yet); any change to `UserService`'s internal Java contract or
any in-process cross-domain caller; rate-limiting/enumeration defenses beyond narrowing the response
(the ids themselves are already non-enumerable).

**Update (2026-08-26, at `PROFILE-0` client pickup):** `UserResponse` gained `city`/`country`
(`toUserResponse()` was silently dropping both, even though `UpdateProfileRequest` already
persisted them — see `client/docs/MVP/PROFILE-0_TYPES_AND_HOOKS_SCAFFOLD.md`'s implementation
notes) — this **grows** the three public endpoints' PII leak by two fields until this ticket ships.
No rework needed here though: `city`/`country` were already excluded from the planned
`PublicUserResponse` safe subset above, so the fix-approach section is still correct as written.
The "flagged future gap" in point 4 also just became real — `/profile` is the page that needs a
self-only full-profile source, and it's now being scoped without one (see PROFILE-0's own notes for
why it went with the existing public `GET /api/users/{userId}` anyway, using the caller's own id).

---

## Implementation summary (2026-08-28)

**Design confirmed at pickup, diverging from the original "no self special-case" plan above** —
the collision flagged in the 2026-08-26 update was real and had to be resolved before writing any
code. Two options were weighed: (a) a caller-dependent special case on `GET /{userId}` (full shape
for self, safe subset for everyone else, no client change needed) vs. (b) a dedicated
`GET /api/users/me` plus a small client migration. Went with (b) — it's what this ticket's own
"flagged future gap" (point 4) always pointed at, and it keeps the three public-facing lookups on
one static, caller-independent response shape rather than reintroducing the exact shape-mixing this
ticket's original design explicitly rejected. Also decided at pickup, beyond the original plan:
`check/email`/`check/username` gained the same `@PreAuthorize` gate as the three lookups — grepped
the client and confirmed neither is called anywhere today (no live pre-registration availability
check exists; registration surfaces a duplicate-email error from `POST /api/auth/register` itself
instead), so there's no anonymous use case to preserve. Re-open with `permitAll` in `SecurityConfig`
if a real feature ever needs one.

**Backend (`modules/user`):**
- New `UserInfoResponse` DTO (`user-api`) — `id`/`fullName`/`username`/`avatarUrl`/`coverUrl`/`bio`,
  with a `UserInfoResponse.of(UserResponse)` static mapper (same `of(...)` factory convention as
  `LocationResponse`).
- `UserController`: `getUserById`/`getUserByEmail`/`getUserByUsername` now map their existing
  `UserResponse` result through `UserInfoResponse.of()` before returning, and gained
  `@PreAuthorize("hasRole('USER')")`. `checkEmailExists`/`checkUsernameExists` gained the same
  annotation, response shape unchanged (still `Boolean`). New `GET /api/users/me` — also
  `@PreAuthorize("hasRole('USER')")`, derives the caller via `@AuthenticationPrincipal String
  callerIdStr` (this controller's own existing convention, e.g. `PUT /me/password`), and simply
  calls the existing `userService.getUserById(callerId)` — no new service method, no change to
  `UserService`'s interface or `UserServiceImpl`, so every in-process cross-domain caller
  (`AuthServiceImpl`, `CommentServiceImpl`, `PostServiceImpl`) is untouched, confirmed by the
  original ticket's own caller audit still holding.
- `SecurityConfig` (`auth-impl`): removed the blanket `.requestMatchers(HttpMethod.GET,
  "/api/users/**").permitAll()` rule entirely. Audited every other `GET` under that path first —
  `/search`, `/friends/**`, `/me/preferences` already carried their own `@PreAuthorize`, so nothing
  anonymous is left standing anywhere under `/api/users/**`.
- No migration, no entity change — this is a controller/DTO/security-only ticket, nothing persisted
  changed shape.

**Client (`client/`):** `useMyProfile.ts` now calls `GET /api/users/me` instead of `` `GET
/api/users/${userId}` ``. Nothing downstream changed — `EditProfileModal`/`ProfileHeader`/
`SportProfileSettingsTab` consume the hook's returned data, not the URL. `useUserProfile.ts`
(Friends' directory lookup) needed no change — it was already typed to the narrow `FriendUser`
shape, a subset of the new `UserInfoResponse`. Updated `useMyProfile.test.tsx` and
`ProfilePage.test.tsx`/`ProfilePage.stories.tsx`'s mock-URL matchers to `/users/me`. Updated the e2e
MSW handler (`e2e/mocks/handlers/friends.ts`): added a dedicated `GET /api/users/me` handler
(auth-gated, returns the session's `myProfileState`) and removed the old self-special-case branch
from the `GET /api/users/:userId` handler, which now always resolves through the narrow
`KNOWN_USERS` directory (auth-gated too) — matching the real backend's new caller-independent
contract.

**Tests:** new `server/src/test/java/com/sportconnect/integration/UserLookupAccessIntegrationTest`
(10 cases, real `MockMvc` + H2 round trip, per this repo's authorization-boundary IT convention) —
anonymous 401 on all 6 newly-gated endpoints (`{userId}`, `email/{email}`, `username/{username}`,
`check/email`, `check/username`, `me`); authenticated lookups assert every stripped PII field is
absent via `jsonPath(...).doesNotExist()` (`email`, `phoneNumber`, `dateOfBirth`, `gender`,
`heightCm`, `weightKg`, `shoeSizeCm`, `location`, `lastLoginAt`, `roles`, `isEmailVerified`,
`isActive`) while the safe fields are present; `/me` asserts the caller gets back their *own* full
profile including `email`. No `UserServiceImplSpec` changes needed — the service layer's contract
and behavior are unchanged.

**Docs:** `CLAUDE.md`'s "Public endpoints" line updated — `GET /api/users/**` removed from the
public list, replaced with a note pointing at this ticket.

**Verification:** `:modules:user:user-impl:test` and `:server:test` both green (the new IT class:
10/10 passing). Client: `tsc -b` clean, full Vitest suite green (153 files / 1029 tests), ESLint
clean on every changed file, `playwright test --project=e2e --grep "profile|friend"` green (13/13,
covers `profile-journey.spec.ts` and `friends-journey.spec.ts`, both exercising the touched MSW
handler). One `visual-regression` failure on `app-profile.spec.ts` (`profile — posts`, a ~1265px vs
1280px width pixel diff) — confirmed **pre-existing and unrelated** by stashing this ticket's
changes and re-running the same spec directly against `master`: identical failure, same pixel count,
same dimension mismatch. Not caused by this change (no UI/visual output changed here) and not
re-baselined as part of this ticket.

---
