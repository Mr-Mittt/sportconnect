# SPORT-7 · SportAttributesFields — honor `order`, group-level layout

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** none. Shares
`SportAttributesFields.tsx` with SPORT-6 — coordinate at pickup.
**Filed:** 2026-09-02, from the session-attribute design discussion: the renderer currently maps
groups/attributes in array order and stacks every field vertically, which doesn't scale as real
schemas (Badminton, plus session schemas) grow.

## What ships

- **Honor `order`**: sort groups and attributes by their `order` field (nulls last, stable). The
  schema already declares it; the client currently ignores it. Confirm at pickup whether the
  server resolver already sorts — if it does, this is a no-op and the ticket narrows to layout.
- **Group-level layout**: each group renders as a section with a heading, optionally collapsible;
  primitive fields (STRING/ENUM/LIST) flow in a 1-col -> 2-col responsive grid;
  DEFINITION/DEFINITION_LIST stay full-width. No schema changes, no per-field config.

Benefits the existing profile editor (`SportProfileSettingsTab`) as well as the new session forms.

## Out of scope

Any schema-driven presentation hint (`widget`/`display`). Per-field widget changes (that's the
`type` switch, extended only when a concrete schema needs it — e.g. SPORT-6).

## Tests

Vitest: groups/attributes render in `order`; collapse toggles; grid falls back to single column at
narrow width. Visual-regression story if the profile editor's baseline shifts.
