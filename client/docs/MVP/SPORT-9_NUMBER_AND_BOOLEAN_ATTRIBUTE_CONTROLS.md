# SPORT-9 · `NUMBER` and `BOOLEAN` attribute form controls

**Status:** `TODO` · **Type:** Component · **Filed:** 2026-09-02 ·
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
