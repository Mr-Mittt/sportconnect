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

---

## Implementation (2026-09-07)

### Approved design

Picked up before CLIENT-SESSION-15 (queue reorder, user decision) so the session-attribute modal
builds on the finished v3 renderer. Four design calls locked at Phase 1:

1. **Group layout order** — a group's own `attributes` render first (in the grid), then its child
   sub-groups stack below.
2. **Collapsible** — every group (top-level and nested) is a `Collapsible` (shared Radix
   primitive), `defaultOpen`; collapsed state is Radix-local, not persisted.
3. **Grid breakpoint** — `grid-cols-1 sm:grid-cols-2` (Tailwind `sm`, 640px). `DEFINITION` /
   `DEFINITION_LIST` take `sm:col-span-2` (full width).
4. **MSW seed** — the Badminton mock schema gains a real nested `gear/rackets` sub-group
   (`stringTension` NUMBER) so e2e/visual exercise recursion, not just Vitest fixtures.

### What was built

1. **Types (`client/src/shared/types/sport.ts`)** — `order?` removed from all six schema
   interfaces (`SportAttribute{Field,Definition,Group}` + the three `Resolved*` twins), mirroring
   backend A19 §6. `groups?: SportAttributeGroup[] | null` added to `SportAttributeGroup`;
   `groups?: ResolvedSportAttributeGroup[] | null` to `ResolvedSportAttributeGroup` (self-referential
   nested tree). `UserSportProfileResponse.attributes` doc updated — keys are now each node's full
   `/`-separated path from the schema root; map shape unchanged.

2. **`SportAttributesFields.tsx`** — recursive `GroupSection` component (replaces the single
   `schema.groups.map` → `group.attributes.map` level):
   - `joinPath(prefix, key)` builds the `/`-path while walking; root groups' path is the bare key.
   - `groupHasVisibleContent(group)` recurses: available **and** (a visible direct attribute **or**
     a descendant sub-group with visible content). Parent-wins cascade at every depth.
   - Each section is `<Collapsible defaultOpen>`; the heading (`<h3>` depth 0, `<h4>` deeper) wraps
     the `<CollapsibleTrigger>` (WAI-ARIA accordion pattern — keeps screen-reader heading nav while
     the whole row is the toggle). Depth ≥ 1 gets `border-l border-border pl-3` as the indent cue.
   - `CollapsibleContent`: own visible attributes in `grid grid-cols-1 gap-3.5 sm:grid-cols-2`
     (`AttributeField` wraps its control in a `min-w-0` cell, `sm:col-span-2` for
     DEFINITION/DEFINITION_LIST, and renders **no cell** for an unknown/malformed type rather than
     an empty column), then visible sub-groups as nested `GroupSection`s.
   - `AttributeField` gains a `path` prop (collision-free field id + the `onChange` key). `onChange`
     fires with the attribute's full path; `values[path]` reads it. Nested-record code
     (`DefinitionFields`/`DefinitionField`/`DefinitionListField`) is unchanged — record field keys
     stay bare inside the value object (A19 §3.1).
   - `defaultValue` seeding `useEffect` recurses the tree, keying by full path, still `[schema]`-gated.

3. **MSW (`e2e/mocks/handlers/sport.ts`)** — `resolveAttributeSchema` now delegates to a recursive
   `resolveGroup` (resolves nested `groups`); `order` dropped from `resolveField` and the attribute
   mapper. `defaultAttributeSchemas()` Badminton (id 1): loose `gear/racketBrand` STRING kept,
   plus a nested `gear/rackets` sub-group with `stringTension` NUMBER (`min` 15 / `max` 35). No
   `order` in the seed. Pickleball stays `null`.

4. **Tests / stories** — `SportAttributesFields.test.tsx`: `order` stripped, flat-schema
   assertions moved to path keys (`g/note`, …), + new cases (array order; nested sub-group render
   + full-path `onChange` + seed; 2-level ancestor-unavailable hides subtree; group visible via
   sub-group only; collapse/re-expand toggle; nested `defaultValue` at full path). `.stories.tsx`:
   `order` stripped, path-keyed `values`, + `NestedGroups` (3 levels, mixed children) and
   `NestedUnavailableSubtree` stories. `AttributeSchemaEditor.stories.tsx` / `AdminSportsPage.test.tsx`
   / `AdminLayout.test.tsx`: `order` stripped from their `SportAttributeSchema` fixtures (the admin
   editor is an opaque JSON textarea — no logic change).

5. **Docs** — `E2E_OVERVIEW.md` fixture notes updated (the mock Badminton schema is now v3/nested,
   values path-keyed). No spec file added/removed → no catalog (§3/§6) change.

### Consumer census (`client`)

