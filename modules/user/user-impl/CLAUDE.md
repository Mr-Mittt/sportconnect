# CLAUDE.md — user-impl

User entity with UUID PK and PostGIS geolocation, role management, profile CRUD, and soft delete.

## Dependencies

| From | Why |
|---|---|
| `modules/user/user-api` | UserService interface + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| `modules/auth/auth-api` | `AuthService.logout()` — U12 session revocation on deactivation (`@Lazy`, cycle) |
| `modules/sport/sport-api` | U15: `UserSportProfileService.getUserProfiles(id)` — the target's active sport ids for `UserInfoResponse.activeSportIds` (no cycle; `sport-api` → only `common`) |
| `modules/reference/reference-api` | U16: `ReferenceService` — `requireValidSelection`, `isActiveLanguage`, batch `getCountriesByIds` / `getRegionsByIds` (no cycle; `reference-api` → only `common`) |
| Hibernate Spatial 6.4.0 | Maps `geography(Point,4326)` to JTS `Point` |
| JTS 1.19.0 | `GeometryFactory`, `Point`, `Coordinate` |

## Key Classes

| Class | Purpose |
|---|---|
| `User` | UUID PK; PostGIS `Point` location; `isActive` soft delete; eager ManyToMany roles |
| `UserServiceImpl` | CRUD + location conversion; `GeometryFactory(PrecisionModel(), 4326)` created in constructor |
| `UserController` | `/api/users/**` — GET lookups are `hasRole('USER')` since U11 (not public); the by-id/email/username lookups return `UserInfoResponse` (PII-free, + `activeSportIds` since U15) |

## Location Pattern

```java
// Creating a point — always longitude=X, latitude=Y
Coordinate coord = new Coordinate(request.getLongitude(), request.getLatitude());
Point point = geometryFactory.createPoint(coord);

// Reading back
double latitude  = point.getY();
double longitude = point.getX();
```

## Endpoints

```
GET    /api/users/{userId}
GET    /api/users/email/{email}
GET    /api/users/username/{username}
GET    /api/users/check/email?email=
GET    /api/users/check/username?username=
PUT    /api/users/{userId}/profile       ROLE_USER
POST   /api/users/me/deactivate          ROLE_USER  (U22: body { currentPassword }; soft-deletes the caller + revokes sessions)
DELETE /api/users/{userId}               ROLE_ADMIN
```

## Run Tests

```bash
./gradlew :modules:user:user-impl:test
```

## Gotchas

- `leetcode.java` and `leetcodeSpec.groovy` are scratch files — not application code, ignore them.
- `UserServiceImpl.createUser()` fetches the `USER` role by name and throws `RuntimeException` if missing — V001 migration seeds it.
- `updateUserPassword()` receives a **pre-hashed** value from auth-impl — never hash it again here.
- **Country / region / language (U16).** `users.country_id` / `region_id` are plain ids into the reference domain (no FK, no JPA
  relation). `users.country` (free text) is **legacy**: never written any more, kept only as the display fallback for users whose text
  matched no country row. `UserResponse.country` is the linked country's English name, else that legacy text.
  - **`getUsersByIds` deliberately does not resolve display names** — it returns `countryId`/`regionId` only (`country` = legacy text,
    `regionName` = `null`). It is the hot batch call behind feed, comments, group and session lists (Discover included), none of which
    shows a country; resolving would add up to two reference queries to each. A caller that needs names collects the ids and calls
    `ReferenceService.getCountriesByIds` / `getRegionsByIds` once. Every single-user read and `searchUsers` **do** resolve (`GeoNames`),
    with one lookup per page, never per row. `UserFriendServiceImpl.getFriends` builds its own PII-free `UserInfoResponse` (U17), not
    `UserResponse` at all.
  - **Display-name-only callers should use `getUserSummariesByIds`, not `getUsersByIds` (U18).** A census of every real cross-domain
    `getUsersByIds` call site (`notification-impl`, `session-impl`, `group-impl`, `post-impl` — 16 sites) found none reading anything
    beyond `fullName`/`avatarUrl`; all were migrated to the new method, which returns `UserSummaryResponse { id, fullName, avatarUrl }`
    (no PII, no geo fields, nothing that grows unnoticed the way `UserResponse` has). Same one-query, no-active-filter contract as
    `getUsersByIds`. Keep new batch-by-id callers on this method unless they genuinely need more of `UserResponse`.
  - **Profile update rule:** `countryId` present → `regionId` *replaces* the region (absent = cleared, so clients send both); a lone
    `regionId` is validated against the stored country; validated with `ReferenceService.requireValidSelection` (→ `400`) **before** any
    other field is applied. An old client's free-text `country` is silently ignored by Jackson (not rejected). Clearing a country is unsupported.
  - **Register:** `createUser(..., UserRegistrationDetails)` validates selection, then language, then coordinates, all **before** the user
    is saved (a `400` persists nothing); it sets the ids, the location point (X = longitude) and, when a language was given, a
    `UserPreference` row. The 5-argument `createUser` delegates with `null`.
  - **Preferences:** `language` must be an active reference language code (`400`); both `getPreferences` and `updatePreferences` reject a
    deactivated caller with `404` before any row is created (the read auto-creates one, and the JWT filter does not recheck `isActive` — U12).
  - **`V075` backfill** links `users.country` text to a country by name / iso2 / iso3, case- and space-insensitive, only where
    `country_id IS NULL` — so it is safe to re-run, and **REF-4 must re-run it** once more countries are seeded. `users.region_id` is not backfilled.
