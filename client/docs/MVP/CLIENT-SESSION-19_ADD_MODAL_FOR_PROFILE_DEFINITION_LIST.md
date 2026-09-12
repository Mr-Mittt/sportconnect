# CLIENT-SESSION-19 · Reuse the "Other…" add-modal for profile `DEFINITION_LIST` attribute adding

**Status:** `TODO`
**Type:** Client feature
**Filed:** 2026-09-08, split out of the `CLIENT-SESSION-17` `/workon` pickup (user decision).
**Depends on:** `CLIENT-SESSION-17` (builds the add-modal component this ticket reuses). Soft
overlap with `CLIENT-SESSION-18` (suggested results) and `SPORT-6`.

## Why

`CLIENT-SESSION-17` (SC-4) builds a nested "Other…" modal for entering a value that isn't on the
creator's profile, used from the `#ref` single/multi-select control in `CreateSessionModal`. In
that ticket the entered value is only a **session-local draft option** — it is never written to the
user's sport profile.

The same modal shape (and, later, the same `CLIENT-SESSION-18` suggested-results typeahead) is the
natural affordance for **adding an entry to a `DEFINITION_LIST` attribute on the user's own sport
profile** — today `SportAttributesFields`' `DefinitionListField` only has an inline "Add" button
that appends a blank record for the user to fill field-by-field.

## Scope

1. In `SportAttributesFields`' `DefinitionListField` (profile Settings tab context), offer the
   `CLIENT-SESSION-17` add-modal as the "Add" path: open the modal, fill the definition's fields
   (reusing `DefinitionFields`), submit → the new record is appended to the attribute's value and
   **persisted to the profile** through the existing profile-save path.
2. Keep the current inline "Add" behaviour or replace it — decide at pickup.
3. If `CLIENT-SESSION-18` has landed, the modal's fields get the suggested-results typeahead for
   free; if not, plain inputs.

## Out of scope

