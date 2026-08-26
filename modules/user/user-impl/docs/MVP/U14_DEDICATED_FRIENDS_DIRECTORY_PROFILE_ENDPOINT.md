# U14 · Dedicated Friends-directory profile endpoint

**Status:** `TODO`
**Type:** New Feature / Cleanup
**Depends on:** none to file; **see relationship to U11 below before scoping**

**Filed:** 2026-08-26, at `PROFILE-0` (`client/docs/BACKLOG_MVP.md`) client pickup — user decision
to stop borrowing a generic public endpoint for the Friends feature's profile popup.

## Why

The Friends feature's directory-search profile popup (`FriendProfilePanel`, via
`useUserProfile`/`FriendUser`) has always called `GET /api/users/{userId}` — the same
public, unauthenticated, full-`UserResponse` endpoint `PROFILE-0`'s `useMyProfile()` now also
calls (for the logged-in user's own profile). `FriendUser` only ever asked for a narrow subset
(`id`, `fullName`, `avatarUrl`, `coverUrl`, `bio`), typed down client-side from the full response —
there has never been a backend contract that actually matches what Friends needs.

At `PROFILE-0` pickup, `useUserProfile` moved from `features/friends/hooks/` to `features/profile/`
(it's a generic "look up any user's public profile by id" concern, not friends-specific) and Friends
keeps consuming it as-is for now, unchanged in shape. This ticket is the follow-up: give Friends a
purpose-built endpoint instead of continuing to borrow the profile feature's.

## Relationship to U11 — resolve at pickup, don't duplicate design work

**U11** (`modules/user/user-impl/docs/MVP/U11_...md`, `TODO`) already plans to narrow
`GET /api/users/{userId}` (and its email/username siblings) to a `PublicUserResponse` — safe subset
`id`, `fullName`, `username`, `avatarUrl`, `coverUrl`, `bio` — for **every** caller, security-motivated
(the endpoint is public/unauthenticated and currently leaks full PII). That subset is almost exactly
`FriendUser` already.

If U11 ships first, `GET /api/users/{userId}` will already return the shape Friends wants, and this
ticket may collapse to nothing more than a client-side rename/re-type (see `FRIEND-2` below) — no
new backend surface needed. Confirm U11's shipped shape against what Friends actually needs
(`username` isn't in today's `FriendUser` — check whether it should be) before building anything new
here. Only design a genuinely separate endpoint if Friends turns out to need something U11's safe
subset doesn't cover (e.g. friendship-status-aware fields) — don't build a parallel endpoint that
duplicates U11's for no reason.

## Out of scope

Any friendship-relationship-specific enrichment (mutual friends, common sports) — not requested,
not scoped; this ticket is about giving Friends its own contract, not growing what that contract
returns beyond today's `FriendUser` fields unless U11's subset turns out to be missing one of them.

---
