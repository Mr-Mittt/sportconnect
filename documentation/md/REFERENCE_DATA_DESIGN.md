# Design: Language / Country / Region Reference Data, Sign-up Detection, Client i18n

**Status:** Approved design, not yet implemented (planned 2026-09-25, `/feature` session). Tracked by the
tickets in [§ Ticket map](#ticket-map).
**Scope:** cross-cutting — new `reference` domain, `user`, `auth`, `location`, `sport` (follow-up) and the
`client`.

---

## 1. Problem

- Where a user is exists only as a free-text `users.country` / `users.city` and an optional PostGIS
  `users.location` point. Nothing stops "VN", "Vietnam", "viet nam" and "VNM" from all appearing.
- There is no notion of a **supported language**: `UserPreference.language` (default `"en"`) accepts any
  string, and the client has no i18n at all (`documentation/md/I18N_READINESS.md`: "nothing built").
- Venue `Location`s carry an IANA `timezone` (LOC-4) but no country or region, so nothing can say
  "venues in Ho Chi Minh City".
- Sign-up asks for none of this, and a returning-visitor's browser already *knows* the language, timezone and
  (with consent) coordinates that would let us pre-fill it.

## 2. Goals

1. Three real, separate reference tables — **Language, Country, Region** — served by public read endpoints.
2. Sign-up gets **optional** dropdowns for them. The client auto-detects, asks the server to match what it
   detected against the tables, and pre-fills; anything the server cannot match stays blank for the user.
3. The client may ask for **browser location permission** (explicit button) to improve country/region detection.
4. The same fields are editable in profile settings.
5. Venue `Location`s are linked to country and region.
6. The client supports **localization** (en + vi), driven by the chosen language.

**"Zone" means region / state / province** (a child of Country) — *not* a timezone. Every existing timezone
field (`UserPreference.timezone`, `Location.timezone`, `client/src/shared/lib/viewerZone.ts`, SESSION-33..35,
`LOCATION_TIMEZONE_DESIGN.md`) is untouched by this work.

## 3. Decisions

| Topic | Decision |
|---|---|
| Zone | Region/state/province, child of Country |
| Which `Location` | The **venue** `Location` entity (`location-impl`), not the user's own point |
| "Server knows it" | Client sends raw detected values to a public resolve endpoint; the server **matches them to rows**. No IP geolocation |
| Seed coverage | ~~All ~250 countries~~ → **countries: Vietnam only (2026-09-25, REF-1 pickup; the rest is REF-4)**; regions for **Vietnam only**; languages `en` + `vi` |
| Coordinates → country/region | Bundled Natural Earth polygons, JTS in memory, lazy-loaded |
| Geolocation UX | Silent detection first; explicit **"Use my current location"** button; coordinates **saved to `User.location`** |
| Venue links | Nullable `countryId`/`regionId`, auto-derived on create, existing rows backfilled once, never blocks creation |
| Legacy `country` text | Replaced by links; responses keep `country` as the resolved display name; free-text writes dropped |
| i18n scope | `react-i18next` infra + en/vi bundles + language switcher; only sign-up + profile-edit strings translated in the first pass |

## 4. Data model

All tables are owned by the `reference` domain. No other domain has a DB foreign key into them (cross-domain
references are IDs only — CLAUDE.md).

```
languages(id, code UNIQUE /* BCP 47: en, vi */, name, native_name, is_active, sort_order)
countries(id, iso2 UNIQUE, iso3 UNIQUE, name /* English */, is_active,
          default_language_code FK→languages(code) NULL /* V074 */)
regions  (id, country_id FK→countries, iso_code UNIQUE /* ISO 3166-2, e.g. VN-SG */,
          name, native_name, is_active)
```

- **Default language per country (added 2026-09-25, REF-1 scope change 2, migration V074):** a nullable
  `countries.default_language_code` (intra-domain FK to `languages.code`; Vietnam → `vi`). One default per country is
  enough while only `en` + `vi` exist; a `country_languages` join table (several languages per country, with an
  `is_default` flag) is the upgrade path for multilingual countries and can be added without breaking the API. Rejected:
  a hardcoded country → language map in the client (drifts from the data), and deriving it in the browser with
  `Intl.Locale.maximize()` (can yield languages the app does not support and splits the logic across client and server).
  **Priority:** explicit user choice > a supported language from `navigator.languages` > the country default > none;
  a hand-picked country fills Language from the default only while Language is empty.
- Country names are localized **client-side** with `Intl.DisplayNames` (no per-language country data to seed
  or maintain). Regions have no such browser API, hence `native_name`.
- Language is keyed by BCP 47 **code**, matching A13's attribute-label locales — two locale-code schemes side by
  side would be their own bug class (`I18N_READINESS.md`, "Relationship to A13").
- Consumers store IDs: `users.country_id`, `users.region_id`, `locations.country_id`, `locations.region_id`
  (nullable, no FK). `UserPreference.language` keeps storing the language **code**.

## 5. API

Public (no auth), read-only:

```
GET  /api/reference/languages
GET  /api/reference/countries
GET  /api/reference/countries/{countryId}/regions
POST /api/reference/resolve
```

`POST /api/reference/resolve` request/response:

```json
{ "locales": ["vi-VN", "en-US"], "timeZoneId": "Asia/Ho_Chi_Minh", "latitude": 10.78, "longitude": 106.70 }
```
```json
{ "language": {"id":2,"code":"vi"}, "country": {"id":240,"iso2":"VN"}, "region": {"id":7,"isoCode":"VN-SG"},
  "source": "COORDINATES" }
```

`latitude`/`longitude` optional, both-or-neither, range-validated; `locales` capped at 10 entries. Every part of
the response is nullable — the server never guesses.

Cross-domain surface (`reference-api`, consumed by `user-impl` and `location-impl`): `getActiveLanguages`,
`getActiveCountries`, `getActiveRegions(countryId)`, batch `getCountriesByIds` / `getRegionsByIds` (no N+1),
`isActiveLanguage(code)`, `requireValidSelection(countryId, regionId)`, `resolve(...)`,
`resolveByCoordinates(lat, lon)`.

## 6. Detection: how the client collects values, and how the server matches them

No IP address is ever read. The client collects three signals from standard browser APIs and sends them in the
request body:

| Signal | Browser API | Permission | Reflects | Weakness |
|---|---|---|---|---|
| Languages | `navigator.languages` | none | Preferred UI language, and a region hint from the subtag (`vi-VN` → VN) | Preference, not location (an expat shows `en-US`) |
| Timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | none | Device clock's zone → country | Wrong if the OS clock is manual/stale; privacy browsers may report `UTC` |
| Coordinates | `navigator.geolocation.getCurrentPosition()` | browser prompt | Precise position | Needs HTTPS, consent; can be denied / unavailable / time out |

Server matching (`POST /api/reference/resolve`):

- **Language:** the first `locales` entry whose primary subtag is an active language code (`vi-VN` → `vi`).
- **Country:** coordinates (point-in-polygon) **>** timezone (bundled `zone1970.tab`-derived table) **>** locale
  region subtag. `source` reports which one won.
- **Region:** coordinates only. Without permission, region stays blank.

Client flow (sign-up):

1. **Page load, no prompt** — resolve with `locales` + `timeZoneId` → pre-fills language and country.
2. **"Use my current location" click** — browser prompt; on grant, resolve again with coordinates → pre-fills
   region (and refines country). Only fields the user has not hand-edited are overwritten. The coordinates are
   kept in form state and sent with the register request.
3. **Denied / unavailable / timeout** — keep step 1's pre-fill, show a non-blocking hint, never block sign-up.

The permission prompt is **never** automatic.

## 7. Boundary resolver

`reference-impl`'s `GeoBoundaryResolver` builds an in-memory JTS `STRtree` lazily (double-checked locking, copied
from `LocationTimeZoneResolver` — eager init caused `OutOfMemoryError` across `:server:test`'s many Spring
contexts) from two classpath resources:

