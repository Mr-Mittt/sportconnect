# U17 · Stop `GET /api/users/friends` leaking email and precise location

**Status:** `DONE` (2026-09-27)
**Type:** Security Fix
**Scope:** `UserFriendService`/`UserFriendServiceImpl`/`UserFriendController` — no schema change
**Depends on:** none
**Filed:** 2026-09-27, found while discussing U16's `getUsersByIds` decision — the user asked about `GET /api/users/friends`
directly.

## What

`GET /api/users/friends` (`UserFriendController.getFriends`, `@PreAuthorize("hasRole('USER')")`) returned a full-ish
`UserResponse` built by `UserFriendServiceImpl`'s own private mapper — a code path U11 never touched, because U11's
search was scoped to `UserController`'s three lookup endpoints and their shared service methods
(`getUserById`/`getUserByEmail`/`getUserByUsername`); `getFriends` lives in a different controller with its own
private mapper, so U11's grep structurally could not find it. The mapper set `email`, `location` (raw lat/long),
`isActive` and `roles` — exactly the PII list U11 named for the other three endpoints, just never applied here.

**Fix:** the endpoint returns `UserInfoResponse` — the same PII-free shape U11 already built and U14 already
identified as "exactly the contract Friends needs" for the single-lookup case. `activeSportIds` is left empty
(`List.of()`) rather than resolved per friend: `UserSportProfileService` has no batch `getUserProfiles`, and
resolving it per friend in a loop would be a fresh N+1; the friend rail doesn't render sport pills today anyway.

**Who:** any authenticated user, viewing their own accepted friends list.

**Entry point:** `GET /api/users/friends`.

**Out of scope:** any other `UserFriendController` endpoint — checked every one of them (`sendFriendRequest`,
`accept`/`decline`/`cancelFriendRequest`, `removeFriend` all return `Void`; `getPendingReceivedRequests`/
`getPendingSentRequests` already returned the properly narrow `FriendRequestResponse`, built from `User::getFullName`
only, never from a `UserResponse`-shaped mapper) — `getFriends` was the only leak in this controller.

## Consumer census

| Contract | Consumers | Disposition |
|---|---|---|
| `UserFriendService.getFriends(UUID)` return type: `List<UserResponse>` → `List<UserInfoResponse>` | `UserFriendController.getFriends` (only backend caller) | updated in this change |
| `GET /api/users/friends` response body | client `client/src/features/friends/types.ts` `FriendUser` (`id`/`fullName`/`avatarUrl`/`coverUrl`/`bio` — the type's own comment already says "email, dateOfBirth, gender... intentionally omitted", written assuming the backend was already narrow); `client/e2e/mocks/handlers/friends.ts` (typed `FriendUser[]`, never emitted `email`/`location`) | compatible as-is — the client was already a strict subset of `UserInfoResponse` |

## Tests

- **Spock** `UserFriendServiceImplSpec`: `getFriends` returns `UserInfoResponse` (updated existing test), a case
  explicitly asserting no `email`/`location` property exists on the result even when the source `User` has both set,
  and a case for the pre-existing active-only filter (was implicitly covered, made explicit).
- **IT** — extended `UserLookupAccessIntegrationTest` (U11's own "never leaks PII" class) rather than a new file: a
  real friendship fixture, a target user with a real non-null `location` set, anonymous → `401`, authenticated →
  every U11 PII field `doesNotExist()` in the JSON body, `activeSportIds` empty.
- **Mutation check:** temporarily reverted the interface/impl/controller to the original `UserResponse`-returning
  path — `UserLookupAccessIntegrationTest`'s new `getFriends` test failed (and only that one), confirming the IT
  genuinely catches the leak. Reverted back immediately after.

## Verification

- `:modules:user:user-impl:test` and `:server:test --tests UserLookupAccessIntegrationTest` green after the fix and
  after restoring from the mutation check.
- No N+1 introduced: `getFriends` is still one `friendshipRepository.findByUserId` + one `userRepository.findAllById`;
  no per-friend call added.
- Client: untouched (compatible as-is, confirmed by grep) — no e2e/visual-regression run applies.
