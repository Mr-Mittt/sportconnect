# CLIENT-REF-1 · Reference hooks, browser detection, and the `GeoLocaleFields` component

**Status:** `TODO`
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