- Session-side `#ref` drafts (that's `CLIENT-SESSION-17`).
- Any new backend — this writes through the existing `PUT` profile-attributes contract.

## Tests

Vitest: `DefinitionListField` add-via-modal appends and reports the new record through `onChange`;
Storybook state; profile-journey e2e adds a `DEFINITION_LIST` entry via the modal.

## Scope decision at pickup (2026-09-11)

Item 2 ("keep the current inline Add behaviour or replace it — decide at pickup") — **replace
entirely** (user decision). The "Add" button always opens the shared add-modal; the old
`onChange([...rows, {}])` inline blank-row append is gone. One consistent add affordance, matching
the session-side `#ref` "Other…" pattern this ticket reuses, rather than two different ways to add
a record depending on context.

## Implementation

**1. Extracted the shared modal** (user decision at pickup, since `CLIENT-SESSION-17`'s "Other…"
modal was inline JSX inside `RefField`, not an actual reusable component) — new
`AddDefinitionRecordModal` (`shared/components/attributeFields/`): a controlled `open`/
`onOpenChange` dialog wrapping `DefinitionFields`, with its own draft-record state (reset the
moment `open` flips to `true`, adjusted during render rather than in a `useEffect` — avoids a
`react-hooks/set-state-in-effect` lint violation and the extra commit an effect-based reset would
cost) and an `onSubmit(record)` callback that only fires for a non-empty draft (same guard the
original inline modal had).

**2. `RefField.tsx`** — its record-base "Other…" branch now renders `AddDefinitionRecordModal`
instead of its own inline `Dialog`+`DefinitionFields` JSX; the scalar/free-text branch (a plain
`Input`) is untouched, still inline, since `DEFINITION_LIST` never needs it. Purely a
behavior-preserving refactor — `RefField`'s own prop surface and rendered behavior are unchanged;
its existing Vitest suite needed no test changes.

**3. `DefinitionListField.tsx`** — "Add" now opens `AddDefinitionRecordModal` (title
`` `Add — ${label}` ``) instead of appending `{}` directly; on submit the returned record is
appended to `rows` and reported through the existing `onChange`, so the write still flows through
`SportAttributesFields` into the profile's existing `PUT /api/sports/profiles/:profileId`
`attributes` merge (backend contract unchanged — this ticket is client-only, per its own "Out of
scope"). Applies uniformly to all three `SPORT-14` layout variants (`cards`/`table`/`accordion`),
since they share one `addButton`/`addModal` pair. The cap check (`atCap`) still disables "Add"
before the modal can even open.

## Verification

- **Vitest:** full suite green — 180 files / 1309 tests. New coverage: `AddDefinitionRecordModal`'s
  own contract (renders the form, Add submits + closes, empty-draft Add is a no-op, Cancel discards,
  reopening resets the draft) in its own test file; `DefinitionListField`'s add-via-modal flow
  (Add opens it, fill+submit appends via `onChange`, Cancel appends nothing, empty submit is a
  no-op). One pre-existing test updated: `SportAttributesFields.test.tsx`'s "adds a row for a
  DEFINITION_LIST field via Add" asserted the old direct-append behavior — now drives the modal
  (fills the required field, submits) and asserts the same `onChange` contract.
- **ESLint/tsc:** both clean. (One fix needed along the way: the modal's draft-reset was originally
  a `useEffect`, which `react-hooks/set-state-in-effect` flagged — moved to the "adjust state during
  render when a prop changes" pattern instead.)
- **Storybook:** `pnpm build-storybook` succeeds; added `DefinitionListField`'s `AddModalOpen` story
  (a `play`-driven open state, same pattern `TopBar.stories.tsx` already uses for its dropdown — no
  dedicated story exists for `RefField`'s equivalent "Other…" modal either, so this follows that
  precedent rather than inventing a new one).
- **e2e:** `pnpm e2e` — **83 passed, 0 failed** on the final run. Along the way: a locator bug in the
  new `profile-journey.spec.ts` step (`getByRole('button', { name: 'Add' })` without `exact: true`
  also matched the `SportSwitcher`'s "Add sport" pill — fixed) and one `friends-journey.spec.ts`
  failure that reproduced only under parallel workers (`ws proxy... ECONNABORTED`) and passed 1/1
  isolated (single-worker, no retries) — the same class of parallel-load flake this suite already
  has precedent for elsewhere (e.g. `CLIENT-SESSION-16`'s `feed-groups-journey` note), not a
  regression from this change. Added `e2e/mocks/handlers/sport.ts` fixture: Badminton's profile
  schema gained a `DEFINITION_LIST` attribute (`gear/ownedRackets`, "Rackets you own", a `Racket`
  definition with `model` STRING required + `weight` NUMBER) so `profile-journey.spec.ts` step 5b
  can exercise the add-via-modal path against a real `DEFINITION_LIST` attribute end to end.
  `client/docs/E2E_OVERVIEW.md` updated for the new step and fixture.
- **Visual-regression expectation:** baselines `profile-settings-375.png` / `-768.png` / `-1280.png`
  (`e2e/visual/app-profile.spec.ts`) legitimately change — the new "Rackets you own" field (empty
  state: label + "Add" button) adds real height to the Settings tab. Verified via stash-and-rerun:
  `app-profile.spec.ts` fails all 12 of its cases identically on a clean stash of this branch's
  changes (same Windows font-rendering noise floor documented since HF-12, ratio ≈0.01–0.04 on the
  unaffected states); only `profile — settings` differs in a way attributable to real content —
  clean master renders the Settings tab at 1790px tall (before this ticket) vs. 1862px with this
  ticket's new field (baseline itself is 1803px), a genuine height delta consistent with one new
  empty-state field, not sub-pixel noise.
  **Correction (found by the `update-baselines` dispatch, not caught at pickup):** the bundled
  `grid-2` tweak below also legitimately changes `profile-settings-inactive-768.png` / `-1280.png`
  (`e2e/visual/app-sport-reactivate.spec.ts`, Pickleball's read-only Settings view) — `grid-2`
  applies unconditionally in `SportProfileSettingsTab`, regardless of active/inactive state, so any
  render of that tab at ≥640px (the `sm:` breakpoint) picks up the side-by-side layout.
  `profile-settings-inactive-375.png` stayed byte-identical, confirming the mechanism: below `sm`,
  `grid-cols-1` renders the same as the old stacked layout. Not caught at pickup since this doc's
  expectation line was written before the "Small tweak" section below existed.
  **Executed (2026-09-12):** `update-baselines` GitHub dispatch run, artifact downloaded and
  applied via `/updatebaseline`. SHA-256 against the committed set confirmed exactly 5 files
  changed — the 3 above plus the 2 inactive-state corrections — and the other 106 baselines came
  back byte-identical (Windows noise floor confirmed, not a regression). Human visual check on
  `profile-settings-375.png`/`-768.png` and `profile-settings-inactive-768.png`: the new "Rackets
  you own" field and the side-by-side Skill level/Years-of-experience row render correctly, nothing
  else drifted. Baselines committed `ef5e12d`.
- **Live backend:** not exercised — this ticket adds no new backend contract (writes through the
  same `attributes` merge on `PUT /api/sports/profiles/:profileId` that `PROFILE-8` already
  verified live), and the real backend's current Badminton schema has no `DEFINITION_LIST`
  attribute to exercise the new path against without first editing it via the admin schema editor,
  which was judged out of proportion for a client-rendering change with no new contract.

## Small tweak bundled in (user request, post-verification)

`SportProfileSettingsTab`'s "Skill level" / "Years of experience" row (the base `UserSportProfile`
fields above `SportAttributesFields`, unrelated to this ticket's `DEFINITION_LIST` scope) changed
from stacked to the same responsive `grid-2` wrapper `SportAttributesFields`' own `group` layout
uses (`grid grid-cols-1 gap-3.5 sm:grid-cols-2`) — side by side at `sm+`, stacked on mobile. Riding
along in this PR since it touches the same `profile — settings` visual surface this ticket already
changes. tsc/eslint clean; `SportProfileSettingsTab.test.tsx` + `useSportProfileSettingsTabData.test.tsx`
(18 tests) green — no role/label change, so no test updates needed.

**Delta found at `update-baselines` time:** since this wrapper is unconditional, it also legitimately
changes `profile-settings-inactive-768.png` / `-1280.png` (the Pickleball read-only Settings state,
`app-sport-reactivate.spec.ts`) — not just the active-Badminton surface this section originally
called out. See the "Visual-regression expectation" correction above.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