- `geo/countries.tsv` — Natural Earth admin-0 (all countries), 1:50m, simplified, as `iso2<TAB>WKT`.
- `geo/regions-VN.tsv` — Natural Earth admin-1, **trimmed to Vietnam**, as `iso_3166_2<TAB>WKT`.
- `geo/tz-country.tsv` — IANA `zone1970.tab`-derived timezone → country table.

WKT (parsed by `WKTReader` in `jts-core`, already a dependency) rather than GeoJSON avoids adding `jts-io-common`.
Lookup order: region polygon → country from that region; else country polygon; else empty. Never throws.
Resource budget ≈ ≤ 2 MB.

Accuracy caveat: simplified polygons can put a point within a few km of a border in the neighbouring region, and
offshore points can resolve to nothing. That is acceptable **because the result only pre-fills**; the user can
always override.

## 8. Vietnam-only regions — decision record

**Decision (2026-09-25):** all ~250 countries are seeded, but **regions (states/provinces) are seeded only for
Vietnam.** For every other country the region dropdown is empty and `regionId` is null.

**Why:** the product is Vietnam-first (VND fees, `Asia/Ho_Chi_Minh` throughout, `en` + `vi` as languages). A
region needs three things kept mutually consistent — a `regions` row, a boundary polygon for detection, and a
native name — and ~5,000 ISO 3166-2 subdivisions worldwide is a large, hard-to-vet dataset that nobody is asking
for yet. Seeding countries for everyone still lets any user pick their own country.