| Consumer | Disposition |
|---|---|
| `SportProfileSettingsTab.tsx` | compatible as-is — passes `schema`/`values`/`onChange` straight through |
| `useSportProfileSettingsTabData.ts` `setAttribute(key,value)` | compatible as-is — keys `attributes` by whatever string it's given; now a path |
| `sportProfileEditDraft.ts` (`buildSportProfileUpdatePayload`, `isSportProfileDraftDirty`, `toSportProfileEditDraft`) | compatible as-is — treats `attributes` as opaque (`JSON.stringify` compare) |
| `shared/hooks/useSportAttributeSchema` / `features/admin/useSportAttributeSchema` | compatible as-is — pass the document through untyped-by-shape |
| `AttributeSchemaEditor` (admin) | compatible as-is — edits the document as opaque JSON text |
| `useSessionAttributeSchema` + `prefillable`/`prefillKey` (CLIENT-SESSION-14) | untouched — not read by this ticket; CLIENT-SESSION-15 consumes them |
| test/story fixtures with `order` (5 files) | updated here — `order` stripped to keep `tsc` green |

### Divergence from the plan

None.

### Verification

- `pnpm exec tsc -b` — clean.
- `pnpm lint` — 0 errors (2 pre-existing `SessionStartTimePicker.tsx` warnings, untouched).
- `pnpm test` — **162 files / 1118 tests green** (was 1110 at CLIENT-SESSION-14; +8 SPORT-7 cases).
  `SportAttributesFields.test.tsx` 29 cases.
- **Real backend** (`:server:bootRun` already up on :8080, dev Postgres): `GET /api/sports/1/attribute-schema`
  returns the v3 shape this ticket's types/renderer expect — `groups` present on every node (`[]`
  when empty), **no `order`**, and the seeded Badminton doc genuinely nests (`gear` →
  `racketStringGroup` sub-group with `racketString` + `tension`; the A19 design doc's "Badminton has
  no nesting" is stale — a later seed extension added it). `prefillable`/`prefillKey` present as
  `null` on the profile-schema resolution, as expected. Path-keyed `attributes` write round-trips:
  `PUT /api/sports/profiles/{id}` with `{"general/handedness":"RIGHT","gear/racketStringGroup/tension":18}`
  is stored and read back **verbatim**, merge semantics intact.
- Browser visual walk: **not performed** — the Claude-in-Chrome extension was not connected this
  session. Rendering of the nested tree / grid / collapsible sections is covered by the 29 Vitest
  cases and the `NestedGroups` / `NestedUnavailableSubtree` Storybook stories (human-review surface).

### Visual-regression expectation

Baselines `profile-settings-375.png`, `profile-settings-768.png`, `profile-settings-1280.png`
(`e2e/visual/app-profile.spec.ts`) **legitimately change** — the Badminton Settings-tab editor now
renders collapsible group chevrons, a responsive 2-col grid at ≥ `sm`, and the new nested `Rackets`
sub-group section. Expected to fail until the `client-ci` `update-baselines` dispatch regenerates
exactly those three; every other baseline must come back byte-identical. `app-sport-reactivate.spec.ts`'s
`profile-settings-inactive-*` screenshots **Pickleball** (no schema → component renders nothing) and
its dialog/switcher baselines don't mount the component, so all 21 stay byte-identical. Baselines
cannot be regenerated on a Windows host; a local `visual-regression` run is the documented
font-rendering noise floor.

**Executed (2026-09-07):** `client-ci` `update-baselines` dispatch run on Linux; `visual-baselines`
artifact applied via `/updatebaseline`. SHA-256 against the committed set confirmed **exactly the 3
predicted files changed** (`profile-settings-{375,768,1280}.png`); the other **105 baselines came
back byte-identical** — no unintended drift, and the local Windows diffs on those were pure noise
floor. Human eyeball of `profile-settings-1280.png` / `-375.png`: the "Gear" group now carries a
collapse chevron, "Racket brand" sits under it, and an indented "Rackets" sub-group with its own
chevron holds "String tension (lbs)" — the v3 nesting, nothing else moved. Committed `1a5adcc`.

### Delta for CLIENT-SESSION-15 / CLIENT-SESSION-16 (`client`)

`SportAttributesFields` now renders the v3 nested tree and is **path-keyed** — a caller's `values`
map and `onChange` key are each node's full `/`-separated path. `useSessionAttributeSchema`'s
resolved session schema is the same `ResolvedSportAttributeSchema` shape, so CLIENT-SESSION-15 can
render it through this component unchanged; pre-fill must read `profile.attributes[prefillKey]`
where `prefillKey` is already a full path (A17) and write the session draft under the **session
node's** own full path.
