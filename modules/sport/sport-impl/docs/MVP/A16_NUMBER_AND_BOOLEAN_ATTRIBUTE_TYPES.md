# A16 · `NUMBER` and `BOOLEAN` attribute types

**Status:** `DONE` (2026-09-02)
**Type:** Enhancement
**Filed:** 2026-08-24
**Depends on:** nothing hard. Independent of A12–A15.
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` §3 (v1) named these as the intended
next additions; `SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` §3 leaves them out of v2 for the same reason.
**Client half:** `SPORT-9` (filed alongside, 2026-09-02) — the `NUMBER`/`BOOLEAN` form controls in
`SportAttributesFields`.

## Why

v1 named `NUMBER` and `BOOLEAN` as "the obvious next additions… not in scope until something needs
them", per this codebase's standing rule against designing for hypothetical requirements.

Writing Badminton's real schema is the first time something needs them. String tension is a number
stored as free text; so is a shoe size value. Storing numbers as `STRING` means no range validation,
no numeric sort, no numeric form control, and no ability to filter later.

This is filed separately from A12 precisely because it is *not* required by v2 — it is the small,
independent gap that authoring a real schema exposed.

## What ships

**1. Two members on `SportAttributeType`** — `NUMBER` (stored as a JSON number) and `BOOLEAN`.

**2. `SportAttributeValues.isValid` cases** for both. Decide and record whether `NUMBER` accepts
integers only or any numeric — and note that Jackson will hand back `Integer`/`Long`/`Double`
depending on the literal, so the check must not be `instanceof Integer`.

**3. Optional `min`/`max` on `NUMBER`** — decide at pickup whether to include them. They are the
obvious reason to have a `NUMBER` type at all rather than a `STRING`, but they add a validation rule
and a client control; skipping them is defensible for a first pass.

**4. Both are legal as definition fields**, not only as top-level attributes.

## Client impact — this is a client-facing change

`SportAttributeType` is a **client-mirrored enum**: the client branches on it to choose a form
control. A9 recorded the rule that adding a member must carry its client case in the same change or
one filed alongside. Consumers are `SPORT-2` (renderer) and `ADMIN-2` (editor — a JSON textarea, so
it needs nothing).

So this ticket lands with `SPORT-2`'s two new cases, or files them alongside. Do not land the enum
member alone and leave the renderer with a type it cannot draw.

## Tests

Spock cases in `SportAttributeSchemaValidatorSpec` (valid/invalid `defaultValue` for each new type,
`options` rejected on both) and `ProfileAttributeFilterSpec` (a numeric string is *not* a valid
`NUMBER`; `true` is not a valid `NUMBER`; boundary cases if `min`/`max` ship).

## Out of scope

`DATE`, `DATETIME`, and any other type kind. Same rule: when something needs one.

---

## Scope decisions at pickup (2026-09-02)

The three "decide at pickup" points above were resolved with the user before implementing:

1. **`NUMBER` accepts any JSON number**, integers and decimals alike — string tension is `27.5`,
   half shoe sizes are `9.5`. Validity is `value instanceof Number` (covers `Integer`/`Long`/
   `Double`/`BigInteger`/`BigDecimal`); a numeric *string* and a `boolean` both fail it.
2. **`min`/`max` are included** (not deferred). Optional, independent, inclusive bounds on a
   `NUMBER` node — the reason to have a `NUMBER` type rather than a `STRING` at all. This is a
   scope addition over the filed ticket, made deliberately at pickup.
3. **Client cases filed alongside as `SPORT-9`**, not landed in this PR — this was `/workon sport`
   (backend), `SPORT-2` already shipped with a `default: return null` degrade, and it matches how
   `SPORT-6` was filed alongside `A14`.

---

## Implementation summary (2026-09-02)

### Approved design

Pure DTO + validation change, entirely inside `modules/sport`. No migration (the schema is a JSONB
document and stored values are already `Map<String, Object>`; the enum lives only in Java). No
cross-domain touch, no new endpoint, no authorization change (the admin `PUT` and profile-write
paths already gate `isActive` via A7).

| Layer | Change |
|---|---|
| `SportAttributeType` (sport-api) | `NUMBER`, `BOOLEAN` members; Javadoc no longer calls them deferred |
| `SportAttributeDefinition`, `SportAttributeField` (sport-api) | optional `Double min`, `Double max` — only meaningful on `NUMBER` |
| `ResolvedSportAttributeDefinition`, `ResolvedSportAttributeField` (sport-api) | mirror `min`/`max` so the member-facing resolved schema can constrain the client input |
| `SportAttributeValues` (sport-impl) | `isValid(value, type, allowedValues, min, max)` — new signature; `NUMBER → instanceof Number` + `withinBounds` (rejects NaN/∞, inclusive bounds), `BOOLEAN → instanceof Boolean`. `filterScalarOrRecord` threads `min`/`max` and adds both to its primitive arm. `isValidRecord` passes `field.getMin()/getMax()` when recursing |
| `SportAttributeSchemaValidator` (sport-impl) | `validateAttribute` + `validateField`: reject `options` on `NUMBER`/`BOOLEAN`; new `validateNumericBounds` helper — `min`/`max` legal only on `NUMBER`, `min ≤ max` when both set; `defaultValue` checked in range. `validateInnerPositionDefinitionsArePrimitiveOnly` now allows `NUMBER`/`BOOLEAN` as inner-position fields |
| `SportAttributeSchemaLabelResolver` (sport-impl) | copies `min`/`max` into the resolved attribute/field |
| `ProfileAttributeFilter` (sport-impl) | passes `definition.getMin()/getMax()` (and, via `isValidRecord`, `field.getMin()/getMax()`) into `filterScalarOrRecord`; the `DEFINITION_LIST` element loop passes `null, null` (element type is `DEFINITION`) |

### What was built

Matches the approved design exactly — no divergence. `withinBounds` also guards against NaN/infinity
(they can't arise from standard JSON parsing but a caller-built value could carry one).

### Key decisions / non-obvious constraints

- **`instanceof Number`, never `instanceof Integer`.** Jackson picks the box type from the literal.
  This also gets the two rejections for free: `Boolean` is not a `Number` in Java, and a numeric
  `String` is not a `Number`.
- **Bounds comparison is done in `double`.** A `BigDecimal`/`BigInteger` value is narrowed via
  `Number.doubleValue()` for the range check only — the original value is stored unchanged. Precision
  loss at the edge of a range check was judged acceptable versus carrying `BigDecimal` bounds
  through every signature.
- **`min`/`max` rejected on non-`NUMBER` nodes** (including `DEFINITION`/`DEFINITION_LIST`) — the
  guard runs unconditionally after the type switch, not only inside the non-record branch.
- **Lenient/strict split is unchanged:** an out-of-range number on a profile write is *dropped*
  silently by `ProfileAttributeFilter` (like any other shape mismatch); an out-of-range
  `defaultValue` on an admin `PUT` is *rejected* with a 400.

### Tests

- `SportAttributeSchemaValidatorSpec` — `NUMBER` (bounded + unbounded) and `BOOLEAN` doc passes;
  integer/long/decimal literal all valid for a `NUMBER` default; `options` rejected on both;
  `defaultValue` wrong-shape and out-of-range rejected, on-bound accepted; `min > max` rejected;
  `min`/`max` on a non-`NUMBER` rejected; both legal as definition fields incl. inner-position; a
  non-`NUMBER` definition field carrying `min`/`max` rejected.
- `ProfileAttributeFilterSpec` — valid number (int + decimal) and boolean survive; `"27"` / `true`
  dropped for `NUMBER`; `1` / `"true"` dropped for `BOOLEAN`; out-of-range dropped, on-bound kept;
  unbounded `NUMBER` accepts any finite value; `NUMBER`/`BOOLEAN` definition fields follow the
  required/optional record cascade.
- `SportAttributeSchemaLabelResolverSpec` — `min`/`max` carried through to the resolved tree for
  both a top-level attribute and a definition field.
- `SportAttributeSchemaIntegrationTest` (`:server:test`) — a `NUMBER`-with-bounds + `BOOLEAN`
  document round-trips through the real JSONB column (`PUT` then `GET`, `min`/`max` intact);
  `min > max` rejected atomically with a 400.

All green: `:modules:sport:sport-impl:test` and full `:server:test`.
