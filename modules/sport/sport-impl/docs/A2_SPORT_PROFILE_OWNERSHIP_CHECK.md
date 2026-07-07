# A2 · Sport profile ownership check (update + delete)

**Status:** DONE
**Module:** `modules/sport/sport-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation (matches the ticket text exactly, confirmed via a baseline
test run before touching anything — full `sport-impl` suite passed):

1. **`UserSportProfileService`** (api) — signature changes:
   ```java
   UserSportProfileResponse updateProfile(Long profileId, UUID callerId, CreateUserSportProfileRequest request);
   void deleteProfile(Long profileId, UUID callerId);
   ```
2. **`UserSportProfileServiceImpl`** — fetch the profile first (existing `ResourceNotFoundException`
   if missing, unchanged), then check `profile.getUserId().equals(callerId)`; throw
   `ForbiddenException` on mismatch; otherwise proceed with the existing update/soft-delete logic
   unchanged.
3. **`SportController`** — add `@AuthenticationPrincipal String userIdStr` to both `updateProfile()`
   and `deleteProfile()`, pass `UUID.fromString(userIdStr)` through as `callerId`.
4. **Tests** — self-update succeeds; self-delete succeeds; update by non-owner throws
   `ForbiddenException`; delete by non-owner throws `ForbiddenException`; not-found still throws
   `ResourceNotFoundException` (checked before the ownership comparison, since the fetch has to
   happen first either way).

No divergence — implementation matched the plan exactly.

## What was built

- **`UserSportProfileService`** (api): both methods gained a `UUID callerId` parameter; Javadoc
  updated to document the new `ForbiddenException` behavior (this interface already had a
  per-method Javadoc convention, unlike controllers — kept it consistent).
- **`UserSportProfileServiceImpl.updateProfile`**: now fetches the profile, checks ownership
  (`!profile.getUserId().equals(callerId)` → `ForbiddenException`), then proceeds with the existing
  field-by-field null-check update logic, unchanged.
- **`UserSportProfileServiceImpl.deleteProfile`**: same ownership check added before the existing
  soft-delete (`isActive = false`) logic.
- **`SportController`**: both `PUT /api/sports/profiles/{profileId}` and
  `DELETE /api/sports/profiles/{profileId}` gained `@AuthenticationPrincipal String userIdStr` →
  `UUID.fromString(userIdStr)` passed as `callerId` — same pattern as A1.

## Key decisions

- **Ownership check happens after the fetch, not before** — matches the ticket's stated rationale
  (`PostServiceImpl.deletePost()`'s existing pattern): the profile has to be fetched anyway to know
  who owns it, so a non-existent profile still correctly 404s rather than incorrectly 403ing (you
  can't compare ownership on a profile that doesn't exist).
- **No Javadoc added to the controller methods** — consistent with A1 and the sibling `DONE`
  group-impl/post-impl A1 tickets, none of which established a Javadoc convention on controllers in
  this codebase.

## Non-obvious constraints

- Pre-existing, unrelated to this ticket: `UserSportProfileServiceImplSpec`'s test fixtures assign
  `UUID.randomUUID()` to `UserSportProfile.id` and `.sportId` (both actually `Long` fields on the
  entity). Confirmed this is not something introduced by A2 — the full test suite passed at
  baseline before any changes, and Groovy's dynamic dispatch tolerates it (the mismatched values are
  only ever used as opaque tokens for mock-argument matching in these tests, never persisted to a
  real DB where the type would matter). Left as-is, out of scope for this ticket.

## Tests

Updated `UserSportProfileServiceImplSpec.groovy`:
- `"updateProfile should update all provided fields"` / `"deleteProfile should soft delete profile"`:
  introduced a shared `ownerId` used both as the profile's `userId` and the `callerId` argument, so
  the existing success-path assertions still hold.
- `"updateProfile should throw exception when profile not found"` /
  `"deleteProfile should throw exception when profile not found"`: pass an arbitrary `callerId`
  (irrelevant since the fetch fails before ownership is ever checked).
- 2 new tests: `"updateProfile should throw ForbiddenException when caller is not the owner"`,
  `"deleteProfile should throw ForbiddenException when caller is not the owner"` — both assert
  `0 * profileRepository.save(_)`, confirming the mutation never happens for a non-owner.

Run: `./gradlew :modules:sport:sport-impl:test` — all pass (6 tests in this area: 4 updated + 2
new). `./gradlew :modules:sport:sport-impl:compileJava` succeeds. `:server:bootRun` reaches the
expected local-Postgres connection failure (no local Postgres running in this sandbox) — no risk
here regardless, since this ticket added no new query, only an in-memory ownership comparison.
