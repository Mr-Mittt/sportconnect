# CLIENT-GROUP-SESSION-4 · Group settings: the Sessions configuration section

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-4; pair of CLIENT-GROUP-SESSION-5 (the form)
**Filed:** 2026-11-19, from the owner's group-session specification ("Configuration"). Replaces the unbuilt UI of GRP-12 (game mood now belongs to the config).

A new collapsible section in `GroupSettingsTab` for group-session configuration; owner/admin edit, members view-only (same hint pattern). It has its **own save semantics** (each action saves at once; it does not join `useSettingsUnsavedGuard`).
- **ON/OFF** control for regular-session generation; when OFF everything below is hidden. (Switch or the tab's existing On/Off pill: pick the existing pill for consistency, decide at pickup.)
- **Recurrence** dropdown (native `Select`): Weekly or Monthly. Switching when configurations of the current mode exist shows the confirm "By switching the recurrence mode, your current configurations are not usable until you switch back." (Stay / Got it); "Got it" switches the mode, which only changes which configurations are active.
- **Add** button next to the dropdown opens the recurrence form (CLIENT-GROUP-SESSION-5).
- **List**, grouped by day (weekday or month-day) in collapsibles (`SessionFormSection`), collapsed by default: title `{Day} (x)`; collapsed it shows each slot's start to end time and location, a missing field as a warning and a "Draft" status, ordered by start ascending; expanded, one row per slot with Edit and Delete (Delete confirms, hard delete). Only configurations of the active mode are listed.
- All strings en and vi (weekday and ordinal names localised), I18N-4 rows for the new error codes, stories, tests, MSW handlers, Playwright flow. Extends `group-settings.spec.ts`.

**Consumer census:** `GroupSettingsTab`, `useGroupSettings`, `feedKeys`, `useSettingsUnsavedGuard` (unchanged), `groups.json`, e2e mocks, `BASELINE-UPDATE-1`. The 5-per-day limit and the other SESSION-GROUP-4 errors are shown inline.

**Out of scope:** the cancel confirmations on OFF, delete and mode switch (CLIENT-GROUP-SESSION-6).

---
