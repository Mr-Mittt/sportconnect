# CLIENT-SESSION-50 · "Continue editing" in the "Are you ready?" popup focuses the first missing field

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** none
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass.

When a session is created with data missing, the popup (`SessionReadinessDialog`, the incomplete variant; the list comes from `missingForScheduling` in `sessionReadiness.ts`) offers "Continue editing" and "Create preparing session". "Continue editing" now only closes the popup. New: it closes the popup and **moves the focus to the first missing field, from the top of the form to the bottom** (page order today: duration, location, open slot, fee, then any other field `missingForScheduling` reports), scrolling it into view.

**How.** One element reference (or `data-` id) per missing field; a pure function picks the first one in page order (not in the order the missing list happens to have); a field inside a collapsed `SessionFormSection` expands its section first; the focus is set from the dialog's `onCloseAutoFocus` so Radix does not hand it back to the button that opened the popup (the same trick as CLIENT-GL-50 part 5, "Keep editing returns to the text"). The amber missing chips stay as they are.

**en/vi:** no new text. **I18N-4:** no census change.

**Out of scope:** Focus on the first field that fails the server's validation after a real submit, other forms.

**Tests:** Vitest for the order function (all combinations, empty list) and a component test per field kind (the focused element is the first missing one, a collapsed section opens, "Create preparing session" does not move the focus); mutation-check the order and the collapsed-section branch.
