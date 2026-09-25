# CLIENT-REF-2 · Sign-up: optional Language / Country / Region with detection, plus translated sign-up strings

**Status:** `TODO`
**Type:** New Feature
**Depends on:** CLIENT-REF-1, CLIENT-I18N-1, backend **U16** (`RegisterRequest`'s new optional fields) — hard-blocked on U16
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md` § 6). Filed together with U16, which it consumes.

## What

Embed `GeoLocaleFields` in `RegisterForm` so sign-up offers **optional** language, country and region, pre-filled from
detection, and translate the sign-up surface.

- `RegisterPayload` (`features/auth/types.ts`) gains optional `languageCode`, `countryId`, `regionId`, `latitude`,
  `longitude`. Coordinates are sent **only if** the user pressed the location button and granted permission; unset
  fields are omitted, not sent as null/empty.
- `RegisterForm` wires `useGeoLocaleFieldsData()`; the form still submits with every new field blank.
- Choosing a language in the form switches the UI language immediately (via `localeStore`), so the rest of the form
  re-renders in it — the point of putting Language on sign-up.
- Translate (en + vi bundles): `RegisterForm`, the Register page's own chrome (`RegisterPage`/`AuthShell` copy shown on
  that page), and the geo/locale fields. **`LoginForm` and everything else stay English** (CLIENT-I18N-2) — a known,
  accepted seam.
- Copy next to the location button must say the coordinates are **saved to the profile** (U16 stores them in
  `User.location`) — the user is consenting to storage, not only to detection.
- Update MSW `auth.ts` register handler for the new fields; keep `auth.ts` fixtures and the typed contract 1:1 with
  `RegisterRequest`.

## Edge cases

- Unsupported browser language → language stays blank, UI stays `en`.
- Server returns `400` for a mismatched region/country (shouldn't happen from the UI) → surface the server message via the
  existing `errorMessage`.
- Deny/timeout on the location prompt → sign-up proceeds; the permission is never re-requested automatically.
- Password managers/autofill must not be disturbed by the new selects (they are `name`d and labelled).

## Tests

Vitest/RTL for `RegisterForm` (payload contains only set fields; coordinates only after the button; language switch flips
copy). e2e (`e2e/flows/`): sign-up pre-fills from the mocked resolve response; **geolocation granted** (Playwright context
`permissions: ['geolocation']` + a fixed `geolocation`) fills region and posts coordinates; **denied** keeps the timezone
pre-fill and still registers; language switch changes visible copy and the `Accept-Language` header. Update the a11y spec.
**Visual regression:** the Register page's baselines change at 375/768/1280 — state the exact expected-changed files at
close-out and regenerate through the `update-baselines` dispatch (`/updatebaseline`); do not commit Windows-rendered baselines.
Update `client/docs/E2E_OVERVIEW.md` for every added/changed spec.

**Out of scope:** profile editing (CLIENT-REF-3); translating `LoginForm` and the rest of the app; changing password or
email rules; IP geolocation.