**Data-currency risk:** Vietnam merged provinces in mid-2025 (63 → 34). The seed must match the bundled polygons
**1:1** (a unit test asserts every seeded region code has a polygon and vice versa). Start with whichever set the
Natural Earth release ships, and refresh via the follow-up ticket (**REF-3**).

**How to add a market later** (e.g. Thailand):
1. Add a Liquibase migration inserting that country's `regions` rows (ISO 3166-2 code, English name, native name).
2. Add that country's admin-1 polygons to a new `geo/regions-<ISO2>.tsv` (or extend the existing file) and load it in
   `GeoBoundaryResolver`.
3. Extend the resolver spec: every seeded region code has a polygon; a known coordinate resolves to the expected region.
4. Add native-name display checks on the client if the language differs.
5. No client or API change is needed — the dropdown is data-driven.

**Delta (2026-09-25, at REF-1 pickup, user decision):** the *countries* seed is narrowed to **Vietnam only** as well —
"the rest is later" (**REF-4** seeds the remaining ISO 3166-1 countries; data-only, no schema/API/client change). The
schema, the `requireValidSelection` rules and the resolver contract are unchanged. Effects: the country dropdown lists
Vietnam only until REF-4; a detected country with no seeded row resolves to `null` (REF-2); the U16 legacy-text backfill
matches Vietnam only and other users keep the legacy text. The first paragraph above ("all ~250 countries are seeded")
is the original decision, kept for the record.

## 9. Client localization (i18n)

- Library: `i18next` + `react-i18next` (Vite-compatible; `next-intl` etc. are Next.js-only — `I18N_READINESS.md` I18N-6).
- Bundles: `client/src/locales/{en,vi}/*.json`, bundled statically; namespaces per feature area.
- `localeStore` (Zustand). Locale source order: signed-in user's stored language → locally stored choice →
  browser (`navigator.languages`) → `en`. Sets `<html lang>`.
- **`Accept-Language` follows the in-app locale** (`I18N_READINESS.md` I18N-2): an `apiClient` interceptor sends it,
  and locale-dependent TanStack query keys (`useSportAttributeSchema`, `useSessionAttributeSchema`) include the
  locale so switching language refetches.
- First-pass translated surfaces: the sign-up form (and its page chrome), `EditProfileModal`, and the new
  geo/locale fields. **Everything else stays English** and is covered by a follow-up ticket; that visible seam
  (e.g. an English `LoginForm` beside a Vietnamese sign-up) is a known, accepted consequence of the phased scope.
- Country display uses `Intl.DisplayNames`; region display uses `native_name` for `vi`.
- Backend prefers the stored language over `Accept-Language` for attribute labels — **I18N-3**, separate sport ticket.

## 10. Privacy and account lifecycle

- **Coordinates saved at sign-up** go into `User.location` (PostGIS point). The user explicitly clicked the button
  *and* granted the browser prompt. Today only `GET /api/users/me` returns `User.location`; the U11 lookups
  (`UserInfoResponse`) are PII-free. **`UserPreference.privacy_location` is stored but never enforced anywhere** —
  a pre-existing gap this work does not fix; any future feature that exposes another user's location must
  enforce it first.
