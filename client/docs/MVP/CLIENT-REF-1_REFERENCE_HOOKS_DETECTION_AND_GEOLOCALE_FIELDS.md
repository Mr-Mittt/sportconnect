# CLIENT-REF-1 · Reference hooks, browser detection, and the `GeoLocaleFields` component

**Status:** `DONE` (2026-09-28)
**Type:** New Feature (shared component + data layer)
**Depends on:** backend **REF-1** (public `GET`s) and **REF-2** (`POST /api/reference/resolve`) — hard-blocked; stop and
tell the user if they have not shipped. **CLIENT-I18N-1** for the locale-aware display helpers.
**Blocks:** CLIENT-REF-2, CLIENT-REF-3
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md` §§ 5–6).

## What

The shared, presentational building block used by both sign-up and profile edit.

- **Types:** `src/shared/types/reference.ts`, typed 1:1 against the Java DTOs (read `reference-api`'s DTOs — never guess field names).
- **Hooks** (`src/shared/hooks/`, TanStack Query, long `staleTime`, all return `{ data, isLoading, isError }`):
  `useLanguages`, `useCountries`, `useRegions(countryId)` (disabled when `countryId` is null), `useResolveGeo` (mutation).
- **Detection:** `src/shared/lib/detectEnvironment.ts` — `navigator.languages` plus the existing `getViewerZoneId()`
  (`shared/lib/viewerZone.ts`); and `requestBrowserPosition()` — a typed result
  `granted{latitude,longitude} | denied | unavailable | timeout` with a 10 s cap. **Never called automatically** — only
  from the button's click handler. Standard, no new dependency.
- **`GeoLocaleFields`** (`src/shared/components/GeoLocaleFields.tsx`): controlled; native `Select` primitive for
  Language, Country and Region (a native element is the repo's stated choice for short lists, `shared/ui/select.tsx`); a
  "Use my current location" button; a non-blocking hint for denied / unavailable / timeout. Country labels via
  `Intl.DisplayNames`, sorted with `Intl.Collator`; region label is `nativeName` when the UI locale is `vi`. Changing
  the country clears the region; a country with no regions renders the region select disabled with an explanatory label.
- **`useGeoLocaleFieldsData()`** (the page-level data hook): on mount a **silent** resolve (locales + timezone) pre-fills
  only fields the user has not touched; the button resolves with coordinates and overwrites only untouched fields; the
  coordinates stay in the hook's state for the caller to submit.
  **Default language (backend REF-1 scope change 2, 2026-09-25):** `CountryResponse.defaultLanguageCode` (nullable). When a
  country is set — picked by hand or resolved — and Language is **still empty**, pre-fill Language from that code, but only
  if it is in the active `useLanguages()` set; **never overwrite** a value the user chose or the browser detected (browser
  language list > country default).
- **MSW:** `e2e/mocks/handlers/reference.ts` (+ fixtures: `en`/`vi`, a few countries incl. Vietnam and one with no regions,
  Vietnam's regions, a resolve handler with a coordinates-aware response and a timezone-only one).
- **A11y:** every control labelled, the button keyboard reachable with visible focus, the hint announced politely
  (`aria-live`), colour never the only signal.

## Edge cases

- Reference fetch fails → fields render disabled with an error hint; sign-up/profile must stay usable (fields are optional).
- Resolve returns all-null → nothing pre-filled, no error shown.
- Geolocation denied/unavailable/timeout → keep the silent pre-fill, show the hint, never block.
- The user edits a field, then the silent resolve finishes → the edit wins (never clobber a touched field).
- Insecure context (no `navigator.geolocation`) → button hidden/disabled, not an exception.

## Tests

Vitest: detection lib (mock `navigator`), each hook, `GeoLocaleFields` (pre-fill, untouched-only overwrite, clear region on
country change, no-regions country, each geolocation outcome), `useGeoLocaleFieldsData`. **Storybook:** one story per
visual state — default, pre-filled, resolving, geolocation denied, no-regions country, reference-load error. e2e is
delivered with the integrations (CLIENT-REF-2/3); this ticket adds no page, so no visual-regression baseline changes.

**Out of scope:** embedding it in any form (CLIENT-REF-2/3); translating strings beyond what the component itself
renders (its own labels go through CLIENT-I18N-1's `t()`); IP geolocation; saving anything.

## Delta — backend REF-2 shipped (2026-09-25)

The contract this ticket is blocked on now exists (`POST /api/reference/resolve`, public). Verified against the running backend,
not just the design doc:

- **Request:** `{ locales?: string[] (≤10, each ≤35 chars), timeZoneId?: string (≤64), latitude?, longitude? }`; send latitude and
  longitude **together or not at all** (else `400`). Range: lat ±90, lon ±180.
- **Response** (inside the usual `ApiResponse` `data`): `{ language: {code,name,nativeName}|null, country: {id,iso2,iso3,name,defaultLanguageCode}|null,
  region: {id,countryId,isoCode,name,nativeName}|null, source: "COORDINATES"|"TIMEZONE"|"LOCALE"|null }` — the same shapes as the three `GET`
  DTOs. Every part nullable; an unresolved request is a `200` with all-null. `source` is `null` exactly when `country` is.
  **`source` is a new mirrored union — add it to the client types (`'COORDINATES' | 'TIMEZONE' | 'LOCALE'`).**
- **Default language is already applied by the server inside `resolve`:** `language` comes from the first supported locale, and when none
  matches it falls back to the resolved country's `defaultLanguageCode` (only if that language is active). So the silent resolve needs no
  client-side default-language step. The client still applies `defaultLanguageCode` itself for the *hand-picked-country* case (no resolve
  call is made when the user picks a country) — exactly as this ticket already specifies.
- **`region` is only ever set when coordinates won the country**, so a silent (locales + timezone) resolve never returns one.
- **Only Vietnam is a seeded country today (REF-4 seeds the rest):** a Paris coordinate or an `en-US`-only browser resolves to an all-null
  `200`. Design the pre-fill and the MSW fixtures for "country null" as the common non-Vietnam outcome, not an edge.
- **Timezone caveat:** merged IANA zones (`Asia/Tokyo`, `Europe/Paris`, `Asia/Bangkok`) deliberately resolve to no country; `Asia/Saigon` and
  `Asia/Ho_Chi_Minh` both resolve to VN. Expect the locale subtag to do the work for those users.
- **A `400` body is not for display:** validation errors carry field keys such as `data.coordinatePairComplete`. Map any `400` from resolve to a
  generic non-blocking hint (or ignore it — the fields are optional); never render the field names.

## Scope decisions (2026-09-28 pickup, before Phase 2)

Answered before implementation, all within the ticket's own stated scope:

1. **The country list always loads independently of the resolve call.** `useCountries()` (`GET /reference/countries`) is a
   separate query from `useResolveGeo()` — the silent mount resolve succeeding, failing, or returning an all-null result
   never gates the country dropdown; resolve only says which already-loaded country/region to pre-select.
2. **`GeoLocaleFields`' country/region display locale follows `localeStore` (CLIENT-I18N-1), not raw `navigator.language`.**
   These turn out to be the same thing on first load: `localeStore`'s own initial value is already
   `detectBrowserLocale(navigator.languages)` (verified in `src/app/localeStore.ts`), so "app locale" already means "browser
   language on first load, switching only on an explicit app-language change" — no extra wiring needed to get both.
3. **A resolve-call failure (network error or a `400`) is swallowed silently**, not surfaced as a hint — the Delta note above
   explicitly permits "or ignore it," and this is not a case that should occur client-side in practice (locales/timezone are
   always well-formed values read from the browser).

## Implementation summary

Built exactly the Phase 3 design:

- **`src/shared/types/reference.ts`** — `LanguageResponse`, `CountryResponse`, `RegionResponse`, `GeoSource`,
  `ResolveGeoRequest`, `ResolvedGeoResponse`, all verified 1:1 against `reference-api`'s Java DTOs.
- **`src/shared/hooks/{useLanguages,useCountries,useRegions,useResolveGeo}.ts`** — `{data, isLoading, isError}` each
  (the mutation-backed `useResolveGeo` adds one `resolve` trigger function on top of the same triple), `staleTime: Infinity`
  for the three `GET`s (reference rows essentially never change within a session), no locale in any query key (`name` is
  always English server-side; localization is client-only).
- **`src/shared/lib/detectEnvironment.ts`** — `getBrowserLocales()` (`navigator.languages`, falling back to
  `navigator.language`, then `[]`), `isGeolocationSupported()`, `requestBrowserPosition()` (typed
  `granted|denied|unavailable|timeout` result, 10s cap, never rejects). Only ever called from a click handler — never on
  mount.
- **`src/shared/hooks/useGeoLocaleFieldsData.ts`** — the composing page-level hook. A `touchedRef` (`Set<'language' |
  'country' | 'region'>`) gates every resolve-applied field; `onCountryChange` is the one action that *removes* a touch
  mark (on `region`, since a region picked for the old country means nothing for the new one) as well as adding one (on
  `country`); the hand-picked-country default-language step only fires when `languageCode` is still `null` and the code
  names a currently active language, and doesn't mark `language` touched so a later coordinate resolve can still improve it.
- **`src/shared/components/GeoLocaleFields.tsx`** — flat controlled props (same convention as
  `LocationPicker`/`useLocationPickerData`), native `Select`s, `Intl.DisplayNames`/`Intl.Collator` for country label
  sort+display, region `nativeName` shown when the UI locale is `vi`, a disabled region select + label for a
  no-regions country, a disabled-all-three + `role="alert"` hint for a reference-load failure, a narrower
  regions-only failure state, and the "Use my current location" button (hidden entirely, not just disabled, when
  `isGeolocationSupported` is `false`).
- **i18n:** new `geoLocaleFields.*` keys added to the existing `common` namespace only (`en`+`vi`) — no new namespace,
  since both `src/app/i18n.ts` and `.storybook/preview.ts` statically import `common.json` directly.
- **MSW:** `e2e/mocks/handlers/reference.ts` (`en`/`vi` languages; Vietnam + a no-regions Singapore fixture; Vietnam's
  regions; a `/resolve` handler with a fixed coordinates-aware branch, a timezone-only branch, and an all-null fallback),
  registered in `e2e/mocks/handlers/index.ts`.

**No divergence from the approved design.**

**Tests:** `detectEnvironment.test.ts` (11, including a fix mid-implementation — `'geolocation' in navigator` still finds
the key when a property is explicitly defined as `undefined`, so the "unsupported" test helper deletes the property
instead), one `.test.tsx` per hook (`useLanguages` 2, `useCountries` 2, `useRegions` 4, `useResolveGeo` 3), 13 in
`useGeoLocaleFieldsData.test.tsx` (mount pre-fill, all-null mount, touched-field protection both from the mount resolve
and from a granted-location resolve, region-clear-on-country-change, default-language hand-pick incl. the
inactive-language-code case, all three geolocation outcomes, a failed resolve call), 15 in `GeoLocaleFields.test.tsx`
(labels/options, pre-filled values, onChange wiring, no-regions-country, both error states, the location button's three
states, all three geo hints). **49 new tests, all green.** Storybook: `Default`, `PreFilled`, `Resolving`,
`GeolocationDenied`, `NoRegionsCountry`, `ReferenceLoadError`.

**Verification:** `npx tsc -b` clean; `npx eslint` on every new/changed file clean; `npx vitest run` on all 7 new test
files — 49/49 passed.

**E2E:** this ticket adds no page (e2e is delivered with CLIENT-REF-2/3, per its own Tests section above), so there is no
new functional flow to cover yet. Per the token-saving standing convention, ran a scoped subset instead of the full
suite: `msw-setup.spec.ts` (3), `smoke.spec.ts` (1), and `locale.spec.ts` (2) — the specs most likely to catch a
regression from this ticket's only shared-file edits (`e2e/mocks/handlers/index.ts`'s new `referenceHandlers` entry,
`src/locales/{en,vi}/common.json`'s new keys). **7/7 passed.** Full `e2e` project not run — that is the standing
convention (full Vitest/Playwright only on request), not a gap specific to this ticket.

**Visual-regression expectation:** no baselined surface touched — `GeoLocaleFields` isn't embedded in any page yet, so
there is no baseline to change and none was run. A `visual-regression` run today would only ever show the Windows
font-rendering noise floor, not a regression from this change.
