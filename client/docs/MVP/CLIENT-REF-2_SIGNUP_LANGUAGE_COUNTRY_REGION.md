# CLIENT-REF-2 · Sign-up: optional Language / Country / Region with detection, plus translated sign-up strings

**Status:** `DONE` (2026-09-28)
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

## Delta — backend U16 shipped (2026-09-26)

The register contract this ticket was blocked on now exists. Verified against a running backend on the real dev database:

- **`POST /api/auth/register` additive optional fields:** `languageCode` (a `languages.code`, ≤ 35 chars), `countryId`, `regionId`, `latitude`,
  `longitude`. Omitting all of them is exactly the old request.
- **Validation → `400`, and a `400` creates no user:** a region without a country, an unknown or inactive country/region, a region that belongs
  to another country, an unknown or inactive `languageCode`, only one of latitude/longitude, or a coordinate out of range (lat ±90, lon ±180).
  The message is in `message` (e.g. `Unknown or inactive language: zz`); the both-or-neither failure instead carries
  `data.coordinatePairComplete` — **never render field names**, map any `400` from the optional block to a generic hint.
- **Saved coordinates may disagree with the chosen country/region** (a traveller signing up abroad); the server tolerates it and the dropdown
  choices win. Coordinates go to the profile location only when the user pressed "Use my current location".
- A supplied `languageCode` becomes the user's stored preference language (`GET /api/users/me/preferences` returns it right after sign-up).
  Without one, no preference row exists yet (created lazily on first access, default `en`).
- ~~The register response's `data.user` is a full `UserResponse` including `country` (resolved name), `countryId`, `regionId`, `regionName`.~~
  **Correction (2026-09-28 pickup):** verified against `AuthServiceImpl.toUserResponse()` — it is still a hand-built
  map (`id`/`email`/`firstName`/`lastName`/`username`/`phoneNumber`/`avatarUrl`/`roles`) that U16 never extended, so
  `AuthResponse.user` does **not** actually carry `country`/`countryId`/`regionId`/`regionName`. CLIENT-REF-2 doesn't
  need to display them back post-signup, so this doesn't block the ticket — just don't build against the stale claim
  above. Not filed as its own follow-up ticket (2026-09-28 decision): nothing in the client reads `AuthResponse.user`'s
  country fields today, so there's no consumer waiting on it.

## Scope decisions (2026-09-28 pickup, before Phase 2)

1. **`AuthShell`'s tagline gets a `tagline` prop** rather than translating its hardcoded default string in place.
   `AuthShell` is the exact same component `LoginPage` renders, with no way to vary its copy — translating the
   tagline directly would mean picking a language on `/register` changes `localeStore` app-wide, so a subsequent visit
   to `/login` would show a translated tagline around an untranslated (English, per CLIENT-I18N-2) `LoginForm`.
   `RegisterPage` passes a translated tagline via `t()`; `AuthShell`'s default (used by `LoginPage`) stays the
   hardcoded English string, untouched.

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

## Implementation summary (2026-09-28)

Built exactly the approved Phase 3 design, with two corrections found during implementation (both noted below).

- **Types** (`features/auth/types.ts`): `RegisterPayload` gained optional `languageCode: string`, `countryId: number`,
  `regionId: number`, `latitude: number`, `longitude: number` — 1:1 with `RegisterRequest` (`Long` → `number`, same
  convention as `CountryResponse.id`).
- **`RegisterForm.tsx`**: wires `useGeoLocaleFieldsData()` directly (not lifted to `RegisterPage` — matches this form's
  existing convention of owning its own field state, unlike the prop-driven `LocationPicker` split). Wraps
  `onLanguageChange` so a selection mapping to a supported UI locale (`mapToSupportedLocale`) also calls
  `localeStore.setLocale` immediately; an unmapped/cleared selection leaves the UI locale untouched. **A pre-fill
  from detection never does this itself** — only an explicit user pick in the Language select does, per the ticket's
  own wording ("**Choosing** a language ... switches the UI language immediately"); a silently pre-filled `vi` from
  the mount's timezone resolve does not, by itself, translate the page. Submit payload spreads in
  `languageCode`/`countryId`/`regionId` only when set, and `latitude`+`longitude` only when both are non-null (i.e.
  only after a successful "Use my current location"). All static copy moved to `register.*` i18n keys, English
  values kept byte-identical to the prior hardcoded strings so every existing locator
  (`getByLabelText('Email')`, `getByRole('button', {name: 'Create account'})`, etc.) kept passing unchanged.