- **Deactivated users** (CLAUDE.md § Account lifecycle): the reference `GET`s and `resolve` are public read-only,
  so they need no caller check. Authenticated writes that now carry country/region/language — the profile update
  and the preference update — must reject a deactivated caller. `updateProfile` already loads with
  `findByIdAndIsActiveTrue`; the preference write gets an explicit `isActive` check via `UserService`
  (the JWT filter does not recheck — U12).
- The public `resolve` endpoint is unauthenticated and there is **no rate-limiting infrastructure** in the codebase.
  Inputs are capped (≤10 locales, validated coordinate ranges) and the work is a cheap in-memory lookup; adding
  rate limiting is out of scope.

## 11. Contract changes (consumer census)

| Change | Consumers | Disposition |
|---|---|---|
| `PUT /users/{id}/profile` drops free-text `country`, adds `countryId`/`regionId` | client `EditProfileModal`, `profileEditDraft.ts`, MSW auth/profile handlers, `UserServiceImplSpec` | updated in U16 / CLIENT-REF-3 |
| `UserResponse.country` becomes the resolved display name; new `countryId`/`regionId`/`regionName` | client `profile/types.ts`, `friends/types.ts`, e2e mocks, any user-mapper (`UserFriendServiceImpl`, search) | updated (mappers batch-resolve); re-grep at pickup |
| `RegisterRequest` gains optional fields | client `RegisterPayload`, `AuthServiceImplSpec`'s `createUser(_,_,_,_,_)` stub | additive |
| `UserService.createUser` gains an overload | only `AuthServiceImpl` | old signature kept |
| `UserPreference.language` becomes validated | no known non-en/vi caller; re-grep client | new 400 |
| `LocationResponse` gains `countryId`/`regionId` | session-impl, group-impl (via `getLocationsByIds`), client `location/types.ts` | additive, compatible |
| DB: nullable columns on `users`, `locations` | entities/JPQL naming those tables | compatible |

## 12. Ticket map

Order: REF-1 → REF-2 → (U16, LOC-5) on the backend; CLIENT-I18N-1 in parallel with backend work; CLIENT-REF-1
needs REF-1/REF-2; CLIENT-REF-2/3 need U16.

| Ticket | Backlog | What |
|---|---|---|
| REF-1 | `modules/reference` | New `reference` module: tables, seeds, public GETs, security, docs |
| REF-2 | `modules/reference` | Boundary resolver + `POST /api/reference/resolve` |
| U16 | `modules/user/user-impl` | User country/region/language links: profile, preferences, register details |
| LOC-5 | `modules/location` | Venue country/region links + backfill runner |
| A24 | `modules/sport/sport-impl` | Attribute-label locale prefers the stored language (I18N-3) |
| REF-3 | `modules/reference` | Vietnam province data refresh (63 → 34 merger) |
| CLIENT-I18N-1 | `client` | i18n infrastructure (**supersedes V1 `I18N-1`**) |
| CLIENT-REF-1 | `client` | Reference hooks, detection, `GeoLocaleFields` |
| CLIENT-REF-2 | `client` | Sign-up integration + translated strings |
| CLIENT-REF-3 | `client` | Profile-edit integration + translated strings |
| CLIENT-I18N-2 | `client` | Translate the rest of the app |

## 13. Risks

1. **Vietnam province data currency** — see § 8.
2. **Boundary accuracy** near borders — see § 7.
3. **`users.country` free text → link migration is best-effort**: existing text is matched to a country by
   name/iso2/iso3 (case-insensitive); anything unmatched keeps the legacy text and shows until the user picks.
4. **Language validation is new** on `PUT /users/me/preferences`.
5. **English-only seams** while i18n is phased in (§ 9).

---

## 14. Declined alternatives

Recorded so a later reader can see what was weighed and why it lost, and when it would be worth revisiting.

### 14.1 What "zone" means

| Option | Why declined | Revisit when |
|---|---|---|
| **IANA timezone** (e.g. `Asia/Ho_Chi_Minh`) | Not what was meant. Timezones already exist on `Location` (LOC-4) and `UserPreference`; a table of them would duplicate `Location.timezone`, and the country → many-timezones relation does not express "state/province" | never for this feature; timezone work lives in `LOCATION_TIMEZONE_DESIGN.md` |
| **Region *and* timezone as separate tables** (four tables) | Doubles scope for a concept already handled elsewhere | a feature needs to *choose* from a timezone list |

