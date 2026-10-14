# U23 · `users` schema: nullable email, unique E.164 phone, and null-safe consumers

**Status:** `DONE` (2026-10-14) · **Type:** Schema + refactor · **Depends on:** none (independent of Keycloak) · **Gates:** auth A25, A26; unblocks auth A22

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md`).

## What

1. Liquibase migration: `users.email` nullable (keep the unique index; nulls do not collide), `users.phone_number` normalised to E.164 and made **unique and nullable**, a check `email IS NOT NULL OR phone_number IS NOT NULL`. Existing dev phone values are normalised or cleared first; the migration must not fail on free-text data. `password_hash` is already nullable.
2. Make every consumer null-safe (census, 2026-10-14): `User.getDisplayName()` (falls back to email), `UserRepository.findByEmail*` / `existsByEmail`, `UserService.getUserByEmail` / `findUserIdByEmail` / `verifyCredentials` / `reactivateUserByEmail`, `GET /api/users/email/{email}`, `GET /api/users/check/email`, `RegisterRequest` / `UpdateProfileRequest` phone validation (E.164), `UserResponse`, the `AuthServiceImpl` response map.
3. `phone_number` uniqueness is a business rule with a stable `errorCode` (C12): `PHONE_ALREADY_USED`. Add its en and vi `errors:codes` entry in the client in this change or file the client ticket straight away.
4. Check that no existing dev `users.id` can collide with a Keycloak `sub` (both UUIDs; note the result here).

## Out of scope

Provisioning from a token (A26); the Keycloak-side rules (A27); what a user without email can do (A22).

## Done when

The migration applies on a populated dev database; the H2 `schema.sql` mirror is updated; an integration test proves the unique phone and the check constraint reject through a real write; every consumer above is marked updated.

## Scope decisions (2026-10-14, at pickup)

- **Phone normalisation (changes What item 1/2):** Google `libphonenumber` in `user-impl`; a phone is parsed with default region **VN** and stored as E.164, so both `0901234567` and `+84901234567` are accepted and are the same number (uniqueness works across formats). A foreign number needs its `+`. Unparseable or invalid numbers are rejected with the new errorCode `INVALID_PHONE_NUMBER` (alongside `PHONE_ALREADY_USED`). A27's Keycloak validator should reuse the same rule.
- **Migration of existing phones (changes What item 1):** all existing `users.phone_number` values are set to `NULL` (dev data only, owner decision); no attempt to normalise in SQL, so the migration cannot fail on free-text data and cannot collide on the new unique index.
- **errorCodes:** `PHONE_ALREADY_USED` and `INVALID_PHONE_NUMBER` get their en and vi `errors:codes` entries in the client **in this change** (not a follow-up ticket). The service checks uniqueness for a clean error; a DB unique violation from a race maps to the same code.
- **Legacy register stays email-required:** `RegisterRequest.email` stays mandatory on `POST /api/auth/register`; only the data layer allows `null` until A26.
- **`sub` collision (What item 4):** verified by inspection of dev `users.id` values and noted in the summary; no code change.

## Delta (found at pickup)

The ticket names `User.getDisplayName()`, which does not exist. The real method is `getFullName()`, on both `User` and `UserResponse`, and it fell back to `username` then `email`; with a null email that returned `null`, and `UserServiceImpl.updateProfile` puts it in a `Map.of(...)` domain event, which throws on a null. The fallback now ends in a masked phone (see below).

## Implementation summary (2026-10-14)

### Design as approved

An account is identified by an email, a phone, or both. `users.email` becomes nullable (its unique constraint stays), `users.phone_number` becomes a unique E.164 value, and the database enforces that at least one of the two is present. The phone is normalised in `user-impl` with Google `libphonenumber`, default region `VN`, so `0901234567` and `+84901234567` are the same number. Existing phone values are cleared by the migration (dev data only). Every consumer of email is null-safe.

### What was built

- **`V079__users_nullable_email_unique_phone.sql`** (registered in the master changelog): clears all existing `phone_number` values, drops `NOT NULL` on `email`, adds `uq_users_phone_number` and `chk_users_email_or_phone`. Run inside a rolled-back transaction against the 208-user dev database: it applies, two null-email rows are accepted, a row with neither identifier is rejected.
- **`PhoneNumbers.normalize`** (`user-impl`, package-private): blank means no phone; otherwise parse with region VN, require `isValidNumber`, return E.164; anything else is `BadRequestException("INVALID_PHONE_NUMBER")`. A number without a `+` is read as Vietnamese; a foreign number needs its `+`. New dependency `com.googlecode.libphonenumber:libphonenumber:8.13.40` in `user-impl` only.
- **`UserServiceImpl`:**
  - `createUser` normalises the phone, requires an email or a phone (`IDENTIFIER_REQUIRED`, 400), checks the phone is free (`PHONE_ALREADY_USED`, 409), stores a blank email as `null`, and flushes inside the transaction so a unique-constraint race on `uq_users_phone_number` maps to the same 409 instead of a 500 at commit.
  - `updateProfile` resolves the phone before any field is touched. `null` skips it; a blank value clears it (refused with `IDENTIFIER_REQUIRED` when the account has no email); re-sending the caller's own number, in any format, is not a conflict.
  - `getUserByEmail`, `existsByEmail`, `findUserIdByEmail`, `verifyCredentials` and `reactivateUserByEmail` never pass a null or blank email to the repository. A Spring Data derived `findByEmail(null)` becomes `email IS NULL` and would have matched a phone-only account.
- **Display name:** `User.getFullName` and `UserResponse.getFullName` now fall back full name, username, email, then a masked phone (`PhoneMask`, in `user-api`: `+84•••••••67`), then an empty string, so it is never `null`.
- **`AuthServiceImpl.toTokenData`** builds a mutable map and omits `email` when it is null.
- **Repository:** `existsByPhoneNumber`, `existsByPhoneNumberAndIdNot`. **Entity:** `email` nullable, `phoneNumber` unique.
- **Client:** en and vi `errors:codes` entries for `PHONE_ALREADY_USED`, `INVALID_PHONE_NUMBER`, `IDENTIFIER_REQUIRED`, and a test that both locales carry them. `documentation/md/ERROR_CODES.md` has the three rows.
- **Unchanged:** `RegisterRequest.email` stays required on the legacy register endpoint; no new endpoint, no lookup by phone.

### Consumer census (final)

| Consumer | Result |
|---|---|
| `users.email NOT NULL`, `@Column(nullable=false)` | updated here |
| `UserRepository.findByEmail*`, `existsByEmail` | updated here (callers guard null and blank in the service) |
| `UserService` email-keyed methods and `createUser` | updated here, Javadoc updated |
| `GET /api/users/email/{email}`, `GET /api/users/check/email` | compatible as-is |
| `getFullName` on `User` and `UserResponse` | updated here |
| `AuthServiceImpl.toTokenData`, `toUserResponse` | updated here (the response map already allowed null values) |
| `PasswordResetService`, forgot-password | compatible as-is (email-keyed, empty result already handled) |
| `RegisterRequest` / `UpdateProfileRequest` phone | updated here (normalised in the service) |
| `UserResponse.phoneNumber` | updated here: now E.164 or null |
| Client `email: string` types, MSW fixtures | deferred to **AUTH-14** (already filed, "nullable email"); a null email cannot occur before A26 provisions phone-only users |
| Client `errors:codes` | updated here |
| Go chat service | compatible as-is (no email in the sync events) |

### Verification

- `:modules:user:user-impl:test` and `:modules:auth:auth-impl:test` green. New `PhoneNumbersSpec` (17 cases) and `UserIdentifiersSpec` (24 cases) cover `0901234567`, `+84901234567`, `84901234567`, spaced and bracketed forms, a foreign `+1` number, blank and garbage input, the null guards, the uniqueness race, phone clearing, and the display-name order. `UserServiceImplSpec` (104 cases) needed only its phone literal changed from `+1234567890`, which libphonenumber rejects as invalid, to `+84901234567`.
- **`:server:test`: 586 tests, 580 passed, 6 failed, all in `SessionEventsConsumerIntegrationTest` with `AmqpIOException` (the Testcontainers RabbitMQ connection). Re-run in isolation, all 6 pass, so this was a connection failure under full-suite load, not a regression; nothing in that class touches users or phones.**
- New IT: see below. Client: scoped Vitest (`userErrorCodes.test.ts`, locales) passed; the full client suite and Playwright were not run (no client behaviour changed beyond two JSON entries).
- `sub` collision check: all 208 dev `users.id` values are random v4 UUIDs (122 random bits), the same space as a Keycloak `sub`, so a collision is not a practical risk. No code change.

### IT changes

- **Added** `server/src/test/java/com/sportconnect/integration/UserIdentifierConstraintsIntegrationTest.java` (11 tests, real MockMvc, Spring wiring and H2 writes):
  - register with `0901234567` stores `+84901234567` and returns it;
  - a second register with the same number in another format gets 409 `PHONE_ALREADY_USED` and creates no user;
  - an invalid phone gets 400 `INVALID_PHONE_NUMBER` and creates no user;
  - register with no phone stays null;
  - profile update with another user's number gets 409 and leaves the phone unchanged;
  - re-sending the caller's own number in another format succeeds;
  - a blank phone clears it for an account with an email;
  - clearing the only identifier of an email-less account gets 400 `IDENTIFIER_REQUIRED` and keeps the phone;
  - the database rejects a row with neither email nor phone, rejects a duplicate phone, and accepts any number of rows with no email or no phone.
- **Updated** `server/src/test/resources/schema.sql`: `users.email` nullable, `phone_number` unique as `uq_users_phone_number`, and the `chk_users_email_or_phone` check, mirroring V079.
- **Updated** `UserServiceImplSpec`: the phone literal only (see above).

### Not done / follow-ups

- A phone-only account cannot be created through the API yet (legacy register still requires an email); the IT covers it by nulling the email in SQL. A26 will create such users.
- The profile screen will now show a phone as `+84…` after any save. No client change is needed for that.
- The masked-phone display name is a last resort; A26 is expected to set `username` from the Keycloak `preferred_username`.
