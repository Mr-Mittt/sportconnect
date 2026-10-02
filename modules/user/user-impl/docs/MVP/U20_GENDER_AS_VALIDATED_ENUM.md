# U20 · Make `gender` a validated enum (`MALE` / `FEMALE`)

**Status:** `DONE` (2026-10-02)
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

## Scope decisions (2026-10-02, `/workon` pickup, user decision)

- `Gender` enum in `user-api` (`MALE`, `FEMALE`); `User.gender` column and `UserResponse.gender` stay strings.
- Strict uppercase on write — `male` is rejected; the migration still normalizes old rows case-insensitively.
- Empty string keeps meaning "clear" (stored as `NULL`); `null` still means "skip".
- DB `CHECK (gender IN ('MALE','FEMALE'))` added in the migration, **and** the service validates first
  (the app layer is the primary gate; the CHECK is defense in depth). `schema.sql` mirrors the constraint.
- Unmappable existing rows become `NULL` — accepted loss. No other scope change.

## Implementation summary (2026-10-02)

**Approved design:** a `Gender` enum (`MALE`, `FEMALE`) in `user-api` as the closed set; `UpdateProfileRequest.gender`
stays a `String` (an enum field would collapse `""` and `null`, losing clear-vs-skip); `UserServiceImpl.updateProfile`
validates before mutating (`null` skip, `""` clear -> `NULL`, exact upper-case name stored, else `BadRequestException`);
migration `V076` normalises existing rows then adds `CHECK (gender IN ('MALE','FEMALE'))`; `schema.sql` mirrors it.

**Built**
- `user-api`: `Gender` enum with strict `fromWire(String) -> Optional<Gender>`; Javadoc on `UpdateProfileRequest.gender`
  and `UserService.updateProfile`.
- `user-impl`: `UserServiceImpl.resolveGender` (private) called right after `applyGeoSelection`, before any field is applied.
  The error message is `gender must be one of: MALE, FEMALE` (400 via the existing `GlobalExceptionHandler` mapping).
- `server`: `V076__normalize_user_gender.sql` (registered in `db.changelog-master.xml`): `UPPER(TRIM)`-normalise
  (`MALE`/`M` -> `MALE`, `FEMALE`/`F` -> `FEMALE`, anything else incl. `''` -> `NULL`), then the CHECK; `schema.sql`
  carries the same constraint.

**Diverged from the plan:** none.

**Consumer census (re-done at pickup):** `PUT /api/users/{id}/profile` narrows its accepted set - the only callers are the
client (sends `MALE`/`FEMALE`/`""`: compatible as-is), the Spock spec (updated `"Male"` -> `"MALE"`), and nothing else in
the backend (registration/auth never set gender). `GET /users/me` / `UserResponse` unchanged; `UserInfoResponse` has no gender.
Client `features/profile/types.ts` comment + `normalizeGender` legacy handling: **deferred to the already-filed client
`ACCOUNT-2`** (client MVP backlog), which this ticket unblocks. MSW fixtures use `gender: null` (compatible).

**Account lifecycle:** no new endpoint; `updateProfile` still loads the user with `findByIdAndIsActiveTrue`, so a deactivated
caller is unchanged. **Client-visible enum:** wire values unchanged, no client change needed here.

**Data impact:** dry run in a rolled-back transaction on the dev Postgres, then applied by a real startup: 1 row
`Female` -> `FEMALE`, 206 rows already `NULL`; no value was lost.

**IT changes report**
- Added `server/src/test/java/com/sportconnect/integration/ProfileGenderIntegrationTest.java` (6): valid gender stored and
  returned via `PUT` then `GET /users/me`; `OTHER` -> real 400 with the message and no other field saved; lower-case
  `male` -> 400; `""` clears / absent / `null` skip; a direct JDBC write of free text fails on the CHECK; and the real
  `V076` file run against legacy rows (`Female`, `f`, ` male `, `M`, `asdf`, `''`, `MALE`, `NULL`) normalising them and
  re-adding the constraint (the test drops the H2 mirror's constraint first and restores it in `@AfterEach`).
- Updated `server/src/test/resources/schema.sql` (CHECK on `users.gender`); no existing IT changed.

**Tests:** `:modules:user:user-impl:test` green (`GenderSpec` 11, `UserServiceImplSpec` 90 incl. 10 U20 rows); full
`:server:test` - 30 classes, 367 tests, 0 failures. `./gradlew :server:bootRun` applied `V076` to the dev DB
(`databasechangelog` row `EXECUTED`, constraint present) but then could not bind port 8080 - already held by a process I
did not start - so the server did not stay up; the web layer was exercised by the ITs instead.
