# FRIEND-2 · Dedicated friend-profile hook, off the borrowed `useUserProfile`

**Status:** `TODO` · **Type:** Cleanup · **Depends on:** backend **U14**
(`modules/user/user-impl/docs/BACKLOG_MVP.md`) — resolve against **U11** first, see U14's own doc

**Filed:** 2026-08-26, at `PROFILE-0` client pickup — user decision.

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
