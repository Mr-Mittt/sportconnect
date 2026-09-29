# CLIENT-I18N-11 · Translate sport names (`common` `sport.*` keys)

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** CLIENT-I18N-6 (merged — its `SportProfileSettingsTab`/`SportProfileStatusConfirmDialog` interpolate `sportName`)
**Filed:** 2026-09-29, requested by the user right after CLIENT-I18N-6's close-out.

## What

Localize sport names. Add a `sport` block to the `common` namespace (`en` + `vi`), keyed by `SportKey`:
`sport.badminton` = "Badminton" / "Cầu lông", `sport.pickleball` = "Pickleball" / "Pickleball" (kept as the
loanword) — user-confirmed Vietnamese values.

Add one helper, e.g. `getSportLabel(key, fallbackName?)` (plain function reading the i18next singleton, same
pattern as `relativeTime.ts`), that resolves `common:sport.<key>` and falls back to the backend-provided
name, then the title-cased key, for a catalog sport with no entry yet (`SportKey` is a live-derived `string`,
so an unknown sport is a real case). Fold `getSportProfileConfig(key).label`
(`shared/lib/sportProfileConfig.ts`, hardcoded English `Badminton`/`Pickleball`) into it — keep `colorRamp`.

**Entry point:** every surface that displays a sport name.
**Inputs/outputs:** no data-shape change — display-only.

## Known display sites (from the pre-filing grep — verify at pickup, don't trust as exhaustive)

`SportSwitcher`, `SportProfileSettingsTab`/`SportProfileStatusConfirmDialog`/`ProfilePage` (the `sportName`
interpolations from CLIENT-I18N-6), `AddSportFields` (`getSportProfileConfig(...).label`; also I18N-7's scope),
`AddSportIntroDialog`, `ReactivateSportNudgeDialog`, `SessionCard`, `SessionDetailModal`,
`useGroupBroadcasts`, `useInactiveSportPillSelect`, `GroupsPage`, `sportProfileFromId`, plus the DTO-mirrored
types (`feed/types.ts`, `shared/types/{sport,session,location}.ts`). Grep `sportName` and
`getSportProfileConfig` again at pickup.

## Notes for pickup

- **Consumer census:** this changes what `getSportProfileConfig().label` returns (locale-dependent) — grep
  `src/` and `e2e/` (locators matching "Badminton"/"Pickleball" text under a `vi` locale) and list each caller
  as compatible / updated / deferred.
- Not I18N-4: this is client-side lookup by key, not backend localization; the backend's `sportName` stays a
  fallback only.
- Interpolated names (`{{sportName}}`) must receive the translated name at the call site.
- Same checklist as prior i18n tickets: `i18n.test.ts` key parity, Storybook `vi`, scoped e2e, visual-regression
  noise-floor check (English output unchanged → no baseline change expected).

**Out of scope:** backend sport-name localization (I18N-4); sport attribute-schema labels (server-resolved, A13);
the language picker.
