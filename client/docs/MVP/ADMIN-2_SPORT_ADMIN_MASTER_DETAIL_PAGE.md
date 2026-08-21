# ADMIN-2 · Sport admin master-detail page (`/admin/sports`)

**Status:** `DONE` · **Type:** Feature (admin) · **Filed:** 2026-08-20 ·
**Rescoped:** 2026-08-21 (see below) ·
**Depends on:** `ADMIN-1` (the `/admin` route + guard) **and** backend `A9`
(`modules/sport/sport-impl`) — hard-blocked on `A9`'s endpoints existing ·
**Sibling:** `SPORT-2` (see below) ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md`

## Rescoped 2026-08-21 — from "attribute schema editor" to "sport master-detail page"

This ticket was originally scoped as an attribute-schema editor only, with a sport *picker* feeding
it, and explicitly excluded editing the sport's own fields. That exclusion was reversed at pickup by
user decision. The reasoning, recorded because the original scope reads as its deliberate opposite:

1. **The original scope had a dead end.** The picker was specced to list inactive sports so an admin
   could "configure a sport before activating it" — but with no UI over `PUT /api/sports/{id}`,
   nothing could then *activate* it. The admin would finish in psql or curl.
2. **`isActive` is a plain sport field on the same endpoint** as `name`/`category`/`minPlayers`/…,
   so the fix for (1) is the same form that edits everything else. Splitting it across two tickets
   would have produced two screens over one resource.
3. The sport-catalog CRUD half was **not filed anywhere** — a repo-wide grep for `ADMIN-[0-9]` found
   only ADMIN-1 and this ticket. It was an unfiled gap, not a deferred ticket, so folding it in
   displaced nothing.

Rescoping in place (rather than filing ADMIN-3) follows the precedent SPORT-2 set on 2026-08-20.
The file was renamed from `ADMIN-2_SPORT_ATTRIBUTE_SCHEMA_EDITOR.md` to match.

## What ships

A master-detail admin screen at `/admin/sports` for **updating existing sports**.

- **Master — a table of every sport**, including inactive ones, from the admin-only
  `GET /api/sports/all`. Shows all sport fields except `attributesSchema`; `description` truncated,
  `isActive` as a text badge. The attributes column holds a **"Show detail"** button instead of a
  value.
- **Detail — a side panel** next to the table (stacked below it at 375px), opened by clicking a row
  or its "Show detail" button. Two independently-saved sections:
  - **Sport fields** — `name`, `description`, `category`, `iconUrl`, `minPlayers`, `maxPlayers`,
    `isActive` → `PUT /api/sports/{sportId}`.
  - **Attributes** — a plain JSON textarea over the whole schema document →
    `PUT /api/sports/{sportId}/attribute-schema`.
- **Errors surfaced verbatim**: `JSON.parse` failures shown locally before any request; `A9`'s
  server-side validation messages (unknown type, duplicate key, bad `defaultValue`, …) rendered as
  returned. The server is the authority on document validity — do not reimplement `A9`'s validation
  rules client-side, they will drift.

## Key decisions

### Two Save buttons, not one

Sport fields and the attribute schema are **two separate endpoints**. A single Save would fire two
requests that cannot succeed or fail together — invalid JSON rejected by the schema `PUT` would land
*after* the fields `PUT` had already committed, leaving a partial save with no rollback available
(there is no transaction across two HTTP calls). Each section therefore owns its own Save + Reset and
its own error slot, so every button maps to exactly one request.

### Route shape — two paths, one page component

`/admin/sports` and `/admin/sports/:sportId` both render `AdminSportsPage`, which reads `:sportId`
via `useParams`. Same pattern `/posts/:postId` → `HomeFeedPage` already uses (FEED-12). Keeps the
table mounted while giving the detail panel deep-linking and browser back/forward, which neither
page-local state nor a modal would.

### Why a textarea for the schema, deliberately

This is an admin-only surface where the user explicitly wants **fastest to build, UX enhanced
later**, and expects to paste schemas around. A textarea also costs **zero new dependencies**, which
matters here: the client has *no* form library at all today — no zod, no react-hook-form, no JSON
editor. Deps are lean by design (Radix primitives, TanStack Query, zustand, axios, Tailwind).

Options that were weighed and rejected *for now*:

- **`react-admin`** — a real out-of-box admin CRUD framework, but brings its own data provider and
  Material UI, which fights the shadcn/Tailwind design system this client is built on.
- **`@rjsf/core`** (react-jsonschema-form) — generates a form *from* a JSON Schema. Needs a theme
  package, and `A9`'s document is a bespoke descriptor tree rather than JSON Schema (design §2.3),
  so it would need a hand-written meta-schema to drive it.
- **A JSON editor component** (`vanilla-jsoneditor`, `@monaco-editor/react`) — nicer editing, real
  dependency weight. A reasonable *later* upgrade once the shape is settled; not the first version.

A structured field-by-field builder (add/remove/reorder groups and attributes, per-field forms) is
the natural follow-up and should be its own ticket once someone actually wants it.

### Row click is an enhancement; the button is the control

A clickable `<tr>` is not keyboard reachable. The "Show detail" button is the real, focusable
control (`aria-label="Show detail for {sport}"`); the row's `onClick` is layered on top as a mouse
convenience only, so the keyboard path never depends on it. The selected row carries `aria-current`.

## Backend constraints this screen inherits

Found by reading `SportServiceImpl` at pickup, then reproduced against a running server. **Two of the
three were fixed in this same branch by backend ticket A11**
(`modules/sport/sport-impl/docs/MVP/A11_ADMIN_SCHEMA_READ_AND_RENAME_COLLISION_GUARD.md`) rather than
being left for the client to work around — user decision, mid-ticket.

1. **~~`GET`/`PUT` disagree about inactive sports.~~ FIXED (A11).** `getAttributeSchema` resolved
   through the active-only `SportLookupCache` and 404'd for an inactive sport, while
   `replaceAttributeSchema` resolved via `findById` and edited one happily — so the admin editor
   could write a schema it could never read back, breaking the configure-before-activating flow this
   screen exists for. A11 added an admin-only twin, `GET /api/sports/all/{sportId}/attribute-schema`,
   resolved via `findById`. The member-facing read is deliberately **unchanged** and still 404s for
   an inactive sport, because that is what keeps a deactivated sport invisible to members (A6/A7) and
   `SPORT-2` reads it.

   **This screen therefore has no inactive-sport special case at all** — no `enabled` gating, no
   unavailable state. An inactive sport loads and edits exactly like an active one. The rejected
   workaround is still worth recording: interpreting the 404 as "no schema yet" would have prefilled
   an empty document over a real stored schema, and the next Save would have destroyed it.

2. **`updateSport` is null-means-skip** (`SportServiceImpl` — every field is
   `if (x != null) set(x)`). `description`, `category` and `iconUrl` therefore **cannot be cleared
   back to `null`**; `""` is the floor. The form sends only changed fields, which sidesteps most of
   this, but the limit is real and is **not** fixed — unsetting a field needs a backend decision
   about how to express it, which is more than a guard.

3. **~~A duplicate-name rename returns 500, not 400.~~ FIXED (A11).** `sports.name` is
   `UNIQUE NOT NULL` (`V003__create_sports_tables.sql:7`) but `updateSport` had no `existsByName`
   guard, and `GlobalExceptionHandler` has no `DataIntegrityViolationException` case, so the most
   likely mistake in a rename form surfaced as an opaque server error. A11 added the guard; it now
   returns the same readable 400 `createSport` always produced. The form's generic fallback copy
   stays for genuinely unexpected errors.

## Relationship to `SPORT-2` — siblings, not duplicates

Both tickets consume A9. **This one edits the schema; `SPORT-2` renders it** to a normal user on
their own sport profile. Neither replaces the other, and there is no shared component between
them: an admin editing a JSON document and a member filling in a form are different surfaces.

`SPORT-2` was briefly closed as superseded by A9 on 2026-08-20 and reinstated the same day (user
decision), then **rescoped in place** from its original static `sportAttributeConfig.ts` to
rendering A9’s fetched schema. That rescope was mandatory: its original spec was keyed on
`football`/`basketball`/`tennis` (deactivated by **A6**) and assumed the closed `SportKey` union
**SPORT-3** replaced with a live-derived `string`.

The typed `SportAttributeSchema` tree this ticket adds to `src/shared/types/sport.ts` is deliberately
shared, not feature-local — `SPORT-2` consumes the same DTOs and should not redeclare them.

## Explicitly out of scope

- **Creating sports** (`POST /api/sports`) — user decision at rescope: update existing sports only.
- **A delete action** (`DELETE /api/sports/{sportId}`). Note the fields form *can* set
  `isActive: false`, which reaches the same end state as that endpoint's soft delete — so "no
  delete" means no delete *button*, not an unreachable state.
- **The user-facing attribute form.** That is `SPORT-2`, not this ticket. Note `SPORT-2` builds only
  the *component*; the "sport profile editing screen" `AddSportModal` deferred
  `bio`/`preferredPosition` to still isn't filed, so nothing hosts it yet either.
- **Drag-to-reorder, live preview, per-field schema forms** — later enhancements over the textarea.

## Tests

- Vitest/RTL with MSW: the table renders every field; selection works via both the button and the
  row; the fields Save sends only changed fields; invalid JSON blocks submit and shows a local parse
  error without firing a request; a `PUT` rejection renders the server's message; a successful save
  invalidates and re-renders; an inactive sport fires no schema `GET` and renders the unavailable
  state.
- Playwright: an ADMIN user reaches the page through `/admin` and completes a field edit → save and
  a schema edit → save round trip.

---

## What was built (2026-08-21)

Implemented exactly as the approved design above. No divergence from the plan.

### Types — `src/shared/types/sport.ts`

`SportAttributeType`/`SportAttributeOption`/`SportAttributeDefinition`/`SportAttributeGroup`/
`SportAttributeSchema`, typed 1:1 against the Java DTOs in `sport-api`. Deliberately in `shared/`
rather than `features/admin/` so `SPORT-2` consumes them instead of redeclaring the same tree.
`SportResponse` needed no change — it already carried `isActive`.

### Data layer — `src/features/admin/`

| File | Endpoint | Notes |
|---|---|---|
| `queryKeys.ts` | — | `adminKeys.sportsAll()`, `adminKeys.attributeSchema(id)` |
| `useAdminSportCatalog.ts` | `GET /api/sports/all` | Returns raw `SportResponse[]`. Not a widening of `useSportCatalog()` — that one is active-only and normalizes away the very fields this screen edits. |
| `useSportAttributeSchema.ts` | `GET /api/sports/all/{id}/attribute-schema` | A11's admin-only read, resolved regardless of active state — **not** the member-facing `GET /api/sports/{id}/attribute-schema`, which stays active-only for `SPORT-2`. Forces `isLoading` false when no sport is selected, or a disabled query would render a permanent spinner. |
| `useUpdateSport.ts` | `PUT /api/sports/{id}` | Invalidates `adminKeys.sportsAll()` **and** `sportCatalogQueryKey` — without the second, a rename leaves the admin's own chrome serving a stale name. |
| `useReplaceSportAttributeSchema.ts` | `PUT .../attribute-schema` | Invalidates the schema key. |
| `sportFieldsDraft.ts` | — | `buildUpdatePayload` diffs draft against the server row so only changed fields are sent. Extracted to its own file (not the component) to satisfy `react-refresh/only-export-components`. |

### Components + page

`SportCatalogTable`, `SportFieldsForm`, `AttributeSchemaEditor` (all presentational/controlled),
assembled by `AdminSportsPage`. Routed at `/admin/sports` and `/admin/sports/:sportId`.
`AdminLayout`'s empty nav slot and `AdminIndex`'s "no sections yet" empty state — both left by
ADMIN-1 explicitly for this ticket — now hold the "Sports" link.

**One implementation note worth recording:** both forms re-seed local draft state when their prop
changes, which ESLint's `react-hooks/set-state-in-effect` correctly rejected in the obvious
`useEffect` form. Rewritten using React's documented "adjust state during render" pattern
(a `seededFrom` state compared against the incoming prop) rather than disabling the rule — this is
also strictly better here, since it avoids the extra commit an effect would cost.

## Verification

| Check | Result |
|---|---|
| `tsc -b` | Clean |
| `pnpm lint` | Clean (2 pre-existing warnings in `SessionStartTimePicker`, untouched) |
| `pnpm vitest run` | **907/907 passing**, 131 files — includes 10 new `AdminSportsPage.test.tsx` cases |
| `pnpm e2e` (full suite) | **57/57 passing** — includes 4 new `admin-sports.spec.ts` cases |
| Storybook | Stories added for all three components (16 states); compile clean, **not** visually reviewed — see open items |
| Live backend contract | Verified — see below |
| Manual browser walk-through | **Not done** — see open items |

### Live-backend verification (against `:server:bootRun` + dev Postgres)

Every claim this ticket's design rests on was checked against the running backend rather than
inferred from source. All confirmed. **Two of these describe pre-A11 behaviour** and are kept as the
record of what was actually reproduced before the fix — see the re-verification below them.

- `GET /api/sports/all` returns the full `SportResponse` shape and includes the genuinely inactive
  Tennis — matching the TS type field-for-field.
- `GET /api/sports/1/attribute-schema` → `200` with `"data": null` for a sport with no schema.
  Confirms `null` is a normal state, and that the editor must prefill rather than error.
- **`GET /api/sports/2/attribute-schema` → `404` for the inactive sport, while
  `PUT /api/sports/2/attribute-schema` → `200`.** The asymmetry this whole design works around is
  real and reproducible, not a misreading of `SportServiceImpl`.
- A9's validator messages arrive verbatim with `400`: `"Duplicate group key: gear"`,
  `"Attribute schema must declare a version"` — the latter confirms the `{version:1,groups:[]}`
  prefill is necessary, not decorative.
- `PUT /api/sports/2` with only `{"category":...}` applied just that field (null-means-skip
  confirmed).
- **`PUT /api/sports/2` renaming to an existing name → `500 "An unexpected error occurred"`**, not a
  `400`. The backend gap in §3 of "Backend constraints" is confirmed live.

**Re-verified after A11 landed**, on a rebuilt server, same inactive sport 2:

| Case | Before A11 | After A11 |
|---|---|---|
| `GET /api/sports/2/attribute-schema` (member path) | 404 | 404 — deliberately unchanged |
| `GET /api/sports/all/2/attribute-schema` (admin twin) | did not exist | 200 + the document |
| same endpoint, anonymous | — | 403, despite `/api/sports/**` being blanket `permitAll` |
| `PUT /api/sports/2` rename to `"Badminton"` | **500** "An unexpected error occurred" | **400** "Sport with name 'Badminton' already exists" |
| `PUT /api/sports/2` re-sending its own name | 200 | 200 — not a false collision |

All dev data touched during this was restored (sport 2's `category` back to `Racquet`, its
`attributes_schema` back to `NULL`).

**Dev-environment note:** `admin2-verify@example.com` (password set at registration) was created in
`sportconnect_dev` and granted `ADMIN` directly in `user_roles`, since no code path grants ADMIN —
same approach ADMIN-1 documented for `admin@admin.admin`. Roles are baked into the JWT at login, so
an existing session must re-login before a new role takes effect.

**Pre-existing e2e breakage found and cleared (not caused by this ticket):** the whole Playwright
suite was failing at login, including `auth-journey.spec.ts` and ADMIN-1's own guard specs — verified
by stashing this ticket's changes and reproducing. Cause: a stale Vite process squatting on port
5174 without `VITE_API_PROXY_TARGET` set, which `reuseExistingServer` adopted, so `/api` proxied to
:8080 instead of the mock server. Killing it fixed all 57. Worth knowing: a crashed Playwright run
leaves this behind, and the symptom (`waitForURL('/')` timeout after login) looks nothing like the
cause.

## Open items

- **Storybook not visually reviewed.** The stories compile and cover every state, but no human/visual
  pass was made against them.
- **No manual browser walk-through.** Phase 5 asks for one; the Chrome extension was not connected in
  this session. The full e2e suite covers the same happy path functionally, but not appearance —
  in particular the side-panel layout at 375px has never been looked at.
- **No visual-regression spec.** Consistent with the ticket as filed (none was scoped), but every
  other major screen has one — a follow-up in the GRP-10/CLIENT-NOTIF-2 mould would fit.

## Deltas for later tickets

- **`SPORT-2` must not redeclare the schema types.** They are in `src/shared/types/sport.ts`.
- **`SPORT-2` does need a per-`SportAttributeType` branch**, and this ticket deliberately does not
  have one — the editor treats the document as opaque JSON and lets A9 validate. So the
  client-visible-enum obligation in `SportAttributeType`'s Javadoc ("client SPORT-2 (renderer) and
  ADMIN-2 (editor) must gain a case for it") is, in practice, **SPORT-2's alone**. A new
  `SportAttributeType` member needs no ADMIN-2 change beyond adding it to the TS union.
- **Both backend gaps this ticket found were fixed in this same branch**, not deferred — filed as
  `A11` (`modules/sport/sport-impl/docs/MVP/A11_ADMIN_SCHEMA_READ_AND_RENAME_COLLISION_GUARD.md`),
  user decision mid-ticket. See the rewritten "Backend constraints" section above. The one gap left
  standing is `updateSport`'s null-means-skip: a field cannot be cleared to `null`, and expressing
  "unset" is a design decision rather than a missing guard.
- **`SPORT-2` reads the *other* endpoint.** A11 deliberately left the member-facing
  `GET /api/sports/{sportId}/attribute-schema` active-only. SPORT-2 should use it, not this screen's
  admin twin — and should expect a 404 for a sport that has since been deactivated. Whether a member
  holding a profile for a deactivated sport can still render its stored attribute values is an
  **open question SPORT-2 has to answer**; today it cannot, because that read 404s.
- **Creating and deleting sports still has no UI.** Out of scope by user decision at rescope; the
  endpoints (`POST /api/sports`, `DELETE /api/sports/{sportId}`) exist and are admin-gated.
