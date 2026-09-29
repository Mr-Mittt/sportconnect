# CLIENT-I18N-6 · Translate remaining feature pages (Groups, Friends, Profile, Sessions/Matches, Notifications, Admin)

**Status:** `DONE` (2026-09-29)
**Type:** Enhancement (broad, incremental — expected to split into one ticket per feature at pickup)
**Depends on:** CLIENT-I18N-2 (step 1), CLIENT-I18N-3 (step 2 — shared chrome translated first)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-4` at pickup — that ticket narrowed to Home Feed
only (user decision), this ticket carries the rest of its original scope forward.

## What

Translate the remaining feature pages' own copy: Groups, Friends, Profile, Sessions/Matches,
Notifications, Admin. Same umbrella-placeholder shape `CLIENT-I18N-4` itself was — **file each
feature as its own backlog ticket when picked up**, pick one feature at a time.

**Entry point:** each feature's own route(s).
**Inputs/outputs:** no data-shape change — pure UI string extraction per feature.

## What CLIENT-I18N-4 already covered (don't re-translate)

`CLIENT-I18N-4` (done 2026-09-29, Home Feed only) translated `HomeFeedPage.tsx` plus these
`shared/components/` files, all cross-page — check before assuming a string here is untranslated:
`Feed`, `PostCard`, `CommentSection`, `CommentItem`, `CreatePostForm`, `GroupBroadcasts`,
`HashtagPostsModal`, `TrendingHashtags`, `SportSwitcher`. Also `shared/lib/relativeTime.ts`
("just now"/"Xm ago"/etc., now in the `common` namespace). New `homeFeed` and `sharedComponents`
i18n namespaces exist — a feature picked up here should check `sharedComponents` for a string
before adding a duplicate key to its own namespace.

**Explicitly deferred by CLIENT-I18N-4** (not done, even though Home Feed renders/triggers them —
pick these up as part of the Sessions/Matches slice of this ticket): `shared/components/
UpcomingMatches.tsx` + `shared/components/SessionCard.tsx` + their supporting libs
(`feeType.ts`/`sessionParticipation.ts`/`sessionCapacity.ts`/`startTime.ts`'s "Today"/"Tomorrow"),
and `features/session/components/CreateSessionModal.tsx`/`SessionDetailModal.tsx`/
`SessionDiscoverModal.tsx`.

## Notes for pickup (carried forward from CLIENT-I18N-4)

- **User directive (2026-09-29, at `CLIENT-I18N-3`'s pickup):** covers every remaining
  `shared/components/` file too, not just each page's own `<Feature>Page.tsx` — apply
  `useOverridableText` (generalized at `CLIENT-I18N-4` to take an explicit default namespace —
  `useOverridableText(defaultNs, overridePrefix?)`) as the standard pattern for any component a
  caller could plausibly want different wording from. A component with only one call site and no
  real override need yet still gets a default key in the right namespace.
- **Read `documentation/md/I18N_READINESS.md`'s I18N-10 before starting.** Every form in scope
  needs its own check for (a) native HTML5 constraint validation, (b) a verbatim server error
  message — if (b), add a row to I18N-4's own census table in that doc. Per that doc's existing
  census (as of `CLIENT-I18N-4`'s pickup): `/profile` (Edit Profile, Settings-tab sport editor,
  deactivate/reactivate), Groups' Invite Friend modal, and 3 Admin editors already show a raw
  server message — check whether they're still accurate when you pick up that feature, and update
  the row if the underlying hook changed.
- Pick an order — likely highest-traffic first (Profile, then Groups) — and file/pick up one
  feature at a time rather than attempting all six in one pass.
- Same per-feature checklist as every prior i18n ticket: new namespace + `.storybook/preview.ts`
  registration + `src/app/i18n.test.ts` key-parity coverage + regenerated visual baselines
  (`update-baselines`, never from Windows) + audit any hardcoded date/number/currency (`VND`)
  formatting for `Intl` + the active locale while that feature is touched anyway.
- Admin pages: confirm whether admin-only surfaces are in scope for `vi` at all, or English-only is
  an accepted call (admins may be internal-only) — still an open scope question, not resolved by
  `CLIENT-I18N-4`.
- Sessions/Matches slice specifically needs `feeType.ts`/`sessionParticipation.ts`/
  `sessionCapacity.ts` translated (client-authored UI copy — "Free"/"Split cost"/"Join"/"Accept"/
  etc.) and `startTime.ts`'s "Today"/"Tomorrow" literals, but **not** `sessionStatus.ts`'s
  `SESSION_STATUS_LABEL` (that's `CLIENT-I18N-5`'s job — client-mirrored backend enums).

**Out of scope:** `TopBar`/`NavTabs`/shared chrome (CLIENT-I18N-3); client-mirrored backend enums
(CLIENT-I18N-5); backend message/enum localization (I18N-4); the language picker UI.

## Note added at CLIENT-I18N-5's pickup (2026-09-29)

`CreateSessionModal.tsx` (already listed above under the Sessions/Matches slice) has pre-existing
raw-literal **custom validation strings** ("Sport is required.", "Title is required.", etc.) — an
I18N-10-class gap (native-validation-equivalent static copy), found while CLIENT-I18N-5 was auditing
`FeeTypeFields.tsx` (same file family). Flagged here rather than filed as a separate ticket
(user decision) since this ticket already claims the whole file — when this slice is picked up,
apply the same `noValidate`/`hasAttemptedSubmit`/translated-inline-error pattern `RegisterForm`/
`LoginForm` established (I18N_READINESS.md's I18N-10), same as every other form this ticket touches.

## Scope change (2026-09-29, at pickup — user decision)

**Admin pages are out of scope — no localization needed** (English-only accepted; admin surfaces are
not user-facing). This resolves the open "are admin surfaces in scope for `vi`" question above and
removes Admin from this ticket's slices. The 3 Admin editors' raw-server-message rows in
`I18N_READINESS.md`'s I18N-4 census stay as-is (no action needed).

## Scope change (2026-09-29, at pickup — user decision): narrowed to Profile only

This ticket now covers **Profile only** (`/profile`: `ProfilePage`, `ProfileTabs`, `MemoriesTab`,
`PostsTab`, `SportProfileSettingsTab`, `SettingsUnsavedChangesDialog`,
`SportProfileStatusConfirmDialog`, client-authored messages in `useEditProfileSave`), in a new
`profilePage` namespace (the existing `profile` namespace is `EditProfileModal`'s copy). The other
slices were filed as **CLIENT-I18N-7** (Groups), **-8** (Friends), **-9** (Notifications), **-10**
(Sessions/Matches — carries the `UpcomingMatches`/`SessionCard`/fee libs and the `CreateSessionModal`
validation-copy note above). The Sessions/Matches notes in this file now belong to I18N-10.
I18N-10 check for Profile: no native validation (one `<form>`, `isDirty`-gated Save); census rows for
`useUpdateSportProfile`/`useDeactivateSportProfile`/`useEditProfileSave` still accurate, no new rows.

## Implementation summary (2026-09-29)

**Approved design (restated):** new `profilePage` namespace (`locales/{en,vi}/profilePage.json`: `page`, `tabs`,
`posts`, `settings` (incl. `skillLevels`), `unsaved`, `statusConfirm`, `saveResult`), registered in `app/i18n.ts`,
`.storybook/preview.ts` and `app/i18n.test.ts` key parity. Components use `useOverridableText('profilePage',
i18nOverridePrefix)`; `ProfilePage` (page, no override need) uses plain `useTranslation('profilePage')`;
`useEditProfileSave` reads the i18next singleton. English values are byte-identical to the replaced literals.

**Built:** exactly the above for `ProfilePage`, `ProfileTabs`, `MemoriesTab`, `PostsTab`, `SportProfileSettingsTab`,
`SettingsUnsavedChangesDialog`, `SportProfileStatusConfirmDialog`, `useEditProfileSave`.

**Divergences / decisions:**
- Beyond the plan's list, the audit at implementation found more literals in the same files (the "Add a sport
  above…" prompt, skill-level placeholder and option labels, the Deactivating…/Reactivating… states, the
  deactivate note, error lines, "Cancel", "Discard changes") — all covered.
- **Skill-level labels** are translated inside the Settings tab (`settings.skillLevels.<value>`), not by
  changing `shared/lib/skillLevels.ts`, because that lib is shared with `AddSportFields` (the Add Sport
  modal), which is untranslated and belongs to a shared-dialog pass. **Known gap:** `AddSportFields`'
  "Select a skill level"/level labels stay English until that is picked up.
- `PAGE_ACCESS_NO_SPORTS_PROMPT` (`shared/lib/noSportsPrompt`) is untouched — not this slice.
- Server messages shown verbatim by `useUpdateSportProfile`/`useDeactivateSportProfile`/`useEditProfileSave` stay
  English (I18N-4); the client-authored fallback/composite messages are translated.
- No hardcoded date/number/currency formatting exists in these files.

**E2E:** scoped `e2e` project (`profile-journey`, `a11y`, `locale`, `feed-groups-journey`) — 44 passed after fixing one stale
locator (`profile-journey.spec.ts` step 7). Full `e2e` project not run (scoped subset only, by standing rule).
**Visual-regression expectation:** no baselined surface changes — English output is byte-identical, so no baseline
change expected; a failing `visual-regression` run is the Windows noise floor. Checked: `app-profile.spec.ts` failed
12/12 both with the change and with it stashed (same set). `app-sport-reactivate` not separately re-run.
