# CLIENT-I18N-4 · Translate per-feature pages (Home Feed, Groups, Friends, Profile, Sessions/Matches, Notifications, Admin)

**Status:** `TODO`
**Type:** Enhancement (broad, incremental — expected to split into one ticket per feature at pickup)
**Depends on:** CLIENT-I18N-2 (step 1), CLIENT-I18N-3 (step 2 — shared chrome translated first, so a
feature page isn't the only translated island the wrong way around: shell in English, content in
Vietnamese)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-2` at pickup — step 3 of that ticket's ordered list.

## What

Translate the remaining feature pages' own copy: Home Feed, Groups, Friends, Profile, Sessions/
Matches, Notifications, Admin. Each gets its own PR, its own i18n namespace (per `app/i18n.ts`'s
one-namespace-per-page convention), its own tests, and its own regenerated visual baselines — this
ticket is filed as the umbrella placeholder; **file each feature as its own backlog ticket when
picked up**, same "prefer splitting" note the parent ticket (`CLIENT-I18N-2`) itself carried.

**Entry point:** each feature's own route(s).
**Inputs/outputs:** no data-shape change — pure UI string extraction per feature.

## Notes for pickup

- **User directive (2026-09-29, at `CLIENT-I18N-3`'s pickup, carried forward here since that
  ticket's own scope stayed narrow — chrome + 6 cross-page dialogs only):** this ticket covers
  every remaining `shared/components/` file too, not just the 7 pages' own `<Feature>Page.tsx`
  files — `Feed`, `PostCard`, `CommentSection`, `EditProfileModal`, `AddSportModal`/`AddSportFields`,
  `GroupBroadcasts`, `HashtagPostsModal`, `SessionCard`, `SportSwitcher`, `ProfileHeader`,
  `TrendingHashtags`, `UpcomingMatches`, the `attributeFields/` subfolder, and anything else under
  that folder still holding hardcoded English. **No hardcoded text left anywhere in scope.** Apply
  `useOverridableText` (`src/shared/lib/useOverridableText.ts`, built at `CLIENT-I18N-3`) as the
  standard pattern for any component a caller could plausibly want different wording from — not
  just the 6 dialogs `CLIENT-I18N-3` already covered. A component with only one call site and no
  real override need yet still gets a default key in the right namespace; add the
  `i18nOverridePrefix` prop preemptively when the component is the kind of thing (a dialog/modal/
  confirm pattern) `CLIENT-I18N-3` applied it to on principle, not only when a second caller already
  exists.
- **Read `documentation/md/I18N_READINESS.md`'s I18N-10 before starting.** Translating static JSX
  strings is not the whole job — every form in scope (and there are several across these 7 features)
  needs its own check for (a) native HTML5 constraint validation rendering an untranslated browser
  popup, and (b) whether it shows a server error message verbatim — if so, **add its row to I18N-4's
  own census table** (same section of that doc), don't just note it locally in each feature's own
  ticket. Found and fixed twice already (`RegisterForm`, `LoginForm`) — check every form here, don't
  assume none of the 7 features have one.
- Pick an order — likely highest-traffic first (Home Feed, Profile) — and file/pick up one feature
  at a time rather than attempting all seven in one pass.
- Same per-feature checklist as every prior i18n ticket: new namespace + `.storybook/preview.ts`
  registration + `src/app/i18n.test.ts` key-parity coverage + regenerated visual baselines
  (`update-baselines`, never from Windows) + audit any hardcoded date/number/currency (`VND`)
  formatting for `Intl` + the active locale while that feature is touched anyway.
- Admin pages: confirm whether admin-only surfaces are in scope for `vi` at all, or English-only is
  an accepted call (admins may be internal-only) — a real scope question, not obvious either way.

**Out of scope:** `TopBar`/`NavTabs`/shared chrome (CLIENT-I18N-3); client-mirrored backend enums
(CLIENT-I18N-5); backend message/enum localization (I18N-4); the language picker UI.
