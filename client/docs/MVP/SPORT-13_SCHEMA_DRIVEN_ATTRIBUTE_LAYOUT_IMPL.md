# SPORT-13 — implementation summary

**Ticket:** `client/docs/MVP/SPORT-13_SCHEMA_DRIVEN_ATTRIBUTE_LAYOUT.md`
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md`
**Status:** `DONE` (2026-09-09) · 1 of 3 (SPORT-14 containers, SPORT-15 read-only parity + `#ref`)

## Approved design (restated)

Add an optional `layout` **object** to the attribute-schema node types and thread it through the
four scalar `attributeFields/` arms so a schema author can pick an alternate control per node, with
the renderer degrading to today's exact markup (plus a dev warning) whenever `layout` is absent,
malformed, or carries an id/format the arm doesn't support. No backend change (that's `common`
C11); no MSW seed sets `layout` yet, so every existing surface renders unchanged.

Scope refinement locked at Phase 1 pickup (written into the ticket):

- `layout.icon` is added to the shared type now, unused (SPORT-14 renders it).
- `format` is a **pattern string, localizable like `label`** — a locale map in the raw schema
  types, the resolved single string in the `Resolved*` twins. Small closed grammar, not a DSL.
- `format` is **display-only** in SPORT-13's editable arms.
- Corrected the vocabulary: `BOOLEAN` default is `switch` (`<Switch>`), not `checkbox`.

## What was built

### Types — `src/shared/types/sport.ts`

- `AttributeLayout` (raw: `format` is `Record<string,string>`) and `ResolvedAttributeLayout`
  (resolved: `format` is `string`), both `{ id, icon?, format? }`.
- `layout?` added to: raw `SportAttributeField`, `SportAttributeDefinition`, `SportAttributeGroup`,
  `SessionAttributeNode`, `SessionAttributeGroup`; resolved `ResolvedAttributeCommon` (all 7
  attribute arms incl. `#ref`), `ResolvedFieldCommon` (record fields), `ResolvedSportAttributeGroup`.
  Group + `#ref` + record-field `layout` are carried but only *rendered* from SPORT-14/15 — added
  now to keep the type stable across the split.

### Helpers

- `src/shared/lib/devWarn.ts` — `devWarn(key, msg)`: dev-only, deduped `console.warn`, plus
  `resetDevWarnCache()` for tests. Every arm's degrade path calls it.
- `src/shared/lib/formatAttributeValue.ts` — `formatAttributeValue(value, type, pattern, locale='en-US')`.
  NUMBER grammar: a `[0#][0#,]*(\.[0#]+)?%?` token (decimals from digits after `.`, grouping from
  `,`, percent from trailing `%` — `Intl` ×100), with optional literal prefix/suffix. STRING:
  `uppercase` / `lowercase` / `titlecase`. Nullish/empty → `''` (no warn); unparseable pattern or
  type mismatch → `String(value)` + `devWarn`. `locale` default is a documented simplification
  until client V1 `I18N-1`.
- `src/shared/components/attributeFields/layout.ts` — `normalizeLayout(layout, context)` validates
  the object shape once (non-object / missing `id` → warn + no hint); `pickLayoutId(id, allowed,
  fallback, context)` resolves against an arm's supported set (unknown id → warn + fallback).

### New UI primitives (native, token-styled — **no new npm deps**)

Consistent with the repo's `Select`/`Switch`/`Label` "hand-written over a native element, a11y for
free, no Radix" convention:

- `src/shared/ui/radio-group.tsx` — `<RadioGroup>` over native `<input type=radio>`; opt-in
  `allowDeselect` (click the checked radio → `onValueChange('')`, since native radios can't be
  unchecked by the user).
- `src/shared/ui/segmented-control.tsx` — `<SegmentedControl>`: connected buttons over `sr-only`
  native radios, `role="radiogroup"`; same opt-in `allowDeselect`.
- `src/shared/ui/slider.tsx` — `<Slider>` over native `<input type=range>` + an `<output>` readout
  (`aria-valuetext`).
- `src/index.css` — added the `border-hairline-l` directional utility (mirrors `-t`/`-b`/`-r`).

### Arms — `src/shared/components/attributeFields/`

Each scalar arm gains `layout?: ResolvedAttributeLayout | null` (on `AttributeControlBaseProps`),
switches on `layout?.id`, `default:` = the prior markup verbatim:

| Arm | ids |
|---|---|
| `StringField` | `input` (default) · `textarea` (`<Textarea>`) · `readonly-text` (value as `<p>`, through `format`) |
| `NumberField` | `input` (default) · `stepper` (± `Button`s around the input) · `slider` (→ `input` + warn if `min`/`max` not both set) · `readonly-text`. `format` → a muted preview line under the editable layouts, the whole value in `readonly-text`. |
| `BooleanField` | `switch` (default `<Switch>`) · `checkbox` (native) · `segmented` (Yes/No `<SegmentedControl>`) |
| `EnumField` | `dropdown` (default `<Select>`) · `radio` (`<RadioGroup>`) · `segmented` (→ `dropdown` + warn past 5 options). **Clearable** (scope addition): an `×` button on the `dropdown` when a value is set; `allowDeselect` on `RadioGroup`/`SegmentedControl` so clicking the selected option deselects it. Empty state byte-identical. |

### Wiring

`SportAttributesFields.tsx` `AttributeField` switch and `DefinitionFields.tsx` `RecordField` switch
each pass `layout={(attribute|field).layout ?? undefined}` to the 4 scalar arms. No page/store/hook
change; `SportAttributesFields` public props unchanged.

