# CLIENT-I18N-11 · Translate sport names (`common` `sport.*` keys)

**Status:** `DONE` (2026-09-30)
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

## Scope check at pickup (2026-09-30)

User confirmed nothing to add or remove.

## Implementation summary (2026-09-30)

**Approved design (restated):** add a `sport` block to `common` (en + vi), a plain `getSportLabel(key, fallbackName?)` reading the i18next
singleton, and fold `getSportProfileConfig(key).label` into it, keeping `colorRamp`; update every display site.

**Built:**
- `locales/{en,vi}/common.json`: `sport.badminton` (Badminton / Cầu lông), `sport.pickleball` (Pickleball / Pickleball). Parity is covered by the existing `i18n.test.ts` `common` entry.
- `shared/lib/sportProfileConfig.ts`: `SPORT_PROFILE_CONFIG` now holds only `colorRamp`; new `getSportLabel` (`i18next.exists` → translated; else backend `fallbackName`; else title-cased key);
  `getSportProfileConfig` composes `{ label: getSportLabel(key), colorRamp }`, so its ~6 callers (`AddSportFields`, `GroupsPage` ×2, `useInactiveSportPillSelect`, `sportProfileFromId`, `useGroupBroadcasts` colorRamp only) needed **no edit**.
- `shared/lib/sportProfileFromId.ts`: new `getSportLabelForId(sportId, sportName)` — resolves the id through the live catalog to a key, keeping the backend `sportName` as the fallback. Used where a display name arrives **from the backend** rather than from a `SportProfile`:
  `SessionCard` and `SessionDetailModal` (`card.defaultTitle`), `ProfilePage` (status-confirm dialog, resolved at render from the stored `sportId`) and `SportProfileSettingsTab` (`ActiveToggleRow`).
- Memoized `SportProfile` mappings cache a locale-dependent `label`, so `useSportProfiles`, `useResumableSports` (its sort now also uses `localeCompare(…, language)`) and `useFriendsPageData`'s `selectedSports` depend on `i18n.language`
  (an `eslint-disable` with reason on the two where the language is read implicitly through the singleton).
- Every `sport.label` render site (`SportSwitcher`, `PostCard`, `CommentSection`, `CreateGroupModal`, `JoinGroupModal`, `FriendProfilePanel`, `CreateSessionModal`, `DiscoverModalSportSearchBox`, `SessionDetailModal` aria-label) reads a `SportProfile`, so it follows for free.

**Consumer census:** `getSportProfileConfig().label` — all callers **compatible as-is** (English output identical; `vi` now translated). `e2e/` locators for "Badminton"/"Pickleball" all run under the default `en` locale → **compatible as-is**; the 66-test scoped run confirms.
Backend `sportName` (`Session`, `UserSportProfileResponse`, `location.ts`) is unchanged and now a fallback only. No I18N-4 census row — client-side key lookup, not backend localization.

**Divergences from the ticket text:** none in design. The ticket's site list was a pre-filing grep; the real set was smaller than feared because most sites read `SportProfile.label`, which the config change covers centrally.
`useGroupBroadcasts` and `GroupsPage`'s `getSportProfileConfig(...).label` needed no edit.

**Not translated (by design):** attribute-schema labels (server-resolved, A13); sport names embedded in user-authored text; the language picker.

**Tests:** new `shared/lib/sportLabelI18n.test.ts` (4: English identical, vi translation + colorRamp, unknown-sport fallback chain, id-based resolution); one new e2e in `locale.spec.ts` (Create Session shows `Cầu lông`, no `Badminton`).

**Verification:** `tsc -b` clean; ESLint 0 errors/0 warnings on `shared`, `features/profile`, `features/friends`. Scoped Vitest (`shared`, `features/profile|friends|groups|session`, `app`) **161 files / 1364 passed**.
**E2E:** `e2e` project — `locale`, `matches-journey`, `profile-journey`, `feed-groups-journey`, `a11y`, `home-feed-journey`, `group-invitations` **66 passed**; the full `pnpm e2e` suite was not run (scoped subset, by standing instruction).
**Visual-regression expectation:** no baselined surface changes — English rendering is byte-identical, so any failing `visual-regression` run on this Windows host is the noise floor, not a regression. Not run this ticket (no visual change; the stash-and-rerun proof was done in I18N-10).
**Browser check:** the `vi` Playwright test drives the real built page (MSW); no real-backend run — no endpoint, DTO or contract changed.

**IT changes:** none — client-only ticket.
