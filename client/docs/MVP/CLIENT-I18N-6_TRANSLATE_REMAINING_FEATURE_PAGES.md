# CLIENT-I18N-6 · Translate remaining feature pages (Groups, Friends, Profile, Sessions/Matches, Notifications, Admin)

**Status:** `TODO`
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
