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

---

**Status:** `DONE`
**Type:** New Feature
**Scope:** `User.java` entity + `UserServiceImpl.updateProfile()` — reuses the existing
`PUT /api/users/{userId}/profile` endpoint, no new endpoint needed.

Split out of a discussion originally framed around U3 (UserPreference). Confirmed with the user:
"preference" (app settings — language, timezone, notifications, privacy) and "physical profile" data
are deliberately separate concepts in this codebase — this ticket is the latter. Its sibling ticket,
**A3** in `modules/sport/sport-impl/docs/BACKLOG_MVP.md`, covers sport-*specific* attributes (e.g.
dominant hand); this ticket covers sport-*agnostic* physical stats only.

**Revised during Phase 1 clarification:** `shoeSize` is **not** a free-form string after all — it's
JP sizing convention, where the size number **is** the foot length in centimeters (e.g. size 25 =
25cm foot). So it's numeric, not `VARCHAR`, and validated the same way as height/weight. Further
revised mid-implementation: `shoeSizeCm` is a whole-number `Integer`, not `BigDecimal` — no half-size
precision.

**Liquibase migration:** add nullable columns to `users`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS shoe_size_cm INTEGER;
```

**Entity (`User.java`):** add `heightCm` (Integer), `weightKg` (BigDecimal), `shoeSizeCm` (Integer)
— all nullable, same style as existing optional profile fields (`bio`, `avatarUrl`, etc.).

**DTOs (`user-api`):** add the same 3 fields to `UpdateProfileRequest` and `UserResponse`.

**Service (`UserServiceImpl.updateProfile()`):** extend the existing null-check-per-field block with
the 3 new fields — no new method, no new permission logic (already self-only as of U2). Validation
bounds (confirmed with the user): `heightCm` 50–300, `weightKg` 20–300, `shoeSizeCm` 10–35. Reject
out-of-range values with `BadRequestException`.

**Tests:** update sets all 3 new fields; partial update (fields omitted) leaves them unchanged
(matches the existing null-check test pattern already in `UserServiceImplSpec`); each field rejects
values outside its bounds.

---
