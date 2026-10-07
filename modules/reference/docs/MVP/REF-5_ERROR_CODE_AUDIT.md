# REF-5 · Error code audit: reference module

**Status:** `DONE` (2026-10-07)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **reference**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-8** lists the final codes.

**Scope:** public read endpoints and the boundary resolver (`POST /api/reference/resolve`).

**Known messages to start from (not exhaustive — the audit finds the rest):** about 8 throw sites; enumerate at pickup.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `GET /api/reference/countries/{id}/regions` | Unknown or inactive country | NOT_FOUND | `COUNTRY_NOT_FOUND` | none | Category copy; the picker reloads its country list (CLIENT-ERR-8 decides) |
| Register, profile update (via `requireValidSelection`) | Region without a country | VALIDATION | `REGION_COUNTRY_REQUIRED` | none | Inline on the geo fields |
| same | Unknown or inactive country | VALIDATION | `COUNTRY_UNKNOWN` | `{country}` | Inline on the country field |
| same | Region unknown, inactive, or not in the country | VALIDATION | `REGION_UNKNOWN` | `{region, country}` | Inline on the region field; the region picker refetches |
| `POST /api/reference/resolve` | Size and range validation | VALIDATION | none (`VALIDATION_FAILED`) | `{fields}` | Ignored by the pre-fill |
| `GeoBoundaryResolver` startup loading | Missing or malformed bundled data | n/a | none | n/a | Not user-reachable |
| every endpoint above | **Deactivated caller** | n/a | none | n/a | Public endpoints need no check; inside register and profile update it is the U12 known gap (no `isActive` check added) |

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-8**, filed alongside this ticket.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

**Scope decisions at pickup (2026-10-07, user-confirmed):** code the three `requireValidSelection` 400s and the regions 404 (four codes, `REGION_UNKNOWN` as one code for unknown, inactive and foreign region); leave the `resolve` bean-validation 400s as the generic `VALIDATION_FAILED`.

## Implementation summary (2026-10-07)

**Approved plan** (user sign-off 2026-10-07): convert the four user-reachable throw sites in `ReferenceServiceImpl` to coded exceptions with the English messages unchanged; document the codes in `ERROR_CODES.md` § reference; extend the Spock spec and the existing geo integration tests rather than adding a new IT class; hand the final codes to CLIENT-ERR-8.

**Built:**
- `getActiveRegions`: `ResourceNotFoundException.coded("COUNTRY_NOT_FOUND", "Country not found with id: '<id>'", null)` (the message keeps the old `ResourceNotFoundException("Country", "id", id)` wording).
- `requireValidSelection`: `REGION_COUNTRY_REQUIRED`, `COUNTRY_UNKNOWN` (`{country}`), `REGION_UNKNOWN` (`{region, country}`), all `BadRequestException`, all with the old messages.
- Javadoc on both `-api` methods (`@throws` with the codes) and the impl; `ReferenceController` `@ApiResponses` name the codes and say the resolve 400s are generic.
- No migration, entity, DTO or status change.

**Key decisions:**
- No status moved, so unlike A11/A18/SESSION-45 there is no contract change beyond the additive `errorCode`/`errorParams`.
- `REGION_UNKNOWN` is one code on purpose: the three causes (unknown, inactive, in another country) call for the same client action (refresh the region list). The REF-3 province merger makes the inactive case real: a saved or stale region id lands here.
- `LANGUAGE_UNKNOWN` stays in § user (U21 coded it); REF-5 adds nothing for languages.

**Consumer census:** `ReferenceService.requireValidSelection` callers: `UserServiceImpl` register path (~361) and profile update (`applyGeoSelection`, ~429), both compatible as-is (the exception type is unchanged, `message` unchanged, `errorCode` additive). `getActiveRegions` consumer: the client `useRegions` / `GeoLocaleFields` (status unchanged, so compatible as-is; the new copy is CLIENT-ERR-8). Nothing outside `ReferenceServiceImpl` matches on the exact message text (Java, Groovy, client, MSW). No new follow-up ticket: CLIENT-ERR-8 (Phase C, already filed) now has the final codes, noted on its ticket.

**IT changes:**
- `ReferenceApiIntegrationTest` (updated): the unknown-country and inactive-country regions cases now assert 404 + `COUNTRY_NOT_FOUND`; the resolve validation loop (9 bodies) asserts 400 + `VALIDATION_FAILED`, proving no reference-specific code leaks in.
- `ProfileGeoUpdateIntegrationTest` (updated): region of another country, region without a country, unknown country, unknown region, inactive region and inactive country now assert `REGION_UNKNOWN` (with `errorParams.region`/`country`), `REGION_COUNTRY_REQUIRED`, `COUNTRY_UNKNOWN` (with `errorParams.country`) and `REGION_UNKNOWN` respectively, through `PUT /api/users/{id}/profile`.
- `RegistrationGeoIntegrationTest` (updated): the same codes through `POST /api/auth/register` (region of another country, region without a country, unknown country with `errorParams.country`, inactive country).
- No new IT class: these three already drove each path through the real pipeline.

**Tests:** `ReferenceServiceImplSpec` (module `:modules:reference:reference-impl:test`): the four exception cases assert `errorCode`, `errorParams` and message. `:server:test` (full): **514 tests, 0 failures, 0 errors**.

**Hand-off to CLIENT-ERR-8:** the final codes are `ERROR_CODES.md` § reference. The register form and the profile form show the three selection 400s today as the server's English text or a generic line; CLIENT-ERR-8 owns their en/vi copy and the region-picker refetch on `REGION_UNKNOWN`.
