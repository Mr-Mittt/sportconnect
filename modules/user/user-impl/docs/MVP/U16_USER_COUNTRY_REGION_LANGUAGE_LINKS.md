# U16 · Link users to Country / Region / Language — profile, preferences, sign-up details

**Status:** `DONE` (2026-09-26)
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

## Scope decisions — 2026-09-26 (at pickup)

Findings from the pickup exploration and the decisions taken (recommended options accepted at the scope gate):

1. **`UserSearchResponse.country` is a producer too** (`searchUsers` maps a whole page): it gets the same resolved-name rule and is
   batch-resolved with one `getCountriesByIds` call per page. Without it, a user who picked a country by id (legacy text no longer
   written) would show a blank country in search. `getUsersByIds` (a list of `UserResponse`) is also batch-resolved — the single-item
   `toUserResponse` must not do its own lookup.
2. **`UserFriendServiceImpl.getFriends` is not affected:** its private mapper builds a *partial* `UserResponse` (no city/country/body
   stats today), so the new fields stay omitted — compatible as-is.
3. **Old clients lose country edits until CLIENT-REF-3 ships** (accepted, `REFERENCE_DATA_DESIGN.md` § 14.8): `EditProfileModal` still
   sends free-text `country`; it is now silently ignored. State it in the ticket conclusion; a note is added to CLIENT-REF-3.
4. **Preference reads are gated too:** `isActive` is checked on both `getPreferences` and `updatePreferences` (a read auto-creates a
   row), not only the write.
5. **`user_preferences.language` widened to `VARCHAR(35)`** (matches `languages.code`), in this ticket's migration and the H2 mirror.
6. **REF-4 follow-up added:** the one-time `users.country` backfill only matches countries seeded today (Vietnam); REF-4 gets a bullet to
   re-run it for the newly seeded countries (REF-4 is where the rows appear).

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

## Implementation summary (2026-09-26)

**Status: DONE.** Approved design, restated, then what was built.

### Design (as approved)

**Migration `V075`:** `users.country_id` / `region_id` (nullable `BIGINT`, no FK — cross-domain ids only), `user_preferences.language` widened to
`VARCHAR(35)`, and a one-time, re-runnable backfill of the legacy `users.country` text (name / iso2 / iso3, case- and space-insensitive, only where
`country_id IS NULL`). **`user-api`:** `UserRegistrationDetails`, a `createUser(..., details)` overload (5-argument method delegates with `null`),
`UserResponse` + `countryId` / `regionId` / `regionName`, `UpdateProfileRequest` − `country` + `countryId` / `regionId`. **`auth-api`:** `RegisterRequest`
+ optional `languageCode` / `countryId` / `regionId` / `latitude` / `longitude` (bean-validated, both-or-neither). **`user-impl`:** `reference-api`
dependency; `User` gets the ids; `createUser` validates selection → language → coordinates *before* saving, then sets ids + point (X = longitude)
and creates the `UserPreference` row when a language was given; `updateProfile` applies the country/region rule first (`countryId` present ⇒ `regionId`
replaces the region; a lone `regionId` is checked against the stored country); a batch `GeoNames` mapper (one `getCountriesByIds` + one
`getRegionsByIds`, none when nobody has a link); `searchUsers` resolves a page with one lookup; **`getUsersByIds` does not resolve names** (hot path);
preference `language` validated against the reference languages and both preference calls reject a deactivated caller (`404`).

### What was built

- `server/.../changes/V075__add_country_region_links_to_users.sql` (+ master changelog entry); H2 mirror `schema.sql`: `users.country_id/region_id`,
  new `user_preferences` and `friend_requests` tables (both were missing — the mirror is built lazily).
- `user-api`: `UserRegistrationDetails` (new), `UserResponse`, `UpdateProfileRequest`, `UserService` (overload + Javadoc on `getUsersByIds`),
  `UserPreferenceService` Javadoc. `auth-api`: `RegisterRequest`.
- `user-impl`: `User`, `UserPreference` (`length = 35`), `UserRepository.existsByIdAndIsActiveTrue`, `UserServiceImpl` (constructor +
  `ReferenceService` and `UserPreferenceRepository`; `applyGeoSelection`, `toPoint`, `GeoNames`, `resolveGeoNames`), `UserPreferenceServiceImpl`
  (`requireActiveCaller`, language check), controller Swagger docs, module `CLAUDE.md`. `auth-impl`: `AuthServiceImpl.register` passes the details.
- Tests: see Verification. Docs: design doc § 11 delta, `IT_OVERVIEW.md`, `PROGRESS.md`; Deltas on CLIENT-REF-2 and CLIENT-REF-3; a bullet on REF-4.

### Divergences and findings — stated, not silently absorbed

- **Scope additions at pickup (all recorded in "Scope decisions" above):** `searchUsers` resolves country too; preference **reads** are gated, not only the
  write; `user_preferences.language` widened; REF-4 re-runs the backfill.
- **`getUsersByIds` does not resolve display names** — the ticket said every mapper must batch-resolve. Deliberate, approved at the plan gate: it is the
  hot batch call behind feed/comments/group/session lists (Discover included) and none reads a country; resolving would add up to two reference queries to
  each. It still returns the ids; the Javadoc on `UserService.getUsersByIds` and on `UserResponse.country` says so. **Trade-off:** a future consumer that
  reads `country`/`regionName` from `getUsersByIds` silently gets the legacy text / `null` — none does today.
- **The "active caller" check uses `UserRepository.existsByIdAndIsActiveTrue`, not a `UserService` method** (the ticket said "via `UserService`"): the
  preference service is in the same module as the repository, so this is one cheap query with no new `-api` surface. Returns `404`, like `updateProfile`.
