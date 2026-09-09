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

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