- `UserPreference` entity and table (V001): `UserPreferenceServiceImpl` serves `GET`/`PUT /api/users/me/preferences`; the row is created lazily
  on first access, or at register when a language is given. `language` is `VARCHAR(35)` (matches `languages.code`) since V075.
- Always use `findByIdAndIsActiveTrue()` in new queries — `findById()` returns soft-deleted users too.
- **Error codes (U21).** Every client-actionable error in this module throws a coded exception (`new BadRequestException("HEIGHT_OUT_OF_RANGE", msg, Map.of(...))`); codes are registered in `documentation/md/ERROR_CODES.md`. The four friend-state conflicts are `ConflictException` (409), not 400. The generic `User not found` 404s stay un-coded on purpose.
- **Email is optional, phone is a second unique identifier (U23).** `users.email` is nullable and `users.phone_number` is unique E.164 (`+84901234567`); the DB check `chk_users_email_or_phone` requires at least one. Every phone is normalised by `PhoneNumbers.normalize` (Google libphonenumber, default region `VN`: `0901234567` and `+84901234567` are one number; a foreign number needs its `+`) - never write `phoneNumber` any other way. Never hand a null/blank email to `UserRepository.findByEmail*` (Spring Data turns `findByEmail(null)` into `email IS NULL` and would return a phone-only user); the service methods already guard. `getFullName` ends in a masked phone, never null (callers put it in `Map.of`). Codes: `PHONE_ALREADY_USED` (409), `INVALID_PHONE_NUMBER`, `IDENTIFIER_REQUIRED`.
- **Users come from Keycloak (A26).** `User.id` is **assigned** (random UUID by default, the token's `sub` for a provisioned user) and `User implements Persistable<UUID>` with a transient `newEntity` flag; without it `save()` of a preset id goes through `merge` and a `@GeneratedValue` id would be replaced. `provisionExternalUser(ExternalIdentity)` is the get-or-create the `/callback` uses (`password_hash` stays null, username from `preferred_username` (ignored when it contains `@`: the realm uses email as username and `users.username` is public), language only if active, no re-sync of an existing row; **A32:** country / region / location from the register page's token claims, each dropped when invalid (`usableZone`, `usableLocation`) and never a failure, because the Keycloak account already exists when they arrive); `reactivateUser(UUID)` evicts the access-state cache. Provisioned users have no local password, so the password-confirming U22 `deactivateOwnAccount` and `changePassword` cannot work for them (U24).
- **First sign-in is serialised per subject (A26).** `provisionExternalUser` starts with `UserProvisioningLock.acquire(sub)`: a transaction-scoped Postgres advisory lock `pg_advisory_xact_lock(0x5C01, hashtext(sub))`, a no-op on any other database (the H2 ITs). It is an optimisation; the primary key and the email/phone unique indexes stay the arbiter and auth's one retry covers two different subjects on one email or phone. Advisory locks share one key space per database, so each use takes its own namespace: registry `0x5C01` = user provisioning. Never change a deployed namespace.
- **The per-request active gate (A25).** `UserService.getAccessState(id)` is what `JwtAuthenticationFilter` calls on every authenticated request: Redis (`UserAccessStateCache`, TTL `app.user.access-state-ttl`, 60 s) then the DB. `deactivate()` and `reactivateUserByEmail()` evict after commit; a new write to `users.is_active` or to a user's roles must call `accessStateCache.evictAfterCommit`, otherwise the change shows only after the TTL. Absent users are not cached.
- **Shoe size is millimetres (U21):** `users.shoe_size_mm` / `shoeSizeMm`, range 10 to 500 (V077 renamed it and multiplied by 10). Never reintroduce `shoeSizeCm`.
