# A32 · Registration country, region and location reach the app database through token claims

**Status:** `DONE (2026-10-15)` · **Type:** Feature · **Depends on:** A26 (provisioning), INFRA-13 (realm as code) · **Gates:** client AUTH-16 (the register-page fields)

**Filed:** 2026-10-15, from the client AUTH-16 scope change: the owner wants country, region, language and the detected location on the Keycloak register page, like the old register form. The theme (AUTH-16) renders and fills the fields; this ticket makes them arrive in `users`.

## What

1. **Realm (admin API script under `infra/scripts/`, mirrored into `sportconnect-realm.json` in the same change, per the realm-change rule in CLAUDE.md):** add optional user-profile attributes `countryId`, `regionId`, `latitude`, `longitude` (language already travels as `locale`), and protocol mappers that put them into the access/ID token as `country_id`, `region_id`, `latitude`, `longitude`. Registration may set them; they are not required, so a Google/Facebook/Zalo user without them still provisions.
2. **Backend:** `ExternalIdentity` gains `countryId`, `regionId`, `latitude`, `longitude`; `AuthServiceImpl.identityOf` reads the four claims; `UserService.provisionExternalUser` stores them on a **new** row only (an existing row is never re-synced, as today). The values are untrusted input: the country/region pair is checked with `ReferenceService.requireValidSelection` and the coordinates for range, and an invalid value is **ignored with a log line, not a failure** (a bad optional field must not block a first sign-in). The location point uses the `GeometryFactory(PrecisionModel, 4326)` rule (X = longitude).

## Scope change 2026-10-15 (owner): language, and a legacy-form parity check

The owner asked that language be covered and that the legacy register form (`RegisterForm`, removed by AUTH-14; backend `RegisterRequest`) be checked for missing fields. Result:

| Legacy field | On the Keycloak register page today | Handled by |
|---|---|---|
| email (required) | yes | already works |
| password (min 8, show/hide) | yes, plus a confirm field (new) | already works |
| full name (one required field) | first name + last name (both required) | Keycloak shape; the provisioning split of `name` is unchanged. A single full-name field is a theme choice for AUTH-16 |
| phone number (optional) | yes (`phoneNumber` attribute) | already works (U23 normalises it) |
| country + region (dependent) | **missing** | this ticket (claims) + AUTH-16 (the page) |
| "Use my current location" (latitude, longitude, both-or-neither) | **missing** | this ticket (claims, pair rule kept) + AUTH-16 (the button) |
| language (`languageCode`) | **no field**, but the page language links set the user's `locale` | already works end to end: `locale` claim -> `ExternalIdentity.languageCode` -> preference only if an active language; this ticket **adds a test that a register in `vi` lands with preference `vi`**, and AUTH-16 may show it as a select bound to `locale` |

So the only missing data is country, region and location; language needs no new claim. The both-or-neither rule for latitude/longitude from `RegisterRequest` is kept: one without the other is ignored.

**Drop rules (owner discussion 2026-10-15; the legacy `createUser` rejected the whole registration with a 400, which cannot work here because the Keycloak account already exists by the time the claims arrive):** an invalid or inactive country drops country and region; a valid country with an invalid region keeps the country and drops the region; a region without a country is dropped; coordinates are kept only as an in-range pair. Every drop is logged, never a failure. The user is told by the client, not by this ticket: the profile comes back with an empty country (or a country with regions but no region), which opens the AUTH-16 dialog. No new signal in the response.

## Consumer census (to redo at pickup)

`ExternalIdentity` (user-api), `UserServiceImpl.provisionExternalUser`, `UserProvisioningSpec`, `AuthServiceImpl.identityOf`, `KeycloakCallbackIntegrationTest` and its `TestKeycloak.Identity` builder, the realm file and the realm script. No REST contract changes, so the client and MSW are unaffected.

## Edge cases

- Claims absent (social users, or a register page that did not set them): nothing changes from today.
- Region without country, region not in the country, coordinates out of range: ignored, logged.
- A user can edit these attributes in Keycloak's own account console; only the first sign-in reads them, so this is harmless, but the attributes should be admin-editable only after registration if the user-profile config allows it.

**Account lifecycle:** no new endpoint or job; provisioning runs only for a new subject.

**Out of scope:** the register page UI (AUTH-16); re-syncing an existing user from the token; reading data from Google/Facebook/Zalo (AUTH-16 records what they offer).

