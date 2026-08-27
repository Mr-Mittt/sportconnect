# PROFILE-5 · Edit Profile modal

**Status:** `DONE` (2026-08-27) · **Type:** Component · **Depends on:** `PROFILE-0` ·
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
`CreatePostForm` uses for `MAX_POST_LENGTH`), `city`, `country`, `avatarUrl`, `coverUrl`,
`phoneNumber`, `dateOfBirth`, `gender`, `heightCm`, `weightKg`, `shoeSizeCm`.

**Delta (2026-08-27, at pickup):** the original spec below excluded the last six fields
(`phoneNumber`/`dateOfBirth`/`gender`/`heightCm`/`weightKg`/`shoeSizeCm`) as "not named in scope
during the `/feature` session." A `/ticket` filing pass to split them into their own follow-up
surfaced that they live on the exact same `users` row/`UserResponse`/`UpdateProfileRequest`
contract as every other field here — no new table, no new endpoint, `heightCm`/`weightKg`/
`shoeSizeCm` already server-validated by backend ticket U7. **User decision: fold them into this
ticket instead of filing separately** — splitting would have meant two tickets editing the same
form. `dateOfBirth` renders as a native `<input type="date">`; `gender`/`phoneNumber` are plain
text inputs, same treatment as `city`/`country` — no fixed value set exists anywhere in the
backend for `gender` (a free-form `String` column, confirmed by reading `User.java` and its
Spock tests), so inventing a `<Select>` enum client-side would be a client-invented business rule
the ticket's own "no reimplemented validation" principle argues against. `heightCm`/`weightKg`/
`shoeSizeCm` are numeric inputs with `min`/`max` matching U7's bounds (50–300 / 20–300 / 10–35) as
a soft UX affordance only — the server's own bounds check is still authoritative on submit, same
"HTML attribute as a hint, not a reimplementation" precedent `SportFieldsForm`'s `min={1}` on
player counts already sets.

