# SPORT-2 · Render a user's per-sport attribute fields on their sport profile

**Status:** `DONE` (2026-08-26) · **Type:** Component · **Depends on:** backend **A12** + **A13**
(`modules/sport/sport-impl`) — both hard · **Filed:** 2026-08-01 ·
**Rescoped:** 2026-08-20, again 2026-08-24 (see below) ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` (v2, current);
`documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` (v1, still the record of why the schema is
server-side at all)

> **Rescoped 2026-08-24 — schema v2. Read this before the 2026-08-20 note below.**
>
> The schema format is being extended before this ticket is built, so the renderer targets **v2**,
> not the v1 format A9 shipped. The job is unchanged — render a schema fetched from the server — but
> the schema is richer, and the dependency moves from A9 (`DONE`) to **A12 + A13**.
>
> **What v2 adds that this ticket must render:**
>
> 1. **`DEFINITION`** — an attribute whose value is a *record* (e.g. a shoe with a name and a size).
>    Renders as a nested field group.
> 2. **`DEFINITION_LIST`** — a *repeating* record (e.g. several rackets). Renders as rows with
>    add/remove. **Writes replace the whole list** — no element identity, no partial merge.
> 3. **Localized labels.** `label` arrives already resolved to one string on the user-facing
>    endpoint (A13 resolves server-side from `Accept-Language`), so this ticket renders a string as
>    before — but must not assume the *admin* endpoint behaves the same way.
> 4. **`isRequired` on definition fields.** This client is the **strict** half of a deliberate
>    asymmetry: block the save and show an error, while the server silently drops. Two corollaries —
>    a `200` does not mean everything sent was stored, and the server never relies on this check.
> 5. **10-item cap on `LIST` (multi-select).** `SportAttributeValues.MAX_LIST_ITEMS` (design §9.2) —
>    a hardcoded default, not readable off the schema response, so hardcode `10` here too. The
>    multi-select control must refuse an 11th selection rather than let the user pick it and find out
>    on save: the server does not error on an over-cap `LIST`, it **silently drops the whole value**
>    and the field reverts to whatever was previously stored. (`DEFINITION_LIST`'s add/remove-row
>    version of this same cap is **SPORT-6**'s, since that ticket owns the row UI — same constant,
>    same failure mode if skipped.)
>
> **Still in scope, unchanged:** `STRING`, `ENUM`, `LIST` (now capped, see 5 above), `isAvailable`
> (parent-wins), `order`, `defaultValue`.
>
> **Split out:** the search/link combobox for `Reference`-shaped attributes is **SPORT-6**, which
> depends on this ticket plus backend A14. Build the generic renderer here; SPORT-6 plugs one field
> type into it.
>
> **Open layout question, not decided:** does a nested record render inline or in a sub-modal? A
> `DEFINITION_LIST` of shoes, each holding two nested records, is a real layout problem — v2 design
> §16 flags it and leaves the answer to this ticket.

> **Rescoped 2026-08-20 — read this before the body below.**
>
> This ticket was originally scoped to build a **static** client-side
> `sportAttributeConfig.ts` holding the per-sport attribute key list. Backend **A9** moves that key
> list server-side as an admin-managed schema, so the static config is no longer the right shape.
>
> This ticket was briefly closed as `SUPERSEDED` by A9 and then **reinstated the same day (user
> decision)**: A9 and ADMIN-2 cover storing and *admin-editing* the schema, but neither renders it
> to a normal user on their own sport profile. That is this ticket, and it is still wanted.
>
> **What changed:** the config source. The component still exists and still does the same job — it
> now renders a schema fetched from A9 instead of a hardcoded map.
>
> **Two reasons the rescope was mandatory, not cosmetic** — the original spec could not have been
> built as written:
>
> 1. Its config is keyed on `football`/`basketball`/`tennis`, all deactivated server-side by **A6**
>    — the live MVP catalog is Badminton + Pickleball.
> 2. It assumes `SportKey` is a closed string-literal union. **SPORT-3** made it a live-derived
>    `string`, so the proposed total `Record<SportKey, SportAttributeField[]>` no longer type-checks.

## What ships (rescoped)

**Data hook** — `useSportAttributeSchema(sportId)` wrapping TanStack Query against A9's
`GET /api/sports/{sportId}/attribute-schema`, returning the standard `{ data, isLoading, isError }`
shape per `client/CLAUDE.md`'s data-layer convention. No component calls the endpoint directly.

**Component** — `shared/components/SportAttributesFields.tsx`, presentational and controlled:

```ts
interface SportAttributesFieldsProps {
  /** A9's schema document for this sport, already fetched by the caller. */
  schema: SportAttributeSchema;
  /** Flat key -> value map, matching UserSportProfile.attributes. */
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}
```

Renders A9's **tree**: each available group as a titled section, its available attributes as fields
inside it. Widget per node `type` — `STRING` → text input, `ENUM` → select, `LIST` → multi-select —
using the same `Label` + `Select`/`Input` idiom `AddSportModal` already uses, on the same tokens.

**Rules the renderer must honour** (all from the design doc — don't re-derive them):

- **`isAvailable: false` hides the node.** A soft-deleted *group* hides its whole subtree, and a
  child's own `isAvailable: true` does not resurrect it under an unavailable parent — parent state
  wins (design §5).
- **Stale stored keys are preserved, not dropped.** A profile may hold keys with no current
  definition (retired attributes, or data written before A9). They aren't rendered as fields, and
  must not be erased on save — the caller assembles the payload, so this component's contract is
  that `onChange` only ever reports keys the schema currently defines.
- **An unknown node `type` is skipped, not crashed on.** The schema is admin-authored data driving
  client rendering; a client older than a newly-added type must degrade, not white-screen.
- **Empty schema renders nothing** — no empty section header, no dangling heading. Same as the
  original spec's basketball case, generalised to any sport with no available attributes.
- **`defaultValue`** seeds a field the profile has no stored value for.

**Tests:** Vitest/RTL — renders groups and fields from a schema fixture; respects `isAvailable` at
both levels; skips an unknown `type`; renders nothing for an empty schema; `onChange` fires with
`(key, value)`. **Storybook:** one story per node type, plus the empty case, the
unavailable-subtree case, and the unknown-type degradation.

## Explicitly out of scope (unchanged from the original filing)

**No page hosts this component in this ticket.** `AddSportModal`'s doc comment already deferred
`bio`/`preferredPosition` (both real, already-shipped backend DTO fields) to "a future
profile-editing screen" that still doesn't exist and isn't filed. `attributes` joins that same
deferred list. Same "component ships ahead of the page that uses it" precedent `LocationPicker`
(CLIENT-LOC-1) set ahead of `CreateSessionModal` (CLIENT-SESSION-1) — buildable and
Storybook-verifiable standalone today.

## Follow-up this unblocks — filed 2026-08-26 as PROFILE-4

The "sport profile editing screen" this section originally described (unfiled at the time) is now
`client/docs/MVP/PROFILE-4_SETTINGS_TAB_SPORT_PROFILE_EDITOR.md`, part of the `/profile` page
(`client/docs/PROFILE_PAGE_DESIGN.md`) — the `/profile` Settings tab, scoped to the active
`SportSwitcher` pill, hosting this ticket's `SportAttributesFields` alongside newly-editable
`skillLevel`/`yearsOfExperience`/`preferredPosition`. **Not** the separate `/profile` Edit Profile
modal (`PROFILE-5`) — that one is `bio`/cover/avatar/name/city/country only, explicitly no
sport-profile content, per a scoping decision made when `/profile` was designed.

## Implementation (2026-08-26) — `DONE`

Built as designed, with two scope decisions locked in before starting (both already reflected
above): SPORT-2 itself builds the generic `DEFINITION_LIST` add/remove-row mechanic (SPORT-6 only
swaps in the search combobox for `Reference`-typed fields later), and a nested `DEFINITION` record
renders inline, never a sub-modal.

**Types** (`client/src/shared/types/sport.ts`) — reworked from the v1 shape to the full v2 tree:
`SportAttributeType` is now the 5-member union, added `SportAttributeField`/
`SportAttributeDefinitionType` (the registry), dropped the removed `version` field from
`SportAttributeSchema`, and added the **resolved** twins (`ResolvedSportAttributeSchema`,
`ResolvedSportAttributeGroup`, `ResolvedSportAttributeDefinition`,
`ResolvedSportAttributeDefinitionType`, `ResolvedSportAttributeField`,
`ResolvedSportAttributeOption`) 1:1 with the `Resolved*` Java DTOs — plain string labels, not the
raw admin locale maps. Exported `MAX_LIST_ITEMS = 10` here so SPORT-6 shares the same constant
later.

**Hook** — `client/src/shared/hooks/useSportAttributeSchema.ts`, wrapping the member-facing
`GET /api/sports/{sportId}/attribute-schema`, returns `{ data: ResolvedSportAttributeSchema | null,
isLoading, isError }`. Deliberately a separate file/hook from `features/admin/
useSportAttributeSchema.ts` (same name, different module, different endpoint, different type) — no
actual collision, just two hooks over sibling documents.

**Component** — `client/src/shared/components/SportAttributesFields.tsx`. Renders `schema.groups` →
attributes, `isAvailable` parent-wins at both levels, an unknown `type` skipped rather than crashed
on, `LIST`/`DEFINITION_LIST` capped client-side at `MAX_LIST_ITEMS` (unselected `LIST` checkboxes
disable at the cap; `DEFINITION_LIST`'s Add button disables at the cap), `DEFINITION`/
`DEFINITION_LIST` render their record's fields via a recursive `DefinitionFields`/`DefinitionField`
pair (handles the depth-2 case — a `DEFINITION` field nested inside another definition, e.g. Shoe →
Reference/ShoeSize), a required definition field shows a visual-only hint when empty (no save
action exists in this ticket to gate on), and a `defaultValue` is seeded as a real controlled value
via a one-time effect-driven `onChange` on mount (not just a display default the caller's save
payload could silently miss). `LIST` renders as a checkbox group (not a native multi-select) to
support the "disable at cap" affordance cleanly and to match this app's existing toggle/pill idiom
for multi-choice UI.

**Ripple fixes** — retyping `SportAttributeSchema` (dropped `version`, `label` now a locale map)
broke every existing literal constructing one. Fixed: ADMIN-2's `AttributeSchemaEditor.tsx` empty-
document constant (`{ version: 1, groups: [] }` → `{ defaultLocale: 'en', groups: [] }`, matching
the real validator's actual requirement), its own Storybook fixture, two `AdminSportsPage`/
`AdminLayout` test fixtures, and `e2e/mocks/handlers/sport.ts` — which also gained a small
`resolveAttributeSchema` helper so its member-facing mock endpoint returns the resolved shape
instead of continuing to serve the raw admin one (a real drift from the actual A13 contract that
predated this ticket).

**Verification:** 16 new Vitest/RTL tests (rendering, `isAvailable` at both levels, unknown-type
skip, empty-schema, `onChange` shape per type incl. nested `DEFINITION`/`DEFINITION_LIST`, both caps,
`defaultValue` seeding incl. the no-reseed case) plus the full client suite (950/950 passing, zero
regressions). `tsc -b`, ESLint, and a Storybook production build all clean. **Not verified:** a live
Storybook-dev visual walkthrough — the Claude-in-Chrome browser extension wasn't connected this
session, so the component's actual on-screen appearance was not eyeballed, only its rendered
DOM/behavior via RTL and a successful production build.

---

## Original filing (2026-08-01) — kept for context, no longer the plan

**Status at filing:** `TODO` · **Type:** Component · **Dependency:** none ·
**Filed:** 2026-08-01, closing the gap A3 (`modules/sport/sport-impl`, `DONE`) explicitly left open:
*"Frontend rendering not built here — documented in the ticket as a future client-backlog item
(static per-sport attribute form config), intentionally out of scope for this backend ticket."*
That item was never filed with a ticket ID until then.

### Background (what A3 had decided at the time)

`UserSportProfile.attributes` is a schema-less `Map<String, Object>` (JSONB) — deliberately not a
backend-driven schema table. The backend did zero per-key validation (only a 4KB total-size cap);
"which keys make sense for which sport" was assigned to the frontend as **a static config object**,
not a `sport_attribute_definitions` table — A3's own words: the latter "is a reasonable future
upgrade only if sports are added often enough to justify it, explicitly called out as
over-engineering for now."

**A9 reverses exactly that decision** (see the design doc for why the requirements changed: runtime
admin management, per-attribute soft delete, display grouping). The paragraph above is retained as
the historical reason this ticket was originally shaped around a static config.

`updateProfile()` **merges** attribute keys rather than replacing them wholesale — so a form editing
one sport's fields can't silently wipe another sport's. Still true today, though A9 notes that with
a known key set this could safely become replace-within-schema; that decision belongs to A9, not
here. Either way this ticket's UI only sends the keys it displays.

### Original "what ships" — replaced

A static `shared/lib/sportAttributeConfig.ts` exporting
`SPORT_ATTRIBUTE_CONFIG: Record<SportKey, SportAttributeField[]>` with a narrow
`'text' | 'select'` field-type union, hardcoded for `football`/`basketball`/`tennis`, plus a
`SportAttributesFields` component reading it by `sportKey`. Replaced by A9's server-driven schema
per the rescope note at the top of this file. The narrow field-type union survives in spirit as
A9's closed `STRING`/`ENUM`/`LIST` node types, and the component survives with a `schema` prop in
place of `sportKey`.
