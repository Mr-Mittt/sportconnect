# U11 · Protect user data — scope public user-lookup endpoints away from full PII

**Status:** `TODO`  
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

---