### Tests / stories

- `formatAttributeValue.test.ts` (17 cases), `{String,Number,Boolean,Enum}Field.test.tsx` (each
  id + absent/unknown/malformed/non-object `layout` → default + `devWarn` spy; `slider`-no-bounds;
  `segmented`-too-many; `onChange` value unchanged across layouts; `BooleanField` uses a stateful
  harness since the arm is controlled).
- `SportAttributesFields.test.tsx` — `SPORT-13` block: a scalar-`layout` schema renders the
  alternate controls; a no-`layout` schema renders the same defaults (no radiogroup).
- New `{String,Number,Boolean,Enum}Field.stories.tsx` — one story per id + `format` variants +
  `DefaultNoLayout`. `SportAttributesFields.stories.tsx` — new `ScalarLayouts` story.

## Scope addition (user decision, post-implementation) — ENUM clearable

`ENUM` selections can be removed, not only changed: an `×` clear button on the `dropdown` (only
when a value is set), and click-the-selected-option-to-deselect on `radio` / `segmented` (via the
new `allowDeselect` prop). Applies regardless of `isRequired`. No baselined surface is affected —
no MSW seed renders an editable `EnumField` (the profile + resolved-session schemas have no `ENUM`
node; the raw-session `ENUM` is admin-textarea only), and the empty state is byte-identical.
5 new Vitest cases in `EnumField.test.tsx` + 3 new stories.

## Divergences from the approved plan

- Added `readonly-text` to **NumberField** too (plan/ticket first listed it only for STRING) — for
  `format` parity on the read display; folded into the ticket's grammar section.
- Degrade thresholds are mine: `EnumField` `segmented` → `dropdown` past **5** options;
  `NumberField` `slider` → `input` when `min`/`max` aren't **both** present.
- Built the `radio` / `segmented` / `slider` controls on **native elements** rather than adding
  `@radix-ui/react-{radio-group,toggle-group,slider}` — matches the existing `Select`/`Switch`
  precedent and avoids three new deps (a `client/CLAUDE.md` "conversation, not a per-page
  exception" item).

## Consumer census (client)

| Consumer | Disposition |
|---|---|
| `SportAttributesFields` `AttributeField` switch | updated here — passes `layout` to 4 arms |
| `DefinitionFields` `RecordField` switch | updated here — passes `layout` to 4 arms |
| `SessionAttributesSummary` (read-only) | compatible as-is — ignores `layout` (SPORT-15) |
| `RefField` | compatible as-is — `#ref` composition is SPORT-15 |
| `useSportAttributeSchema` / `useSessionAttributeSchema` / admin schema hooks | compatible — new optional field, documents passed through untyped-by-shape |
| MSW `e2e/mocks/handlers/sport.ts` + label resolver | compatible — no seed sets `layout` this ticket |
| existing arm/composite tests + stories | compatible — `layout` optional |

## Verification

- `pnpm exec tsc -b` — clean. `pnpm lint` — 0 errors (2 pre-existing `SessionStartTimePicker.tsx`
  warnings, untouched).
- **Browser / Storybook:** no dev-server walk — no MSW schema seed sets `layout`, so `/profile`
  and the session modals render the unchanged defaults (which the composite Vitest + e2e already
  cover). The alternate controls' human-review surface is the new `attributeFields/*.stories.tsx`
  (one story per `layout.id` + `format`/degrade variants) and the `ScalarLayouts` composite
  story; `addon-a11y` runs on every story in CI. No real backend endpoint is touched (pure
  rendering, no hook).
- `pnpm test` — **172 files / 1213 passed** (was 167 / 1170 at CLIENT-SESSION-20; +5 files,
  +43 cases from SPORT-13 incl. the ENUM-clear scope addition).
- New/affected targeted run — 87 passed (the 4 arm tests, `formatAttributeValue`,
  `SportAttributesFields`).

### E2E

`pnpm e2e` — **75 passed, 8 failed**, every failure in `e2e/flows/a11y.spec.ts` (home-feed
horizontal-overflow + axe at 375/768/1280, sport-filtered state, groups Members tab) — surfaces
SPORT-13 does not touch. The run had the full Vitest suite executing concurrently; the failures
carried `[WebServer] Error: write ECONNABORTED` (the Windows Vite-dev-server write-pipe artifact),
i.e. the page didn't finish rendering under load. **Re-run in isolation: `a11y.spec.ts` 31/31
passed** — a suite-parallelism flake, not a regression. Every attribute-rendering spec
(`app-profile`, `app-session-detail-modal`, `app-create-session-modal`, `matches-journey`,
`profile-journey`) passed in the main run.

### Visual-regression expectation

**No baselined surface changes.** Every arm's `default:` branch reproduces its pre-SPORT-13 DOM
verbatim, and no MSW schema seed sets `layout`, so `app-profile` / `app-session-detail-modal` /
`app-create-session-modal` render byte-identically. New Storybook stories are not
`visual-regression` baselines.

`visual-regression` fails wholesale on this Windows host (the documented font-rendering noise
floor). **Stash-and-rerun proof:** with SPORT-13 stashed, `app-session-detail-modal.spec.ts:50`
(a state that renders no attributes) fails at `ratio 0.02` / ~3.86k px — the same magnitude as
with SPORT-13 applied (~3.91k px). The diff is present identically on clean `master`, so nothing
here changes a baseline and **no `update-baselines` dispatch is needed**.