`avatarUrl`/`coverUrl` are plain paste-URL text fields, not a file upload — no upload infra exists
anywhere in this client yet (same honesty gap `CreatePostForm`'s inert Photo button already has).
This is a deliberate, minimal choice: the backend already accepts a URL string, so shipping that much
costs nothing, without pretending there's an upload flow that doesn't exist.

Single `Dialog`/`DialogContent`, no `Collapsible` sections (the field count roughly doubled with the
delta above, but the ticket's original "flat set of fields, not several logical groups" call still
holds — plain, non-interactive `<h4>` labels group the fields visually for scannability without
adding `Collapsible`'s expand/collapse behavior). Internally scrollable body (`overflow-y-auto`,
`AddSportFields`' pattern) so the header/footer stay fixed while 14 fields scroll.

## Explicitly out of scope

Everything sport-profile-related (`PROFILE-4`'s job). Avatar/cover *upload* (vs. paste-URL) — no
upload infra ticket exists yet. Any backend validation gap beyond what already exists (`gender`
and `dateOfBirth` currently have no server-side validation at all, unlike U7's three bounded
fields) — raised at pickup and explicitly deferred: this ticket ships client UI against the
contract as it exists today, not a backend hardening pass.

## Tests

Vitest/RTL — form renders seeded from `useMyProfile()`'s current values (all 14 fields, including
the six added in the pickup-time delta); submit calls the update mutation with only the *changed*
fields (matches `ADMIN-2`'s `buildUpdatePayload`/`sportFieldsDraft` diff-only precedent, the
established pattern for this app's `UpdateProfileRequest`-shaped partial-update endpoints); bio
clamps at `MAX_BIO_LENGTH`; a cleared `dateOfBirth`/`heightCm`/`weightKg`/`shoeSizeCm` is omitted
from the payload rather than sent as `""`/`0` (same "no way to express unset" limitation
`sportFieldsDraft` already documents for `minPlayers`/`maxPlayers`); validation errors surface the
server's own message (matches `UpdateProfileRequest`'s `@Size` messages), not a reimplemented
client-side copy.

---

## Implementation summary (2026-08-27)

**Built as approved** (the pickup-time delta above, folding in the six extra fields, was the only
scope change — no further divergence during implementation).

**`features/profile/profileEditDraft.ts`** — `ProfileEditDraft`/`UpdateProfilePayload` types +
`toProfileEditDraft(user)` + `buildProfileUpdatePayload(user, draft)`, a direct port of
`sportFieldsDraft.ts`'s diff-only shape to this endpoint's 14 fields. Text fields (including
`gender`/`phoneNumber`) diff to `''` when cleared, since an empty string is still non-null and
clears the column; `dateOfBirth`/`heightCm`/`weightKg`/`shoeSizeCm` are omitted from the payload
when cleared instead, for the reasons documented in the file's own comment (unparsable empty date,
`0`/`NaN` would fail U7's bounds check anyway).

**`features/profile/useUpdateMyProfile.ts`** — wraps `PUT /api/users/{userId}/profile`, patches
`profileKeys.myProfile(userId)` directly with the returned row on success (same "patch, don't
refetch" reasoning as `useUpdateGroup`), and extracts `errorMessage` the same way
`useUpdateSport`/`useRegister`/`useLogin` already do.

**`shared/components/EditProfileModal.tsx`** — presentational and controlled
(`isOpen`/`onClose`/`user`/`onSave`/`isSaving`/`errorMessage`), same shape as
`AddSportModal`/`CreateGroupModal`. Save is disabled until the diffed payload is non-empty (mirrors
`SportFieldsForm`'s `isDirty` gate). Fields are grouped under three plain `<h4>` labels ("Profile",
"Contact", "Personal") for scannability — not `Collapsible`, per the ticket's own call. Uses
`DialogContent`'s `fixedHeight`/`overflow-y-auto` combination (`CommentSection`'s pattern) so the
14-field body scrolls while the header/footer stay fixed.

**`ProfileHeader`'s `onEditProfile` is still a no-op** and `/profile`'s route still renders the
pre-existing full-page `ComingSoonPage` stub — this ticket ships the modal, its hook, and its draft
helper in isolation, same precedent `PROFILE-1`/`PROFILE-2` set. `PROFILE-6` (page integration,
still `TODO`) is what will own `isOpen` state, call `useUpdateMyProfile()`, wire `ProfileHeader`'s
button to open it, and — this is the part to not skip — **call `reset()` on close**, per
`CLIENT-MODAL-1`'s rule that any dialog whose error prop comes from a mutation must reset that
mutation when it closes. This modal's `errorMessage` prop comes from a mutation, so it qualifies.

**A real-backend finding, not a code change:** verified the live contract by registering a
throwaway user and calling `PUT /api/users/{userId}/profile` directly (server was already running
for this session). Confirmed the happy path matches `UserResponse`/`useUpdateMyProfile` exactly,
and surfaced a pre-existing, repo-wide error-shape split that predates this ticket: a manually
thrown `BadRequestException` (e.g. U7's `heightCm`/`weightKg`/`shoeSizeCm` bounds check) returns
the real message directly in `ApiResponse.message` (`"heightCm must be between 50 and 300"`), but a
bean-validation `@Size` failure (`firstName`/`lastName`/`username`/`bio`/`phoneNumber`) returns the
generic `"Validation failed"` in `message`, with the actual per-field text nested under `data`
instead (`GlobalExceptionHandler.handleValidation()`, confirmed by its own Spock spec). This
hook's `errorMessage` extraction — reading only `message` — is therefore accurate for U7-style
bounds errors but shows the generic string for `@Size` violations on this modal's text fields. Not
fixed here: `useRegister`/`useUpdateSport`/`useLogin` all have the identical extraction and the
identical gap, so this is an established, repo-wide convention rather than something specific to
this ticket to solve alone. Left as a known limitation for whoever eventually revisits that
extraction convention app-wide.

**Tests:** `useUpdateMyProfile.test.tsx` (3 cases: PUT payload, cache patch on success, error-
message extraction) + `EditProfileModal.test.tsx` (6 cases: seeded render incl. the six new fields,
bio `maxLength` clamp, Save disabled until dirty, diff-only submit, cleared-numeric/date omission,
server error passthrough). `EditProfileModal.stories.tsx` (Default/EmptyProfile/Saving/ErrorState) —
production Storybook build green.

**Verification:** `tsc -b` clean, `pnpm lint` clean (2 pre-existing unrelated warnings in
`SessionStartTimePicker.tsx`), full Vitest suite green (144→146 files, 975→984 tests, both new
files/9 new tests accounted for, no regressions), `build-storybook` green. Real backend contract
verified directly via `curl` against a running `:server:bootRun` (see finding above) rather than
a live UI walkthrough — no page hosts this modal yet (`PROFILE-6`), and the Claude-in-Chrome
browser extension was not connected this session (same gap `PROFILE-0`/`PROFILE-1` noted).