### 14.2 Which "Location"

| Option | Why declined | Revisit when |
|---|---|---|
| **User's own location** (`User.location`/`city`/`country`) only | The request was about the venue directory; the user's own country/region is covered separately by the user links (U16) | — |
| **Both venue and user via the same mechanism** | Largest blast radius (session, discover, favorite-locations consumers); the user side is already served by U16 | a feature filters venues by the *viewer's* region |

### 14.3 How the server "knows" the detected values

| Option | Why declined | Revisit when |
|---|---|---|
| **Server-side IP geolocation** | Needs a GeoIP database or a third-party service, sends the user's IP to a vendor, breaks behind a VPN/CGNAT, adds privacy handling, and still cannot give reliable region without more data | product wants zero-prompt region guesses and accepts the dependency and privacy cost |
| **Pre-fill only for returning users** | Sign-up would always be blank — the exact case the feature is for | — |

### 14.4 Seed coverage

| Option | Why declined | Revisit when |
|---|---|---|
| **Regions for everything worldwide** (~5,000 ISO 3166-2) | Large migration and bundled-boundary size, highest data-quality risk, no demand yet | a second market launches — add it per § 8 rather than everything at once |
| **Launch countries only** (few countries + their regions) | Users elsewhere cannot select their own country | — |
| **Vietnam + a few more launch countries** | Each extra market adds regions, polygons and currency checks with no committed launch | a concrete market is scheduled |

### 14.5 Coordinates → country/region

| Option | Why declined | Revisit when |
|---|---|---|
| **Boundaries in PostGIS** (`ST_Contains` + GiST) | No in-memory footprint, but not testable on the H2 `:server:test` schema (no PostGIS), and hides the data from unit tests | the in-memory footprint or startup cost becomes a problem, or regions grow into the thousands |
| **External reverse-geocoding API** (Nominatim/Google) | API key or usage-policy compliance, network dependency, sends user coordinates off-platform, non-deterministic in tests | offline data proves too inaccurate |
| **Country only from timezone/coords; never guess region** | Least accurate, and the region field would then be useless to pre-fill | region is dropped from scope |

### 14.6 Geolocation UX

| Option | Why declined | Revisit when |
|---|---|---|
| **Auto-prompt on page load** | Worse UX and trust; a denied prompt is remembered by the browser and blocks the later, better-timed ask | — |
| **Button, then discard coordinates** | Safer for privacy, but the coordinates were wanted on the profile | product decides `User.location` should not be stored at sign-up |

### 14.7 Venue link behaviour

| Option | Why declined | Revisit when |
|---|---|---|
| **Required on create** | Contract break for existing clients, and venues without coordinates would need a fake country | every venue is guaranteed coordinates |
| **Nullable, no backfill** | Existing venues would stay unlinked until someone edits them | — |

### 14.8 Legacy free-text `country`

| Option | Why declined | Revisit when |
|---|---|---|
| **Keep both writable** | Two sources of truth that can disagree (`country="Vietnam"` while `countryId` points at Thailand) | — |
| **Hard cut** (drop `users.country`) | Loses existing free-text data for anyone whose text does not match a country | the legacy column has been empty of unmatched values for a while |

### 14.9 i18n scope

| Option | Why declined | Revisit when |
|---|---|---|
| **Infra only** (a few demo strings) | Ships a switcher that changes almost nothing | — |
| **Whole app at once** | Very large; also drags in enum/notification text (I18N-4/5) and rewrites most Vitest literal-string assertions | infra is proven — done incrementally via CLIENT-I18N-2 |

### 14.10 Other rejected details

| Option | Why declined |
|---|---|
| **GeoJSON resources** | Would need a new `jts-io-common` dependency; pre-converted WKT parses with `jts-core` already in use |
| **Store translated country names per language** | `Intl.DisplayNames` gives them for free; only regions need `native_name` |
| **Language stored by id** | `UserPreference.language` already stores the BCP 47 code and A13 keys on it |

---

Related: `documentation/md/I18N_READINESS.md`, `documentation/md/LOCATION_TIMEZONE_DESIGN.md`,
`modules/reference/docs/BACKLOG_MVP.md`.
