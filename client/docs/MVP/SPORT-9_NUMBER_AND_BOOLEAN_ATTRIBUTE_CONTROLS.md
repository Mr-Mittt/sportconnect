# SPORT-9 · `NUMBER` and `BOOLEAN` attribute form controls

**Status:** `DONE` (2026-09-04) · **Type:** Component · **Filed:** 2026-09-02 ·
**Depends on:** backend **A16** (`DONE` 2026-09-02 — the enum members + `min`/`max`) and client
**SPORT-2** (`DONE` — the `SportAttributesFields` renderer these plug into) ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` §3, and backend
`modules/sport/sport-impl/docs/MVP/A16_NUMBER_AND_BOOLEAN_ATTRIBUTE_TYPES.md`

## Why

Backend A16 added `NUMBER` and `BOOLEAN` to `SportAttributeType`. `SportAttributeType` is a
**client-mirrored enum** — `SportAttributesFields` branches on it to pick a form control — and today
that mirror is a 5-member union (`shared/types/sport.ts`). The renderer's `switch` has a
`default: return null` degrade, so until this ticket ships a `NUMBER` or `BOOLEAN` attribute
declared in a sport's schema simply **renders nothing** on the profile editor. A16 was filed
backend-only (`/workon sport`); this is its client half, filed alongside per A16's own client-impact
note (same pattern as SPORT-6 ↔ A14).

No sport schema declares a `NUMBER`/`BOOLEAN` field yet (seeded Badminton stores tension and
shoe-size value as `STRING`), so nothing is visibly broken in production right now — but the gap is
real and silent, and a schema edit could open it at any time.

## What ships

### 1. Mirror the enum + bounds

- `shared/types/sport.ts`: extend `SportAttributeType` to
  `'STRING' | 'NUMBER' | 'BOOLEAN' | 'ENUM' | 'LIST' | 'DEFINITION' | 'DEFINITION_LIST'`.
- Add optional `min?: number` / `max?: number` to the resolved attribute type and the resolved
  field type (1:1 with the Java `ResolvedSportAttributeDefinition` / `ResolvedSportAttributeField`,
  which A16 extended). They are `null`/absent for every non-`NUMBER` node.
- Update the MSW sport handler fixtures / label-resolver mock under `e2e/mocks/` if any fixture
  exercises these types.

### 2. `NUMBER` control

- `<input type="number">` (shadcn `Input`), value bound as a **number**, not a string — store
  `undefined`/omit when the field is empty, never `NaN` or `""`.
- Apply `min` / `max` / a sensible `step` (`any` unless the schema implies integer) as input
  attributes when present. This is a UX affordance only — mirror A16's strict-client/lenient-server
  split: the server **silently drops** an out-of-range value on save (A3 merge semantics mean the
  profile then keeps its previous value), so the control should stop the user reaching that state,
  and a `200` does not mean the value was stored.
- A `defaultValue` from the schema is seeded as a real controlled value the same way SPORT-2 does
  for `STRING`/`ENUM` (one-time `onChange` on mount), not a display-only placeholder.

### 3. `BOOLEAN` control

- A checkbox or switch (shadcn primitive, restyled via tokens), value bound as a real `boolean`.
- `aria-label` from the attribute label; color is never the only state signal (the checked/label
  text carries it).
- `defaultValue` (`true`/`false`) seeded the same way.

### 4. Both work as definition fields

Add the cases to `DefinitionFields` (the `DEFINITION` / `DEFINITION_LIST` record renderer), not just
the top-level `AttributeField` switch — A16 makes both legal as definition fields, including
inner-position.

## Out of scope

- `order` / group layout for these fields — that's SPORT-7's job across all field types.
- Any Save-gating / required-field validation — no Save action lives in `SportAttributesFields`
  itself (PROFILE-4 owns that); required hints stay visual-only, consistent with SPORT-2.
- The admin editor (ADMIN-2) — it's a raw JSON textarea and needs nothing.
- `DATE`/`DATETIME` or any other type — not in the backend enum.

## Tests

- Vitest — a `NUMBER` field renders a number input, stores a `number`, respects `min`/`max`; an
  empty `NUMBER` stores nothing (not `NaN`); a `BOOLEAN` field toggles a real boolean; both render
  and round-trip inside a `DEFINITION` record; an unknown type still degrades to nothing.
- Storybook — one story per new visual state (`NUMBER` unbounded, `NUMBER` with bounds, `BOOLEAN`
  unchecked/checked), plus a `DEFINITION` record containing one of each.
- Update `client/docs/E2E_OVERVIEW.md` only if an e2e/visual spec file is added or materially
  changed.

---

## Implementation summary (2026-09-04)

### Approved design (Phase 3)

Additive-only: two new members on `SportAttributeType`, optional `min`/`max` mirrored onto the raw
and resolved definition/field types, and two new render cases added to each of
`SportAttributesFields`' two `switch (type)` blocks (`AttributeField` for top-level attributes,
`DefinitionField` for nested `DEFINITION`/`DEFINITION_LIST` record fields — inner-position works
automatically once the leaf case exists, no new recursion). `BOOLEAN` reuses the existing
`shared/ui/switch.tsx` primitive (SPORT-10) rather than introducing a second checkbox pattern
alongside `ListField`'s existing multi-select checkboxes. `step="any"` always for `NUMBER` — A16's
own design deliberately has no int/decimal distinction in the schema, so there is no signal to
branch a stricter step on.

### What was built

**Types (`shared/types/sport.ts`):** `SportAttributeType` extended to the 7-member union; optional
`min?: number | null` / `max?: number | null` added to `SportAttributeDefinition`,
`SportAttributeField`, `ResolvedSportAttributeDefinition`, `ResolvedSportAttributeField`.

**`SportAttributesFields.tsx`:**
- `AttributeField`'s `NUMBER` case — `<input type="number" step="any">`, `min`/`max` mirrored as
  input attrs when present, value bound as `number | undefined` via `event.target.valueAsNumber`
  (never `NaN`/`''`).
- `AttributeField`'s `BOOLEAN` case — `Switch` with `aria-label`, value bound as real `boolean`.
- `DefinitionField` gets the identical two cases (same `showRequiredHint`/`${label} *` treatment
  every other definition-field case already has). `Switch` doesn't accept `aria-required` (its
  props are `checked`/`onCheckedChange`/`disabled`/`aria-label`/`id`/`className` only) — left off
  rather than extending the shared primitive for this, since the visible "Required" hint paragraph
  already carries the same signal for every other type.

**MSW (`e2e/mocks/handlers/sport.ts`):** `resolveField` and `resolveAttributeSchema`'s attribute
mapping now thread `min`/`max` through, keeping the mock's label-resolver simulation 1:1 with the
real backend for any future fixture that declares a bounded `NUMBER` — no current fixture does, so
this is a resolver-correctness fix, not new fixture data.

**Tests:**
- `SportAttributesFields.test.tsx` — `simpleSchema` extended with top-level `weight`
  (`NUMBER`, bounded 0–200) / `strung` (`BOOLEAN`) attributes, and the `Reference` definition
  extended with `gramWeight` (`NUMBER`, bounded 0–500) / `inStock` (`BOOLEAN`) fields (covers
  inner-position via the existing `primary`/`items` `DEFINITION`/`DEFINITION_LIST` attributes). 5
  new cases: renders a number input honoring `min`/`max`; `onChange` fires a real number, never a
  string; an emptied field reports `undefined`, never `NaN`/`''`; `BOOLEAN` toggles a real boolean;
  both round-trip inside a `DEFINITION` record.
- `SportAttributesFields.stories.tsx` — `referenceDefinition` gained `gramWeight`/`inStock`, so
  every existing `DEFINITION`/`DEFINITION_LIST`-hosting story (`AllFieldTypes`, `DefinitionField`,
  `DefinitionFieldMissingRequired`, `DefinitionListField`) now exercises both new types as
  definition fields for free; `AllFieldTypes`' top-level "General" group gained `yearsPlaying`
  (`NUMBER`)/`coached` (`BOOLEAN`). Four new dedicated stories: `NumberFieldUnbounded`,
  `NumberFieldWithBounds`, `BooleanFieldUnchecked`, `BooleanFieldChecked`.

### Key decisions

- **`Switch`, not a checkbox, for `BOOLEAN`.** The ticket left this open; `shared/ui/switch.tsx`
  already exists as a restyled primitive doing exactly this job elsewhere (`ActiveToggleRow`), and
  a switch is the closer semantic fit for a single yes/no attribute — `ListField`'s raw checkboxes
  are a different affordance (multi-select), not a precedent to match here.
- **`min`/`max` threaded through the MSW resolver even with no fixture using them yet** — the
  resolver is generic infrastructure mimicking the real backend's label-resolution step, not
  per-test fixture data, so keeping it 1:1 with the real DTO shape is a correctness fix regardless
  of current fixture coverage.
- **No `aria-required` on the `BOOLEAN` `Switch`** — `Switch`'s prop surface doesn't include it, and
  extending a shared primitive for one optional a11y attribute on a type this ticket doesn't
  otherwise touch was judged out of scope; the existing visible "Required" hint paragraph already
  signals the same thing to every user, sighted or not.

### Divergence from the approved design

None.

### Delta — Settings-tab "stuck dirty after save" fix (2026-09-06)

Found while testing this ticket against a real backend: after editing the Settings tab and pressing
**Save changes**, the value persisted but the form stayed dirty forever — Save button enabled,
leaving the tab kept firing the PROFILE-10 unsaved-changes guard.

**Cause (pre-existing, latent since PROFILE-4):** `useSportProfileSettingsTabData` only re-seeded
its edit `draft` when `activeProfile.id` changed (a sport switch). A save doesn't change `id`, so
the draft kept the just-typed values while `activeProfile` moved to the server's stored row. For a
clean scalar round-trip the two happen to be value-equal, so `isDirty` clears — but any server-side
normalisation breaks that: an empty/whitespace attribute the backend strips, or (SPORT-9's own
concern) an out-of-range `NUMBER` the backend silently drops per A16's lenient-server rule. Then
`draft` ≠ `activeProfile` permanently and `isDirty` is stuck `true`.

**Fix:** `save()` now passes a per-call `onSuccess` to the mutation that re-baselines the draft
from the mutation's returned row — `setDraft(toSportProfileEditDraft(updated))` — before invoking
the guard's own `onSuccess`. The draft's baseline is always the server's truth after a save, so
`isDirty` clears correctly even when the server normalised the value (and the field visibly snaps
back to what was actually stored, which is the honest UX for the silent-drop case). New Vitest case
in `useSportProfileSettingsTabData.test.tsx`: "re-baselines the draft to the server response after
save…". Bundled here rather than a separate ticket — it's a one-hook fix thematically tied to
SPORT-9's attribute editing and A16's server semantics.

### Visual-regression expectation

No baselined surface touched — `SportAttributesFields` has no visual-regression coverage of its own
(verified via Storybook/Vitest per its own original SPORT-2 scope, unchanged here), and no sport's
live schema declares a `NUMBER`/`BOOLEAN` field yet, so no page-level baseline (`profile-settings-*`
etc.) renders anything different. Any Windows `visual-regression` failure is unrelated noise floor,
not a regression from this change.

### Verification

- `pnpm exec tsc -b` — clean.
- `pnpm exec eslint` (all changed files) — clean.
- `pnpm exec vitest run src/shared/components/SportAttributesFields.test.tsx` — **21/21 pass**.
- `pnpm exec vitest run src/features/profile/useSportProfileSettingsTabData.test.tsx` (the dirty-fix
  Delta) — **8/8 pass**; `ProfilePage.test.tsx` (PROFILE-10 guard path) — 10/10 pass.
- `pnpm exec vitest run` (full suite) — **161 files / 1105 tests pass** (1104 + the dirty-fix case).
- Storybook stories added/extended per above — not opened interactively in this session (no browser
  tool invoked); verified via typecheck + lint + the equivalent Vitest interaction coverage instead.
- No e2e/visual spec file added or materially changed → `client/docs/E2E_OVERVIEW.md` unchanged.
