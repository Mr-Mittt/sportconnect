# FRIEND-2 · Dedicated friend-profile hook, off the borrowed `useUserProfile`

**Status:** `TODO` (unblocked) · **Type:** Cleanup · **Depends on:** ~~backend **U14**~~ — **U14
`DONE` 2026-08-29, resolved to no backend change** (see Delta below and
`modules/user/user-impl/docs/MVP/U14_DEDICATED_FRIENDS_DIRECTORY_PROFILE_ENDPOINT.md` § Resolution)

**Filed:** 2026-08-26, at `PROFILE-0` client pickup — user decision.

## Delta from U14 (2026-08-29) — read before implementing

U14 collapsed to nothing new on the backend: U11 already narrowed `GET /api/users/{userId}` to
`UserInfoResponse` — `{ id, fullName, username, avatarUrl, coverUrl, bio }`, gated
`@PreAuthorize("hasRole('USER')")` (no longer public). That is exactly what Friends needs, plus
`username`. So this ticket is purely the client feature-folder cleanup — **no new endpoint, no new
backend DTO to wait on.**

Concretely for this ticket:

1. `useFriendProfile(userId)` in `features/friends/hooks/` calls `GET /api/users/{userId}` (auth'd —
   every Friends page already sits behind `ProtectedRoute`, so the U11 auth requirement is a
   non-issue) and types its result **1:1 with `UserInfoResponse`**: all six fields, including
   `username: string | null` (user decision at U14 pickup) — even though `FriendProfilePanel`
   renders only `fullName` / `bio` / `avatarUrl` / `coverUrl` today.
2. While here, correct the three now-stale doc comments U14 deliberately left for this ticket, since
   they all still describe the pre-U11 "public / full `UserResponse`" behavior:
   `features/profile/useUserProfile.ts` docstring, `features/profile/types.ts` (`UserResponse` doc),
   `features/friends/types.ts` (`FriendUser` "sourced from `UserResponse`").
3. `useFriendsPageData.ts` switches from `@/features/profile/useUserProfile` to the new hook;
   `features/profile/useUserProfile` then has no importer outside `features/profile/` — decide at
   that point whether to inline it into `useMyProfile` / delete it (per the original step 3 below).

## Why

`useFriendsPageData.ts`'s directory-search profile popup calls `useUserProfile(userId)`, which now
lives in `features/profile/` (moved there at `PROFILE-0` pickup, since it's a generic "look up any
user's public profile by id" concern, not friends-specific) but is still typed to Friends' own
narrow `FriendUser` shape and still hits the same public `GET /api/users/{userId}` endpoint
`useMyProfile()` uses for the logged-in user's own full profile. Friends borrowing a hook that now
belongs to a different feature, off an endpoint shaped for someone else's use case, is exactly the
kind of coupling this repo's feature-folder convention exists to avoid — it just hasn't been fixed
yet, and doesn't need to block `PROFILE-0`.

## What ships

Once backend **U14** lands (a Friends-specific endpoint, or confirmation that U11's
`PublicUserResponse` narrowing of the shared endpoint already covers everything `FriendUser` needs
— see U14's own doc for which):

1. A `useFriendProfile(userId)` hook (or a rename of the existing call site, if U14 collapsed to no
   new endpoint) living in `features/friends/hooks/`, typed against whatever U14 actually shipped.
2. `useFriendsPageData.ts` switches from `@/features/profile/useUserProfile` to this new hook.
3. `features/profile/useUserProfile` stops being imported outside `features/profile/` — if nothing
   else in the app still needs the generic by-id public lookup at that point, evaluate whether it
   should be inlined into `useMyProfile`/deleted rather than kept as an unused generic export
   (decide at pickup, don't assume either way now).

## Explicitly out of scope

Any change to `useMyProfile()` or anything else in `features/profile/` — this ticket only touches
the Friends feature's own consumption. Designing U14's actual response shape — that's U14's own
ticket, this one just consumes whatever it ships.

---
