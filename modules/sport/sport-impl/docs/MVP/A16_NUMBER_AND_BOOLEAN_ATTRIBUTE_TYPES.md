# A16 · `NUMBER` and `BOOLEAN` attribute types

**Status:** `TODO`
**Type:** Enhancement
**Filed:** 2026-08-24
**Depends on:** nothing hard. Independent of A12–A15.
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` §3 (v1) named these as the intended
next additions; `SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` §3 leaves them out of v2 for the same reason.

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
