# SPORT-8 · Remove "Preferred position" from the sport profile editor

**Status:** `TODO` · **Type:** Enhancement (Architecture) · **Depends on:** pairs with backend
**A18** — land SPORT-8 first or together, never drop the column while the client still sends the
field.
**Filed:** 2026-09-02 — client half of A18 (the `preferred_position` column was a mistake).

## What ships

- Drop `preferredPosition` from `shared/types/sport.ts` (`UserSportProfileResponse`), the
  `SportProfileEditDraft`, `toSportProfileEditDraft`, `buildSportProfileUpdatePayload`,
  `isSportProfileDraftDirty`.
- Remove the "Preferred position" `<Input>` and its `setPreferredPosition` wiring from
  `SportProfileSettingsTab` / `useSportProfileSettingsTabData`.
- Update `AddSportModal` if it collects the field at creation.
- MSW handlers + fixtures: drop the field.

## Out of scope

Adding a per-sport "position" attribute (admin content via ADMIN-2 later, if a sport wants it).

## Tests

Update `SportProfileSettingsTab` / `useSportProfileSettingsTabData` specs and the sport-profile MSW
mutation tests to drop the field; e2e profile journey step if it asserts on it.
