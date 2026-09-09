# CLIENT-SESSION-18 · Suggested-results typeahead in the `#ref` "Other…" add-modal

**Status:** `TODO`
**Type:** Client feature
**Filed:** 2026-09-08, split out of the `CLIENT-SESSION-17` `/workon` pickup (user decision).
**Depends on:** backend **A14** (`modules/sport/sport-impl` — attribute reference aggregation
strategy, *postponed 2026-08-25*) — **hard**. Same block as `SPORT-6`; sequence the two together.

## Why

`CLIENT-SESSION-17` (SC-4) ships the `#ref` single/multi-select control with an **"Other…"** entry
that opens a nested modal to add a value not on the creator's profile. That modal ships with a
**plain text input only**. The reason a modal was chosen over inline free-text (user's words at the
CLIENT-SESSION-17 pickup) is that the add flow is meant to show **suggested results** for the item
being added — a typeahead over a backend-aggregated pool of known values (racket models, shoe
models, …), the same capability `SPORT-6`'s Reference field widget needs. That backend
(`A14`) does not exist yet.

## Scope

1. When `A14`'s reference-search endpoint is available, add a debounced typeahead to the
   `CLIENT-SESSION-17` "Other…" modal: as the user types, show matching suggestions from the
   backend pool; picking one fills the value. Free-text entry (type anything, submit as-is) stays
   available — suggestions are assistive, not a gate.
2. Share the search hook / result-list presentation with `SPORT-6` rather than building a second
   one — decide at pickup whether `SPORT-6` lands first and this consumes its widget, or this
   defines the shared piece.
3. Draft-option semantics from `CLIENT-SESSION-17` are unchanged — a picked suggestion is still a
   local draft option on the `#ref` node, not a write to the profile.

## Out of scope

- Writing the added/picked value back to the user's sport profile — that's `CLIENT-SESSION-19`.
- The `A14` backend itself.

## Tests

Vitest for the typeahead hook (debounce, empty query, no-results, pick-vs-free-text); Storybook
states (idle / loading / results / no-results / free-text fallback); refresh the
`CLIENT-SESSION-17` MSW `#ref` fixture + create-flow e2e to exercise a suggestion pick.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
