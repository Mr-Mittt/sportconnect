# PROFILE-5 · Edit Profile modal

**Status:** `TODO` · **Type:** Component · **Depends on:** `PROFILE-0` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

A `Dialog`-based edit form, opened from `ProfileHeader`'s "Edit profile" button (`PROFILE-1`),
covering the caller's **non-sport identity fields only** — user decision during scoping: "profile
modal is about cover avatar bio update (no sport profile update here)." Sport-profile editing
(`skillLevel`/`yearsOfExperience`/`preferredPosition`/attributes) lives in the Settings tab
(`PROFILE-4`) instead.

**Fields** (all real `UpdateProfileRequest` fields, `PUT /api/users/{userId}/profile`):
`firstName`, `lastName`, `username`, `bio` (textarea, clamped to `MAX_BIO_LENGTH` same pattern
`CreatePostForm` uses for `MAX_POST_LENGTH`), `city`, `country`, `avatarUrl`, `coverUrl`.

`avatarUrl`/`coverUrl` are plain paste-URL text fields, not a file upload — no upload infra exists
anywhere in this client yet (same honesty gap `CreatePostForm`'s inert Photo button already has).
This is a deliberate, minimal choice: the backend already accepts a URL string, so shipping that much
costs nothing, without pretending there's an upload flow that doesn't exist.

Single `Dialog`/`DialogContent`, no `Collapsible` sections expected (unlike the longer
`CreateSessionModal`/Settings-tab forms) — this is one flat set of fields, not several logical
groups.

## Explicitly out of scope

Everything sport-profile-related (`PROFILE-4`'s job). `dateOfBirth`/`gender`/`heightCm`/`weightKg`/
`shoeSizeCm`/`phoneNumber` — real `UpdateProfileRequest` fields too, but not named in scope by the
user during scoping; leave them out rather than guessing they're wanted. Avatar/cover *upload* (vs.
paste-URL) — no upload infra ticket exists yet.

## Tests

Vitest/RTL — form renders seeded from `useMyProfile()`'s current values; submit calls the update
mutation with only changed/all fields (whichever this app's existing edit-form precedent uses); bio
clamps at `MAX_BIO_LENGTH`; validation errors surface the server's own message (matches
`UpdateProfileRequest`'s `@Size` messages), not a reimplemented client-side copy.
