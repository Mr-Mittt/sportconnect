# CLIENT-I18N-10 · Translate Sessions/Matches

**Status:** `DONE` (2026-09-30)
**Type:** Enhancement
**Depends on:** CLIENT-I18N-2, CLIENT-I18N-3, CLIENT-I18N-4 (Home Feed), CLIENT-I18N-5 (enums)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-6` at pickup (narrowed to Profile only — user decision).

## What

Translate the Sessions/Matches feature (`features/session/`, 30 components) plus `shared/components/UpcomingMatches`/`SessionCard`. Same per-feature checklist as every prior i18n ticket: new namespace + `i18n.ts`
and `.storybook/preview.ts` registration + `src/app/i18n.test.ts` key-parity coverage + `useOverridableText`
`i18nOverridePrefix` on components + regenerated visual baselines (`update-baselines`, never from Windows)
+ `Intl` + active-locale for any hardcoded date/number/currency. Check `sharedComponents` before adding a
duplicate key. Read `documentation/md/I18N_READINESS.md` I18N-10 before starting: check each form for native
constraint validation and for a verbatim server message (add a row to I18N-4's census if so).
Also: `feeType.ts`/`sessionParticipation.ts`/`sessionCapacity.ts` copy (incl. `FeeType`/`ParticipationActionKind` deferred from I18N-5), `startTime.ts` "Today"/"Tomorrow", `CreateSessionModal`/`SessionDetailModal`/`SessionDiscoverModal`. `CreateSessionModal` has raw-literal custom validation strings ("Sport is required." etc.) — apply the `noValidate`/`hasAttemptedSubmit` pattern from `RegisterForm`/`LoginForm` (carried over from I18N-6's note added at I18N-5). Not `SESSION_STATUS_LABEL` (done in I18N-5).

**Out of scope:** shared chrome (CLIENT-I18N-3), mirrored backend enums (CLIENT-I18N-5), backend message
localization (I18N-4), the language picker, Admin pages (no localization needed — user decision 2026-09-29).

## Scope check at pickup (2026-09-30)

User confirmed nothing to add or remove.

## Implementation summary (2026-09-30)

**Approved design (restated):** one new `session` namespace (`locales/{en,vi}/session.json`, 215 keys, nested by area:
`common`, `dateFormat`, `dateLabel`, `startTime`, `fee`, `capacity`, `participation`, `matches`, `history`, `upcoming`,
`requested`, `discover.*`, `create.*`, `detail.*`, `comments`, `card`, `upcomingMatches`, `preparing`, `time`, `calendar`,
`attributes`) registered in `app/i18n.ts`, `.storybook/preview.ts` and the `i18n.test.ts` parity table. Every component in
scope gains `i18nOverridePrefix` via `useOverridableText('session', …)`; plain functions read `i18next.t('session:…')`.
Dates use date-fns with the `vi` locale plus **per-language format patterns** kept in `session:dateFormat.*`
(user decision: date-fns over strict `Intl`, so English stays byte-identical and `do` ordinals keep working).

**Built:**
- New `shared/lib/localizedDate.ts` (`getDateFnsLocale`, `formatLocalized(date, patternKey)`). A date-fns `Locale` supplies weekday/month
  names but not word order — English is month-first (`Oct 15`), Vietnamese day-first (`15 thg 10`) — so the pattern itself is translated.
- Libs translated: `feeType` (**`FEE_TYPE_LABEL` constant → `getFeeTypeLabel()`**; its 2 importers updated), `sessionCapacity` (i18next plural
  keys; `vi` carries `_one` and `_other` with the same text so the parity test passes), `sessionParticipation`, `startTime`,
  `discoverDateLabel`, `groupSessionsByDate`. `SessionStartTimeCalendar` uses the locale's week start and translated month/weekday patterns.
- Components: `MatchesPage` (`useTranslation`, no props), `SessionCard`, `UpcomingMatches`, and every `features/session/components` file with copy
  (`FeeTypeFields` uses `getFeeTypeLabel` only, no prop; `DiscoverFilterTrigger` has no copy). `SessionDiscoverModal`/`CreateSessionModal` moved
  their module-level `NO_SPORTS_PROMPT` constants into the namespace. `SessionDetailModal`'s `rosterQualifier` and pending-label map became
  key lookups; `DiscoverSearchBox`/`DiscoverTimeFilter`'s label constants likewise.
- Sentences with an inline `<strong>` (`SessionPreparingCompletion`, `CreateSessionModal`'s "will be created as Preparing") are split into
  prefix/suffix keys around the element; the status word reuses `getSessionStatusLabel` (`enums`) so it can't drift from the status badge.

**Divergences from the approved plan / ticket text:**
- **The `noValidate`/`hasAttemptedSubmit` step needed no code.** `CreateSessionModal` already had `hasAttemptedSubmit` + custom inline errors, and there is
  no `<form>`, no `required` attribute and no native constraint validation anywhere in `features/session` (the number inputs only use `min`, with no form to
  trigger the browser popup). The ticket's premise (carried over from I18N-5/6) was stale; only the copy needed translating.
- Two `useMemo`s cached locale-formatted labels (`useMatchesPageData`'s `upcomingDateGroups`, `useDiscoverFilters`'s `labelsByDate`) and would have gone
  stale after a language switch; both now depend on `i18n.language` (each hook calls `useTranslation()`).

**I18N-10 form checks / census:** no raw server message is displayed anywhere in the feature (every error is client-authored), so **no new I18N-4 census row**.

**Not translated (by design):** sport names (`sportName`/`sport.label`, CLIENT-I18N-11), VND amounts (`150 000 ₫`, locale-neutral existing format), `dd/MM/yyyy` on the
picker's custom-date option, user-authored text (titles, descriptions, names).

**Tests:** new `shared/lib/sessionLibsI18n.test.ts` (8), `shared/components/SessionCardI18n.test.tsx` (2: `vi` render + override prefix),
`features/session/components/CreateSessionModalI18n.test.tsx` (2: `vi` render + inline validation errors, override prefix); `session` added to the parity table;
one new e2e in `locale.spec.ts` (Matches page + Create Session validation in `vi`). All existing English assertions pass unchanged.

**Verification:** `tsc -b` clean; ESLint 0 errors (2 pre-existing `SessionStartTimePicker` warnings, unchanged from `master`).
Scoped Vitest (`features/session`, `shared`, `app`) 98 files / 910 passed before the new tests; the 3 new files (12 tests) passed after.
**E2E:** `e2e` project — `locale`, `matches-journey`, `feed-groups-journey`, `a11y`, `home-feed-journey` **57 passed**; the full `pnpm e2e` suite was not run (scoped subset, by standing instruction).
**Visual-regression expectation (corrected 2026-09-30):** baselines `session-detail-{cancelled,discussion,not-joined}-{375,768,1280}` and `session-detail-preparing-{768,1280}` (11 files) legitimately change — the modal's `Players (n/m)` heading (and the cancelled `Reason: …` line) went from several JSX text runs to one `t()` string, so the browser shapes/kerns it as a single run and the closing `)` shifts by a sub-pixel (~32 px per file, 1 px over the diff threshold in CI). Expected to fail until the `update-baselines` dispatch regenerates exactly those files; every other baseline must come back byte-identical. *(The original expectation here was "no baseline change" — wrong: the pre-push stash check only covered 3 specs, and English *text* is identical but its *rasterization* is not.)*

**Executed (2026-09-30):** `update-baselines` artifact applied — SHA-256 confirmed exactly those 11 files changed, the other 139 byte-identical; pixel diff located the change at the `)` glyph of the Players heading in every file.
Checked: `app-session-detail-modal`, `app-create-session-modal`, `app-discover-panel` — **60/60 fail both in the changed tree and with `src`/`.storybook`/`e2e`/`docs` stashed** (identical failing set; pixel counts vary run to run, as in earlier tickets). Other baselined surfaces touching these components (`app-discover-modal`, `app-home-feed`, `app-groups`, `app-sport-reactivate`) were not re-run.
**Browser check:** the `vi` Playwright test drives the real built page (MSW) through Matches → Create Session; no real-backend run — no endpoint, DTO or contract changed.

**IT changes:** none — client-only ticket.
