# U7 · General physical profile stats

**Status:** DONE
**Module:** `modules/user/user-api` + `modules/user/user-impl`
**Date:** 2026-07-02

## What was built

Added sport-agnostic physical stats to the `User` entity, reusing the existing (already self-only as
of U2) `PUT /api/users/{userId}/profile` endpoint — no new endpoint needed.

- Migration `V024`: nullable `height_cm INTEGER`, `weight_kg NUMERIC(5,2)`, `shoe_size_cm INTEGER` on
  `users`
- `User.heightCm` (Integer), `weightKg` (BigDecimal), `shoeSizeCm` (Integer)
- `UpdateProfileRequest` + `UserResponse` (`user-api`) gained the same 3 fields
- `UserServiceImpl.updateProfile()` extends its existing null-check-per-field pattern; each field
  validates its bounds and throws `BadRequestException` if out of range

## Key decisions (both revised mid-ticket from the original spec)

- **`shoeSizeCm` is JP sizing, not a free-form multi-system string.** The original ticket spec assumed
  a `VARCHAR` to accommodate EU/US/UK sizing ambiguity — the user clarified during Phase 1 that
  `shoeSize` should specifically be JP convention, where the size number *is* the foot length in
  centimeters (e.g. size 25 = 25cm). So it became numeric from the start.
- **`shoeSizeCm` is `Integer`, not `BigDecimal`** — changed again mid-implementation (after the
  migration/entity/DTOs/tests were already written with `BigDecimal` for half-size precision) to a
  whole-number `Integer`. All layers (migration, entity, both DTOs, service validation, tests) were
  updated together in the same pass.
- **Validation bounds** (confirmed with the user): `heightCm` 50–300, `weightKg` 20–300, `shoeSizeCm`
  10–35. All three throw `BadRequestException` when out of range — checked in the service layer, same
  place as the existing null-check-per-field pattern, not via bean validation annotations.

## Non-obvious constraints

- No new permission logic — inherits U2's self-only ownership check on `updateProfile()` for free.
- **Important caveat surfaced during this ticket, not fixed here:** `BadRequestException` (and the
  other 4 shared exception types) currently has no global exception handler anywhere in the codebase —
  every throw of it across the entire application returns a generic HTTP 500, not 400. This was found
  while designing this ticket's validation and is tracked separately as **C1** in the newly-created
  `modules/common/docs/BACKLOG_MVP.md` — out of scope for U7 itself, but worth knowing that the
  bounds-check `BadRequestException`s added here won't actually produce a 400 response until C1 lands.

## Tests

8 new tests in `UserServiceImplSpec.groovy` (42 → 50): all 3 fields set when provided within bounds;
all 3 left unchanged when omitted; each of the 3 fields rejects both an under-bound and an over-bound
value (6 cases via `where:` tables). Full module suite: 87 → 95 tests, 0 failures, 0 errors.

Run with: `./gradlew :modules:user:user-impl:test`