**Tests:** extend `UserProvisioningSpec` (valid, invalid and absent claims) and `KeycloakCallbackIntegrationTest` (a first sign-in whose token carries the claims lands with country, region and location on the row).

## Implementation summary (2026-10-15)

**Approved design, as built.** The register page's four optional attributes reach `users` as token claims, are validated as untrusted input, and are stored on a *new* row only.

- **Realm** (`infra/scripts/registration-geo-attributes.mjs`, one definition, two targets): `api` mode adds the attributes `countryId`, `regionId`, `latitude`, `longitude` to the user profile (optional, `view: admin`, `edit: admin + user`, with Keycloak validators `integer >= 1` and `double` in range) and four `oidc-usermodel-attribute-mapper`s on `sportconnect-web` (claims `country_id`, `region_id`, `latitude`, `longitude`, all strings because the mapper has no double type); `file` mode writes the same into `sportconnect-realm.json`. `infra/scripts/apply-registration-geo-attributes.sh` wraps `api`. Both modes are idempotent (a second run adds nothing).
- **`ReferenceService.isValidSelection(countryId, regionId)`** (new, non-throwing twin of `requireValidSelection`). Why: `ReferenceServiceImpl` is `@Transactional(readOnly = true)`, so a `BadRequestException` from `requireValidSelection` passing through its proxy marks the provisioning transaction rollback-only even when caught (the SESSION-38 lesson); "ignore a bad value" would have become a failed first sign-in.
- **`ExternalIdentity`** gains `countryId`, `regionId`, `latitude`, `longitude`; **`AuthServiceImpl.identityOf`** reads the claims with tolerant parsing (string or number; blank, non-numeric, NaN and infinity are absent).
- **`UserServiceImpl.provisionExternalUser`**: `usableZone` (an unknown or inactive country drops country and region; a valid country with a bad region keeps the country; a region without a country is dropped) and `usableLocation` (kept only as an in-range pair, X = longitude). Every drop is logged, never a failure. Language needed nothing: the `locale` claim already becomes the preference.

**Divergences from the approved plan:** none in design. Two corrections to what I said while planning: the `/api/auth/callback` response's `user` is a small map **without** `countryId`/`regionId` (the first IT assertion caught it), so the AUTH-16 dialog must read the profile (`GET /api/users/me`); and a real Keycloak run showed the validators refuse non-numeric ids and out-of-range coordinates themselves, so the backend rule is a second line of defence, not the first.

**Tests.** `ReferenceServiceImplSpec` +3 (`isValidSelection`); `UserProvisioningSpec` +11 test instances (valid claims stored with SRID 4326, unknown country drops both, bad region keeps the country, region without country, six bad-location rows, no claims touches no reference call); `AuthServiceImplSpec` +5 data rows (string, number, padded, garbage, non-finite claims); `KeycloakCallbackIntegrationTest` +3 (a first sign-in with valid claims stores country, region and location; bad claims still sign in and drop only what is invalid; no claims leaves the zone empty) with a `TestKeycloak.Identity.geo(...)` helper. Results: `user-impl` 284, `auth-impl` 141 (before the last 5 rows), `reference-impl` 91, full `:server:test` 636, all passing; real-Keycloak e2e (a fresh container built from the updated realm file) 9 of 9.

**Verified on the real dev Keycloak:** the script added all four attributes and mappers; a user created with the attributes gets `country_id`, `region_id`, `latitude`, `longitude` (strings) in Keycloak's example access token; bad values are refused with 400.

**IT changes:** `KeycloakCallbackIntegrationTest` (+3: stored, dropped-when-invalid, absent) and `TestKeycloak` (the `geo(...)` claim helper). No `schema.sql` change (the reference tables were already mirrored and reseeded by `ReferenceTestData`).

**Consumer census (final).** `ExternalIdentity`: `AuthServiceImpl.identityOf` updated here; `UserServiceImpl.provisionExternalUser` updated here; `UserProvisioningSpec`, `AuthServiceImplSpec`, `KeycloakCallbackIntegrationTest` updated here. `ReferenceService`: one implementer (`ReferenceServiceImpl`), Spock mocks unaffected. No REST contract change, so the client and MSW are compatible as-is.

**Not verified / known.** The register page itself (AUTH-16): until it lands, the stock Keycloak register page shows the four new attributes as plain optional fields ("Country", "Region", "Latitude", "Longitude") on any realm that has them, including the dev realm now. AUTH-16 replaces that with the real controls. The vi labels for the four attributes are AUTH-16's too.
