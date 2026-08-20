# ADMIN-2 · Sport attribute schema editor (`/admin/sports/:sportId/attributes`)

**Status:** `TODO` · **Type:** Feature (admin) · **Filed:** 2026-08-20 ·
**Depends on:** `ADMIN-1` (the `/admin` route + guard) **and** backend `A9`
(`modules/sport/sport-impl`) — hard-blocked on `A9`'s endpoints existing ·
**Sibling:** `SPORT-2` (see below) ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md`

## What ships

An admin screen to read and replace a sport's attribute schema, backed by `A9`'s two endpoints
(`GET`/`PUT /api/sports/{sportId}/attribute-schema`).

- **Sport picker** — lists sports from the existing `useSportCatalog()` hook (`SPORT-3` already
  fetches the real `GET /api/sports`; reuse it, don't add a second catalog fetch). Note it must show
  **all** sports including inactive ones if the catalog exposes them — an admin configuring a sport
  before activating it is a normal flow.
- **A plain JSON textarea** holding the whole document, prefilled from `GET`.
- **Save** → `PUT` the parsed document. **Reset** → re-fetch and discard local edits.
- **Errors surfaced verbatim**: `JSON.parse` failures shown locally before any request; `A9`'s
  server-side validation messages (unknown type, duplicate key, bad `defaultValue`, …) rendered as
  returned. The server is the authority on document validity — do not reimplement `A9`'s validation
  rules client-side, they will drift.

## Why a textarea, deliberately

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

## Reuse note

Prefer TanStack Query for the fetch/mutate pair, consistent with the rest of the client, so the
`GET` is cached and the `PUT` can invalidate it rather than the page hand-rolling refetch state.

## Relationship to `SPORT-2` — siblings, not duplicates

Both tickets consume A9. **This one edits the schema; `SPORT-2` renders it** to a normal user on
their own sport profile. Neither replaces the other, and there is no shared component between
them: an admin editing a JSON document and a member filling in a form are different surfaces.

`SPORT-2` was briefly closed as superseded by A9 on 2026-08-20 and reinstated the same day (user
decision), then **rescoped in place** from its original static `sportAttributeConfig.ts` to
rendering A9’s fetched schema. That rescope was mandatory: its original spec was keyed on
`football`/`basketball`/`tennis` (deactivated by **A6**) and assumed the closed `SportKey` union
**SPORT-3** replaced with a live-derived `string`.

## Explicitly out of scope

- **The user-facing attribute form.** That is `SPORT-2`, not this ticket. Note `SPORT-2` builds only
  the *component*; the "sport profile editing screen" `AddSportModal` deferred
  `bio`/`preferredPosition` to still isn't filed, so nothing hosts it yet either.
- **Drag-to-reorder, live preview, per-field forms** — later enhancements over the textarea.
- **Creating/deleting sports themselves.** The backend endpoints exist (`SportController`, admin-
  gated) but no UI is in scope here; this screen edits an existing sport's schema only.

## Tests

- Vitest/RTL with MSW: loads and renders the fetched document; invalid JSON blocks submit and shows
  a local parse error without firing a request; a `PUT` rejection renders the server's message;
  a successful save invalidates and re-renders.
- Playwright: an ADMIN user reaches the page through `/admin` and completes an edit → save round
  trip.