- **`AuthShell.tsx`**: gained an optional `tagline?: string` prop (default = the prior hardcoded English string), per
  the scope decision above — `LoginPage` needed zero changes.
- **`geoLocaleFields.useMyLocation`** copy (shared `en`/`vi` `common.json`, both sign-up and the not-yet-built
  CLIENT-REF-3 consume it) reworded to state the coordinates are saved to the profile, satisfying the ticket's consent
  requirement without any component change.
- **MSW** (`e2e/mocks/handlers/auth.ts`): no behavioral change needed — the register handler never destructured only
  the original three fields, so it already accepts the widened `RegisterPayload` type once `types.ts` changed. Left a
  comment explaining why, per the ticket's instruction to "update" it.

**Layout iteration (2026-09-28, several rounds of user feedback after initial review):** the final field order/layout
is not what Phase 3 originally designed — recorded here as the actual as-built shape, not the approved plan, per the
"say so explicitly" rule for a diverged outcome:

1. **Field order, top to bottom:** Email\*, Password\*, Full name\*, then a Country+Region row, then a Phone
   number+Language row, then Submit. (Originally: all geo fields as one row above Email.)
2. **`GeoLocaleFields.tsx` split into standalone per-field components** (`GeoLocaleLanguageField`,
   `GeoLocaleCountrySelect`, `GeoLocaleRegionField`, `GeoLocaleLocationButton`, `GeoLocaleLocationHint`,
   `GeoLocaleReferenceError`) instead of one fixed-layout `GeoLocaleFields` — needed once Country/Region and Language
   had to live in two different rows on the page. `GeoLocaleCountrySelect` is the one field with no `Label` of its
   own: its column is two rows (the "Country" label on top, then the select + location button side by side below),
   so the label has to be rendered by the consuming page instead.
3. **The location button is icon-only** (`size="icon"`, no visible text) with a native `title`+`aria-label` hover/
   screen-reader hint (`SportSwitcher.tsx` precedent for the `title` pattern) — sits to the **left** of the Country
   select, vertically centered against just the select's height via `items-center` on their shared flex row.
4. **The `geoHint` result (denied/unavailable/timeout) is its own row**, below the whole Country/Region grid —
   originally nested inside the location button's own component. That nesting was a real bug: the button lives in a
   `shrink-0` flex slot sized to the icon, and a full sentence rendered inside that same fixed-width slot forced it
   wide open, breaking the row's layout (reported as "crashes the UI"). Splitting it into `GeoLocaleLocationHint`,
   rendered as a separate full-width block by the consuming page, fixed it.
5. **`Email`/`Password`/`Full name` show a `RequiredMark`** (extracted to `shared/components/RequiredMark.tsx` from
   its sole prior owner, `CreateSessionModal.tsx`, once `RegisterForm` became a second consumer); `Phone number`'s
   label dropped its "(optional)" suffix — absence of the mark is now the signal.
6. **Phone number gets typing validation** (not in the original design) — keydown + paste guards restricting input to
   digits and `+`/`-`/`(`/`)`/space, the same style as `CreateSessionModal.tsx`'s existing digits-only guard, since
   `RegisterRequest.phoneNumber` has no server-side format validation beyond `@Size(max = 20)`.
7. **Subheading copy iterated twice**: "Join SportHub and find your next game." → "... and join your sport
   community." → final: "Join SportHub - Join your sport community." (`en`/`vi` both updated each time).
