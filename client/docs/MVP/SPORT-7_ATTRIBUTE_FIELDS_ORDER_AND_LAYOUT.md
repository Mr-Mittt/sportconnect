# SPORT-7 · SportAttributesFields — array-position order, nested groups, group-level layout

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** none. Shares
`SportAttributesFields.tsx` with SPORT-6 — coordinate at pickup.
**Filed:** 2026-09-02, from the session-attribute design discussion: the renderer currently maps
groups/attributes in array order and stacks every field vertically, which doesn't scale as real
schemas (Badminton, plus session schemas) grow.

## Scope change 2026-09-06 (from backend A19 pickup) — schema v3

Backend **A19** (`DONE` 2026-09-06, `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V3_DESIGN.md`) shipped
schema **v3**. Three client-facing consequences land in this ticket:

1. **Ordering is array position, not an `order` field.** A19 **removed** `order` from every schema
   node (group / definition / field) and its `Resolved*` twin. Children are a strict ordered array,
   so the renderer honours **array index**. The original "sort by `order`, nulls last" work is gone
   — do not add a client-side `order` sort, and drop `order` from `client/src/shared/types/sport.ts`
   (`SportAttributeGroup`, `SportAttributeDefinition`, `SportAttributeField`, and the three
   `Resolved*` interfaces).
2. **Nested groups.** `SportAttributeGroup` / `ResolvedSportAttributeGroup` gain an optional
   self-referential `groups: SportAttributeGroup[]` list — a group may hold sub-groups and
   attributes together, to arbitrary depth. `SportAttributesFields` renders the group tree
   **recursively** (sub-group = nested section, one indent level deeper). `isAvailable` is
   parent-wins at **every** depth (already the rule at one level — make it recursive).
3. **`UserSportProfile.attributes` is path-keyed.** A stored/submitted attribute value is keyed by
   its full `/`-separated path from the schema root (`gear/rackets/tension`), not the bare leaf key.
   Everywhere the profile editor (PROFILE-4's `SportProfileSettingsTab`) reads or writes
   `attributes`, the key is the node's full path. Build the path while walking the group tree.
   `client/src/shared/types/sport.ts`'s `UserSportProfileResponse.attributes` type
   (`Record<string, unknown>`) is unchanged in shape — only the key convention changes; call it out
   in a comment. Backend `V061` migrates the one seeded Badminton schema + any stored rows.

MSW `e2e/mocks/handlers/sport.ts` and its label resolver must return the nested `groups` tree and
path-keyed attribute maps to match.

## What ships

- **Array-position order**: render groups and attributes in declared array order (see scope change
  above — no `order` sort).
- **Nested-group recursion**: render the v3 group tree recursively; each (sub-)group is a section
  with a heading, optionally collapsible; primitive fields (STRING/ENUM/LIST/NUMBER/BOOLEAN) flow in
  a 1-col -> 2-col responsive grid; DEFINITION/DEFINITION_LIST stay full-width. No schema changes,
  no per-field config.
- **Path-keyed attribute I/O** in the profile editor.

Benefits the existing profile editor (`SportProfileSettingsTab`) as well as the new session forms.

## Out of scope

Any schema-driven presentation hint (`widget`/`display`). Per-field widget changes (that's the
`type` switch, extended only when a concrete schema needs it — e.g. SPORT-6). Client rendering of
session-attribute `#ref` nodes (that's CLIENT-SESSION-14/15/16 + A17).

## Tests

Vitest: groups/attributes render in array order; a nested sub-group renders one indent deeper and
its fields read/write at the full path; `isAvailable:false` on an ancestor group hides the whole
subtree; collapse toggles; grid falls back to single column at narrow width. Visual-regression
story if the profile editor's baseline shifts.
