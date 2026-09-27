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
    with one lookup per page, never per row. `UserFriendServiceImpl.getFriends` builds its own partial `UserResponse` with no geo fields.
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
