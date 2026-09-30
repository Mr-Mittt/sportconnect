# U20 · Make `gender` a validated enum (`MALE` / `FEMALE`)

**Status:** `TODO`
**Type:** Enhancement (Validation + data normalization)
**Depends on:** none — the client already sends `MALE`/`FEMALE` (ACCOUNT-1); client follow-up **ACCOUNT-2** (client backlog) sequences after this ships
**Filed:** 2026-09-30, found during ACCOUNT-1: the client's gender input became a Male/Female dropdown, but the server stores `users.gender` as free text (`VARCHAR(20)`, V001) and `UpdateProfileRequest.gender` has no validation, so any API caller can still store any string.

## What

Constrain gender to a closed set. Values: `MALE`, `FEMALE` (the client's wire values today; exact set confirmed at pickup).

**Entry point:** `PUT /api/users/{userId}/profile` (`gender` rejected with a 400 + message if outside the set); `GET /api/users/me` (`UserResponse.gender`) keeps returning a string.

**Scope:**
- Validation on `UpdateProfileRequest.gender` (`@Pattern` over the closed set, or a `Gender` enum in `user-api`) with a clear message; `null` still means "skip", empty string still clears (unchanged null-means-skip semantics of `updateProfile`).
- Migration (next `V0xx`): normalize existing rows case-insensitively (`female`/`Female`/`F` → `FEMALE`, likewise male); values that map to neither become `NULL` (accepted, explicit loss — free text like "asdf" is not recoverable).
- Keep the column a string in the JSON contract (the enum is a server-side constraint) so no client type break.
- Update `server/src/test/resources/schema.sql` if the column type changes.

**Consumer census (do again at pickup):** `UpdateProfileRequest`, `UserResponse`, `User` entity, `UserServiceImpl` (`setGender` ~L244, response builder ~L588); client `features/profile/types.ts` (`GENDERS`/`isGender`), `profileEditDraft.ts` (`normalizeGender`), `AccountSettingsModal`, `friends/types.ts` comment; MSW `e2e/mocks/fixtures.ts` (`mockMyProfile.gender`).

**Out of scope:** more gender options (non-binary/prefer-not-to-say) — a product decision, not this ticket; any client change (ACCOUNT-2).

**Tests:** Spock (`user-impl`) for accept `MALE`/`FEMALE`, reject junk, null/empty semantics; an IT in `server/src/test/.../integration/` for the real 400 mapping through `GlobalExceptionHandler` and a Liquibase-normalization check if feasible; full `:server:test` (schema/migration change).
