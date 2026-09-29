# CLIENT-I18N-7 · Translate Groups page

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** CLIENT-I18N-2, CLIENT-I18N-3, CLIENT-I18N-4 (Home Feed), CLIENT-I18N-5 (enums)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-6` at pickup (narrowed to Profile only — user decision).

## What

Translate the Groups feature (`features/groups/`, 16 components). Same per-feature checklist as every prior i18n ticket: new namespace + `i18n.ts`
and `.storybook/preview.ts` registration + `src/app/i18n.test.ts` key-parity coverage + `useOverridableText`
`i18nOverridePrefix` on components + regenerated visual baselines (`update-baselines`, never from Windows)
+ `Intl` + active-locale for any hardcoded date/number/currency. Check `sharedComponents` before adding a
duplicate key. Read `documentation/md/I18N_READINESS.md` I18N-10 before starting: check each form for native
constraint validation and for a verbatim server message (add a row to I18N-4's census if so).
Its Invite Friend modal (`useInviteFriendModalData`) shows a raw server message — re-check that census row.

**Out of scope:** shared chrome (CLIENT-I18N-3), mirrored backend enums (CLIENT-I18N-5), backend message
localization (I18N-4), the language picker, Admin pages (no localization needed — user decision 2026-09-29).

## Added scope (2026-09-29, filed from CLIENT-I18N-6's close-out — user decision): `AddSportFields`

`shared/components/AddSportFields.tsx` (the Add Sport modal's form body, used from `/profile`, Groups and
elsewhere) is entirely untranslated and belongs to this ticket. Found while translating
`SportProfileSettingsTab` in CLIENT-I18N-6, which translated the skill-level labels locally
(`profilePage:settings.skillLevels.*`) rather than touching `shared/lib/skillLevels.ts`, since that lib is
shared with `AddSportFields`.

- Strings: "Sport", "Skill level" + "Select a skill level" placeholder + the `SKILL_LEVELS` option labels
  (Beginner/Intermediate/Advanced), "Years of experience (optional)", the "You already have a profile for every
  sport…" message, the "You had a {sport} profile before — …" resume note, "Couldn't add that sport. Try
  again.", Cancel, and the Add sport / submitting button text.
- Pick a namespace/home in `sharedComponents` (or a sibling) since it renders from more than one page, with
  `i18nOverridePrefix` per the shared-component convention. Reuse or align with `profilePage:settings.skillLevels.*`
  rather than duplicating the three level labels with different wording — consider moving them into a shared
  key and pointing both at it.
- Check `AddSportModal` and any sibling shared add-sport pieces (`AddSportIntroDialog` is already in
  `sharedDialogs`) for further untranslated copy while there.
- I18N-10: check whether this form shows native validation or a verbatim server message (`Couldn't add that
  sport` looks client-authored); add an I18N-4 census row if it surfaces a server message.
