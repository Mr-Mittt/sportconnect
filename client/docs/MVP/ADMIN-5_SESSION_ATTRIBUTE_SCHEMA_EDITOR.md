# ADMIN-5 · Session attribute schema editor

**Status:** `DONE` (2026-09-07) · **Type:** Enhancement · **Depends on:** A17
**Filed:** 2026-09-02 — the admin authoring surface for A17's session schema.

## What ships

In the sport admin master-detail page (ADMIN-2), a second JSON `<textarea>` bound to the raw
`session_attributes_schema` document — same pattern ADMIN-2 already uses for `attributes_schema`:
load raw via `GET /api/sports/all/{sportId}/session-attribute-schema`, save via the `PUT`, surface
the server's 400 text inline (dangling `#ref`, key collision, etc.) exactly as the attribute-schema
textarea does. Reuse ADMIN-2's unsaved-changes guard.

**Editor component (design decision, 2026-09-07):** the existing `AttributeSchemaEditor` is
parameterised and mounted a second time for the session schema (new optional props — section title,
DOM-id prefix, save-button label — each defaulting to today's profile-schema copy, so ADMIN-2's call
site is unchanged), rather than a second near-identical component. Its schema type becomes generic.
New hooks `useSessionAttributeSchemaAdmin` (the admin `GET`) and `useReplaceSessionAttributeSchema`
(the `PUT`), a new `adminKeys.sessionAttributeSchema` query key, a `SessionAttributeSchema` type in
`shared/types/sport.ts` (1:1 with the backend A17 DTO), and two MSW handlers.

## Scope change 2026-09-07 (added at Phase 1 gate, user decision)

1. **All three detail-panel sections collapsible** — Sport fields, Profile attributes, Session
   attributes each get a disclosure toggle (`aria-expanded` / `aria-controls`, keyboard operable),
   via one shared `CollapsibleSection` wrapper in `AdminSportsPage`. **Collapsed content stays
   mounted** (hidden, not unmounted): unmounting an editor would reset its draft and clear its
   dirty flag, silently defeating the unsaved-changes guard. All three default to open.
   *Why:* the detail panel is getting long with a third editor; collapsing lets the admin focus on
   one section.
