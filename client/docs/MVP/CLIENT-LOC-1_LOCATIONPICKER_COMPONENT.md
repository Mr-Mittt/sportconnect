# CLIENT-LOC-1 · `LocationPicker` component

**Status:** `DONE` (2026-07-31) · **Type:** Feature · **Dependency:** `modules/location` LOC-1
(`DONE`) · **Spec:** `client/docs/BACKLOG_MVP.md` § CLIENT-LOC-1

## Design (as approved)

Backlog spec: a shared location-picking widget, sport-scoped (`Location` is always specific to
one sport per LOC-1), against the real `/api/locations/**` endpoints — no paid/keyed map API.
Shipped standalone (Storybook-testable), no page consumes it yet — `CLIENT-SESSION-1` wires it
into session create/edit next.

Design confirmed before implementation: rebuild the Dialog-based `LocationPicker` from the
design worked out (then reverted) earlier in the Session/Location feature's design round —
internal `mode: 'search' | 'create'` state, `JoinGroupModal`-style submit-triggered search (no
`Command`/Combobox primitive exists in this codebase), `leaflet` + `react-leaflet@^4` (pinned to
v4.x — v5 requires React 19, this app is on React 18.3.1) as a new dependency for the preview
pin.

## What was built

**Types** (`features/location/types.ts`) — `Location`, `CreateLocationPayload`, `ResolvedMapsUrl`,
typed 1:1 against `LocationResponse`/`CreateLocationRequest`/`ResolvedMapsUrlResponse`
(`modules/location/location-api/.../dto/`). `PagedApiResponse`/`ApiResponse` imported from
`@/features/feed/types`/`@/shared/types/api` — the established cross-feature convention (same as
`friends/hooks/useUserSearch.ts`), not redefined locally.

**Data layer:**
- `queryKeys.ts` — `locationKeys.all`/`.search(sportId, q)`.
- `hooks/useLocationSearch.ts` — query wrapping `GET /locations/search?sportId=&q=`, `enabled`
  owned by the caller.
- `hooks/useResolveMapsUrl.ts` — mutation wrapping `POST /locations/resolve-maps-url`. A `null`
  lat/lng result is a valid success, not a mutation error (matches the backend's own
  graceful-degradation contract).
- `hooks/useCreateLocation.ts` — mutation wrapping `POST /locations`, invalidates
  `locationKeys.all` on success.
