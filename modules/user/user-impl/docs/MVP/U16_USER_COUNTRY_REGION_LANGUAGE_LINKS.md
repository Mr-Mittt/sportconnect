# U16 · Link users to Country / Region / Language — profile, preferences, sign-up details

**Status:** `TODO`
**Module:** `modules/user/user-impl` (with the `auth` register path — `modules/auth/auth-api` / `auth-impl`)
**Type:** New Feature (API — additive fields, one removed write field, new cross-domain dependency)
**Depends on:** REF-1 (`reference-api`); REF-2 only for the client's `resolve` call, not for this ticket's code
**Blocks:** CLIENT-REF-2, CLIENT-REF-3, A24
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md`). Filed in `user` (not `reference`) because it changes user-impl and
auth code, so `/workon user` and `/list user` see it.

## What

Replace the free-text `users.country` with real links, let a user pick language/country/region at sign-up
(optional) and later in profile settings, and save the sign-up coordinates to the profile.

**Migration** (next free `V0xx`): `users.country_id`, `users.region_id` — `BIGINT`, nullable, **no FK** (cross-domain
IDs only). One-time SQL backfill matching `users.country` text to `countries.name` / `iso2` / `iso3`
case-insensitively; unmatched rows keep the legacy text. `users.country` stays as a legacy display fallback.

**Entity / DTOs**
- `User`: add `countryId`, `regionId`.
- `UpdateProfileRequest`: add `countryId`, `regionId`; **remove free-text `country`** (Jackson ignores an unknown
  property, so an old client's `country` is silently dropped rather than rejected — state this in the ticket
  conclusion). Rule: if `countryId` is present, `regionId` (nullable) *replaces* the region; a lone `regionId` is
  validated against the stored country; validation via `ReferenceService.requireValidSelection` (→ `400`).
  Clearing a country once set is out of scope.
- `UserResponse`: add `countryId`, `regionId`, `regionName`; `country` becomes the **resolved display name** (legacy
  text fallback). Every mapper that emits it must batch-resolve through `getCountriesByIds` / `getRegionsByIds` —
  collect ids first, look up once, resolve from the map (CLAUDE.md N+1 rule). Grep for every producer of
  `UserResponse` (`UserServiceImpl`, `UserFriendServiceImpl`, search paths) and every mirror of the field.

**Sign-up** — `RegisterRequest` (`auth-api`) gains optional `languageCode`, `countryId`, `regionId`, `latitude`,
`longitude` (range-validated; coordinates both-or-neither). `AuthServiceImpl.register` passes them to a new
`UserService.createUser(..., UserRegistrationDetails)` overload (`UserRegistrationDetails` lives in `user-api`); the
existing 5-argument method delegates with nulls (`AuthServiceImpl` is its only caller). `createUser` validates the
selection, sets `countryId`/`regionId`, sets `User.location` from the coordinates
(`GeometryFactory(new PrecisionModel(), 4326)`, X = longitude), and creates the `UserPreference` row with the language.
A supplied but unknown/inactive `languageCode` → `400`.

**Preferences** — `UserPreferenceServiceImpl`: `language` must be an active language code
(`ReferenceService.isActiveLanguage`) → `400` otherwise. **This is new** — it was accepted unvalidated.

**Wiring:** `user-impl` gains `implementation project(':modules:reference:reference-api')`.

## Edge cases

- **Account lifecycle (CLAUDE.md):** `updateProfile` already loads via `findByIdAndIsActiveTrue`, so a deactivated
  caller is rejected — keep it and cover with an IT. The preference write does **not** check today (the JWT filter does
  not recheck — U12); add an explicit `isActive` check via `UserService` on the write. Register is pre-auth.
- Region without a country, region not in the country, inactive ids, unknown ids → `400`.
- Saved coordinates disagreeing with the final country/region picks are **tolerated** (travelling); the dropdown choices win.
- `privacy_location` is stored but **not enforced anywhere** (pre-existing gap). This ticket does not fix it; it is
  safe only because `GET /api/users/me` is the sole endpoint returning `User.location` — do not add another without
  enforcing it (`REFERENCE_DATA_DESIGN.md` § 10).

## Consumer census (do again at pickup — this list is from 2026-09-25)

| Contract | Consumers | Disposition |
|---|---|---|
| `PUT /users/{id}/profile` drops `country`, adds `countryId`/`regionId` | client `EditProfileModal`, `profileEditDraft.ts`, MSW handlers | client side deferred to **CLIENT-REF-3** (filed) |
| `UserResponse.country` = resolved name; new fields | client `profile/types.ts`, `friends/types.ts`, e2e mocks, backend user mappers | additive for the client (mirror update in CLIENT-REF-3); mappers updated here |
| `RegisterRequest` optional fields | client `RegisterPayload`, `AuthServiceImplSpec` (`createUser(_,_,_,_,_)`) | additive; client in **CLIENT-REF-2** (filed); spec updated here |
| `UserService.createUser` overload | `AuthServiceImpl` only | compatible (old signature kept) |
| `UserPreference.language` validated | re-grep client for a non-en/vi writer | verify at pickup |

## Tests

- **Spock:** `UserServiceImplSpec` (selection validation, region ∈ country, `createUser` with details incl. point and
  preference creation, legacy-text fallback in responses, batch resolution), `UserPreferenceServiceImplSpec` (language
  validation), `AuthServiceImplSpec` (register passes details through).
- **IT** (`server/src/test/java/com/sportconnect/integration/`; add the columns to the H2 `schema.sql` and the reference
  tables from REF-1): `RegistrationGeoIntegrationTest` (register with ids/coords → persisted country/region/point and
  preference language; region–country mismatch → `400`; unknown language → `400`), `ProfileGeoUpdateIntegrationTest`
  (real update path; **deactivated caller rejected**; another country's region rejected). A new cross-domain bean edge
  (`user-impl` → `reference-api`) means real context wiring must be proven by IT, not only mocked specs.
- Report the IT changes in the ticket conclusion.

**Out of scope:** the client changes (CLIENT-REF-2/3); the resolver call; venue links (LOC-5); enforcing
`privacy_location`; clearing a country; the attribute-label locale (A24).