2. **Read-only pop-up viewer on both schema editors** — a "View" button (next to Save / Reset) in
   each `AttributeSchemaEditor` instance opens a modal (shadcn `Dialog`) showing the current
   document pretty-printed (`JSON.stringify(parsed, null, 2)`) in a wide, scrollable, read-only
   `<pre>`. When the current text is not valid JSON, the viewer shows the raw text verbatim with a
   short "couldn't format — invalid JSON" note. No editing, no save, no syntax-highlight
   dependency. Built into the shared `AttributeSchemaEditor` so both instances get it; dialog title
   derives from the section title prop.
   *Why:* the textarea is cramped inside the ~24rem detail panel; a full-width read-only view makes
   a real schema legible without a structured editor (that is still V1's ADMIN-3).

## Out of scope

- A structured (non-textarea) editor — same call ADMIN-2 made; the richer editor is V1's ADMIN-3.
- Syntax highlighting or a JSON-editor/Monaco dependency in the viewer — plain pretty-printed text
  only (keeps ADMIN-2's zero-new-deps stance).
- A viewer button on the Sport fields section — only the two schema editors get one.
- Persisting collapsed/expanded state across reload or sport switch — sections reset to open.

## Tests

Vitest:
- textarea round-trips the admin session document; a rejected save shows the server error verbatim;
  the unsaved-changes guard blocks navigation with unsaved session-schema edits.
- each section collapses/expands (`aria-expanded` flips, body hidden); collapsing a section with a
  dirty editor keeps its edited text and keeps the guard armed on re-expand.
- the viewer dialog opens from each editor, shows the current document pretty-printed, is read-only
  (no textarea, no Save), and closes; invalid JSON falls back to raw text with the note.

## Implementation (2026-09-07)

### Approved plan (Phase 3), as built

**Types** — `shared/types/sport.ts` gained `SessionAttributeNode` / `SessionAttributeGroup` /
`SessionAttributeSchema`, 1:1 with the `modules/sport/sport-api` A17 DTOs (polymorphic `#ref`-or-own
node; `#ref` serialised as the JSON key `"#ref"`). All additive — no existing consumer touched.

**Data layer** — `src/features/admin/`:
- `queryKeys.ts` → `adminKeys.sessionAttributeSchema(sportId)`.
- `useSessionAttributeSchemaAdmin.ts` — sibling of `useSportAttributeSchema`, reads the admin twin
  `GET /api/sports/all/{sportId}/session-attribute-schema` (raw, all-locale, active-state-agnostic),
  `data: null` (not error) for a sport with no session schema, disabled-query guard.
- `useReplaceSessionAttributeSchema.ts` — sibling of `useReplaceSportAttributeSchema`,
  `PUT /api/sports/{sportId}/session-attribute-schema`, invalidates the key, `errorMessage` = the
  server's own 400 text verbatim.
- MSW `e2e/mocks/handlers/sport.ts` — session-store field `sessionAttributeSchemaState`
  (Badminton seeded with a `#ref` node + an own `ENUM` node, Pickleball `null`), a
  `defaultSessionAttributeSchemasRaw()` helper (the *raw* admin shape — distinct from the existing
  resolved member fixture), `GET /api/sports/all/:sportId/session-attribute-schema` (admin, 404
  unknown sport) and `PUT /api/sports/:sportId/session-attribute-schema` (stand-in validator:
  missing `defaultLocale` / duplicate group key → 400).

**Components** — `src/features/admin/components/`:
- **`CollapsibleSection.tsx`** (new) — one collapsible section: `<h3>` wraps `CollapsibleTrigger`
  (WAI-ARIA accordion pattern, same as `SportAttributesFields`'s `GroupSection`), `defaultOpen`
  prop (default `true`). **`CollapsibleContent forceMount` + `data-[state=closed]:hidden`** — the
  load-bearing choice: Radix unmounts collapsed content by default, which would tear down a
  schema editor's draft and fire its `onDirtyChange(false)` cleanup, silently discarding an edit
  and clearing the `/admin` guard. Kept mounted and CSS-hidden instead. `+ .stories.tsx`.
- **`AttributeSchemaEditor.tsx`** (modified) — now generic `<T extends object>` (the component
  round-trips JSON and never reads a field off the document, so the type only flows through
  `schema`/`onSave`/`emptyDocument`). New optional props, each defaulting to the profile editor's
  original copy: `emptyDocument`, `fieldId` (drives the textarea id, `<Label htmlFor>`, and the
  `${fieldId}-parse-error` node), `fieldLabel`, `saveLabel`, `viewerTitle`. **Own `<h3>` dropped
  from both branches** — the title is now the enclosing `CollapsibleSection`'s trigger. New
  **View** button (always enabled, next to Save/Reset) opens **`SchemaViewerDialog`** — a
  `Dialog` (`max-w-[40rem]`, `fixedHeight` 72vh) with `DialogHeader` title `"<viewerTitle> —
  read-only"` and a scrollable `<pre>` showing `JSON.stringify(JSON.parse(text), null, 2)`, or the
  raw `text.trim()` plus a "Couldn't format — invalid JSON" note when it does not parse. Read-only,
  no Save. `.stories.tsx` gained a `SessionSchema` story.

**Page / state** — `AdminSportsPage.tsx` wraps the three sections in `CollapsibleSection`
(`"Sport fields"` / `"Profile attributes"` / `"Session attributes"`); adds `sessionSchemaQuery` +
`replaceSessionSchema` (reset in `selectSport`), a third dirty flag `isSessionSchemaDirty` +
`reportSessionSchemaDirty`, and folds it into the guard —
`areFieldsDirty || isSchemaDirty || isSessionSchemaDirty`. Second `<AttributeSchemaEditor>` mounted
with `fieldId="session-attribute-schema"`, `fieldLabel="Session schema document (JSON)"`,
`saveLabel="Save session attributes"`, `viewerTitle="Session attributes"`.
`SportFieldsForm.tsx` — dropped its own `<h3>Sport fields</h3>` (+ the now-redundant `mt-3`).

**Tests** — `AdminSportsPage.test.tsx`: `mockGet()` stubs both session-schema GETs (id 1 + 4);
9 new cases (session round-trip via the admin path, empty-doc prefill, save to the session
endpoint, verbatim A17 rejection, invalid-JSON block, collapse flips `aria-expanded` without
unmounting, an edited doc survives a collapse/re-expand, viewer shows pretty-printed + read-only +
closes, viewer raw-text fallback). `AdminLayout.test.tsx`: `mockSportReads()` stubs the session
GET; 1 new case — an unsaved session-schema edit still triggers the logout guard **with its
section collapsed** (proves the third flag reaches the guard and `forceMount` keeps it armed).
`CollapsibleSection.stories.tsx` added.

### Divergences from the plan

- Plan said "~15 lines" for `AttributeSchemaEditor`; actual is larger because the plan's prop list
  grew by `fieldLabel` (needed a distinct accessible name so two textareas don't collide in
  `getByLabelText`) and the viewer dialog is a co-located sub-component rather than a one-liner.
- No dedicated `AttributeSchemaEditor.test.tsx` was added — this component has never had one; its
  behaviour is covered through `AdminSportsPage.test.tsx` as before.

### Deltas for later tickets

- The profile schema section heading changed from **"Attributes"** to **"Profile attributes"** (for
  parity with "Session attributes"). No test asserted the old text.
- `AttributeSchemaEditor` **no longer renders its own heading** — a caller that mounts it outside a
  `CollapsibleSection` must supply its own.
- `AttributeSchemaEditor` is now **generic** (`<T extends object>`); the profile call site infers
  `T = SportAttributeSchema` unchanged.

### Verification

`tsc -b` clean · `eslint` clean · `src/features/admin` Vitest **37/37** · full Vitest suite
**1143 passed** (1 unrelated pre-existing flake in `src/features/chat/useChatConversation.test.tsx`
— a fake-timer typing-indicator test; passes 16/16 in isolation; nothing under `features/chat` was
touched). No live-backend session was available this pickup; the MSW round-trip plus the A17
contract (merged 2026-09-06) stand in, same as the surrounding client-session tickets noted.

### Visual-regression expectation

No baselined surface touched — `/admin` has no `visual-regression` spec or baseline (confirmed:
`e2e/visual/` covers home-feed, groups, profile, sport-reactivate only). A failing
`visual-regression` run on this branch is the documented Windows font noise floor, not a
regression; no baseline changes and none can be regenerated on a Windows host.

### E2E

Ticket scope was Vitest only, but the shared `AdminSportsPage` is driven through a real browser by
`admin-sports.spec.ts` / `admin-route-guard.spec.ts`, so those were run. **Three specs in
`admin-sports.spec.ts` broke** and were fixed:

- `page.getByLabel('Schema document (JSON)')` does **substring** matching in Playwright, so it now
  resolved to *two* textareas ("Session schema document (JSON)" contains it) → strict-mode
  violation. The Vitest suite did not catch this because RTL's `getByLabelText` is **exact** by
  default. Fix: `getByLabel('Schema document (JSON)', { exact: true })` at the 3 call sites
  (lines 50, 68, 85). Behaviour of the tests is unchanged — still the profile editor only — so no
  `E2E_OVERVIEW.md` catalog change; its `e2e/mocks/handlers/sport.ts` handler note now also covers
  the session-schema admin GET/PUT.

After the fix: `admin-sports.spec.ts` + `admin-route-guard.spec.ts` **10/10 green**; full `e2e`
project re-run to confirm the additive `e2e/mocks/handlers/sport.ts` change (new state field + 2
handlers) did not disturb other specs.

**Process note:** the first close-out asserted "existing e2e stays green" without running
Playwright — a real gap. `/workon` Phase 5's "always run e2e when the ticket touches a
browser-exercised surface" is why the step exists; skipping it because the *ticket* scoped tests to
Vitest was the wrong call when the change edits a page three e2e specs cover.

### Phase 5 e2e-grep checklist (for the next ticket)

Before committing a client ticket, regardless of what the ticket's Tests section says:

1. **Grep `e2e/` for every component/page/hook in the diff.** If it returns a spec file, that
   surface is browser-covered — run its Playwright project (`pnpm e2e` for the whole project, or
   `pnpm exec playwright test --project=e2e <files>`). "The ticket only scoped Vitest" waives *new*
   tests, never *existing* ones.
   ```bash
   git diff --name-only | grep -oE '[A-Za-z]+\.(tsx?|ts)' | sed 's/\.[^.]*$//' | sort -u \
     | while read n; do grep -rl "$n" client/e2e/flows client/e2e/visual 2>/dev/null; done | sort -u
   ```
2. **Any new/renamed label, button text, `aria-label`, or role name → grep `e2e/` for the string it
   resembles.** Playwright `getByLabel` / `getByText` / `getByRole({name})` default to
   **substring + whitespace-normalized** matching; RTL (`getByLabelText`, …) defaults to **exact**.
   A new name that *contains* an existing one (here: `"Session schema document (JSON)"` ⊃
   `"Schema document (JSON)"`) passes every Vitest test and trips Playwright strict-mode on the
   old locator. Fix in the same commit: make the sibling names non-overlapping, or add
   `{ exact: true }` to the existing e2e locator.
3. **Never write an e2e result you didn't run.** If Playwright wasn't run, the summary says
   "e2e not run — <reason>", the same discipline the "Visual-regression expectation" line already
   forces.
4. A green Vitest run over a shared component is necessary, not sufficient — RTL and Playwright also
   disagree on hidden-element visibility and `forceMount`ed content. The full-pipeline run is the
   step that catches those.