- `useLocationPickerData(sportId, isOpen, onSelect, onClose)` (feature root) — composes the
  three hooks above; owns `mode`, search input/submitted-keyword, the paste-link/resolve flow,
  the draggable pin's coordinates + `mapSeed`, and the create-mode name/address fields. Resets
  all transient state on close via a ref-guarded effect (`resetOnNextCloseRef`, same shape as
  `useJoinGroupModalData`'s `seededForOpenRef` — needed to satisfy
  `eslint-plugin-react-hooks`'s `set-state-in-effect` rule, which flags an unconditional
  multi-`setState` effect body even when the runtime-guaranteed call count is already "once per
  close"). Selecting a location (search-result click or a successful create-save) calls
  `onSelect` then `onClose` itself — picking a location is this widget's one job.

**Components** (`components/`):
- `LocationMapPreview.tsx` — thin `react-leaflet` wrapper (`MapContainer` + draggable `Marker`).
  `key={mapSeed}` remounts the map only on a fresh resolve, not on every drag (a drag would
  otherwise fight the map's own re-pan). Fixes Leaflet's default marker icon under Vite bundling
  (`L.Icon.Default.mergeOptions` pointed at the bundled asset URLs) — a one-time, well-documented
  Vite+Leaflet integration fix, not a design choice.
- `LocationPicker.tsx` — Dialog, controlled `isOpen`/`onClose`. Search mode: `Input` + Search
  button + result rows. Create mode: "Find on Google Maps" link-out (`window.open`, new tab),
  paste-link `Input` + Resolve button, `LocationMapPreview` + "Get Directions" deep-link once
  coordinates exist, editable name/address fields, "Save & Use This Location". Presentational and
  controlled — every prop is data or a callback, matching `JoinGroupModal`'s shape.
- Both components have full Storybook coverage (12 `LocationPicker` states: search
  empty/loading/error/results, create empty/resolving/resolve-error/resolved-no-coordinates/
  with-preview/saving/save-error) and Vitest/RTL tests (36 tests total across the feature,
  including the 3 hooks and the composed data hook).

**New dependency:** `leaflet@1.9.4`, `react-leaflet@4.2.1`, `@types/leaflet` — confirmed v4, not
v5. `leaflet/dist/leaflet.css` is imported inside `LocationMapPreview.tsx` (component-local, not
`index.css`) so the CSS only loads when the picker is actually mounted.

## Verification

- `tsc -b` and `eslint src/features/location` — clean.
- `vitest run` on the full suite — 105 files / 660 tests passed, no regressions from the new
  dependency or files.
- `storybook dev` — all 12 new stories registered in the index and load without runtime errors
  (spot-checked via the stories index JSON and an `iframe.html` fetch of the most complex story,
  `CreateModeWithPreview`, which exercises the real Leaflet map + Get Directions link).
- No E2E/visual-regression coverage in this ticket — there is no page integration yet
  (`CLIENT-SESSION-1`), consistent with the backlog's explicit scope cut.

## Explicitly out of scope (unchanged from the backlog entry)

Page-level integration (`CLIENT-SESSION-1`), geo-proximity/nearby search (no such backend
endpoint — LOC-1 deliberately didn't build one), editing/moderating an existing `Location`
(LOC-1's backend is create-only).

---

### CLIENT-LOC-1 · `LocationPicker` component
**Status:** `DONE` (2026-07-31, `client/docs/CLIENT-LOC-1_LOCATIONPICKER_COMPONENT.md`) · **Type:** Feature · **Filed:** 2026-07-30, alongside CLIENT-SESSION-1 once the
Session/Location backend shipped
**Dependency:** `modules/location` LOC-1 (`DONE`) — no client code dependency otherwise; this is a
self-contained component, buildable before CLIENT-SESSION-1 has anywhere to use it (Storybook-testable
standalone, same "components ship ahead of page integration" precedent as Phase 1's HF-1..HF-6).

**What ships:** the shared location-picking widget both session create/edit (CLIENT-SESSION-1) and,
later, group recurrence config will use. Types + `use<Feature>Data`-style hook (`useLocationPickerData`,
composing `useLocationSearch`/`useResolveMapsUrl`/`useCreateLocation`) against the real backend:
- Sport-scoped typeahead search (`GET /api/locations/search?sportId=&q=`) — a `Location` is always
  specific to one sport (LOC-1 decision), so this component always takes a `sportId` prop from
  whatever form opens it.
- "Add a new location" flow with **no paid/keyed map API** (`documentation/md/SESSION_LOCATION_DESIGN.md`
  decision): a "Find on Google Maps" link-out button, a paste-the-share-link-back field wired to
  `POST /api/locations/resolve-maps-url` (coordinates may come back `null` for an unresolvable
  link — not an error, falls back to manual entry), and a free **OpenStreetMap/Leaflet** preview pin
  (draggable, for fine-tuning) once coordinates are known.
- Confirm calls `POST /api/locations` and returns the chosen `Location` to the parent form.
- "Get Directions" link (deep-links to the user's own maps app) once a `Location` has coordinates —
  no in-app routing.

**New dependency, flagged per `client/CLAUDE.md`'s "that's a conversation to have and record, not a
silent per-page exception" rule:** `leaflet` + `react-leaflet`. Must be **`react-leaflet` v4.x, not
v5** — v5 requires React 19, this app is pinned to React 18.3.1. No `Command`/Combobox primitive
exists yet in this codebase for the search-as-you-type input; follow `JoinGroupModal`'s existing
`Input` + custom result-row pattern (submit-triggered search, not live-as-you-type) rather than
introducing a second new dependency (`cmdk`) in the same ticket.

**Explicitly out of scope:** page-level integration (CLIENT-SESSION-1), geo-proximity/nearby search
(no such backend endpoint exists — LOC-1 deliberately didn't build one), editing/moderating an
existing `Location` (LOC-1's backend is create-only).

---