- **Old clients silently lose country edits** until CLIENT-REF-3 ships (accepted at the scope gate, `REFERENCE_DATA_DESIGN.md` § 14.8): `EditProfileModal`
  still sends free-text `country`; Jackson drops it (verified through real binding). Noted on CLIENT-REF-3.
- **`UserFriendServiceImpl.getFriends` was left alone:** its private mapper builds a partial `UserResponse` with no city/country/body stats, so the new
  fields stay omitted — compatible as-is.
- **The `friend_requests` and `user_preferences` tables were absent from the H2 mirror** (added; the CLAUDE.md "built lazily" case).
- **Unrelated observation, not touched and not verified as a defect:** `GET /api/users/friends` returns each friend's `email` and coordinates in its
  partial `UserResponse`; U11 narrowed the lookup endpoints but does not mention this one. It may be intentional (friends only). Raised with the user;
  no ticket filed.
- Pre-existing doc drift noticed: `UserService.getUsersByIds`'s Javadoc says "Missing/inactive ids are simply absent", but the implementation uses
  `findAllById` and includes inactive users. Not changed here.
- Also unverified: `regionName` is the English name; the client shows `nativeName` for `vi` (CLIENT-REF-3), which needs the region id it already has.

### Verification (what was actually run)

- **Spock:** `:modules:user:user-impl:test` — 162 tests, 0 failures (2 skipped: the pre-existing scratch `leetcodeSpec`); `:modules:auth:auth-impl:test` — 59,
  0 failures; `:modules:reference:reference-impl:test` still green. New coverage: `UserServiceImplSpec` (createUser with details incl. point and preference,
  validation-before-save, blank language, half/out-of-range coordinates, the profile geo rules, resolved names with one lookup each, legacy fallback, an
  unresolvable id, `getUsersByIds` making **no** reference call, `searchUsers` making exactly one lookup per page and none when no row is linked),
  `UserPreferenceServiceImplSpec` (language validation before any row is touched; deactivated caller on read and both writes), `AuthServiceImplSpec`
  (details passed through; all-null for an old client; a `400` from `createUser` creates no token or refresh row).
- **IT (real wiring, H2):** `RegistrationGeoIntegrationTest` 10, `ProfileGeoUpdateIntegrationTest` 16, `UserCountryBackfillIntegrationTest` 4.
  **Mutation check:** removing the space-insensitive match from the migration's `UPDATE` fails the backfill IT (a first, equivalent mutation passed and was
  discarded; the migration file was restored afterwards).
- **`:server:test` (full):** 29 classes, 359 tests, 0 failures, 0 errors, 0 skipped (329 before this ticket).
- **Real Postgres:** `:server:bootRun --args=--server.port=8081` against the dev database (8080 was free; used 8081 anyway). `V075` "ran successfully in 77ms";
  `databasechangelog` shows it `EXECUTED`; `users.country_id` / `region_id` are `bigint`, `user_preferences.language` is `varchar(35)`. **The backfill linked
  the two pre-existing legacy rows** ("Vietnam" and "Viet Nam") to `VN` (id 1). Live HTTP: register with `vi` + VN + VN-SG + coordinates → 200 and
  `GET /users/me` returns `country: Vietnam`, `countryId: 1`, `regionId: 63`, `regionName: Ho Chi Minh`, `location` 10.7769 / 106.7009, and preferences
  `language: vi`; register with a region and no country / unknown language / latitude only / unknown country → 400 with readable messages; register with no
  extras → 200; profile `countryId`+`regionId` → resolved names; an old body with free-text `country` → 200, ignored; `countryId` only → region cleared;
  unknown region → 400; preference `language` `en` → 200, `fr` → 400. Server stopped afterwards.
  **Side effects on the dev database:** V075 applied, 2 legacy users linked, and **3 test users were created** by the smoke script
  (`u16-live-*`, `u16-plain-*`, `u16-viewer-*`, plus one preference row, for `u16-live`) — harmless dev data, not removed.
- **N+1 scan:** no repository or reference call inside a loop or `.map()` over a page; `searchUsers` resolves before the row mapping (one call per page),
  single-user reads make at most two, `getUsersByIds` none.
- **Not verified live:** the resolved-country path of `GET /users/search` on Postgres (my smoke query matched only unlinked users; the path is covered by
  `ProfileGeoUpdateIntegrationTest` against the real wiring on H2). No load test of the extra lookups on a hot path — `getUsersByIds` was left out
  precisely so there is nothing to measure there.
- **Client:** untouched (backend-only) — no e2e / visual-regression run applies.

### IT changes (standing report)

- **Added** `server/src/test/java/com/sportconnect/integration/RegistrationGeoIntegrationTest.java` (10), `ProfileGeoUpdateIntegrationTest.java` (16),
  `UserCountryBackfillIntegrationTest.java` (4), and the package-private helper `ReferenceTestData.java` (loads the real `V073`/`V074` seed into H2).
  What each covers is in `documentation/md/IT_OVERVIEW.md` (three new rows).
- **Updated** `server/src/test/resources/schema.sql`: `users.country_id` / `region_id`; new `user_preferences` and `friend_requests` tables.
- **Updated** `documentation/md/IT_OVERVIEW.md` (three rows, summary bullet).

### Notes for the next tickets

- **CLIENT-REF-2 / CLIENT-REF-3:** unblocked on the backend; contract facts are in the Deltas added to both tickets.
- **A24:** its backend dependency (U16) is met; it also needs client CLIENT-I18N-1.
- **REF-4:** must re-run V075's backfill `UPDATE` for the newly seeded countries (bullet added to REF-4).
- **Anyone reading `UserResponse.country` from `getUsersByIds`:** do not — resolve through `ReferenceService.getCountriesByIds`, or use a single-user read.