8. **Location button's final polish**: the "(saved to your profile)" consent phrase was dropped from
   `geoLocaleFields.useMyLocation` (`en`/`vi`) — "Use my current location" alone was judged enough — and the icon
   itself is `text-text-accent` (the app's blue accent token, same one the "Log in" link uses) instead of the outline
   button's default text color, so it reads as an action rather than plain chrome.

None of the three grid rows are viewport-breakpoint-gated below `sm` without reason — `sm:grid-cols-2` (640px+)
collapses to one column below that, which is safe here since the AuthShell card's right panel only narrows below the
viewport's own width starting at `md` (768px), so `sm:` is always at least as wide as the true container. Verified no
page-level horizontal overflow at 375px via the existing `a11y.spec.ts` check throughout every iteration.
`a11y.spec.ts`'s `/register: Tab reaches every control in order` test was rewritten to match the final DOM/tab order
(Email → Password → Full name → location button → Country → Phone number → Language → Create account → Log in).

**A real Playwright quirk found while fixing the tab-order test:** `getByLabel(..., { exact: true })` compares the
raw label text, not the ARIA accessible-name computation `getByRole` uses — it does **not** exclude an
`aria-hidden` descendant's text the way the accessible-name algorithm does. Once Email/Password/Full name gained a
visual `RequiredMark` (`aria-hidden`'d " *"), every existing `{ exact: true }` locator against the bare word on
`/register` (`a11y.spec.ts`, `auth-journey.spec.ts`'s register step, all four `signup-locale.spec.ts` tests) stopped
matching anything at all. Fixed by dropping `{ exact: true }` for "Email" (no collision risk) and switching
"Password" to the anchored regex `/^Password/` (still excludes the "Show/Hide password" toggle buttons' aria-labels,
the same disambiguation `{ exact: true }` used to provide). `/login`'s own assertions are untouched — `LoginForm` has
no `RequiredMark` (out of scope, CLIENT-I18N-2). Vitest/RTL needed the equivalent regex fix for the same reason
(`getByLabelText` there behaves like `getByLabel`, not `getByRole`).

### Corrections found during implementation

1. **`AuthResponse.user` does not carry U16's new fields** — see the Delta correction above (struck-through claim).
   Verified against `AuthServiceImpl.toUserResponse()` directly; decided not to file a backend follow-up since nothing
   client-side reads those fields today.
2. **`e2e/mocks/handlers/reference.ts`'s resolve mock only matched `timeZoneId === 'Asia/Ho_Chi_Minh'`, missing its
   IANA alias `Asia/Saigon`** — found because Playwright's `timezoneId: 'Asia/Ho_Chi_Minh'` context option is itself
   canonicalized by Chromium's `Intl`, so `getViewerZoneId()` actually reports `Asia/Saigon` in the running browser.
   The real backend already treats both names as equivalent (this same mock file's own module doc already said so,
   from CLIENT-REF-1/REF-2's delta — the mock just never implemented the second alias). Fixed in this ticket since it
   silently broke any e2e test asking for the Ho Chi Minh timezone branch, not just this ticket's own tests.
3. **No visual-regression baseline exists for `/login` or `/register` at all** (confirmed against
   `e2e/visual/`'s full directory listing) — the ticket's Tests section assumed one did. There is nothing to
   regenerate; see the Visual-regression expectation line below.

### Tests

- **Vitest/RTL** (`RegisterForm.test.tsx`, `RegisterPage.test.tsx`): both gained a `QueryClientProvider` wrapper +
  `vi.spyOn(apiClient, 'get'/'post')` mocks (same pattern as `useGeoLocaleFieldsData.test.tsx`/`ProfilePage.stories.tsx`),
  since `RegisterForm` now makes real TanStack Query calls. New cases: payload field inclusion/omission per field,
  coordinates included only after the location button succeeds and omitted otherwise (even with a country chosen),
  language selection switching `localeStore`, an unmapped language code (a fixture `fr` language, since only `en`/`vi`
  are seeded today) leaving the UI locale untouched while still being submitted, and the phone number field's typing
  guard (letters stripped while typing, a mixed-content paste rejected outright, a valid paste accepted). Label
  queries for Email/Password/Full name switched to regex (`/^Email/`, `/^Password/`) once those labels gained a
  `RequiredMark` — see the Playwright note below for the same underlying reason. **18/18 passed**
  (`RegisterForm.test.tsx` alone; `RegisterPage.test.tsx`/`useRegister.test.tsx` unaffected, still green).
  `GeoLocaleFields.test.tsx` was restructured alongside the component split (one `describe` per new component,
  `GeoLocaleCountrySelect`'s tests query by `getByRole('combobox')` since it has no `Label` of its own) — **63/63
  passed** across the whole `src/features/auth` + `GeoLocaleFields.test.tsx` set.
- **Storybook** (`RegisterForm.stories.tsx`): existing `Default`/`Submitting`/`Error` plus a new `PreFilled` story
  (composed-layout review with the geo section filled via a mocked coordinates resolve) — `GeoLocaleFields`' own
  Storybook file already covers every one of its individual visual states in isolation (resolving, denied,
  no-regions-country, reference-load-error), so those weren't duplicated here. `npx storybook build` succeeds.
- **E2E** (`e2e/flows/signup-locale.spec.ts`, new, 4 `test()`s, 2 inside a `test.describe` scoped to
  `test.use({ timezoneId: 'Asia/Ho_Chi_Minh' })`): pre-fill from the mocked timezone resolve; geolocation denied keeps
  that pre-fill and still registers; geolocation granted (real `context.grantPermissions`/`setGeolocation`) fills the
  region and posts real coordinates (asserted via `page.waitForRequest`/`postDataJSON()`, not anything the MSW
  handler echoes back — confirmed the response doesn't carry them either); language switch flips visible copy and the
  `Accept-Language` header. **Also updated** `e2e/flows/a11y.spec.ts`'s `/register: Tab reaches every control in
  order` test — the new GeoLocaleFields fields extend the tab sequence (Language → Country → "Use my current
  location"; Region is skipped, `disabled` until a country is picked, same tab-order exclusion as the existing
  disabled-OAuth-row comment already documents). `e2e/flows/auth-journey.spec.ts`'s existing register step needed no
  change (new fields stay blank under its default browser locale/timezone, matching the "all-null" common case).
  **`e2e` project run** (scoped, not full suite — standing convention): `signup-locale.spec.ts` (4) +
  `a11y.spec.ts` (31) + `auth-journey.spec.ts` (3) + `locale.spec.ts` (2) + `smoke.spec.ts` (1) — **41/41 passed**,
  no isolated re-run needed (no flake encountered once the stale local mock-server/vite processes from a prior
  session were killed — see below). Full `e2e` project not run.
- **Environment note, not a code issue:** the very first run against this branch failed almost everything with
  "Couldn't load languages and countries right now" / stale pre-fill values. Root cause: a mock-server process (port
  9876) and a Vite dev server (port 5174) were already running from a much earlier local session, predating some of
  the handler files `playwright.config.ts`'s `reuseExistingServer: !process.env.CI` happily reused instead of
  starting fresh. Killing both stale processes and letting Playwright spawn its own resolved every failure that
  wasn't the two real corrections above. Worth knowing if a future pickup on this machine sees inexplicable e2e
  failures that don't match the diff at all.

**E2E:** `e2e` project — 41/41 passed (scoped subset above, not the full suite; see note above and the standing
token-saving convention). Every failure hit along the way was tracked to its root cause (stale local processes, a
region-id typo in this ticket's own test fixture, a test-ordering bug in this ticket's own test, and the two real
corrections filed above) and fixed rather than worked around.

**Post-layout-iteration re-verification (same session, re-run after every round above):** `tsc -b` and `eslint` clean
throughout; `npx storybook build` succeeds after each component split; the full `src/features/auth` +
`GeoLocaleFields.test.tsx` Vitest set stayed green at each step, ending at **63/63 passed**; the same scoped `e2e` set
(`signup-locale.spec.ts` + `a11y.spec.ts` + `auth-journey.spec.ts` + `locale.spec.ts` + `smoke.spec.ts`, 41 tests) was
re-run after every layout/behavior change and ended at **41/41 passed**, including `/register @ 375px — no horizontal
overflow` and its axe check at every breakpoint. Two more stale assertions found and fixed while re-running (neither
caused by the layout changes themselves): `GeoLocaleFields.test.tsx` still exact-matched the pre-CLIENT-REF-2 button
name `'Use my current location'` (a gap from this ticket's own earlier copy change that no test run had exercised
until now); the `{ exact: true }` → regex Playwright fix described above.

**Visual-regression expectation:** no baselined surface touched — `/login` and `/register` have **no**
`visual-regression` spec at all in this repo (confirmed against `e2e/visual/`'s directory listing), correcting this
ticket's original Tests section, which assumed one existed. There is nothing to regenerate via `update-baselines`,
and any `visual-regression` run today is unrelated to this change (Windows noise floor only, not run).

**Docs:** `client/docs/E2E_OVERVIEW.md` updated — new `signup-locale.spec.ts` catalog entry (§6), directory listing
(§3), and a missing `reference.ts` handler-listing entry (§3) retroactively added (CLIENT-REF-1 shipped that file
but never added it to this listing).

## Second round of changes (same session, further user feedback)

1. **Custom validation, not native HTML constraint validation.** `<form noValidate>` — a browser's own "Please fill
   out this field" popup renders in the *browser's* language, never this app's `i18next` locale, so it never
   translated. Replaced with the `CreateSessionModal.tsx` `hasAttemptedSubmit` pattern: the submit button is always
   clickable; clicking it while Email/Password/Full name are invalid sets `hasAttemptedSubmit` and reveals a
   translated inline message **beside each field's own label** (user decision — not under the input), recomputed from
   current state every render so it clears itself the moment the field becomes valid. `aria-required` replaces the
   native `required` attribute for the same a11y signal. The server's own error message (`errorMessage`, e.g. "Email
   already registered") stays untranslated — see the A8 follow-up below.
2. **i18n restructured into one namespace per page** (user-initiated architecture question, anticipated by
   CLIENT-I18N-2's own "expect to split per feature at pickup" note): `register` is now its own namespace
   (`src/locales/{en,vi}/register.json`), keys nested by field (`form.email.label`, `form.email.error.required`,
   `form.password.error.tooShort`, etc.) instead of the flat `register.emailRequired`-style names growing inside
   `common.json`. `geoLocaleFields.*` stays in `common.json` since CLIENT-REF-3 will share it too.
   `RegisterForm`/`RegisterPage` use `useTranslation('register')`; the one label `RegisterForm` renders that's
   genuinely a `common` string (`GeoLocaleCountrySelect`'s "Country" label, rendered by the page itself — see below)
   uses the explicit `t('common:geoLocaleFields.country')` namespace prefix. `i18n.ts` and `.storybook/preview.ts`
   both updated to register the new namespace (kept in sync by hand, same as the rest of that file).
3. **Real bug found while restructuring: the Language field could show "English" while the whole page rendered in
   Vietnamese.** Root cause: `useGeoLocaleFieldsData`'s `languageCode` started `null` and was only ever set by the
   mount's silent resolve (which re-detects the browser's raw `navigator.languages` signal fresh on every load) or an
   explicit pick — completely independent of `localeStore.locale` (which can instead be a *persisted* explicit choice
   from an earlier visit, e.g. `'vi'`, overriding the raw browser default). Fixed in the shared hook (affects
   CLIENT-REF-3 too): `languageCode` now starts seeded from `localeStore.locale` instead of `null`, and the mount's
   silent resolve is changed to never apply a detected language at all (`applyResolvedFields(result, { applyLanguage:
   false })`) — only a deliberate action (an explicit pick, or a "Use my current location" click, which can carry a
   more specific coordinate/country-derived language) can change it from here. The country-hand-pick default-language
   feature's own gating moved from "is `languageCode` still `null`" (now never true, since it's always seeded) to "is
   `language` still untouched" (`touchedRef`), preserving that feature exactly as before. New regression test in
   `useGeoLocaleFieldsData.test.tsx` proves the mount resolve can no longer override a seeded, disagreeing value.
   **Side effect (judged an improvement, not a regression):** since `languageCode` is now always seeded,
   `RegisterForm`'s submit payload always includes `languageCode` (whatever the page's active locale is) even when
   the user never touches the Language dropdown — previously it was omitted entirely in that case, meaning a user who
   experienced the *entire* sign-up flow in Vietnamese but never touched the field would still register with no
   language preference. Existing payload-assertion tests updated to expect `languageCode: 'en'` (the test
   environment's pinned default locale) rather than its absence.
4. **Location button polish:** hint text shortened to "Use my current location" (dropped the "(saved to your
   profile)" consent phrase — judged sufficient on its own); icon recolored to `text-text-accent` (the app's blue
   accent token, same one the "Log in" link uses) instead of the outline button's default text color.
5. **Country/Region and Phone number/Language rows use a 7:5 column ratio** (`sm:grid-cols-[7fr_5fr]`, both rows —
   user decision), not an even split; Country's column is wider since it also holds the location button.
6. **Filed backend `auth` **A8** (`modules/auth/docs/BACKLOG_MVP.md`)**: structured error codes on
   `ApiResponse.error()` for known auth failures, starting with register's "Email already registered", so the client
   can translate them instead of showing the server's raw English text. Not built in this ticket — the register error
   banner stays untranslated until A8 ships and a client-side mapping ticket is filed against it.

**Re-verification after this round:** `tsc -b`/`eslint` clean; full `src/features/auth` + `GeoLocaleFields.test.tsx` +
`useGeoLocaleFieldsData.test.tsx` + `src/app` Vitest set — **200/200 passed**; `npx storybook build` succeeds; the
same scoped `e2e` set (41 tests) re-run after each change, ending **41/41 passed** (two assertions in
`signup-locale.spec.ts` updated mid-round for the exact same reason as item 3 above — Language now correctly reads
`'en'`, the seed, not `'vi'` from the timezone-only mocked resolve).
