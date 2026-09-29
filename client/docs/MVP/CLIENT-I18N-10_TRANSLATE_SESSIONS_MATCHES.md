# CLIENT-I18N-10 · Translate Sessions/Matches

**Status:** `TODO`
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
