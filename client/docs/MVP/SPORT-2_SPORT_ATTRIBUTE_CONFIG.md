# SPORT-2 · Static per-sport attribute config + `SportAttributesFields` component

**Status:** `TODO` · **Type:** Component · **Dependency:** none · **Spec:** this file ·
**Filed:** 2026-08-01, closing the gap A3 (`modules/sport/sport-impl`, `DONE`) explicitly left open:
*"Frontend rendering not built here — documented in the ticket as a future client-backlog item
(static per-sport attribute form config), intentionally out of scope for this backend ticket."*
That item was never filed with a ticket ID until now.

## Background (what A3 already decided, not re-litigated here)

`UserSportProfile.attributes` is a schema-less `Map<String, Object>` (JSONB) — deliberately not a
backend-driven schema table. The backend does zero per-key validation (only a 4KB total-size cap);
"which keys make sense for which sport" was explicitly assigned to the frontend as **a static
config object**, not a `sport_attribute_definitions` table — A3's own words: the latter "is a
reasonable future upgrade only if sports are added often enough to justify it, explicitly called
out as over-engineering for now." Nothing about that calculus has changed; this ticket builds the
static config, it does not reopen the schema-table question.

`updateProfile()` **merges** attribute keys rather than replacing them wholesale (server-side,
already built) — so a form that only edits tennis's `dominantHand` can't silently wipe out
`preferredFoot` if the user also has a football profile. This ticket's UI only needs to send the
keys it displays; it doesn't need to round-trip the full existing map itself.

## What ships

**Config** — `shared/lib/sportAttributeConfig.ts`, sibling to the already-established
`shared/lib/sportProfileConfig.ts` (whose own comment already says it follows "the same approach
sport-impl's A3 ticket already took for per-sport attributes" — this ticket is that approach's
other half):

```ts
export type SportAttributeFieldType = 'text' | 'select';

export interface SportAttributeOption {
  value: string;
  label: string;
}

export interface SportAttributeField {
  /** Matches a key in UserSportProfile.attributes exactly, e.g. 'dominantHand'. */
  key: string;
  label: string;
  type: SportAttributeFieldType;
  /** Required when type === 'select'. */
  options?: SportAttributeOption[];
}

export const SPORT_ATTRIBUTE_CONFIG: Record<SportKey, SportAttributeField[]> = {
  football: [
    { key: 'preferredFoot', label: 'Preferred foot', type: 'select', options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'both', label: 'Both' },
    ] },
  ],
  basketball: [], // no sport-specific attributes yet — empty array, not an omitted key
  tennis: [
    { key: 'dominantHand', label: 'Dominant hand', type: 'select', options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    { key: 'playingStyle', label: 'Playing style', type: 'text' },
  ],
};
```

The example field choices above are illustrative, not final — confirm actual field lists per sport
at implementation time (a product call, not an engineering one). `type` is deliberately a narrow
union (`text` | `select`) rather than trying to anticipate every future input shape; extend it
(e.g. add `number`) only when a real attribute needs it, same "don't design for hypothetical future
requirements" rule as everywhere else in this codebase.

**Component** — `shared/components/SportAttributesFields.tsx`:

```ts
interface SportAttributesFieldsProps {
  sportKey: SportKey;
  /** String-only — matches what a form can collect; the caller assembles the
   * full Record<string, unknown> attributes payload before sending it. */
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}
```

Presentational and controlled, same idiom `AddSportModal`'s own fields already use (`Label` +
`Select`/`Input` per field, same tokens). Renders nothing when `SPORT_ATTRIBUTE_CONFIG[sportKey]`
is empty (basketball today) — not an empty section header, just nothing, so a sport with no extra
attributes doesn't leave a dangling heading in whatever form hosts this.

**Tests:** Vitest/RTL — renders the right fields per sport, calls `onChange` with `(key, value)`,
renders nothing for an empty-config sport. **Storybook:** one story per `SportKey` (including
basketball's empty case) so every visual state is reviewable without a hosting page.

## Explicitly out of scope

**No page/modal hosts this component in this ticket.** `AddSportModal`'s own doc comment already
deferred `bio`/`preferredPosition` (both real, already-shipped backend DTO fields) to "a future
profile-editing screen" — that screen still doesn't exist and isn't filed. `attributes` joins that
same deferred list; wiring `SportAttributesFields` in only becomes possible once that screen is
scoped. Same "component ships ahead of the page that uses it" precedent `LocationPicker`
(CLIENT-LOC-1) set ahead of `CreateSessionModal` (CLIENT-SESSION-1) — buildable and
Storybook-verifiable standalone today.

No backend change — A3 already ships everything this component needs to eventually call
(`CreateUserSportProfileRequest.attributes`, `UserSportProfileResponse.attributes`, merge-on-update
semantics).

## Follow-up this unblocks (not filed)

A "sport profile editing screen" ticket — `bio`, `preferredPosition`, and (via this ticket)
per-sport `attributes` all become editable in one place. Worth filing once someone actually wants
to build it; this ticket's job is only to make sure the attribute half isn't blocked when that
happens.

---

### SPORT-2 · Static per-sport attribute config + `SportAttributesFields` component
**Status:** `TODO` · **Type:** Component · **Dependency:** none · **Filed:** 2026-08-01 · **Spec:**
`client/docs/SPORT-2_SPORT_ATTRIBUTE_CONFIG.md`

**What ships:** closes a gap backend ticket A3 (`modules/sport/sport-impl`, `DONE`) explicitly left
open — `UserSportProfile.attributes` is a schema-less JSONB map by design (no backend schema table,
a deliberate A3 decision), with "which keys render for which sport" assigned to a static
frontend-side config. `shared/lib/sportAttributeConfig.ts` (sibling to the already-shipped
`sportProfileConfig.ts`, which already followed this exact precedent for label/icon/colorRamp) adds
`SPORT_ATTRIBUTE_CONFIG: Record<SportKey, SportAttributeField[]>`; `shared/components/
SportAttributesFields.tsx` renders it (text/select inputs, controlled, same idiom `AddSportModal`
already uses; renders nothing for a sport with an empty field list). No backend change — A3 already
ships everything this needs.

**Explicitly out of scope:** no page hosts this component yet. `AddSportModal` already deferred
`bio`/`preferredPosition` to "a future profile-editing screen" that was never filed; `attributes`
joins that same deferred list. This ticket only removes the "component doesn't exist yet" blocker,
same "component ships ahead of the page" precedent `LocationPicker` set for `CreateSessionModal`.
