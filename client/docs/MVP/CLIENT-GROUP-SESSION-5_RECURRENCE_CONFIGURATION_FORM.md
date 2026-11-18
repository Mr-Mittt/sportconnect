# CLIENT-GROUP-SESSION-5 · The recurrence configuration form

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-4, CLIENT-GROUP-SESSION-1 (member picker), CLIENT-GROUP-SESSION-4
**Filed:** 2026-11-19, from the owner's group-session specification ("Add button ... Recurrence session creation form, same design as standalone with sections"). Closes GRP-12's scope (game mood).

A modal built on `SessionFormSection` and the shared section components, in this order:
- **Overview:** sport hidden (the group's).
- **When:** a day dropdown (weekday names for Weekly, 1st to 31st for Monthly; the options follow the group's mode), start time, duration, end time (`useSessionTimeFields` linking them); **no date picker**, so `WhenFields` gets a date-less variant.
- **Where:** as standalone, scoped to the group's sport.
- **Who:** All members / Specific with the member picker (no notification at config time).
- **Fee:** free by default. **Attributes:** as standalone, plus the **game mood**.
- **Save:** day and start time are required. If location or duration is missing, a warning "Your recurrence session is missing information" with Keep editing / Save as draft; saving a draft is allowed. On success an information dialog "Your weekly/monthly session configuration on [Monday ... Sunday] / [1st ... 31st] was saved" with Add another (clears the form) / Close. Editing an existing slot opens the same form filled.
- Errors (5 per day, location sport mismatch, permissions) inline with en/vi codes; all strings en and vi; stories (empty, filled, draft warning, saved); tests; MSW handlers; Playwright flow.

**Consumer census:** `WhenFields`/`useSessionTimeFields`, `WhereFields` and the location picker, `useSessionWhoFields` (not reused: this form has its own state), the shared member picker, `GRP-12` ticket (mark superseded), `errors.json`, I18N-4 rows.

---
